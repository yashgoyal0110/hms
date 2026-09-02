import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../permissions.js';

const { Schema, model } = mongoose;

const departmentSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  type: { type: String, enum: ['Clinical', 'Diagnostic', 'Administrative', 'Support'], default: 'Clinical' },
  description: String,
  location: String,
  head: { type: Schema.Types.ObjectId, ref: 'User' },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Department = model('Department', departmentSchema);

const userSchema = new Schema({
  employeeId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false, minlength: 8 },
  role: { type: String, enum: Object.keys(ROLES), required: true },
  phone: { type: String, trim: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  department: { type: Schema.Types.ObjectId, ref: 'Department' },
  designation: String,
  specialization: String,
  qualification: String,
  registrationNo: String,
  consultationFee: { type: Number, default: 0, min: 0 },
  joiningDate: Date,
  availability: {
    days: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    start: { type: String, default: '09:00' },
    end: { type: String, default: '17:00' },
    slotMinutes: { type: Number, default: 15 },
  },
  active: { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  lastLogin: Date,
  passwordChangedAt: Date,
}, { timestamps: true });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
});

userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password; delete ret.failedLogins; delete ret.lockUntil; delete ret.__v;
    return ret;
  },
});

export const User = model('User', userSchema);

export function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password must contain upper-case, lower-case and numeric characters';
  }
  return null;
}
