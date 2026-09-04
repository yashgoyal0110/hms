import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = model('Counter', counterSchema);

export async function nextSeq(key) {
  const c = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}

// e.g. nextCode('INV') -> INV-2026-000042 ; nextCode('UH', { yearly: false, pad: 6, sep: '' }) -> UH000042
export async function nextCode(prefix, { yearly = true, pad = 6, sep = '-' } = {}) {
  const year = new Date().getFullYear();
  const key = yearly ? `${prefix}-${year}` : prefix;
  const n = String(await nextSeq(key)).padStart(pad, '0');
  return yearly ? `${prefix}${sep}${year}${sep}${n}` : `${prefix}${sep}${n}`;
}

const settingSchema = new Schema({
  _id: { type: String, default: 'hospital' },
  name: { type: String, default: 'City Care Multispeciality Hospital' },
  tagline: { type: String, default: 'Quality care, every day' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  website: { type: String, default: '' },
  gstin: { type: String, default: '' },
  registrationNo: { type: String, default: '' },
  currency: { type: String, default: '₹' },
  invoiceFooter: { type: String, default: 'This is a computer generated document.' },
  prescriptionFooter: { type: String, default: '' },
  defaultConsultationFee: { type: Number, default: 500 },
  registrationFee: { type: Number, default: 100 },
}, { timestamps: true });
export const Setting = model('Setting', settingSchema);

export async function getSettings() {
  let s = await Setting.findById('hospital');
  if (!s) s = await Setting.create({ _id: 'hospital' });
  return s;
}

const auditSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  role: String,
  action: { type: String, required: true },
  entity: String,
  entityId: String,
  method: String,
  path: String,
  status: Number,
  ip: String,
  userAgent: String,
  at: { type: Date, default: Date.now },
}, { versionKey: false });
auditSchema.index({ at: -1 });
auditSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });
export const AuditLog = model('AuditLog', auditSchema);

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  message: String,
  link: String,
  type: { type: String, enum: ['info', 'warning', 'critical', 'success'], default: 'info' },
  read: { type: Boolean, default: false },
}, { timestamps: true });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
export const Notification = model('Notification', notificationSchema);

const templateSchema = new Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  channel: { type: String, enum: ['SMS', 'Email', 'WhatsApp'], default: 'SMS' },
  subject: String,
  body: { type: String, required: true },
  autoSend: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const MessageTemplate = model('MessageTemplate', templateSchema);

const messageSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
  channel: { type: String, enum: ['SMS', 'Email', 'WhatsApp'], required: true },
  to: { type: String, required: true },
  subject: String,
  body: { type: String, required: true },
  status: { type: String, enum: ['Queued', 'Sent', 'Failed', 'Logged'], default: 'Queued' },
  error: String,
  template: String,
  sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
  automatic: { type: Boolean, default: false },
}, { timestamps: true });
export const Message = model('Message', messageSchema);

const shiftSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  shift: { type: String, enum: ['Morning', 'Evening', 'Night', 'General', 'Off', 'Leave'], required: true },
  department: { type: Schema.Types.ObjectId, ref: 'Department' },
  location: String,
  notes: String,
}, { timestamps: true });
shiftSchema.index({ user: 1, date: 1 }, { unique: true });
export const Shift = model('Shift', shiftSchema);
