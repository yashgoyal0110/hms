import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Appointment, getSettings } from '../models/index.js';
import { dayRange } from '../utils/query.js';
import { DEMO_ACCOUNTS } from '../seed/demoAccounts.js';

const r = Router();

r.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp, uptime: Math.round(process.uptime()) });
});

r.get('/info', async (_req, res) => {
  const s = await getSettings();
  res.json({
    hospital: { name: s.name, tagline: s.tagline, phone: s.phone, currency: s.currency },
    demoMode: config.demoMode,
    demoAccounts: config.demoMode ? DEMO_ACCOUNTS : [],
  });
});

// Token display board for the waiting area. Exposes only token numbers, doctor names and initials.
r.get('/queue', async (_req, res) => {
  const { start, end } = dayRange();
  const appts = await Appointment.find({
    date: { $gte: start, $lt: end }, status: { $in: ['Checked-in', 'In-consultation'] },
  }).populate('doctor', 'name specialization').populate('department', 'name').populate('patient', 'firstName lastName')
    .sort('tokenNo');
  const byDoctor = new Map();
  for (const a of appts) {
    if (!a.doctor) continue;
    const key = String(a.doctor._id);
    if (!byDoctor.has(key)) {
      byDoctor.set(key, {
        doctor: a.doctor.name, specialization: a.doctor.specialization, department: a.department?.name, current: null, waiting: [],
      });
    }
    const entry = byDoctor.get(key);
    const p = a.patient;
    const label = { token: a.tokenNo, initials: p ? `${p.firstName?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase() : '' };
    if (a.status === 'In-consultation') entry.current = label; else entry.waiting.push(label);
  }
  res.json({ updatedAt: new Date(), doctors: [...byDoctor.values()] });
});

export default r;
