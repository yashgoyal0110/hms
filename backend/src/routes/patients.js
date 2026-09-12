import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Admission, Appointment, Encounter, Invoice, LabOrder, Patient, Surgery, getSettings, nextCode,
} from '../models/index.js';
import { addCharges } from '../services/billing.js';
import { clean, notFound } from '../utils/http.js';
import { paginate, searchFilter } from '../utils/query.js';

const r = Router();

r.get('/', can('patients', 'r'), async (req, res) => {
  const filter = searchFilter(req.query.q, ['uhid', 'firstName', 'lastName', 'phone', 'email']);
  if (req.query.gender) filter.gender = req.query.gender;
  if (req.query.status) filter.status = req.query.status;
  res.json(await paginate(Patient, filter, req, { sort: '-createdAt' }));
});

r.post('/', can('patients', 'rw'), async (req, res) => {
  const data = clean(req.body, ['uhid', 'registeredBy']);
  const { chargeRegistration } = req.body;
  delete data.chargeRegistration;
  const dup = await Patient.findOne({ phone: data.phone, firstName: new RegExp(`^${String(data.firstName || '').replace(/[^\w ]/g, '')}$`, 'i') });
  if (dup && !req.body.allowDuplicate) {
    return res.status(409).json({ message: `A patient with this name and phone already exists (${dup.uhid})`, duplicate: dup });
  }
  delete data.allowDuplicate;
  const patient = await Patient.create({ ...data, uhid: await nextCode('UH', { yearly: false, pad: 6, sep: '' }), registeredBy: req.user._id });
  if (chargeRegistration) {
    const s = await getSettings();
    if (s.registrationFee > 0) {
      await addCharges({
        patientId: patient._id, type: 'OPD', userId: req.user._id, forceSeparate: true,
        items: [{ description: 'Patient registration', category: 'Registration', quantity: 1, rate: s.registrationFee }],
      });
    }
  }
  res.status(201).json(patient);
});

r.get('/:id', can('patients', 'r'), async (req, res) => {
  const patient = await Patient.findById(req.params.id).populate('registeredBy', 'name');
  if (!patient) throw notFound('Patient');
  const [activeAdmission, visits, outstanding] = await Promise.all([
    Admission.findOne({ patient: patient._id, status: 'Admitted' }).populate('ward', 'name').populate('doctor', 'name'),
    Encounter.countDocuments({ patient: patient._id }),
    Invoice.aggregate([
      { $match: { patient: patient._id, status: { $in: ['Unpaid', 'Partially Paid'] } } },
      { $group: { _id: null, due: { $sum: '$balance' } } },
    ]),
  ]);
  res.json({ patient, activeAdmission, visits, outstanding: outstanding[0]?.due || 0 });
});

r.put('/:id', can('patients', 'rw'), async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw notFound('Patient');
  patient.set(clean(req.body, ['uhid', 'registeredBy']));
  await patient.save();
  res.json(patient);
});

// Consolidated clinical and financial history for the EMR view.
r.get('/:id/history', can('patients', 'r'), async (req, res) => {
  const id = req.params.id;
  const [encounters, appointments, admissions, labOrders, invoices, surgeries] = await Promise.all([
    Encounter.find({ patient: id }).sort('-createdAt').limit(100).populate('doctor', 'name specialization').populate('department', 'name'),
    Appointment.find({ patient: id }).sort('-date').limit(100).populate('doctor', 'name').populate('department', 'name'),
    Admission.find({ patient: id }).sort('-admittedAt').limit(50).populate('ward', 'name').populate('doctor', 'name'),
    LabOrder.find({ patient: id }).sort('-createdAt').limit(100).populate('doctor', 'name'),
    Invoice.find({ patient: id }).sort('-createdAt').limit(100).select('-items'),
    Surgery.find({ patient: id }).sort('-scheduledAt').limit(50).populate('surgeon', 'name').populate('theatre', 'name'),
  ]);
  res.json({ encounters, appointments, admissions, labOrders, invoices, surgeries });
});

export default r;
