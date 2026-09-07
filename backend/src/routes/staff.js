import { Router } from 'express';
import { can } from '../middleware/auth.js';
import {
  Department, Shift, User, nextCode, validatePasswordStrength,
} from '../models/index.js';
import { ROLES } from '../permissions.js';
import { crudRouter } from '../utils/crud.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { paginate, searchFilter } from '../utils/query.js';

// Department list is open to all signed-in users because every form needs it.
export const departmentsRouter = crudRouter(Department, {
  module: 'staff', search: ['name', 'code'], filters: ['type'], populate: { path: 'head', select: 'name' }, label: 'Department', openList: true,
});

export const usersRouter = Router();

usersRouter.get('/roles', (_req, res) => res.json(ROLES));

// Lightweight directory (doctors, nurses...) available to all authenticated users for pickers.
usersRouter.get('/directory', async (req, res) => {
  const filter = { active: true };
  if (req.query.role) filter.role = { $in: String(req.query.role).split(',') };
  if (req.query.department) filter.department = req.query.department;
  const users = await User.find(filter).select('name role specialization designation department consultationFee availability').populate('department', 'name').sort('name');
  res.json(users);
});

usersRouter.get('/', can('staff', 'r'), async (req, res) => {
  const filter = { ...searchFilter(req.query.q, ['name', 'email', 'phone', 'employeeId', 'specialization']) };
  if (req.query.role) filter.role = req.query.role;
  if (req.query.department) filter.department = req.query.department;
  if (req.query.active === 'true' || req.query.active === 'false') filter.active = req.query.active === 'true';
  res.json(await paginate(User, filter, req, { sort: 'name', populate: { path: 'department', select: 'name' }, defLimit: 50 }));
});

usersRouter.get('/:id', can('staff', 'r'), async (req, res) => {
  const u = await User.findById(req.params.id).populate('department', 'name');
  if (!u) throw notFound('Staff member');
  res.json(u);
});

usersRouter.post('/', can('staff', 'rw'), async (req, res) => {
  const data = clean(req.body, ['failedLogins', 'lockUntil', 'lastLogin', 'passwordChangedAt', 'employeeId']);
  const err = validatePasswordStrength(data.password);
  if (err) throw badRequest(err);
  const u = await User.create({ ...data, employeeId: await nextCode('EMP', { yearly: false, pad: 4 }) });
  res.status(201).json(u);
});

usersRouter.put('/:id', can('staff', 'rw'), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw notFound('Staff member');
  const data = clean(req.body, ['password', 'failedLogins', 'lockUntil', 'lastLogin', 'passwordChangedAt', 'employeeId']);
  if (String(u._id) === String(req.user._id) && (data.role && data.role !== u.role)) throw badRequest('You cannot change your own role');
  if (String(u._id) === String(req.user._id) && data.active === false) throw badRequest('You cannot deactivate your own account');
  u.set(data);
  await u.save();
  res.json(u);
});

usersRouter.post('/:id/reset-password', can('staff', 'rw'), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw notFound('Staff member');
  const err = validatePasswordStrength(req.body.password);
  if (err) throw badRequest(err);
  u.password = req.body.password;
  u.set('failedLogins', 0);
  u.set('lockUntil', undefined);
  await u.save();
  res.json({ ok: true });
});

/* ---------- Duty roster ---------- */
export const shiftsRouter = Router();

shiftsRouter.get('/', can('staff', 'r'), async (req, res) => {
  const from = new Date(req.query.from || Date.now()); from.setHours(0, 0, 0, 0);
  const to = new Date(req.query.to || from.getTime() + 6 * 86400000); to.setHours(23, 59, 59, 999);
  const filter = { date: { $gte: from, $lte: to } };
  if (req.query.department) filter.department = req.query.department;
  const shifts = await Shift.find(filter).populate('user', 'name role designation').populate('department', 'name');
  res.json(shifts);
});

// Upsert one cell of the roster.
shiftsRouter.put('/', can('staff', 'rw'), async (req, res) => {
  const { user, date, shift, department, location, notes } = req.body;
  if (!user || !date) throw badRequest('Staff member and date are required');
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (!shift) {
    await Shift.deleteOne({ user, date: d });
    return res.json({ ok: true });
  }
  const doc = await Shift.findOneAndUpdate({ user, date: d }, { shift, department, location, notes }, { upsert: true, new: true, runValidators: true });
  res.json(doc);
});
