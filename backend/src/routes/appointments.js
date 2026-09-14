import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Appointment, Encounter, Patient, User, getSettings, nextCode,
} from '../models/index.js';
import { addCharges } from '../services/billing.js';
import { notifyPatient } from '../services/messaging.js';
import { badRequest, clean, conflict, notFound } from '../utils/http.js';
import { dayRange, paginate } from '../utils/query.js';

const r = Router();
const ACTIVE = ['Scheduled', 'Checked-in', 'In-consultation'];

function toMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function toTime(mins) { return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; }

r.get('/', can('appointments', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.date) { const { start, end } = dayRange(req.query.date); filter.date = { $gte: start, $lt: end }; }
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = dayRange(req.query.from).start;
    if (req.query.to) filter.date.$lt = dayRange(req.query.to).end;
  }
  if (req.query.doctor) filter.doctor = req.query.doctor === 'me' ? req.user._id : req.query.doctor;
  if (req.query.department) filter.department = req.query.department;
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.patient) filter.patient = req.query.patient;
  res.json(await paginate(Appointment, filter, req, {
    sort: req.query.date ? 'timeSlot' : '-date',
    populate: [
      { path: 'patient', select: 'uhid firstName lastName phone gender dob' },
      { path: 'doctor', select: 'name specialization' },
      { path: 'department', select: 'name' },
    ],
    defLimit: 100,
  }));
});

// Available slots for a doctor on a date, based on their availability and existing bookings.
r.get('/slots', can('appointments', 'r'), async (req, res) => {
  const doctor = await User.findById(req.query.doctor);
  if (!doctor || doctor.role !== 'doctor') throw badRequest('Select a valid doctor');
  const { start, end } = dayRange(req.query.date);
  const av = doctor.availability || {};
  const working = (av.days || []).includes(start.getDay());
  const booked = await Appointment.find({ doctor: doctor._id, date: { $gte: start, $lt: end }, status: { $in: [...ACTIVE, 'Completed'] } }).select('timeSlot');
  const taken = new Set(booked.map((b) => b.timeSlot));
  const slots = [];
  if (working) {
    const step = av.slotMinutes || 15;
    const now = new Date();
    const isToday = start.toDateString() === now.toDateString();
    for (let m = toMinutes(av.start || '09:00'); m + step <= toMinutes(av.end || '17:00'); m += step) {
      const t = toTime(m);
      const past = isToday && m < now.getHours() * 60 + now.getMinutes();
      slots.push({ time: t, available: !taken.has(t) && !past });
    }
  }
  res.json({ working, slots, fee: doctor.consultationFee });
});

r.post('/', can('appointments', 'rw'), async (req, res) => {
  const data = clean(req.body, ['appointmentNo', 'status', 'tokenNo', 'invoice', 'encounter', 'createdBy']);
  const [patient, doctor] = await Promise.all([Patient.findById(data.patient), User.findById(data.doctor)]);
  if (!patient) throw badRequest('Select a valid patient');
  if (!doctor || doctor.role !== 'doctor' || !doctor.active) throw badRequest('Select a valid doctor');
  const { start, end } = dayRange(data.date);
  if (!data.timeSlot) throw badRequest('Select a time slot');
  const clash = await Appointment.findOne({ doctor: doctor._id, date: { $gte: start, $lt: end }, timeSlot: data.timeSlot, status: { $in: ACTIVE } });
  if (clash && data.type !== 'Emergency') throw conflict(`Dr. ${doctor.name} already has an appointment at ${data.timeSlot}`);
  const appt = await Appointment.create({
    ...data,
    date: start,
    department: data.department || doctor.department,
    appointmentNo: await nextCode('APT'),
    createdBy: req.user._id,
  });
  notifyPatient('appointment_booked', patient, {
    doctorName: doctor.name, date: start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), time: data.timeSlot, appointmentNo: appt.appointmentNo,
  });
  res.status(201).json(appt);
});

r.get('/:id', can('appointments', 'r'), async (req, res) => {
  const appt = await Appointment.findById(req.params.id)
    .populate('patient').populate('doctor', 'name specialization consultationFee').populate('department', 'name');
  if (!appt) throw notFound('Appointment');
  res.json(appt);
});

r.put('/:id', can('appointments', 'rw'), async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw notFound('Appointment');
  if (!['Scheduled'].includes(appt.status)) throw badRequest('Only scheduled appointments can be rescheduled');
  const { date, timeSlot, notes, reason, type } = req.body;
  if (date || timeSlot) {
    const { start, end } = dayRange(date || appt.date);
    const slot = timeSlot || appt.timeSlot;
    const clash = await Appointment.findOne({ _id: { $ne: appt._id }, doctor: appt.doctor, date: { $gte: start, $lt: end }, timeSlot: slot, status: { $in: ACTIVE } });
    if (clash) throw conflict('Selected slot is already booked');
    appt.date = start; appt.timeSlot = slot;
  }
  if (notes !== undefined) appt.notes = notes;
  if (reason !== undefined) appt.reason = reason;
  if (type) appt.type = type;
  await appt.save();
  res.json(appt);
});

// Workflow transitions: check-in (token + consultation bill), start, cancel, no-show.
r.post('/:id/status', can('appointments', 'rw'), async (req, res) => {
  const appt = await Appointment.findById(req.params.id).populate('doctor');
  if (!appt) throw notFound('Appointment');
  const { status, reason, bill = true } = req.body;
  const allowed = {
    'Checked-in': ['Scheduled'],
    'In-consultation': ['Checked-in', 'Scheduled'],
    Cancelled: ['Scheduled', 'Checked-in'],
    'No-show': ['Scheduled'],
    Completed: ['In-consultation', 'Checked-in'],
  };
  if (!allowed[status]) throw badRequest('Invalid status');
  if (!allowed[status].includes(appt.status)) throw badRequest(`Cannot change status from ${appt.status} to ${status}`);

  if (status === 'Checked-in' || (status === 'In-consultation' && !appt.tokenNo)) {
    const { start, end } = dayRange(appt.date);
    const last = await Appointment.findOne({ doctor: appt.doctor._id, date: { $gte: start, $lt: end }, tokenNo: { $gt: 0 } }).sort('-tokenNo');
    appt.tokenNo = (last?.tokenNo || 0) + 1;
    appt.checkedInAt = new Date();
    if (bill && !appt.invoice) {
      const settings = await getSettings();
      const fee = appt.type === 'Follow-up' ? Math.round((appt.doctor.consultationFee || settings.defaultConsultationFee) / 2) : (appt.doctor.consultationFee || settings.defaultConsultationFee);
      if (fee > 0) {
        const inv = await addCharges({
          patientId: appt.patient, type: 'OPD', userId: req.user._id, appointment: appt._id,
          items: [{ description: `${appt.type} consultation - Dr. ${appt.doctor.name}`, category: 'Consultation', quantity: 1, rate: fee, refType: 'Appointment', refId: appt._id }],
        });
        appt.invoice = inv?._id;
      }
    }
  }
  if (status === 'In-consultation') {
    appt.startedAt = new Date();
    if (!appt.encounter) {
      const enc = await Encounter.create({
        encounterNo: await nextCode('ENC'), patient: appt.patient, doctor: appt.doctor._id, department: appt.department,
        appointment: appt._id, type: appt.type === 'Emergency' ? 'Emergency' : 'OPD',
      });
      appt.encounter = enc._id;
    }
  }
  if (status === 'Completed') appt.completedAt = new Date();
  if (status === 'Cancelled') appt.cancelReason = reason;
  appt.status = status;
  await appt.save();
  res.json(appt);
});

export default r;
