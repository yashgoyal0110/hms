import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Message, MessageTemplate, Notification, Patient, getSettings,
} from '../models/index.js';
import { gatewayStatus, renderTemplate, sendMessage } from '../services/messaging.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { paginate } from '../utils/query.js';

/* ---- Staff in-app notifications (every signed-in user) ---- */
export const notificationsRouter = Router();
notificationsRouter.get('/', async (req, res) => {
  const [data, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort('-createdAt').limit(30),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ data, unread });
});
notificationsRouter.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
});
notificationsRouter.post('/:id/read', async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ ok: true });
});

/* ---- Patient communication ---- */
export const messagesRouter = Router();

messagesRouter.get('/gateways', can('communication', 'r'), (_req, res) => res.json(gatewayStatus()));

messagesRouter.get('/', can('communication', 'r'), async (req, res) => {
  const filter = {};
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.patient) filter.patient = req.query.patient;
  res.json(await paginate(Message, filter, req, {
    populate: [{ path: 'patient', select: 'uhid firstName lastName' }, { path: 'sentBy', select: 'name' }],
  }));
});

messagesRouter.post('/', can('communication', 'rw'), async (req, res) => {
  const { patients = [], channel, subject, body, template } = req.body;
  if (!['SMS', 'Email', 'WhatsApp'].includes(channel)) throw badRequest('Select a channel');
  if (!body?.trim()) throw badRequest('Message body is required');
  if (!patients.length) throw badRequest('Select at least one recipient');
  if (patients.length > 500) throw badRequest('A maximum of 500 recipients per batch is allowed');
  const settings = await getSettings();
  const list = await Patient.find({ _id: { $in: patients } });
  const results = [];
  for (const p of list) {
    const to = channel === 'Email' ? p.email : p.phone;
    if (!to) { results.push({ patient: p.uhid, status: 'Skipped', error: `No ${channel === 'Email' ? 'email' : 'phone'} on file` }); continue; }
    const vars = { patientName: p.fullName, uhid: p.uhid, hospitalName: settings.name, hospitalPhone: settings.phone };
    const msg = await sendMessage({
      patient: p._id, channel, to, subject: renderTemplate(subject, vars), body: renderTemplate(body, vars), template, sentBy: req.user._id,
    });
    results.push({ patient: p.uhid, status: msg.status, error: msg.error });
  }
  res.status(201).json({ results });
});

export const templatesRouter = Router();
templatesRouter.get('/', can('communication', 'r'), async (_req, res) => {
  res.json(await MessageTemplate.find().sort('name'));
});
templatesRouter.post('/', can('communication', 'rw'), async (req, res) => {
  res.status(201).json(await MessageTemplate.create(clean(req.body)));
});
templatesRouter.put('/:id', can('communication', 'rw'), async (req, res) => {
  const t = await MessageTemplate.findById(req.params.id);
  if (!t) throw notFound('Template');
  t.set(clean(req.body, ['key']));
  await t.save();
  res.json(t);
});
templatesRouter.delete('/:id', can('communication', 'rw'), async (req, res) => {
  await MessageTemplate.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});
