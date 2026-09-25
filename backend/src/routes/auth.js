import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User, validatePasswordStrength } from '../models/index.js';
import {
  authenticate, COOKIE_NAME, issueToken, setSessionCookie,
} from '../middleware/auth.js';
import { logEvent } from '../middleware/audit.js';
import { permissionsFor, ROLES } from '../permissions.js';
import { badRequest, HttpError } from '../utils/http.js';

const r = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again in a few minutes.' },
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function sessionPayload(user) {
  return {
    user,
    role: user.role,
    roleLabel: ROLES[user.role],
    permissions: permissionsFor(user.role),
  };
}

r.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!email || !password) throw badRequest('Email and password are required');

  const user = await User.findOne({ email }).select('+password +failedLogins +lockUntil').populate('department', 'name code');
  if (!user) {
    await logEvent(req, 'LOGIN_FAILED', { userName: email, status: 401 });
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!user.active) throw new HttpError(403, 'This account has been deactivated. Contact the administrator.');
  if (user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new HttpError(423, `Account locked after repeated failed attempts. Try again in ${mins} minute(s).`);
  }
  const ok = await user.checkPassword(password);
  if (!ok) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    if (user.failedLogins >= MAX_FAILED) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      user.failedLogins = 0;
    }
    await user.save();
    await logEvent(req, 'LOGIN_FAILED', { user, status: 401 });
    throw new HttpError(401, 'Invalid email or password');
  }
  user.failedLogins = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();
  await user.save();
  setSessionCookie(res, issueToken(user));
  await logEvent(req, 'LOGIN', { user });
  res.json(sessionPayload(user));
});

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// Session probe used by the web app on load: 200 with user=null when signed out (avoids console noise).
r.get('/session', async (req, res, next) => {
  if (!req.cookies?.[COOKIE_NAME]) return res.json({ user: null });
  try {
    await authenticate(req, res, () => {});
    return res.json(sessionPayload(req.user));
  } catch {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ user: null });
  }
});

r.get('/me', authenticate, (req, res) => {
  res.json(sessionPayload(req.user));
});

r.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.checkPassword(String(currentPassword || '')))) throw badRequest('Current password is incorrect');
  const err = validatePasswordStrength(newPassword);
  if (err) throw badRequest(err);
  user.password = newPassword;
  await user.save();
  setSessionCookie(res, issueToken(user));
  await logEvent(req, 'PASSWORD_CHANGED');
  res.json({ ok: true });
});

export default r;
