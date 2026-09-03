import { AuditLog } from '../models/index.js';

const ACTIONS = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

export function auditTrail(req, res, next) {
  if (!ACTIONS[req.method]) return next();
  res.on('finish', () => {
    if (!req.user || res.statusCode >= 400) return;
    const parts = req.originalUrl.split('?')[0].replace(/^\/api\//, '').split('/');
    const idPart = parts.find((p) => /^[a-f0-9]{24}$/i.test(p));
    const actionSuffix = parts.length > 2 && !/^[a-f0-9]{24}$/i.test(parts[parts.length - 1]) ? `:${parts[parts.length - 1]}` : '';
    AuditLog.create({
      user: req.user._id,
      userName: req.user.name,
      role: req.user.role,
      action: `${ACTIONS[req.method]}${actionSuffix}`.toUpperCase(),
      entity: parts[0],
      entityId: idPart,
      method: req.method,
      path: req.originalUrl.slice(0, 300),
      status: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 200),
    }).catch((e) => console.error('[audit]', e.message));
  });
  next();
}

export function logEvent(req, action, extra = {}) {
  return AuditLog.create({
    user: extra.user?._id || req.user?._id,
    userName: extra.user?.name || req.user?.name || extra.userName,
    role: extra.user?.role || req.user?.role,
    action,
    entity: extra.entity || 'auth',
    method: req.method,
    path: req.originalUrl,
    status: extra.status || 200,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 200),
  }).catch(() => {});
}
