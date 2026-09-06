import { Router } from 'express';
import { hasPermission } from '../permissions.js';
import {
  Encounter, LabOrder, LabTest, Patient, nextCode,
} from '../models/index.js';
import { addCharges } from '../services/billing.js';
import { notifyPatient } from '../services/messaging.js';
import { notifyStaff } from '../services/notify.js';
import {
  HttpError, badRequest, clean, notFound,
} from '../utils/http.js';
import { dayRange, paginate, searchFilter } from '../utils/query.js';

export const testsRouter = Router();
export const ordersRouter = Router();

const CATS = ['lab', 'radiology'];
function assertCat(category) {
  if (!CATS.includes(category)) throw badRequest('category must be lab or radiology');
}
function guard(req, category, level) {
  assertCat(category);
  if (!hasPermission(req.user.role, category, level)) throw new HttpError(403, 'You do not have permission to perform this action');
}

/* ---------- Test catalogue ---------- */
testsRouter.get('/', async (req, res) => {
  const { category } = req.query;
  guard(req, category, 'r');
  const filter = { category, ...searchFilter(req.query.q, ['name', 'code', 'section']) };
  if (req.query.section) filter.section = req.query.section;
  if (req.query.active !== 'all') filter.active = true;
  res.json(await paginate(LabTest, filter, req, { sort: 'section name', defLimit: 200 }));
});

testsRouter.post('/', async (req, res) => {
  guard(req, req.body.category, 'rw');
  res.status(201).json(await LabTest.create(clean(req.body)));
});

testsRouter.put('/:id', async (req, res) => {
  const t = await LabTest.findById(req.params.id);
  if (!t) throw notFound('Test');
  guard(req, t.category, 'rw');
  t.set(clean(req.body, ['category']));
  await t.save();
  res.json(t);
});

/* ---------- Orders ---------- */
const populate = [
  { path: 'patient', select: 'uhid firstName lastName gender dob phone' },
  { path: 'doctor', select: 'name specialization' },
  { path: 'reportedBy', select: 'name designation qualification' },
  { path: 'collectedBy', select: 'name' },
];

ordersRouter.get('/', async (req, res) => {
  const { category } = req.query;
  guard(req, category, 'r');
  const filter = { category };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.patient) filter.patient = req.query.patient;
  if (req.query.doctor) filter.doctor = req.query.doctor === 'me' ? req.user._id : req.query.doctor;
  if (req.query.date) { const { start, end } = dayRange(req.query.date); filter.createdAt = { $gte: start, $lt: end }; }
  if (req.query.q) {
    const pts = await Patient.find(searchFilter(req.query.q, ['uhid', 'firstName', 'lastName', 'phone'])).select('_id').limit(200);
    filter.$or = [{ patient: { $in: pts.map((p) => p._id) } }, ...Object.values(searchFilter(req.query.q, ['orderNo'])).flat()];
  }
  res.json(await paginate(LabOrder, filter, req, { populate }));
});

ordersRouter.post('/', async (req, res) => {
  const { category, patient: patientId, tests = [], priority, clinicalNotes, encounter, doctor } = req.body;
  guard(req, category, 'rw');
  const patient = await Patient.findById(patientId);
  if (!patient) throw badRequest('Select a valid patient');
  if (!tests.length) throw badRequest('Select at least one test');
  const catalog = await LabTest.find({ _id: { $in: tests }, category, active: true });
  if (catalog.length !== tests.length) throw badRequest('One or more selected tests are invalid');
  const order = new LabOrder({
    orderNo: await nextCode(category === 'lab' ? 'LAB' : 'RAD'),
    category, patient: patient._id, priority, clinicalNotes, encounter,
    doctor: doctor || (req.user.role === 'doctor' ? req.user._id : undefined),
    createdBy: req.user._id,
    items: catalog.map((t) => ({
      test: t._id, code: t.code, name: t.name, section: t.section, price: t.price,
      results: (t.parameters || []).map((p) => ({ parameter: p.name, unit: p.unit, refRange: p.refRange, value: '', flag: '' })),
    })),
  });
  const inv = await addCharges({
    patientId: patient._id, type: category === 'lab' ? 'Laboratory' : 'Radiology', userId: req.user._id,
    items: catalog.map((t) => ({ description: `${t.name} (${order.orderNo})`, category: category === 'lab' ? 'Laboratory' : 'Radiology', quantity: 1, rate: t.price, refType: 'LabOrder', refId: order._id })),
  });
  order.invoice = inv?._id;
  if (inv?.admission) order.admission = inv.admission;
  await order.save();
  if (encounter) await Encounter.updateOne({ _id: encounter }, { $addToSet: { labOrders: order._id } });
  notifyStaff({
    roles: [category === 'lab' ? 'lab_technician' : 'radiologist'],
    title: `New ${order.priority} ${category === 'lab' ? 'lab' : 'imaging'} order`,
    message: `${order.orderNo} - ${patient.firstName} ${patient.lastName}: ${catalog.map((t) => t.name).join(', ')}`,
    link: `/${category === 'lab' ? 'laboratory' : 'radiology'}/${order._id}`,
    type: order.priority === 'STAT' ? 'critical' : 'info',
  });
  res.status(201).json(order);
});

async function loadOrder(req, level) {
  const order = await LabOrder.findById(req.params.id);
  if (!order) throw notFound('Order');
  guard(req, order.category, level);
  return order;
}

ordersRouter.get('/:id', async (req, res) => {
  await loadOrder(req, 'r');
  const order = await LabOrder.findById(req.params.id).populate(populate).populate('items.test', 'parameters sampleType');
  res.json(order);
});

ordersRouter.post('/:id/collect', async (req, res) => {
  const order = await loadOrder(req, 'rw');
  if (order.status !== 'Ordered') throw badRequest('Sample already collected');
  order.status = 'Sample Collected';
  order.sampleCollectedAt = new Date();
  order.collectedBy = req.user._id;
  await order.save();
  res.json(order);
});

function flagFor(value, low, high) {
  const n = parseFloat(value);
  if (Number.isNaN(n) || (low == null && high == null)) return '';
  if (low != null && n < low) return n < low * 0.5 ? 'Critical' : 'L';
  if (high != null && n > high) return n > high * 2 ? 'Critical' : 'H';
  return '';
}

ordersRouter.put('/:id/results', async (req, res) => {
  const order = await loadOrder(req, 'rw');
  if (['Completed', 'Cancelled'].includes(order.status)) throw badRequest(`Order is ${order.status.toLowerCase()}`);
  const tests = await LabTest.find({ _id: { $in: order.items.map((i) => i.test) } });
  const byId = new Map(tests.map((t) => [String(t._id), t]));
  for (const incoming of req.body.items || []) {
    const item = order.items.id(incoming._id);
    if (!item) continue;
    const def = byId.get(String(item.test));
    if (Array.isArray(incoming.results)) {
      item.results = incoming.results.map((r) => {
        const p = def?.parameters?.find((x) => x.name === r.parameter);
        return { ...r, flag: r.flag || flagFor(r.value, p?.low, p?.high) };
      });
    }
    if (incoming.findings !== undefined) item.findings = incoming.findings;
    if (incoming.impression !== undefined) item.impression = incoming.impression;
  }
  if (req.body.reportRemarks !== undefined) order.reportRemarks = req.body.reportRemarks;
  if (order.status === 'Ordered' || order.status === 'Sample Collected') order.status = 'In Progress';
  await order.save();
  res.json(order);
});

ordersRouter.post('/:id/complete', async (req, res) => {
  const order = await loadOrder(req, 'rw');
  if (order.status === 'Completed') throw badRequest('Report already finalised');
  if (order.status === 'Cancelled') throw badRequest('Order is cancelled');
  const empty = order.category === 'lab'
    ? order.items.some((i) => i.results.length && i.results.every((r) => !String(r.value || '').trim()))
    : order.items.some((i) => !String(i.findings || '').trim());
  if (empty) throw badRequest('Enter results for all tests before finalising the report');
  order.status = 'Completed';
  order.completedAt = new Date();
  order.reportedBy = req.user._id;
  await order.save();
  const patient = await Patient.findById(order.patient);
  notifyPatient('report_ready', patient, { orderNo: order.orderNo, tests: order.items.map((i) => i.name).join(', ') });
  const critical = order.items.some((i) => i.results.some((r) => r.flag === 'Critical'));
  if (order.doctor) {
    notifyStaff({
      users: [order.doctor],
      title: critical ? 'Critical result reported' : 'Report ready',
      message: `${order.orderNo} for ${patient?.firstName} ${patient?.lastName}`,
      link: `/${order.category === 'lab' ? 'laboratory' : 'radiology'}/${order._id}`,
      type: critical ? 'critical' : 'success',
    });
  }
  res.json(order);
});

ordersRouter.post('/:id/cancel', async (req, res) => {
  const order = await loadOrder(req, 'rw');
  if (order.status === 'Completed') throw badRequest('Completed orders cannot be cancelled');
  order.status = 'Cancelled';
  order.reportRemarks = req.body.reason || order.reportRemarks;
  await order.save();
  res.json(order);
});

export default ordersRouter;
