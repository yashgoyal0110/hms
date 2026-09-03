import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

export const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Insurance', 'Advance'];
export const CHARGE_CATEGORIES = [
  'Registration', 'Consultation', 'Room', 'Nursing', 'Pharmacy', 'Laboratory', 'Radiology',
  'Procedure', 'OT', 'Consumables', 'Other',
];

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const invoiceSchema = new Schema({
  invoiceNo: { type: String, unique: true },
  patient: { ...ref('Patient'), required: true, index: true },
  type: { type: String, enum: ['OPD', 'IPD', 'Pharmacy', 'Laboratory', 'Radiology', 'OT', 'General'], default: 'General' },
  items: [{
    description: { type: String, required: true },
    category: { type: String, enum: CHARGE_CATEGORIES, default: 'Other' },
    quantity: { type: Number, default: 1, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    amount: Number,
    refType: String,
    refId: Schema.Types.ObjectId,
    addedAt: { type: Date, default: Date.now },
  }],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0, min: 0 },
  discountReason: String,
  taxTotal: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  status: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'], default: 'Unpaid', index: true },
  finalized: { type: Boolean, default: true },
  payments: [{
    receiptNo: String,
    amount: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    reference: String,
    paidAt: { type: Date, default: Date.now },
    receivedBy: ref('User'),
  }],
  admission: ref('Admission'),
  appointment: ref('Appointment'),
  notes: String,
  cancelReason: String,
  createdBy: ref('User'),
}, { timestamps: true });

invoiceSchema.methods.recalc = function recalc() {
  let subtotal = 0; let tax = 0;
  for (const it of this.items) {
    const base = r2((it.quantity || 0) * (it.rate || 0));
    it.amount = base;
    subtotal += base;
    tax += base * ((it.taxRate || 0) / 100);
  }
  this.subtotal = r2(subtotal);
  this.taxTotal = r2(tax);
  this.discount = Math.min(this.discount || 0, this.subtotal + this.taxTotal);
  this.total = r2(this.subtotal + this.taxTotal - this.discount);
  this.amountPaid = r2(this.payments.reduce((s, p) => s + p.amount, 0));
  this.balance = r2(this.total - this.amountPaid);
  if (this.status !== 'Cancelled') {
    if (this.amountPaid <= 0) this.status = 'Unpaid';
    else if (this.balance > 0) this.status = 'Partially Paid';
    else this.status = 'Paid';
  }
  return this;
};
invoiceSchema.index({ createdAt: -1 });
export const Invoice = model('Invoice', invoiceSchema);

const claimSchema = new Schema({
  claimNo: { type: String, unique: true },
  patient: { ...ref('Patient'), required: true },
  invoice: { ...ref('Invoice'), required: true },
  admission: ref('Admission'),
  provider: { type: String, required: true },
  tpa: String,
  policyNumber: { type: String, required: true },
  preAuthNo: String,
  claimAmount: { type: Number, required: true, min: 0 },
  approvedAmount: { type: Number, default: 0 },
  settledAmount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Under Review', 'Query Raised', 'Approved', 'Partially Approved', 'Rejected', 'Settled'],
    default: 'Submitted',
    index: true,
  },
  submittedAt: { type: Date, default: Date.now },
  settledAt: Date,
  remarks: String,
  history: [{ status: String, note: String, at: { type: Date, default: Date.now }, by: ref('User') }],
  createdBy: ref('User'),
}, { timestamps: true });
export const InsuranceClaim = model('InsuranceClaim', claimSchema);

export const INCOME_CATEGORIES = ['OPD', 'IPD', 'Pharmacy', 'Laboratory', 'Radiology', 'OT', 'General', 'Other Income'];
export const EXPENSE_CATEGORIES = [
  'Salaries', 'Medical Supplies', 'Pharmacy Purchases', 'Utilities', 'Rent', 'Maintenance',
  'Equipment', 'Housekeeping', 'Marketing', 'Insurance', 'Taxes', 'Professional Fees', 'Miscellaneous',
];

const ledgerSchema = new Schema({
  entryNo: { type: String, unique: true },
  date: { type: Date, default: Date.now, index: true },
  type: { type: String, enum: ['Income', 'Expense'], required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  mode: { type: String, enum: [...PAYMENT_MODES], default: 'Cash' },
  description: String,
  reference: String,
  payee: String,
  invoice: ref('Invoice'),
  auto: { type: Boolean, default: false },
  createdBy: ref('User'),
}, { timestamps: true });
export const LedgerEntry = model('LedgerEntry', ledgerSchema);
