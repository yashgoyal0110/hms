import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

const appointmentSchema = new Schema({
  appointmentNo: { type: String, unique: true },
  patient: { ...ref('Patient'), required: true, index: true },
  doctor: { ...ref('User'), required: true, index: true },
  department: ref('Department'),
  date: { type: Date, required: true, index: true },
  timeSlot: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  type: { type: String, enum: ['New', 'Follow-up', 'Emergency', 'Teleconsult'], default: 'New' },
  source: { type: String, enum: ['Walk-in', 'Phone', 'Online', 'Referral'], default: 'Walk-in' },
  status: {
    type: String,
    enum: ['Scheduled', 'Checked-in', 'In-consultation', 'Completed', 'Cancelled', 'No-show'],
    default: 'Scheduled',
  },
  tokenNo: Number,
  reason: String,
  notes: String,
  cancelReason: String,
  checkedInAt: Date,
  startedAt: Date,
  completedAt: Date,
  invoice: ref('Invoice'),
  encounter: ref('Encounter'),
  createdBy: ref('User'),
  // Created by the demo activity simulator (demo mode only); advanced automatically through the day.
  simulated: { type: Boolean, default: false },
}, { timestamps: true });
appointmentSchema.index({ doctor: 1, date: 1, timeSlot: 1 });
export const Appointment = model('Appointment', appointmentSchema);

const vitalsSchema = new Schema({
  bpSystolic: Number,
  bpDiastolic: Number,
  pulse: Number,
  temperature: Number,
  spo2: Number,
  respRate: Number,
  weight: Number,
  height: Number,
  bmi: Number,
  bloodSugar: Number,
  recordedAt: { type: Date, default: Date.now },
  recordedBy: ref('User'),
}, { _id: false });

const encounterSchema = new Schema({
  encounterNo: { type: String, unique: true },
  patient: { ...ref('Patient'), required: true, index: true },
  doctor: { ...ref('User'), required: true },
  department: ref('Department'),
  appointment: ref('Appointment'),
  admission: ref('Admission'),
  type: { type: String, enum: ['OPD', 'IPD', 'Emergency'], default: 'OPD' },
  status: { type: String, enum: ['Open', 'Completed'], default: 'Open' },
  vitals: vitalsSchema,
  chiefComplaint: String,
  historyOfIllness: String,
  pastHistory: String,
  examination: String,
  diagnoses: [{
    code: String,
    description: { type: String, required: true },
    type: { type: String, enum: ['Provisional', 'Final'], default: 'Provisional' },
  }],
  prescriptions: [{
    medicine: ref('Medicine'),
    name: { type: String, required: true },
    dosage: String,
    frequency: String,
    duration: String,
    route: { type: String, default: 'Oral' },
    instructions: String,
  }],
  labOrders: [ref('LabOrder')],
  advice: String,
  followUpDate: Date,
  completedAt: Date,
  rxDispensedAt: Date,
}, { timestamps: true });
encounterSchema.index({ createdAt: -1 });
export const Encounter = model('Encounter', encounterSchema);
