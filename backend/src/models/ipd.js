import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

const bedSchema = new Schema({
  number: { type: String, required: true },
  status: { type: String, enum: ['Available', 'Occupied', 'Cleaning', 'Maintenance', 'Reserved'], default: 'Available' },
  patient: ref('Patient'),
  admission: ref('Admission'),
});

const wardSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: {
    type: String,
    enum: ['General', 'Semi-Private', 'Private', 'Deluxe', 'ICU', 'NICU', 'HDU', 'Emergency', 'Maternity'],
    default: 'General',
  },
  floor: String,
  dailyRate: { type: Number, default: 0, min: 0 },
  nursingRate: { type: Number, default: 0, min: 0 },
  gender: { type: String, enum: ['Any', 'Male', 'Female'], default: 'Any' },
  beds: [bedSchema],
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Ward = model('Ward', wardSchema);

const admissionSchema = new Schema({
  admissionNo: { type: String, unique: true },
  patient: { ...ref('Patient'), required: true, index: true },
  doctor: { ...ref('User'), required: true },
  department: ref('Department'),
  ward: { ...ref('Ward'), required: true },
  bedNumber: { type: String, required: true },
  admissionType: { type: String, enum: ['Planned', 'Emergency', 'Referral', 'Day Care'], default: 'Planned' },
  admittedAt: { type: Date, default: Date.now },
  expectedDischarge: Date,
  reason: { type: String, required: true },
  provisionalDiagnosis: String,
  attendant: { name: String, relation: String, phone: String },
  status: { type: String, enum: ['Admitted', 'Discharged', 'LAMA', 'Referred', 'Expired'], default: 'Admitted', index: true },
  dischargedAt: Date,
  dischargeSummary: {
    finalDiagnosis: String,
    treatmentGiven: String,
    procedures: String,
    conditionAtDischarge: String,
    medications: String,
    followUp: String,
    instructions: String,
  },
  notes: [{
    type: { type: String, enum: ['Nursing', 'Doctor', 'Vitals', 'Medication'], default: 'Nursing' },
    text: String,
    vitals: {
      bpSystolic: Number, bpDiastolic: Number, pulse: Number, temperature: Number, spo2: Number, respRate: Number,
    },
    by: ref('User'),
    at: { type: Date, default: Date.now },
  }],
  bedHistory: [{
    ward: ref('Ward'), wardName: String, bedNumber: String, dailyRate: Number, from: Date, to: Date,
  }],
  deposit: { type: Number, default: 0 },
  invoice: ref('Invoice'),
  createdBy: ref('User'),
}, { timestamps: true });
export const Admission = model('Admission', admissionSchema);

const theatreSchema = new Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  type: { type: String, enum: ['Major', 'Minor', 'Cardiac', 'Neuro', 'Orthopaedic', 'Obstetric'], default: 'Major' },
  location: String,
  status: { type: String, enum: ['Available', 'In Use', 'Cleaning', 'Maintenance'], default: 'Available' },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Theatre = model('Theatre', theatreSchema);

const surgerySchema = new Schema({
  surgeryNo: { type: String, unique: true },
  patient: { ...ref('Patient'), required: true, index: true },
  admission: ref('Admission'),
  theatre: { ...ref('Theatre'), required: true },
  procedure: { type: String, required: true },
  category: { type: String, enum: ['Major', 'Minor', 'Day Care'], default: 'Major' },
  priority: { type: String, enum: ['Elective', 'Urgent', 'Emergency'], default: 'Elective' },
  surgeon: { ...ref('User'), required: true },
  anaesthetist: ref('User'),
  assistants: [ref('User')],
  anaesthesiaType: { type: String, enum: ['General', 'Spinal', 'Epidural', 'Regional', 'Local', 'Sedation', ''], default: '' },
  scheduledAt: { type: Date, required: true, index: true },
  durationMins: { type: Number, default: 60 },
  status: { type: String, enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Postponed'], default: 'Scheduled' },
  preOpDiagnosis: String,
  checklist: {
    consent: { type: Boolean, default: false },
    fasting: { type: Boolean, default: false },
    siteMarked: { type: Boolean, default: false },
    bloodArranged: { type: Boolean, default: false },
    anaesthesiaCleared: { type: Boolean, default: false },
  },
  operativeNotes: String,
  postOpInstructions: String,
  startedAt: Date,
  endedAt: Date,
  charges: { type: Number, default: 0 },
  billed: { type: Boolean, default: false },
  createdBy: ref('User'),
}, { timestamps: true });
export const Surgery = model('Surgery', surgerySchema);
