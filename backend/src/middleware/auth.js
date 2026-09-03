import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { hasPermission } from '../permissions.js';
import { HttpError } from '../utils/http.js';

export const COOKIE_NAME = 'hms_session';

export function issueToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  const token = req.cookies?.[COOKIE_NAME] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }
  const user = await User.findById(payload.sub).populate('department', 'name code');
  if (!user || !user.active) throw new HttpError(401, 'Account is inactive');
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    throw new HttpError(401, 'Password changed, please sign in again');
  }
  req.user = user;
  next();
}

export const can = (module, level = 'r') => (req, _res, next) => {
  if (hasPermission(req.user?.role, module, level)) return next();
  next(new HttpError(403, 'You do not have permission to perform this action'));
};

// Pass if the user has the permission on any of the listed modules.
export const canAny = (modules, level = 'r') => (req, _res, next) => {
  if (modules.some((m) => hasPermission(req.user?.role, m, level))) return next();
  next(new HttpError(403, 'You do not have permission to perform this action'));
};
