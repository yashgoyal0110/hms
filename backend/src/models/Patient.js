import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const patientSchema = new Schema({
  uhid: { type: String, unique: true, index: true },
  title: { type: String, enum: ['Mr', 'Mrs', 'Ms', 'Master', 'Baby', 'Dr', ''], default: '' },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true, default: '' },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  dob: Date,
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'], default: 'Unknown' },
  maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed', ''], default: '' },
  phone: { type: String, required: true, trim: true, index: true },
  altPhone: String,
  email: { type: String, trim: true, lowercase: true },
  occupation: String,
  address: {
    line1: String, city: String, state: String, pincode: String,
  },
  idProof: { type: { type: String }, number: String },
  emergencyContact: { name: String, relation: String, phone: String },
  allergies: [String],
  chronicConditions: [String],
  currentMedications: [String],
  insurance: {
    provider: String, policyNumber: String, tpa: String, validTill: Date, coverageAmount: Number,
  },
  referredBy: String,
  notes: String,
  status: { type: String, enum: ['Active', 'Inactive', 'Deceased'], default: 'Active' },
  registeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

patientSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

patientSchema.virtual('age').get(function age() {
  if (!this.dob) return null;
  const diff = Date.now() - this.dob.getTime();
  return Math.floor(diff / (365.25 * 86400000));
});

patientSchema.index({ firstName: 1, lastName: 1 });
patientSchema.index({ createdAt: -1 });

export const Patient = model('Patient', patientSchema);
