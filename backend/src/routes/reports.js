import { Router } from 'express';
import { can, canAny } from '../middleware/auth.js';
import {
  Admission, Appointment, Encounter, Invoice, LabOrder, LedgerEntry, Medicine, Patient, Surgery, Ward,
} from '../models/index.js';
import { hasPermission } from '../permissions.js';
import { dateRange, dayRange } from '../utils/query.js';

const r = Router();
const TZ = process.env.TZ || 'UTC';

r.get('/dashboard', can('dashboard', 'r'), async (req, res) => {
  const { start, end } = dayRange();
  const role = req.user.role;
  const since14 = new Date(start.getTime() - 13 * 86400000);
  const finance = hasPermission(role, 'billing', 'r') || hasPermission(role, 'accounting', 'r');

  const [
    todayAppts, apptByStatus, admitted, wards, newPatients, pendingLab, pendingRad, lowStock,
    otToday, revenueToday, revenueTrend, deptLoad, outstanding, admissionsToday, dischargesToday, recentAdmissions,
  ] = await Promise.all([
    Appointment.countDocuments({ date: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } }),
    Appointment.aggregate([{ $match: { date: { $gte: start, $lt: end } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Admission.countDocuments({ status: 'Admitted' }),
    Ward.find({ active: true }).select('name type beds.status'),
    Patient.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    LabOrder.countDocuments({ category: 'lab', status: { $in: ['Ordered', 'Sample Collected', 'In Progress'] } }),
    LabOrder.countDocuments({ category: 'radiology', status: { $in: ['Ordered', 'Sample Collected', 'In Progress'] } }),
    Medicine.countDocuments({ active: true, $expr: { $lte: ['$stock', '$reorderLevel'] } }),
    Surgery.countDocuments({ scheduledAt: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } }),
    finance ? LedgerEntry.aggregate([{ $match: { type: 'Income', date: { $gte: start, $lt: end } } }, { $group: { _id: null, t: { $sum: '$amount' } } }]) : [],
    finance ? LedgerEntry.aggregate([
      { $match: { type: 'Income', date: { $gte: since14, $lt: end } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: TZ } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]) : [],
    Appointment.aggregate([
      { $match: { date: { $gte: since14, $lt: end }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$department', n: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
      { $project: { name: { $ifNull: [{ $arrayElemAt: ['$d.name', 0] }, 'General'] }, n: 1 } },
      { $sort: { n: -1 } }, { $limit: 8 },
    ]),
    finance ? Invoice.aggregate([{ $match: { status: { $in: ['Unpaid', 'Partially Paid'] } } }, { $group: { _id: null, t: { $sum: '$balance' }, n: { $sum: 1 } } }]) : [],
    Admission.countDocuments({ admittedAt: { $gte: start, $lt: end } }),
    Admission.countDocuments({ dischargedAt: { $gte: start, $lt: end } }),
    Admission.find({ status: 'Admitted' }).sort('-admittedAt').limit(6).populate('patient', 'uhid firstName lastName').populate('ward', 'name').populate('doctor', 'name'),
  ]);

  let totalBeds = 0; let occupiedBeds = 0;
  const occupancy = wards.map((w) => {
    const total = w.beds.length;
    const occ = w.beds.filter((b) => b.status === 'Occupied').length;
    totalBeds += total; occupiedBeds += occ;
    return { ward: w.name, type: w.type, total, occupied: occ, available: w.beds.filter((b) => b.status === 'Available').length };
  });

  const trend = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(since14.getTime() + i * 86400000);
    const key = d.toLocaleDateString('en-CA', { timeZone: TZ });
    trend.push({ date: key, total: revenueTrend.find((x) => x._id === key)?.total || 0 });
  }

  let myQueue = null;
  if (role === 'doctor') {
    myQueue = await Appointment.find({ doctor: req.user._id, date: { $gte: start, $lt: end }, status: { $in: ['Scheduled', 'Checked-in', 'In-consultation'] } })
      .sort('tokenNo timeSlot').limit(10).populate('patient', 'uhid firstName lastName gender dob');
  }

  res.json({
    kpis: {
      todayAppointments: todayAppts,
      admitted,
      totalBeds,
      occupiedBeds,
      occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      newPatients,
      pendingLab,
      pendingRadiology: pendingRad,
      lowStock,
      surgeriesToday: otToday,
      admissionsToday,
      dischargesToday,
      revenueToday: finance ? revenueToday[0]?.t || 0 : null,
      outstanding: finance ? outstanding[0]?.t || 0 : null,
      outstandingCount: finance ? outstanding[0]?.n || 0 : null,
    },
    appointmentStatus: Object.fromEntries(apptByStatus.map((a) => [a._id, a.n])),
    occupancy,
    revenueTrend: finance ? trend : null,
    departmentLoad: deptLoad.map((d) => ({ department: d.name, count: d.n })),
    recentAdmissions,
    myQueue,
  });
});

// Management analytics over a date range.
r.get('/analytics', canAny(['reports']), async (req, res) => {
  const { start, end } = dateRange(req.query.from, req.query.to);
  const range = { $gte: start, $lte: end };
  const [
    revenueByType, revenueByMode, dailyRevenue, expenseByCat, opdByDept, doctorStats, admissions, los,
    topTests, topMedicines, topDiagnoses, demographics, newPatients, invoiceStatus,
  ] = await Promise.all([
    LedgerEntry.aggregate([{ $match: { type: 'Income', date: range } }, { $group: { _id: '$category', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
    LedgerEntry.aggregate([{ $match: { type: 'Income', date: range } }, { $group: { _id: '$mode', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
    LedgerEntry.aggregate([
      { $match: { date: range } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: TZ } }, t: '$type' }, total: { $sum: '$amount' } } },
      { $sort: { '_id.d': 1 } },
    ]),
    LedgerEntry.aggregate([{ $match: { type: 'Expense', date: range } }, { $group: { _id: '$category', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
    Appointment.aggregate([
      { $match: { date: range, status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$department', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } }, noShow: { $sum: { $cond: [{ $eq: ['$status', 'No-show'] }, 1, 0] } } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
      { $project: { department: { $ifNull: [{ $arrayElemAt: ['$d.name', 0] }, 'General'] }, total: 1, completed: 1, noShow: 1 } },
      { $sort: { total: -1 } },
    ]),
    Encounter.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: '$doctor', consultations: { $sum: 1 }, patients: { $addToSet: '$patient' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $project: { doctor: { $arrayElemAt: ['$u.name', 0] }, specialization: { $arrayElemAt: ['$u.specialization', 0] }, consultations: 1, uniquePatients: { $size: '$patients' } } },
      { $sort: { consultations: -1 } },
    ]),
    Admission.countDocuments({ admittedAt: range }),
    Admission.aggregate([
      { $match: { dischargedAt: range } },
      { $project: { days: { $divide: [{ $subtract: ['$dischargedAt', '$admittedAt'] }, 86400000] } } },
      { $group: { _id: null, avg: { $avg: '$days' }, n: { $sum: 1 } } },
    ]),
    LabOrder.aggregate([
      { $match: { createdAt: range, status: { $ne: 'Cancelled' } } }, { $unwind: '$items' },
      { $group: { _id: { name: '$items.name', category: '$category' }, count: { $sum: 1 }, revenue: { $sum: '$items.price' } } },
      { $sort: { count: -1 } }, { $limit: 10 },
    ]),
    Invoice.aggregate([
      { $match: { createdAt: range, status: { $ne: 'Cancelled' } } }, { $unwind: '$items' }, { $match: { 'items.category': 'Pharmacy' } },
      { $group: { _id: '$items.refId', name: { $first: '$items.description' }, qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.amount' } } },
      { $sort: { revenue: -1 } }, { $limit: 10 },
    ]),
    Encounter.aggregate([
      { $match: { createdAt: range } }, { $unwind: '$diagnoses' },
      { $group: { _id: { $toLower: '$diagnoses.description' }, label: { $first: '$diagnoses.description' }, code: { $first: '$diagnoses.code' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 10 },
    ]),
    Patient.aggregate([
      { $match: { createdAt: range } },
      {
        $project: {
          gender: 1,
          age: { $cond: [{ $ifNull: ['$dob', false] }, { $divide: [{ $subtract: [new Date(), '$dob'] }, 31557600000] }, null] },
        },
      },
      {
        $project: {
          gender: 1,
          band: {
            $switch: {
              branches: [
                { case: { $eq: ['$age', null] }, then: 'Unknown' },
                { case: { $lt: ['$age', 13] }, then: '0-12' },
                { case: { $lt: ['$age', 19] }, then: '13-18' },
                { case: { $lt: ['$age', 36] }, then: '19-35' },
                { case: { $lt: ['$age', 51] }, then: '36-50' },
                { case: { $lt: ['$age', 66] }, then: '51-65' },
              ],
              default: '65+',
            },
          },
        },
      },
      { $group: { _id: { band: '$band', gender: '$gender' }, n: { $sum: 1 } } },
    ]),
    Patient.countDocuments({ createdAt: range }),
    Invoice.aggregate([{ $match: { createdAt: range } }, { $group: { _id: '$status', n: { $sum: 1 }, total: { $sum: '$total' } } }]),
  ]);

  const days = {};
  for (const d of dailyRevenue) {
    days[d._id.d] ??= { date: d._id.d, income: 0, expense: 0 };
    days[d._id.d][d._id.t === 'Income' ? 'income' : 'expense'] = d.total;
  }
  const bands = ['0-12', '13-18', '19-35', '36-50', '51-65', '65+', 'Unknown'].map((band) => {
    const row = { band, Male: 0, Female: 0, Other: 0 };
    demographics.filter((x) => x._id.band === band).forEach((x) => { row[x._id.gender] = x.n; });
    return row;
  });

  res.json({
    range: { from: start, to: end },
    revenueByType: revenueByType.map((x) => ({ name: x._id, value: x.total })),
    revenueByMode: revenueByMode.map((x) => ({ name: x._id, value: x.total })),
    daily: Object.values(days),
    expenseByCategory: expenseByCat.map((x) => ({ name: x._id, value: x.total })),
    opdByDepartment: opdByDept,
    doctorStats,
    ipd: { admissions, discharges: los[0]?.n || 0, avgLengthOfStay: los[0]?.avg ? Math.round(los[0].avg * 10) / 10 : 0 },
    topTests: topTests.map((t) => ({ name: t._id.name, category: t._id.category, count: t.count, revenue: t.revenue })),
    topMedicines: topMedicines.map((m) => ({ name: m.name?.split(' - ')[0], qty: m.qty, revenue: m.revenue })),
    topDiagnoses: topDiagnoses.map((d) => ({ name: d.label, code: d.code, count: d.count })),
    demographics: bands,
    newPatients,
    invoiceStatus: invoiceStatus.map((s) => ({ status: s._id, count: s.n, total: s.total })),
  });
});

export default r;
