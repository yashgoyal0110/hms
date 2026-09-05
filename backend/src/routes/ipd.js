import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Admission, Patient, User, Ward, nextCode,
} from '../models/index.js';
import { daysBetween, getOrCreateIpdInvoice, recordPayment } from '../services/billing.js';
import { notifyPatient } from '../services/messaging.js';
import { notifyStaff } from '../services/notify.js';
import {
  badRequest, clean, conflict, notFound,
} from '../utils/http.js';
import { paginate, searchFilter } from '../utils/query.js';

export const wardsRouter = Router();
export const admissionsRouter = Router();

/* ---------------- Wards & beds ---------------- */

wardsRouter.get('/', can('wards', 'r'), async (req, res) => {
  const filter = { active: true };
  if (req.query.type) filter.type = req.query.type;
  const wards = await Ward.find(filter).sort('floor name')
    .populate('beds.patient', 'uhid firstName lastName gender dob')
    .populate({ path: 'beds.admission', select: 'admissionNo admittedAt doctor', populate: { path: 'doctor', select: 'name' } });
  res.json(wards);
});

wardsRouter.post('/', can('wards', 'rw'), async (req, res) => {
  const { bedCount = 0, bedPrefix, ...rest } = clean(req.body, ['beds']);
  const prefix = bedPrefix || String(rest.code || '').toUpperCase();
  const beds = Array.from({ length: Math.min(Number(bedCount) || 0, 200) }, (_, i) => ({ number: `${prefix}-${String(i + 1).padStart(2, '0')}` }));
  const ward = await Ward.create({ ...rest, beds });
  res.status(201).json(ward);
});

wardsRouter.put('/:id', can('wards', 'rw'), async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  if (!ward) throw notFound('Ward');
  ward.set(clean(req.body, ['beds']));
  await ward.save();
  res.json(ward);
});

wardsRouter.post('/:id/beds', can('wards', 'rw'), async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  if (!ward) throw notFound('Ward');
  const number = String(req.body.number || '').trim();
  if (!number) throw badRequest('Bed number is required');
  if (ward.beds.some((b) => b.number === number)) throw conflict('Bed number already exists in this ward');
  ward.beds.push({ number });
  await ward.save();
  res.status(201).json(ward);
});

wardsRouter.patch('/:id/beds/:bedId', can('wards', 'rw'), async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  const bed = ward?.beds.id(req.params.bedId);
  if (!bed) throw notFound('Bed');
  const { status } = req.body;
  if (bed.status === 'Occupied') throw badRequest('Occupied beds can only be released through discharge or transfer');
  if (!['Available', 'Cleaning', 'Maintenance', 'Reserved'].includes(status)) throw badRequest('Invalid bed status');
  bed.status = status;
  await ward.save();
  res.json(ward);
});

wardsRouter.delete('/:id/beds/:bedId', can('wards', 'rw'), async (req, res) => {
  const ward = await Ward.findById(req.params.id);
  const bed = ward?.beds.id(req.params.bedId);
  if (!bed) throw notFound('Bed');
  if (bed.status === 'Occupied') throw badRequest('Cannot remove an occupied bed');
  bed.deleteOne();
  await ward.save();
  res.json(ward);
});

/* ---------------- Admissions ---------------- */

const admPopulate = [
  { path: 'patient', select: 'uhid firstName lastName gender dob phone bloodGroup allergies insurance address' },
  { path: 'doctor', select: 'name specialization qualification' },
  { path: 'department', select: 'name' },
  { path: 'ward', select: 'name code type dailyRate nursingRate' },
];

admissionsRouter.get('/', can('ipd', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.ward) filter.ward = req.query.ward;
  if (req.query.doctor) filter.doctor = req.query.doctor === 'me' ? req.user._id : req.query.doctor;
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.q) {
    const pts = await Patient.find(searchFilter(req.query.q, ['uhid', 'firstName', 'lastName', 'phone'])).select('_id').limit(200);
    filter.$or = [{ patient: { $in: pts.map((p) => p._id) } }, { admissionNo: { $regex: req.query.q, $options: 'i' } }];
  }
  res.json(await paginate(Admission, filter, req, { sort: '-admittedAt', populate: admPopulate, select: '-notes' }));
});

async function occupyBed(wardId, bedNumber, patientId, admissionId) {
  const updated = await Ward.findOneAndUpdate(
    { _id: wardId, beds: { $elemMatch: { number: bedNumber, status: { $in: ['Available', 'Reserved'] } } } },
    { $set: { 'beds.$.status': 'Occupied', 'beds.$.patient': patientId, 'beds.$.admission': admissionId } },
    { new: true },
  );
  if (!updated) throw conflict('Selected bed is not available');
  return updated;
}

async function releaseBed(wardId, bedNumber) {
  await Ward.updateOne(
    { _id: wardId, 'beds.number': bedNumber },
    { $set: { 'beds.$.status': 'Cleaning' }, $unset: { 'beds.$.patient': '', 'beds.$.admission': '' } },
  );
}

admissionsRouter.post('/', can('ipd', 'rw'), async (req, res) => {
  const data = clean(req.body, ['admissionNo', 'status', 'dischargedAt', 'dischargeSummary', 'notes', 'bedHistory', 'invoice', 'createdBy']);
  const [patient, doctor, ward] = await Promise.all([
    Patient.findById(data.patient), User.findById(data.doctor), Ward.findById(data.ward),
  ]);
  if (!patient) throw badRequest('Select a valid patient');
  if (!doctor || doctor.role !== 'doctor') throw badRequest('Select the admitting doctor');
  if (!ward) throw badRequest('Select a ward');
  if (await Admission.exists({ patient: patient._id, status: 'Admitted' })) throw conflict('Patient is already admitted');

  const admission = new Admission({
    ...data,
    department: data.department || doctor.department,
    admissionNo: await nextCode('IPD'),
    admittedAt: data.admittedAt || new Date(),
    createdBy: req.user._id,
    bedHistory: [{ ward: ward._id, wardName: ward.name, bedNumber: data.bedNumber, dailyRate: (ward.dailyRate || 0) + (ward.nursingRate || 0), from: data.admittedAt || new Date() }],
  });
  await occupyBed(ward._id, data.bedNumber, patient._id, admission._id);
  try {
    await admission.save();
  } catch (e) {
    await releaseBed(ward._id, data.bedNumber);
    await Ward.updateOne({ _id: ward._id, 'beds.number': data.bedNumber }, { $set: { 'beds.$.status': 'Available' } });
    throw e;
  }
  const invoice = await getOrCreateIpdInvoice(admission, req.user._id);
  if (Number(data.deposit) > 0) {
    await recordPayment(invoice, { amount: Number(data.deposit), mode: req.body.depositMode || 'Cash', reference: 'Admission deposit' }, req.user);
  }
  notifyStaff({
    roles: ['nurse'], title: 'New admission', message: `${patient.firstName} ${patient.lastName} admitted to ${ward.name} / ${data.bedNumber}`, link: `/ipd/${admission._id}`,
  });
  res.status(201).json(admission);
});

admissionsRouter.get('/:id', can('ipd', 'r'), async (req, res) => {
  const adm = await Admission.findById(req.params.id).populate(admPopulate)
    .populate('notes.by', 'name role').populate('invoice', 'invoiceNo total amountPaid balance status finalized');
  if (!adm) throw notFound('Admission');
  res.json(adm);
});

admissionsRouter.put('/:id', can('ipd', 'rw'), async (req, res) => {
  const adm = await Admission.findById(req.params.id);
  if (!adm) throw notFound('Admission');
  const allowed = ['provisionalDiagnosis', 'reason', 'expectedDischarge', 'attendant', 'doctor', 'admissionType'];
  for (const k of allowed) if (req.body[k] !== undefined) adm[k] = req.body[k];
  await adm.save();
  res.json(adm);
});

admissionsRouter.post('/:id/notes', can('ipd', 'rw'), async (req, res) => {
  const adm = await Admission.findById(req.params.id);
  if (!adm) throw notFound('Admission');
  if (adm.status !== 'Admitted') throw badRequest('Patient is not currently admitted');
  const { type = 'Nursing', text, vitals } = req.body;
  if (!text && !vitals) throw badRequest('Enter a note or vitals');
  adm.notes.push({ type, text, vitals, by: req.user._id, at: new Date() });
  await adm.save();
  res.status(201).json(adm);
});

admissionsRouter.post('/:id/transfer', can('ipd', 'rw'), async (req, res) => {
  const adm = await Admission.findById(req.params.id);
  if (!adm) throw notFound('Admission');
  if (adm.status !== 'Admitted') throw badRequest('Patient is not currently admitted');
  const ward = await Ward.findById(req.body.ward);
  if (!ward) throw badRequest('Select a ward');
  const bedNumber = req.body.bedNumber;
  if (String(ward._id) === String(adm.ward) && bedNumber === adm.bedNumber) throw badRequest('Patient is already in this bed');
  await occupyBed(ward._id, bedNumber, adm.patient, adm._id);
  await releaseBed(adm.ward, adm.bedNumber);
  const now = new Date();
  const current = adm.bedHistory[adm.bedHistory.length - 1];
  if (current) current.to = now;
  adm.bedHistory.push({ ward: ward._id, wardName: ward.name, bedNumber, dailyRate: (ward.dailyRate || 0) + (ward.nursingRate || 0), from: now });
  adm.notes.push({ type: 'Nursing', text: `Transferred to ${ward.name} / ${bedNumber}. ${req.body.reason || ''}`.trim(), by: req.user._id });
  adm.ward = ward._id;
  adm.bedNumber = bedNumber;
  await adm.save();
  res.json(adm);
});

admissionsRouter.post('/:id/discharge', can('ipd', 'rw'), async (req, res) => {
  const adm = await Admission.findById(req.params.id).populate('patient');
  if (!adm) throw notFound('Admission');
  if (adm.status !== 'Admitted') throw badRequest('Patient is not currently admitted');
  const now = new Date();
  const { status = 'Discharged', summary = {} } = req.body;
  if (!['Discharged', 'LAMA', 'Referred', 'Expired'].includes(status)) throw badRequest('Invalid discharge status');

  const current = adm.bedHistory[adm.bedHistory.length - 1];
  if (current) current.to = now;

  // Room & nursing charges: each calendar day is billed to the bed occupied at midnight; minimum one day.
  const invoice = await getOrCreateIpdInvoice(adm, req.user._id);
  const totalDays = daysBetween(adm.admittedAt, now);
  let allocated = 0;
  adm.bedHistory.forEach((seg, idx) => {
    const isLast = idx === adm.bedHistory.length - 1;
    let days = Math.round((new Date(seg.to || now).setHours(0, 0, 0, 0) - new Date(seg.from).setHours(0, 0, 0, 0)) / 86400000);
    if (isLast) days = Math.max(0, totalDays - allocated);
    allocated += days;
    if (days > 0 && seg.dailyRate > 0) {
      invoice.items.push({
        description: `Room & nursing - ${seg.wardName} / ${seg.bedNumber} (${days} day${days > 1 ? 's' : ''})`,
        category: 'Room', quantity: days, rate: seg.dailyRate, refType: 'Admission', refId: adm._id,
      });
    }
  });
  invoice.finalized = true;
  invoice.recalc();
  await invoice.save();

  await releaseBed(adm.ward, adm.bedNumber);
  adm.status = status;
  adm.dischargedAt = now;
  adm.dischargeSummary = summary;
  await adm.save();
  notifyPatient('discharge', adm.patient, { admissionNo: adm.admissionNo, amount: invoice.balance.toFixed(2) });
  notifyStaff({ roles: ['accountant'], title: 'Discharge billing', message: `${adm.admissionNo} discharged - bill ${invoice.invoiceNo} due ${invoice.balance.toFixed(2)}`, link: `/billing/${invoice._id}` });
  res.json({ admission: adm, invoice });
});

export default admissionsRouter;
