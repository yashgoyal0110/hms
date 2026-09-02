import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

const labTestSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ['lab', 'radiology'], required: true, index: true },
  section: { type: String, required: true },
  sampleType: String,
  price: { type: Number, required: true, min: 0 },
  turnaroundHours: { type: Number, default: 24 },
  parameters: [{ name: String, unit: String, refRange: String, low: Number, high: Number }],
  instructions: String,
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const LabTest = model('LabTest', labTestSchema);

const labOrderSchema = new Schema({
  orderNo: { type: String, unique: true },
  category: { type: String, enum: ['lab', 'radiology'], required: true, index: true },
  patient: { ...ref('Patient'), required: true, index: true },
  doctor: ref('User'),
  encounter: ref('Encounter'),
  admission: ref('Admission'),
  priority: { type: String, enum: ['Routine', 'Urgent', 'STAT'], default: 'Routine' },
  status: {
    type: String,
    enum: ['Ordered', 'Sample Collected', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Ordered',
    index: true,
  },
  items: [{
    test: ref('LabTest'),
    code: String,
    name: String,
    section: String,
    price: Number,
    results: [{ parameter: String, value: String, unit: String, refRange: String, flag: { type: String, default: '' } }],
    findings: String,
    impression: String,
  }],
  clinicalNotes: String,
  reportRemarks: String,
  sampleCollectedAt: Date,
  collectedBy: ref('User'),
  completedAt: Date,
  reportedBy: ref('User'),
  invoice: ref('Invoice'),
  createdBy: ref('User'),
}, { timestamps: true });
labOrderSchema.index({ createdAt: -1 });
export const LabOrder = model('LabOrder', labOrderSchema);
