import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { can } from '../middleware/auth.js';
import { AuditLog, Setting, getSettings } from '../models/index.js';
import { badRequest, clean, notFound } from '../utils/http.js';
import { dateRange, paginate, searchFilter } from '../utils/query.js';

/* ---- Hospital settings ---- */
export const settingsRouter = Router();
settingsRouter.get('/', async (_req, res) => res.json(await getSettings()));
settingsRouter.put('/', can('settings', 'rw'), async (req, res) => {
  await getSettings();
  const s = await Setting.findByIdAndUpdate('hospital', clean(req.body), { new: true, runValidators: true });
  res.json(s);
});

/* ---- Audit trail ---- */
export const auditRouter = Router();
auditRouter.get('/', can('audit', 'r'), async (req, res) => {
  const { start, end } = dateRange(req.query.from, req.query.to, 7);
  const filter = { at: { $gte: start, $lte: end }, ...searchFilter(req.query.q, ['userName', 'action', 'entity', 'path', 'ip']) };
  if (req.query.user) filter.user = req.query.user;
  if (req.query.entity) filter.entity = req.query.entity;
  res.json(await paginate(AuditLog, filter, req, { sort: '-at', defLimit: 50 }));
});

/* ---- Backups (files are produced by the hms-backup container on a shared volume) ---- */
export const backupRouter = Router();
const NAME_RX = /^hms-\d{8}-\d{6}\.archive\.gz$/;

backupRouter.get('/', can('backup', 'r'), async (_req, res) => {
  let files = [];
  let status = null;
  try {
    const names = (await fs.readdir(config.backupDir)).filter((n) => NAME_RX.test(n));
    files = await Promise.all(names.map(async (name) => {
      const st = await fs.stat(path.join(config.backupDir, name));
      return { name, size: st.size, createdAt: st.mtime };
    }));
    files.sort((a, b) => b.createdAt - a.createdAt);
  } catch { /* backup volume unavailable */ }
  try { status = JSON.parse(await fs.readFile(path.join(config.backupDir, '.status.json'), 'utf8')); } catch { /* none yet */ }
  res.json({ files, status });
});

backupRouter.post('/', can('backup', 'rw'), async (req, res) => {
  try {
    await fs.writeFile(path.join(config.backupDir, '.trigger'), JSON.stringify({ by: req.user.email, at: new Date() }));
  } catch {
    throw badRequest('Backup storage is not available on this server');
  }
  res.status(202).json({ ok: true, message: 'Backup requested. It will start within 30 seconds.' });
});

backupRouter.get('/:name', can('backup', 'rw'), async (req, res) => {
  const { name } = req.params;
  if (!NAME_RX.test(name)) throw badRequest('Invalid backup name');
  const file = path.join(config.backupDir, name);
  try { await fs.access(file); } catch { throw notFound('Backup'); }
  res.download(file, name);
});
