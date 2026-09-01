import mongoose from 'mongoose';

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchFilter(q, fields) {
  if (!q || !fields.length) return {};
  const rx = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

export function pageParams(req, defLimit = 25) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export async function paginate(Model, filter, req, { sort = '-createdAt', populate, select, defLimit } = {}) {
  const { page, limit, skip } = pageParams(req, defLimit);
  const sortParam = typeof req.query.sort === 'string' && /^-?[a-zA-Z.]+$/.test(req.query.sort) ? req.query.sort : sort;
  let query = Model.find(filter).sort(sortParam).skip(skip).limit(limit);
  if (populate) query = query.populate(populate);
  if (select) query = query.select(select);
  const [data, total] = await Promise.all([query, Model.countDocuments(filter)]);
  return { data, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

export const isId = (v) => mongoose.isValidObjectId(v);

export function dayRange(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start, end };
}

export function dateRange(from, to, defaultDays = 30) {
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - (defaultDays - 1) * 86400000);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}
