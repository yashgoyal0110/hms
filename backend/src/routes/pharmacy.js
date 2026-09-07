import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Admission, Encounter, Invoice, Medicine, Patient, StockMovement, nextCode,
} from '../models/index.js';
import { addCharges, recordPayment } from '../services/billing.js';
import { notifyStaff } from '../services/notify.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { dayRange, paginate, searchFilter } from '../utils/query.js';

const r = Router();

r.get('/medicines', can('pharmacy', 'r'), async (req, res) => {
  const filter = { ...searchFilter(req.query.q, ['name', 'genericName', 'code', 'manufacturer']) };
  if (req.query.active !== 'all') filter.active = true;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.stock === 'low') filter.$expr = { $lte: ['$stock', '$reorderLevel'] };
  if (req.query.stock === 'out') filter.stock = 0;
  if (req.query.inStock === 'true') filter.stock = { $gt: 0 };
  res.json(await paginate(Medicine, filter, req, { sort: 'name', defLimit: 50 }));
});

r.post('/medicines', can('pharmacy', 'rw'), async (req, res) => {
  const data = clean(req.body, ['stock', 'batches', 'code']);
  const med = await Medicine.create({ ...data, code: await nextCode('MED', { yearly: false, pad: 5 }) });
  res.status(201).json(med);
});

r.get('/medicines/:id', can('pharmacy', 'r'), async (req, res) => {
  const med = await Medicine.findById(req.params.id).populate('batches.supplier', 'name');
  if (!med) throw notFound('Medicine');
  const movements = await StockMovement.find({ item: med._id }).sort('-createdAt').limit(50).populate('by', 'name');
  res.json({ medicine: med, movements });
});

r.put('/medicines/:id', can('pharmacy', 'rw'), async (req, res) => {
  const med = await Medicine.findById(req.params.id);
  if (!med) throw notFound('Medicine');
  med.set(clean(req.body, ['stock', 'batches', 'code']));
  await med.save();
  res.json(med);
});

r.post('/medicines/:id/batches', can('pharmacy', 'rw'), async (req, res) => {
  const med = await Medicine.findById(req.params.id);
  if (!med) throw notFound('Medicine');
  const { batchNo, expiryDate, quantity, purchasePrice, mrp, supplier } = req.body;
  const qty = Number(quantity);
  if (!batchNo || !expiryDate || !(qty > 0)) throw badRequest('Batch number, expiry and quantity are required');
  if (new Date(expiryDate) <= new Date()) throw badRequest('Cannot receive an expired batch');
  const existing = med.batches.find((b) => b.batchNo === batchNo);
  if (existing) existing.quantity += qty;
  else med.batches.push({ batchNo, expiryDate, quantity: qty, purchasePrice, mrp: mrp || med.mrp, supplier: supplier || undefined });
  if (mrp) med.mrp = mrp;
  await med.save();
  await StockMovement.create({ itemType: 'Medicine', item: med._id, itemName: med.name, type: 'IN', quantity: qty, batchNo, note: req.body.note || 'Stock received', by: req.user._id });
  res.status(201).json(med);
});

r.post('/medicines/:id/adjust', can('pharmacy', 'rw'), async (req, res) => {
  const med = await Medicine.findById(req.params.id);
  const batch = med?.batches.id(req.body.batchId);
  if (!batch) throw notFound('Batch');
  const delta = Number(req.body.quantity);
  if (!delta) throw badRequest('Enter a non-zero adjustment');
  if (batch.quantity + delta < 0) throw badRequest('Adjustment exceeds available batch quantity');
  batch.quantity += delta;
  await med.save();
  await StockMovement.create({
    itemType: 'Medicine', item: med._id, itemName: med.name, type: req.body.reason === 'Expired' ? 'EXPIRED' : 'ADJUST',
    quantity: delta, batchNo: batch.batchNo, note: req.body.note || req.body.reason, by: req.user._id,
  });
  res.json(med);
});

r.get('/alerts', can('pharmacy', 'r'), async (req, res) => {
  const days = Number(req.query.days) || 90;
  const soon = new Date(Date.now() + days * 86400000);
  const [lowStock, expiring] = await Promise.all([
    Medicine.find({ active: true, $expr: { $lte: ['$stock', '$reorderLevel'] } }).select('code name strength form stock reorderLevel').sort('stock').limit(100),
    Medicine.aggregate([
      { $match: { active: true } },
      { $unwind: '$batches' },
      { $match: { 'batches.quantity': { $gt: 0 }, 'batches.expiryDate': { $lte: soon } } },
      { $project: { name: 1, strength: 1, form: 1, batchNo: '$batches.batchNo', batchId: '$batches._id', expiryDate: '$batches.expiryDate', quantity: '$batches.quantity' } },
      { $sort: { expiryDate: 1 } },
      { $limit: 200 },
    ]),
  ]);
  res.json({ lowStock, expiring });
});

// Prescriptions from consultations awaiting dispensing.
r.get('/prescriptions', can('pharmacy', 'r'), async (req, res) => {
  const { start } = dayRange(req.query.date);
  const since = new Date(start.getTime() - 2 * 86400000);
  const filter = { 'prescriptions.0': { $exists: true }, createdAt: { $gte: since } };
  if (req.query.pending !== 'false') filter.rxDispensedAt = { $exists: false };
  const list = await Encounter.find(filter).sort('-createdAt').limit(100)
    .populate('patient', 'uhid firstName lastName phone gender dob')
    .populate('doctor', 'name')
    .populate('prescriptions.medicine', 'name strength form stock mrp');
  res.json(list);
});

/**
 * Dispense medicines using FEFO (first-expiry-first-out). Admitted patients are billed to the
 * running IPD bill; others get a pharmacy invoice that can be settled immediately.
 */
r.post('/dispense', can('pharmacy', 'rw'), async (req, res) => {
  const { patient: patientId, items = [], encounter, payment, discount = 0 } = req.body;
  const patient = await Patient.findById(patientId);
  if (!patient) throw badRequest('Select a valid patient');
  if (!items.length) throw badRequest('Add at least one medicine');

  const meds = await Medicine.find({ _id: { $in: items.map((i) => i.medicine) } });
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const now = new Date();
  const plan = [];
  for (const line of items) {
    const med = byId.get(String(line.medicine));
    const qty = Math.floor(Number(line.quantity));
    if (!med) throw badRequest('Invalid medicine selected');
    if (!(qty > 0)) throw badRequest(`Enter a valid quantity for ${med.name}`);
    const usable = med.batches.filter((b) => b.quantity > 0 && b.expiryDate > now).sort((a, b) => a.expiryDate - b.expiryDate);
    const available = usable.reduce((s, b) => s + b.quantity, 0);
    if (available < qty) throw badRequest(`Insufficient stock for ${med.name}: ${available} available`);
    let remaining = qty;
    for (const b of usable) {
      if (!remaining) break;
      const take = Math.min(b.quantity, remaining);
      plan.push({ med, batch: b, take });
      remaining -= take;
    }
  }

  const reference = await nextCode('PHM');
  const invoiceItems = [];
  for (const { med, batch, take } of plan) {
    batch.quantity -= take;
    invoiceItems.push({
      description: `${med.name}${med.strength ? ` ${med.strength}` : ''} - Batch ${batch.batchNo}`,
      category: 'Pharmacy', quantity: take, rate: batch.mrp || med.mrp, taxRate: 0, refType: 'Medicine', refId: med._id,
    });
  }
  for (const med of new Set(plan.map((p) => p.med))) await med.save();
  await StockMovement.insertMany(plan.map(({ med, batch, take }) => ({
    itemType: 'Medicine', item: med._id, itemName: med.name, type: 'DISPENSE', quantity: -take, batchNo: batch.batchNo,
    reference, note: `Dispensed to ${patient.uhid}`, by: req.user._id,
  })));

  const admitted = await Admission.exists({ patient: patient._id, status: 'Admitted' });
  const invoice = await addCharges({ patientId: patient._id, type: 'Pharmacy', items: invoiceItems, userId: req.user._id });
  if (!admitted && Number(discount) > 0) {
    invoice.discount = Number(discount);
    invoice.discountReason = 'Pharmacy discount';
    invoice.recalc();
    await invoice.save();
  }
  let receiptNo;
  if (!admitted && payment?.mode) {
    receiptNo = await recordPayment(invoice, { amount: payment.amount ?? invoice.balance, mode: payment.mode, reference: payment.reference }, req.user);
  }
  if (encounter) await Encounter.updateOne({ _id: encounter }, { rxDispensedAt: new Date() });

  const low = [...new Set(plan.map((p) => p.med))].filter((m) => m.stock <= m.reorderLevel);
  if (low.length) {
    notifyStaff({ roles: ['pharmacist'], title: 'Low stock alert', message: low.map((m) => `${m.name} (${m.stock})`).join(', '), link: '/pharmacy?tab=alerts', type: 'warning' });
  }
  const fresh = await Invoice.findById(invoice._id).populate('patient', 'uhid firstName lastName phone');
  res.status(201).json({ reference, invoice: fresh, receiptNo, billedToIpd: Boolean(admitted) });
});

r.get('/sales', can('pharmacy', 'r'), async (req, res) => {
  const filter = { type: 'Pharmacy' };
  if (req.query.date) { const { start, end } = dayRange(req.query.date); filter.createdAt = { $gte: start, $lt: end }; }
  res.json(await paginate(Invoice, filter, req, { populate: { path: 'patient', select: 'uhid firstName lastName' } }));
});

export default r;
