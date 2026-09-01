export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);

// Remove fields a client must never set directly.
export function clean(body, extraBlocked = []) {
  const blocked = new Set(['_id', 'id', '__v', 'createdAt', 'updatedAt', ...extraBlocked]);
  const out = {};
  for (const [k, v] of Object.entries(body || {})) if (!blocked.has(k)) out[k] = v;
  return out;
}
