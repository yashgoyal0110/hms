import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Admission, Patient, Surgery, Theatre, User, nextCode,
} from '../models/index.js';
import { addCharges } from '../services/billing.js';
import { crudRouter } from '../utils/crud.js';
import {
  badRequest, clean, conflict, notFound,
} from '../utils/http.js';
import { dayRange, paginate } from '../utils/query.js';

export const theatresRouter = crudRouter(Theatre, { module: 'ot', search: ['name', 'code'], label: 'Theatre' });
export const surgeriesRouter = Router();

const populate = [
  { path: 'patient', select: 'uhid firstName lastName gender dob bloodGroup' },
  { path: 'theatre', select: 'name code' },
  { path: 'surgeon', select: 'name specialization' },
  { path: 'anaesthetist', select: 'name' },
  { path: 'assistants', select: 'name' },
  { path: 'admission', select: 'admissionNo' },
];

surgeriesRouter.get('/', can('ot', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.date) { const { start, end } = dayRange(req.query.date); filter.scheduledAt = { $gte: start, $lt: end }; }
  if (req.query.from && req.query.to) filter.scheduledAt = { $gte: dayRange(req.query.from).start, $lt: dayRange(req.query.to).end };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.theatre) filter.theatre = req.query.theatre;
  if (req.query.surgeon) filter.surgeon = req.query.surgeon === 'me' ? req.user._id : req.query.surgeon;
  if (req.query.patient) filter.patient = req.query.patient;
  res.json(await paginate(Surgery, filter, req, { sort: req.query.sort || 'scheduledAt', populate, defLimit: 100 }));
});

async function checkClash(theatreId, start, durationMins, excludeId) {
  const end = new Date(new Date(start).getTime() + durationMins * 60000);
  const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
  const candidates = await Surgery.find({
    _id: { $ne: excludeId }, theatre: theatreId, status: { $in: ['Scheduled', 'In Progress'] },
    scheduledAt: { $gte: new Date(dayStart.getTime() - 86400000), $lt: end },
  });
  const hit = candidates.find((s) => new Date(s.scheduledAt.getTime() + s.durationMins * 60000) > new Date(start));
  if (hit) throw conflict(`Theatre is booked for ${hit.procedure} (${hit.surgeryNo}) during this time`);
}

surgeriesRouter.post('/', can('ot', 'rw'), async (req, res) => {
  const data = clean(req.body, ['surgeryNo', 'status', 'startedAt', 'endedAt', 'billed', 'createdBy']);
  const [patient, surgeon, theatre] = await Promise.all([
    Patient.findById(data.patient), User.findById(data.surgeon), Theatre.findById(data.theatre),
  ]);
  if (!patient) throw badRequest('Select a valid patient');
  if (!surgeon) throw badRequest('Select the operating surgeon');
  if (!theatre) throw badRequest('Select a theatre');
  if (!data.scheduledAt) throw badRequest('Schedule date and time are required');
  await checkClash(theatre._id, data.scheduledAt, Number(data.durationMins) || 60);
  if (!data.admission) {
    const adm = await Admission.findOne({ patient: patient._id, status: 'Admitted' });
    data.admission = adm?._id;
  }
  const s = await Surgery.create({ ...data, surgeryNo: await nextCode('OT'), createdBy: req.user._id });
  res.status(201).json(s);
});

surgeriesRouter.get('/:id', can('ot', 'r'), async (req, res) => {
  const s = await Surgery.findById(req.params.id).populate(populate);
  if (!s) throw notFound('Surgery');
  res.json(s);
});

surgeriesRouter.put('/:id', can('ot', 'rw'), async (req, res) => {
  const s = await Surgery.findById(req.params.id);
  if (!s) throw notFound('Surgery');
  const data = clean(req.body, ['surgeryNo', 'patient', 'status', 'startedAt', 'endedAt', 'billed', 'createdBy']);
  if ((data.scheduledAt || data.theatre || data.durationMins) && s.status === 'Scheduled') {
    await checkClash(data.theatre || s.theatre, data.scheduledAt || s.scheduledAt, Number(data.durationMins || s.durationMins), s._id);
  }
  s.set(data);
  await s.save();
  res.json(s);
});

surgeriesRouter.post('/:id/status', can('ot', 'rw'), async (req, res) => {
  const s = await Surgery.findById(req.params.id);
  if (!s) throw notFound('Surgery');
  const { status } = req.body;
  const flow = {
    'In Progress': ['Scheduled'], Completed: ['In Progress'], Cancelled: ['Scheduled', 'Postponed'], Postponed: ['Scheduled'], Scheduled: ['Postponed'],
  };
  if (!flow[status]?.includes(s.status)) throw badRequest(`Cannot change status from ${s.status} to ${status}`);
  if (status === 'In Progress') {
    const c = s.checklist || {};
    if (!c.consent || !c.siteMarked || !c.anaesthesiaCleared) throw badRequest('Complete the pre-operative checklist (consent, site marking, anaesthesia clearance) first');
    s.startedAt = new Date();
    await Theatre.updateOne({ _id: s.theatre }, { status: 'In Use' });
  }
  if (status === 'Completed') {
    s.endedAt = new Date();
    if (req.body.operativeNotes) s.operativeNotes = req.body.operativeNotes;
    if (req.body.postOpInstructions) s.postOpInstructions = req.body.postOpInstructions;
    await Theatre.updateOne({ _id: s.theatre }, { status: 'Cleaning' });
    if (!s.billed && s.charges > 0) {
      await addCharges({
        patientId: s.patient, type: 'OT', userId: req.user._id,
        items: [{ description: `OT charges - ${s.procedure} (${s.surgeryNo})`, category: 'OT', quantity: 1, rate: s.charges, refType: 'Surgery', refId: s._id }],
      });
      s.billed = true;
    }
  }
  s.status = status;
  await s.save();
  res.json(s);
});

export default surgeriesRouter;
