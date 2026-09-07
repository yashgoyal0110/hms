import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Admission, CHARGE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_CATEGORIES, InsuranceClaim, Invoice, LedgerEntry, PAYMENT_MODES, Patient, nextCode,
} from '../models/index.js';
import { addCharges, recordPayment } from '../services/billing.js';
import { notifyPatient } from '../services/messaging.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { dateRange, paginate, searchFilter } from '../utils/query.js';

/* ---------------- Invoices ---------------- */
export const invoicesRouter = Router();
const invPopulate = [
  { path: 'patient', select: 'uhid firstName lastName phone gender dob address insurance' },
  { path: 'createdBy', select: 'name' },
];

invoicesRouter.get('/meta', can('billing', 'r'), (_req, res) => {
  res.json({ paymentModes: PAYMENT_MODES, chargeCategories: CHARGE_CATEGORIES });
});

invoicesRouter.get('/', can('billing', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.from || req.query.to) { const { start, end } = dateRange(req.query.from, req.query.to); filter.createdAt = { $gte: start, $lte: end }; }
  if (req.query.q) {
    const pts = await Patient.find(searchFilter(req.query.q, ['uhid', 'firstName', 'lastName', 'phone'])).select('_id').limit(200);
    filter.$or = [{ patient: { $in: pts.map((p) => p._id) } }, searchFilter(req.query.q, ['invoiceNo']).$or[0]];
  }
  const [page, totals] = await Promise.all([
    paginate(Invoice, filter, req, { populate: invPopulate, select: '-items' }),
    Invoice.aggregate([{ $match: { ...filter, status: { $ne: 'Cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' }, paid: { $sum: '$amountPaid' }, due: { $sum: '$balance' } } }]),
  ]);
  res.json({ ...page, summary: totals[0] || { total: 0, paid: 0, due: 0 } });
});

invoicesRouter.post('/', can('billing', 'rw'), async (req, res) => {
  const { patient: patientId, items = [], discount = 0, discountReason, notes, type = 'General', payment } = req.body;
  const patient = await Patient.findById(patientId);
  if (!patient) throw badRequest('Select a valid patient');
  if (!items.length) throw badRequest('Add at least one line item');
  const inv = await addCharges({
    patientId: patient._id, type, userId: req.user._id, forceSeparate: true,
    items: items.map((i) => ({ description: i.description, category: i.category || 'Other', quantity: Number(i.quantity) || 1, rate: Number(i.rate) || 0, taxRate: Number(i.taxRate) || 0 })),
  });
  inv.discount = Number(discount) || 0;
  inv.discountReason = discountReason;
  inv.notes = notes;
  inv.recalc();
  await inv.save();
  if (payment?.mode && Number(payment.amount) > 0) await recordPayment(inv, payment, req.user);
  res.status(201).json(inv);
});

invoicesRouter.get('/:id', can('billing', 'r'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id).populate(invPopulate)
    .populate('payments.receivedBy', 'name')
    .populate({ path: 'admission', select: 'admissionNo admittedAt dischargedAt ward bedNumber doctor', populate: [{ path: 'ward', select: 'name' }, { path: 'doctor', select: 'name' }] });
  if (!inv) throw notFound('Invoice');
  const claims = await InsuranceClaim.find({ invoice: inv._id }).select('claimNo status claimAmount approvedAmount settledAmount provider');
  res.json({ invoice: inv, claims });
});

// Add line items to an open (non-finalized) bill, or adjust discount before any payment.
invoicesRouter.post('/:id/items', can('billing', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'Cancelled') throw badRequest('Invoice is cancelled');
  if (inv.finalized && inv.payments.length) throw badRequest('Finalized invoices with payments cannot be modified');
  const { description, category = 'Other', quantity = 1, rate, taxRate = 0 } = req.body;
  if (!description || !(Number(rate) >= 0)) throw badRequest('Description and rate are required');
  inv.items.push({ description, category, quantity: Number(quantity), rate: Number(rate), taxRate: Number(taxRate) });
  inv.recalc();
  await inv.save();
  res.json(inv);
});

invoicesRouter.delete('/:id/items/:itemId', can('billing', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (inv.finalized && inv.payments.length) throw badRequest('Finalized invoices with payments cannot be modified');
  const item = inv.items.id(req.params.itemId);
  if (!item) throw notFound('Line item');
  item.deleteOne();
  inv.recalc();
  await inv.save();
  res.json(inv);
});

invoicesRouter.post('/:id/discount', can('billing', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'Paid' || inv.status === 'Cancelled') throw badRequest(`Invoice is ${inv.status.toLowerCase()}`);
  const amount = Number(req.body.amount);
  if (!(amount >= 0)) throw badRequest('Invalid discount');
  if (amount > inv.subtotal + inv.taxTotal - inv.amountPaid) throw badRequest('Discount cannot exceed the outstanding amount');
  inv.discount = amount;
  inv.discountReason = req.body.reason;
  inv.recalc();
  await inv.save();
  res.json(inv);
});

invoicesRouter.post('/:id/finalize', can('billing', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (inv.admission) {
    const adm = await Admission.findById(inv.admission);
    if (adm?.status === 'Admitted') throw badRequest('IPD bills are finalized automatically at discharge');
  }
  inv.finalized = true;
  inv.recalc();
  await inv.save();
  res.json(inv);
});

invoicesRouter.post('/:id/payments', can('billing', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id).populate('patient');
  if (!inv) throw notFound('Invoice');
  const { amount, mode, reference } = req.body;
  if (!PAYMENT_MODES.includes(mode)) throw badRequest('Select a payment mode');
  const receiptNo = await recordPayment(inv, { amount, mode, reference }, req.user);
  notifyPatient('payment_received', inv.patient, { amount: Number(amount).toFixed(2), invoiceNo: inv.invoiceNo, receiptNo });
  res.json({ invoice: inv, receiptNo });
});

invoicesRouter.post('/:id/cancel', can('billing', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (inv.payments.length) throw badRequest('Invoices with payments cannot be cancelled');
  if (!req.body.reason) throw badRequest('Cancellation reason is required');
  inv.status = 'Cancelled';
  inv.cancelReason = req.body.reason;
  await inv.save();
  res.json(inv);
});

/* ---------------- Insurance claims ---------------- */
export const claimsRouter = Router();
const claimPopulate = [
  { path: 'patient', select: 'uhid firstName lastName phone insurance' },
  { path: 'invoice', select: 'invoiceNo total amountPaid balance status type' },
];

claimsRouter.get('/', can('insurance', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.provider) filter.provider = req.query.provider;
  if (req.query.q) Object.assign(filter, searchFilter(req.query.q, ['claimNo', 'policyNumber', 'provider', 'preAuthNo']));
  const [page, summary] = await Promise.all([
    paginate(InsuranceClaim, filter, req, { populate: claimPopulate }),
    InsuranceClaim.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$claimAmount' } } }]),
  ]);
  res.json({ ...page, summary });
});

claimsRouter.post('/', can('insurance', 'rw'), async (req, res) => {
  const inv = await Invoice.findById(req.body.invoice).populate('patient');
  if (!inv) throw badRequest('Select a valid invoice');
  if (inv.status === 'Cancelled') throw badRequest('Invoice is cancelled');
  const open = await InsuranceClaim.exists({ invoice: inv._id, status: { $nin: ['Rejected', 'Settled'] } });
  if (open) throw badRequest('An active claim already exists for this invoice');
  const ins = inv.patient.insurance || {};
  const claimAmount = Number(req.body.claimAmount) || inv.balance;
  if (claimAmount > inv.balance + 0.001) throw badRequest('Claim amount exceeds invoice balance');
  const data = clean(req.body, ['claimNo', 'status', 'history', 'settledAmount', 'approvedAmount', 'settledAt']);
  const claim = await InsuranceClaim.create({
    ...data,
    claimNo: await nextCode('CLM'),
    patient: inv.patient._id,
    admission: inv.admission,
    provider: data.provider || ins.provider,
    tpa: data.tpa || ins.tpa,
    policyNumber: data.policyNumber || ins.policyNumber,
    claimAmount,
    status: 'Submitted',
    history: [{ status: 'Submitted', note: data.remarks, by: req.user._id }],
    createdBy: req.user._id,
  });
  res.status(201).json(claim);
});

claimsRouter.get('/:id', can('insurance', 'r'), async (req, res) => {
  const c = await InsuranceClaim.findById(req.params.id).populate(claimPopulate).populate('history.by', 'name');
  if (!c) throw notFound('Claim');
  res.json(c);
});

claimsRouter.post('/:id/status', can('insurance', 'rw'), async (req, res) => {
  const claim = await InsuranceClaim.findById(req.params.id);
  if (!claim) throw notFound('Claim');
  const { status, note, approvedAmount, settledAmount, preAuthNo } = req.body;
  const allowed = ['Under Review', 'Query Raised', 'Approved', 'Partially Approved', 'Rejected', 'Settled'];
  if (!allowed.includes(status)) throw badRequest('Invalid status');
  if (['Settled', 'Rejected'].includes(claim.status)) throw badRequest(`Claim is already ${claim.status.toLowerCase()}`);
  if (preAuthNo) claim.preAuthNo = preAuthNo;
  if (['Approved', 'Partially Approved'].includes(status)) {
    const amt = Number(approvedAmount ?? claim.claimAmount);
    if (!(amt > 0) || amt > claim.claimAmount) throw badRequest('Approved amount must be between 0 and the claimed amount');
    claim.approvedAmount = amt;
  }
  if (status === 'Settled') {
    const amt = Number(settledAmount ?? claim.approvedAmount);
    if (!(amt > 0)) throw badRequest('Enter the settled amount');
    const inv = await Invoice.findById(claim.invoice);
    const payable = Math.min(amt, inv.balance);
    if (payable > 0) await recordPayment(inv, { amount: payable, mode: 'Insurance', reference: claim.claimNo }, req.user);
    claim.settledAmount = amt;
    claim.settledAt = new Date();
  }
  claim.status = status;
  claim.history.push({ status, note, by: req.user._id });
  await claim.save();
  res.json(claim);
});

/* ---------------- Accounting ledger ---------------- */
export const ledgerRouter = Router();

ledgerRouter.get('/meta', can('accounting', 'r'), (_req, res) => {
  res.json({ incomeCategories: INCOME_CATEGORIES, expenseCategories: EXPENSE_CATEGORIES, paymentModes: PAYMENT_MODES });
});

ledgerRouter.get('/', can('accounting', 'r'), async (req, res) => {
  const { start, end } = dateRange(req.query.from, req.query.to);
  const filter = { date: { $gte: start, $lte: end } };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.mode) filter.mode = req.query.mode;
  if (req.query.q) Object.assign(filter, searchFilter(req.query.q, ['description', 'reference', 'payee', 'entryNo']));
  const [page, totals] = await Promise.all([
    paginate(LedgerEntry, filter, req, { sort: '-date', populate: { path: 'createdBy', select: 'name' } }),
    LedgerEntry.aggregate([{ $match: filter }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
  ]);
  const t = Object.fromEntries(totals.map((x) => [x._id, x.total]));
  res.json({ ...page, summary: { income: t.Income || 0, expense: t.Expense || 0, net: (t.Income || 0) - (t.Expense || 0) } });
});

ledgerRouter.post('/', can('accounting', 'rw'), async (req, res) => {
  const data = clean(req.body, ['entryNo', 'auto', 'invoice', 'createdBy']);
  if (!['Income', 'Expense'].includes(data.type)) throw badRequest('Select entry type');
  const entry = await LedgerEntry.create({ ...data, entryNo: await nextCode('LED'), createdBy: req.user._id });
  res.status(201).json(entry);
});

ledgerRouter.delete('/:id', can('accounting', 'rw'), async (req, res) => {
  const e = await LedgerEntry.findById(req.params.id);
  if (!e) throw notFound('Entry');
  if (e.auto) throw badRequest('System-generated entries cannot be deleted; reverse the source transaction instead');
  await e.deleteOne();
  res.json({ ok: true });
});

// Profit & loss by category and month.
ledgerRouter.get('/summary', can('accounting', 'r'), async (req, res) => {
  const { start, end } = dateRange(req.query.from, req.query.to, 180);
  const match = { date: { $gte: start, $lte: end } };
  const [byCategory, byMonth, byMode] = await Promise.all([
    LedgerEntry.aggregate([{ $match: match }, { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
    LedgerEntry.aggregate([
      { $match: match },
      { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$date', timezone: process.env.TZ || 'UTC' } }, type: '$type' }, total: { $sum: '$amount' } } },
      { $sort: { '_id.month': 1 } },
    ]),
    LedgerEntry.aggregate([{ $match: { ...match, type: 'Income' } }, { $group: { _id: '$mode', total: { $sum: '$amount' } } }]),
  ]);
  const months = {};
  for (const m of byMonth) {
    months[m._id.month] ??= { month: m._id.month, income: 0, expense: 0 };
    months[m._id.month][m._id.type === 'Income' ? 'income' : 'expense'] = m.total;
  }
  res.json({
    income: byCategory.filter((c) => c._id.type === 'Income').map((c) => ({ category: c._id.category, total: c.total })),
    expense: byCategory.filter((c) => c._id.type === 'Expense').map((c) => ({ category: c._id.category, total: c.total })),
    monthly: Object.values(months).map((m) => ({ ...m, net: m.income - m.expense })),
    byMode: byMode.map((m) => ({ mode: m._id, total: m.total })),
  });
});
