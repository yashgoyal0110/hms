import {
  Admission, Invoice, LedgerEntry, nextCode,
} from '../models/index.js';
import { badRequest } from '../utils/http.js';

/**
 * Add charges for a patient. If the patient is currently admitted, charges go onto the
 * running IPD bill; otherwise a new finalized invoice of the given type is created.
 */
export async function addCharges({ patientId, type, items, userId, appointment, forceSeparate = false }) {
  if (!items?.length) return null;
  if (!forceSeparate) {
    const admission = await Admission.findOne({ patient: patientId, status: 'Admitted' });
    if (admission) {
      const inv = await getOrCreateIpdInvoice(admission, userId);
      inv.items.push(...items);
      inv.recalc();
      await inv.save();
      return inv;
    }
  }
  const inv = new Invoice({
    invoiceNo: await nextCode('INV'), patient: patientId, type, items, appointment, createdBy: userId, finalized: true,
  });
  inv.recalc();
  await inv.save();
  return inv;
}

export async function getOrCreateIpdInvoice(admission, userId) {
  if (admission.invoice) {
    const existing = await Invoice.findById(admission.invoice);
    if (existing) return existing;
  }
  const inv = new Invoice({
    invoiceNo: await nextCode('INV'), patient: admission.patient, type: 'IPD', admission: admission._id,
    finalized: false, createdBy: userId, items: [],
  });
  inv.recalc();
  await inv.save();
  admission.invoice = inv._id;
  await admission.save();
  return inv;
}

export async function recordPayment(invoice, { amount, mode, reference, paidAt }, user) {
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!amt || amt <= 0) throw badRequest('Payment amount must be greater than zero');
  if (invoice.status === 'Cancelled') throw badRequest('Cannot accept payment on a cancelled invoice');
  // Advances are allowed on running (non-finalized) IPD bills.
  if (invoice.finalized && amt > invoice.balance + 0.001) throw badRequest('Payment exceeds outstanding balance');
  const receiptNo = await nextCode('RCP');
  invoice.payments.push({ receiptNo, amount: amt, mode, reference, paidAt: paidAt || new Date(), receivedBy: user?._id });
  invoice.recalc();
  await invoice.save();
  await LedgerEntry.create({
    entryNo: await nextCode('LED'),
    date: paidAt || new Date(),
    type: 'Income',
    category: invoice.type,
    amount: amt,
    mode,
    description: `Receipt ${receiptNo} against ${invoice.invoiceNo}`,
    reference: receiptNo,
    invoice: invoice._id,
    auto: true,
    createdBy: user?._id,
  });
  return receiptNo;
}

export function daysBetween(from, to) {
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(to); b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b - a) / 86400000));
}
