import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Admission, Appointment, Encounter, Patient, nextCode,
} from '../models/index.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { dayRange, paginate } from '../utils/query.js';

const r = Router();
const populate = [
  { path: 'patient', select: 'uhid firstName lastName gender dob phone bloodGroup allergies chronicConditions' },
  { path: 'doctor', select: 'name specialization qualification registrationNo' },
  { path: 'department', select: 'name' },
];

r.get('/', can('opd', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.doctor) filter.doctor = req.query.doctor === 'me' ? req.user._id : req.query.doctor;
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.date) { const { start, end } = dayRange(req.query.date); filter.createdAt = { $gte: start, $lt: end }; }
  res.json(await paginate(Encounter, filter, req, { populate }));
});

r.post('/', can('opd', 'rw'), async (req, res) => {
  const data = clean(req.body, ['encounterNo', 'status', 'completedAt']);
  const patient = await Patient.findById(data.patient);
  if (!patient) throw badRequest('Select a valid patient');
  if (!data.doctor) data.doctor = req.user.role === 'doctor' ? req.user._id : undefined;
  if (!data.doctor) throw badRequest('Select the consulting doctor');
  if (data.type === 'IPD' && !data.admission) {
    const adm = await Admission.findOne({ patient: patient._id, status: 'Admitted' });
    data.admission = adm?._id;
  }
  const enc = await Encounter.create({ ...data, encounterNo: await nextCode('ENC') });
  res.status(201).json(enc);
});

r.get('/:id', can('opd', 'r'), async (req, res) => {
  const enc = await Encounter.findById(req.params.id).populate(populate)
    .populate({ path: 'labOrders', select: 'orderNo category status items.name priority' })
    .populate('appointment', 'appointmentNo tokenNo type');
  if (!enc) throw notFound('Consultation');
  res.json(enc);
});

r.put('/:id', can('opd', 'rw'), async (req, res) => {
  const enc = await Encounter.findById(req.params.id);
  if (!enc) throw notFound('Consultation');
  const data = clean(req.body, ['encounterNo', 'patient', 'appointment', 'labOrders', 'completedAt', 'status']);
  if (data.vitals) {
    const v = { ...(enc.vitals?.toObject?.() || {}), ...data.vitals };
    if (v.weight && v.height) v.bmi = Math.round((v.weight / ((v.height / 100) ** 2)) * 10) / 10;
    v.recordedBy = req.user._id;
    v.recordedAt = new Date();
    data.vitals = v;
  }
  enc.set(data);
  await enc.save();
  res.json(enc);
});

r.post('/:id/complete', can('opd', 'rw'), async (req, res) => {
  const enc = await Encounter.findById(req.params.id);
  if (!enc) throw notFound('Consultation');
  if (!enc.diagnoses?.length && !enc.chiefComplaint) throw badRequest('Record at least a chief complaint or diagnosis before completing');
  enc.status = 'Completed';
  enc.completedAt = new Date();
  await enc.save();
  if (enc.appointment) {
    await Appointment.updateOne({ _id: enc.appointment }, { status: 'Completed', completedAt: new Date() });
  }
  res.json(enc);
});

export default r;
