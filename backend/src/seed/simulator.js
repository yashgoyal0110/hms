/* eslint-disable no-await-in-loop */
/**
 * Demo activity simulator (runs only when SEED_DEMO=true).
 *
 * Keeps the demo hospital "alive" as real days pass:
 *  - Daily rollover (catches up on missed days): closes out previous days' visits, finalises
 *    pending reports, discharges/admits patients, nursing notes, new registrations, surgeries,
 *    monthly expenses, pharmacy restocking, and books the rolling 7-day appointment schedule.
 *  - Live tick every 10 minutes: advances today's simulated clinic with the clock
 *    (check-in -> consultation -> completed) and runs today's theatre list.
 *
 * Records a user is actively working on are left alone.
 */
import {
  Admission, Appointment, Counter, Encounter, Invoice, LabOrder, LabTest, LedgerEntry, Medicine, Patient, StockMovement, Surgery,
  Theatre, User, Ward, nextCode,
} from '../models/index.js';
import {
  addCharges, getOrCreateIpdInvoice, recordPayment,
} from '../services/billing.js';
import {
  CITIES, CLINICAL, DOSING, FEMALE, INSURERS, LAST, MALE, RAD_REPORTS, STREETS, medLabel,
} from './demo.js';

const DAY = 86400000;
const TICK_MS = 10 * 60 * 1000;
const MAX_CATCHUP_DAYS = 14;

const rand = Math.random;
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const chance = (p) => rand() < p;
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = dayStart(d); x.setDate(x.getDate() + n); return x; };
const at = (d, h, m = 0) => { const x = dayStart(d); x.setHours(h, m, 0, 0); return x; };
const ymd = (d) => Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
const fromYmd = (n) => { const s = String(n); return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))); };
const slotTime = (date, slot) => { const [h, m] = slot.split(':').map(Number); return at(date, h, m); };
const minTime = (a, b) => new Date(Math.min(a.getTime(), b.getTime()));
async function backdate(Model, id, date) {
  await Model.collection.updateOne({ _id: id }, { $set: { createdAt: date, updatedAt: date } });
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */
async function loadContext() {
  const byEmail = async (e) => User.findOne({ email: e });
  const doctors = await User.find({ role: 'doctor', active: true }).populate('department', 'code');
  const ctx = {
    reception: await byEmail('reception@demo.hms'),
    nurse: await byEmail('nurse.priya@demo.hms'),
    labTech: await byEmail('lab@demo.hms'),
    radiologist: await byEmail('radiology@demo.hms'),
    pharmacist: await byEmail('pharmacy@demo.hms'),
    accountant: await byEmail('accounts@demo.hms'),
    doctors: doctors.map((u) => ({ user: u, code: u.department?.code || 'GM' })),
    medicines: await Medicine.find({ active: true }),
    tests: await LabTest.find({ active: true }),
  };
  if (!ctx.reception || !ctx.nurse || !ctx.doctors.length) return null;
  ctx.clinic = ctx.doctors.filter((d) => !['ANES', 'EM'].includes(d.code));
  ctx.anaesthetist = ctx.doctors.find((d) => d.code === 'ANES')?.user;
  ctx.medByName = new Map(ctx.medicines.map((m) => [m.name, m]));
  ctx.test = (code) => ctx.tests.find((t) => t.code === code);
  return ctx;
}

const vitals = (p, by) => {
  const child = p.dob && Date.now() - new Date(p.dob).getTime() < 13 * 365 * DAY;
  return {
    bpSystolic: int(108, 150), bpDiastolic: int(68, 94), pulse: int(66, 104), temperature: Math.round((97.6 + rand() * 3) * 10) / 10,
    spo2: int(94, 99), respRate: int(14, 22), weight: child ? int(10, 38) : int(48, 92), height: child ? int(80, 150) : int(150, 182), recordedBy: by,
  };
};

function buildRx(ctx, names) {
  return names.map((n) => {
    const m = ctx.medByName.get(n);
    const liquid = m && ['Syrup', 'Drops', 'Cream', 'Inhaler'].includes(m.form);
    return {
      medicine: m?._id, name: m ? medLabel(m) : n, dosage: liquid ? (m.form === 'Syrup' ? '5 ml' : 'As directed') : '1 tab',
      frequency: pick(DOSING), duration: `${pick([3, 5, 5, 7, 10])} days`,
      route: m?.form === 'Injection' ? 'IV' : ['Cream', 'Drops'].includes(m?.form) ? 'Topical' : 'Oral', instructions: pick(['After food', 'Before food', 'At bedtime', '']),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */
function fillResults(order, patient, tests) {
  for (const item of order.items) {
    const def = tests.find((t) => String(t._id) === String(item.test));
    item.results = item.results.map((r) => {
      if (r.value) return r;
      const p = def?.parameters?.find((x) => x.name === r.parameter) || {};
      let value; let flag = '';
      if (p.low != null || p.high != null) {
        const lo = p.low ?? p.high * 0.5; const hi = p.high ?? p.low * 1.6;
        let v = lo + rand() * (hi - lo);
        if (chance(0.18)) v = p.high != null && chance(0.5) ? p.high * (1.05 + rand() * 0.3) : (p.low ?? lo) * (0.75 + rand() * 0.2);
        value = String(Math.round(v * (hi < 20 ? 10 : 1)) / (hi < 20 ? 10 : 1));
        if (p.low != null && Number(value) < p.low) flag = 'L';
        if (p.high != null && Number(value) > p.high) flag = 'H';
      } else if (r.parameter === 'Blood Group') value = (patient?.bloodGroup || 'O+').replace(/[+-]|Unknown/g, '') || 'O';
      else if (r.parameter === 'Rh Factor') value = patient?.bloodGroup?.includes('-') ? 'Negative' : 'Positive';
      else if (r.parameter === 'Colour') value = 'Pale Yellow';
      else value = r.refRange || 'Negative';
      return { ...(r.toObject?.() || r), value, flag };
    });
    if (order.category === 'radiology' && !item.findings) {
      const rep = RAD_REPORTS[item.code] || ['No significant abnormality detected.', 'Normal study.'];
      item.findings = rep[0];
      item.impression = rep[1];
    }
  }
}

async function completeOrder(ctx, order, when) {
  const patient = await Patient.findById(order.patient);
  fillResults(order, patient, ctx.tests);
  order.status = 'Completed';
  order.sampleCollectedAt ||= new Date(when.getTime() - 3 * 3600000);
  order.collectedBy ||= ctx.labTech?._id;
  order.completedAt = when;
  order.reportedBy = order.category === 'lab' ? ctx.labTech?._id : ctx.radiologist?._id;
  await order.save();
}

async function createOrder(ctx, { patient, doctor, codes, when, complete, encounter, priority = 'Routine' }) {
  const tests = codes.map((c) => ctx.test(c)).filter(Boolean);
  if (!tests.length) return null;
  const category = tests[0].category;
  const order = new LabOrder({
    orderNo: await nextCode(category === 'lab' ? 'LAB' : 'RAD'), category, patient: patient._id, doctor: doctor._id, encounter: encounter?._id, priority, createdBy: doctor._id,
    items: tests.filter((t) => t.category === category).map((t) => ({
      test: t._id, code: t.code, name: t.name, section: t.section, price: t.price,
      results: (t.parameters || []).map((p) => ({ parameter: p.name, unit: p.unit, refRange: p.refRange, value: '', flag: '' })),
    })),
  });
  const inv = await addCharges({
    patientId: patient._id, type: category === 'lab' ? 'Laboratory' : 'Radiology', userId: ctx.reception._id,
    items: order.items.map((i) => ({ description: `${i.name} (${order.orderNo})`, category: category === 'lab' ? 'Laboratory' : 'Radiology', quantity: 1, rate: i.price, refType: 'LabOrder', refId: order._id })),
  });
  order.invoice = inv._id;
  if (inv.admission) order.admission = inv.admission;
  await order.save();
  await backdate(LabOrder, order._id, when);
  if (inv.type !== 'IPD') {
    await backdate(Invoice, inv._id, when);
    await recordPayment(inv, { amount: inv.balance, mode: pick(['Cash', 'UPI', 'UPI', 'Card']), paidAt: when }, ctx.reception);
  }
  if (encounter) await Encounter.updateOne({ _id: encounter._id }, { $addToSet: { labOrders: order._id } });
  if (complete) {
    await completeOrder(ctx, order, new Date(Math.min(when.getTime() + int(2, 5) * 3600000, Date.now())));
  } else if (chance(0.5)) {
    order.status = 'Sample Collected'; order.sampleCollectedAt = new Date(Math.min(when.getTime() + 20 * 60000, Date.now())); order.collectedBy = ctx.labTech?._id;
    await order.save();
  }
  return order;
}

/* ------------------------------------------------------------------ */
/* OPD visits                                                          */
/* ------------------------------------------------------------------ */
async function checkIn(ctx, appt, when) {
  if (!appt.tokenNo) {
    const last = await Appointment.findOne({ doctor: appt.doctor._id || appt.doctor, date: appt.date, tokenNo: { $gt: 0 } }).sort('-tokenNo');
    appt.tokenNo = (last?.tokenNo || 0) + 1;
  }
  appt.checkedInAt ||= when;
  if (!appt.invoice) {
    const doc = appt.doctor.consultationFee !== undefined ? appt.doctor : await User.findById(appt.doctor);
    const fee = appt.type === 'Follow-up' ? Math.round((doc.consultationFee || 500) / 2) : (doc.consultationFee || 500);
    const inv = await addCharges({
      patientId: appt.patient, type: 'OPD', userId: ctx.reception._id, appointment: appt._id, forceSeparate: true,
      items: [{ description: `${appt.type} consultation - ${doc.name}`, category: 'Consultation', quantity: 1, rate: fee, refType: 'Appointment', refId: appt._id }],
    });
    await backdate(Invoice, inv._id, when);
    await recordPayment(inv, { amount: inv.total, mode: pick(['Cash', 'UPI', 'UPI', 'Card']), paidAt: when }, ctx.reception);
    appt.invoice = inv._id;
  }
  if (appt.status === 'Scheduled') appt.status = 'Checked-in';
}

async function startVisit(ctx, appt, when) {
  await checkIn(ctx, appt, new Date(when.getTime() - 10 * 60000));
  const patient = await Patient.findById(appt.patient);
  if (!appt.encounter) {
    const enc = await Encounter.create({
      encounterNo: await nextCode('ENC'), patient: appt.patient, doctor: appt.doctor._id || appt.doctor, department: appt.department, appointment: appt._id,
      type: 'OPD', vitals: vitals(patient, ctx.nurse._id), chiefComplaint: appt.reason,
    });
    await backdate(Encounter, enc._id, when);
    appt.encounter = enc._id;
  }
  appt.status = 'In-consultation';
  appt.startedAt ||= when;
}

/** True when a staff member has edited the consultation after the simulator created it. */
async function userTouched(appt) {
  if (!appt.encounter) return false;
  const enc = await Encounter.findById(appt.encounter).select('createdAt updatedAt diagnoses');
  return Boolean(enc && enc.updatedAt - enc.createdAt > 60000 && enc.updatedAt > Date.now() - 6 * 3600000);
}

async function completeVisit(ctx, appt, when) {
  const docEntry = ctx.doctors.find((d) => String(d.user._id) === String(appt.doctor._id || appt.doctor));
  const doctor = docEntry?.user || await User.findById(appt.doctor);
  await startVisit(ctx, appt, new Date(when.getTime() - 15 * 60000));
  const patient = await Patient.findById(appt.patient);
  const [complaint, code, diagnosis, rx] = pick(CLINICAL[docEntry?.code] || CLINICAL.GM);
  const enc = await Encounter.findById(appt.encounter);
  if (enc.status !== 'Completed') {
    enc.chiefComplaint ||= appt.reason || complaint;
    if (!enc.diagnoses.length) enc.diagnoses = [{ code, description: diagnosis, type: 'Final' }];
    if (!enc.prescriptions.length) enc.prescriptions = buildRx(ctx, rx);
    enc.examination ||= 'General condition fair. Vitals stable. Systemic examination unremarkable.';
    enc.advice ||= pick(['Plenty of oral fluids. Rest for 3 days.', 'Low salt, low fat diet. Regular walks.', 'Review with reports.', 'Avoid oily and spicy food.']);
    if (chance(0.4)) enc.followUpDate = new Date(when.getTime() + int(5, 21) * DAY);
    enc.status = 'Completed';
    enc.completedAt = when;
    await enc.save();

    if (chance(0.3)) {
      const pool = { ORTHO: ['XRKNEE', 'XRLS', 'XRWRIST'], CARD: ['ECHO', 'LIPID'], OBG: ['USGOBS', 'CBC'] }[docEntry?.code]
        || ['CBC', 'FBS', 'LFT', 'KFT', 'TFT', 'URINE', 'HBA1C', 'NS1', 'XRCHEST', 'USGABD'];
      // Recent orders stay on the worklist; older ones are reported.
      await createOrder(ctx, { patient, doctor, codes: [pick(pool)], when: new Date(when.getTime() + 5 * 60000), complete: when < new Date(Date.now() - 3 * 3600000), encounter: enc });
    }
    const lines = enc.prescriptions.slice(0, 2).map((m) => ctx.medicines.find((x) => String(x._id) === String(m.medicine))).filter(Boolean);
    if (lines.length && chance(0.75)) {
      const saleAt = new Date(when.getTime() + 15 * 60000);
      const pinv = await addCharges({
        patientId: patient._id, type: 'Pharmacy', userId: ctx.pharmacist._id, forceSeparate: true,
        items: lines.map((m) => ({ description: `${medLabel(m)} - Batch ${m.batches[0]?.batchNo || 'NA'}`, category: 'Pharmacy', quantity: ['Tablet', 'Capsule'].includes(m.form) ? int(6, 20) : 1, rate: m.mrp, refType: 'Medicine', refId: m._id })),
      });
      await backdate(Invoice, pinv._id, saleAt);
      await recordPayment(pinv, { amount: pinv.total, mode: pick(['Cash', 'UPI']), paidAt: saleAt }, ctx.pharmacist);
      await Encounter.updateOne({ _id: enc._id }, { rxDispensedAt: saleAt });
    }
  }
  appt.status = 'Completed';
  appt.completedAt = when;
  await appt.save();
}

/* ------------------------------------------------------------------ */
/* IPD                                                                 */
/* ------------------------------------------------------------------ */
const IPD_CASES = [
  ['SURG', 'Acute appendicitis', 'CTABD'], ['SURG', 'Symptomatic cholelithiasis', 'USGABD'], ['ORTHO', 'Fracture neck of femur', 'XRKNEE'],
  ['GM', 'Dengue fever with thrombocytopenia', 'NS1'], ['GM', 'Community acquired pneumonia', 'XRCHEST'], ['CARD', 'Acute coronary syndrome', 'ECHO'],
  ['GM', 'Uncontrolled type 2 diabetes', 'HBA1C'], ['OBG', 'Term pregnancy in labour', 'USGOBS'], ['GM', 'Acute gastroenteritis with dehydration', 'ELEC'],
];

async function admitPatient(ctx, when) {
  const admittedIds = (await Admission.find({ status: 'Admitted' }).select('patient')).map((a) => String(a.patient));
  const candidates = await Patient.aggregate([{ $match: { status: 'Active', dob: { $lt: new Date(Date.now() - 14 * 365 * DAY) } } }, { $sample: { size: 20 } }]);
  const patient = candidates.find((p) => !admittedIds.includes(String(p._id)));
  if (!patient) return;
  const [code, diagnosis, testCode] = pick(IPD_CASES.filter((c) => patient.gender === 'Female' || c[0] !== 'OBG'));
  const doctor = ctx.doctors.find((d) => d.code === code)?.user || ctx.clinic[0].user;
  const wardCode = code === 'CARD' ? 'ICU' : code === 'OBG' ? 'MAT' : pick(patient.gender === 'Female' ? ['GWF', 'SPW', 'PVT', 'GWF'] : ['GWM', 'SPW', 'PVT', 'GWM']);
  const ward = await Ward.findOne({ code: wardCode, active: true });
  const bed = ward?.beds.find((b) => b.status === 'Available');
  if (!bed) return;
  const adm = new Admission({
    admissionNo: await nextCode('IPD'), patient: patient._id, doctor: doctor._id, department: doctor.department, ward: ward._id, bedNumber: bed.number,
    admissionType: chance(0.5) ? 'Emergency' : 'Planned', admittedAt: when, reason: diagnosis, provisionalDiagnosis: diagnosis,
    attendant: { name: patient.emergencyContact?.name, relation: patient.emergencyContact?.relation, phone: patient.emergencyContact?.phone },
    bedHistory: [{ ward: ward._id, wardName: ward.name, bedNumber: bed.number, dailyRate: ward.dailyRate + ward.nursingRate, from: when }],
    createdBy: ctx.reception._id, deposit: pick([5000, 10000, 15000]),
    notes: [
      { type: 'Vitals', text: 'Admission vitals', vitals: { bpSystolic: int(110, 150), bpDiastolic: int(70, 95), pulse: int(70, 110), temperature: 99.1, spo2: int(93, 99), respRate: int(16, 24) }, by: ctx.nurse._id, at: new Date(when.getTime() + 30 * 60000) },
      { type: 'Doctor', text: `Admitted with ${diagnosis.toLowerCase()}. Investigations sent, IV fluids and supportive care started.`, by: doctor._id, at: new Date(when.getTime() + 60 * 60000) },
    ],
  });
  const ok = await Ward.updateOne({ _id: ward._id, beds: { $elemMatch: { _id: bed._id, status: 'Available' } } }, { $set: { 'beds.$.status': 'Occupied', 'beds.$.patient': patient._id, 'beds.$.admission': adm._id } });
  if (!ok.modifiedCount) return;
  await adm.save();
  await backdate(Admission, adm._id, when);
  const inv = await getOrCreateIpdInvoice(adm, ctx.reception._id);
  await backdate(Invoice, inv._id, when);
  await recordPayment(inv, { amount: adm.deposit, mode: pick(['Cash', 'Card', 'UPI', 'Bank Transfer']), reference: 'Admission deposit', paidAt: when }, ctx.reception);
  const orderAt = new Date(when.getTime() + 2 * 3600000);
  const recent = orderAt > new Date(Date.now() - 4 * 3600000);
  await createOrder(ctx, { patient, doctor, codes: ['CBC'], when: minTime(orderAt, new Date()), complete: !recent, priority: code === 'CARD' ? 'STAT' : 'Urgent' });
  await createOrder(ctx, { patient, doctor, codes: [testCode], when: minTime(orderAt, new Date()), complete: !recent, priority: 'Urgent' });
}

async function dischargePatient(ctx, adm, when) {
  const inv = await getOrCreateIpdInvoice(adm, ctx.reception._id);
  const days = Math.max(1, Math.round((dayStart(when) - dayStart(adm.admittedAt)) / DAY));
  const seg = adm.bedHistory[adm.bedHistory.length - 1];
  if (seg) seg.to = when;
  const meds = ['Normal Saline 500 ml', 'Pantoprazole Injection', 'Ceftriaxone 1g', 'Paracetamol 650'].map((n) => ctx.medByName.get(n)).filter(Boolean);
  for (const m of meds) inv.items.push({ description: `${medLabel(m)} - Batch ${m.batches[0]?.batchNo || 'NA'}`, category: 'Pharmacy', quantity: int(2, 3) * days, rate: m.mrp, refType: 'Medicine', refId: m._id });
  const doctor = await User.findById(adm.doctor);
  inv.items.push({ description: `Doctor visit charges - ${doctor?.name || 'Consultant'}`, category: 'Consultation', quantity: days, rate: 600 });
  inv.items.push({ description: `Room & nursing - ${seg?.wardName} / ${adm.bedNumber} (${days} day${days > 1 ? 's' : ''})`, category: 'Room', quantity: days, rate: seg?.dailyRate || 1500, refType: 'Admission', refId: adm._id });
  inv.finalized = true;
  inv.recalc();
  await inv.save();
  if (inv.balance > 0) {
    await recordPayment(inv, { amount: inv.balance, mode: pick(['Card', 'UPI', 'Bank Transfer', 'Cash']), paidAt: when }, ctx.reception);
  } else if (inv.balance < 0) {
    const amount = Math.round(-inv.balance * 100) / 100;
    inv.payments.push({ receiptNo: await nextCode('RFD'), amount: -amount, mode: 'Cash', reference: 'Refund of excess deposit', paidAt: when, receivedBy: ctx.accountant?._id });
    inv.recalc(); await inv.save();
    await LedgerEntry.create({ entryNo: await nextCode('LED'), date: when, type: 'Expense', category: 'Patient Refunds', amount, mode: 'Cash', description: `Refund against ${inv.invoiceNo}`, invoice: inv._id, auto: true, createdBy: ctx.accountant?._id });
  }
  adm.status = 'Discharged';
  adm.dischargedAt = when;
  adm.dischargeSummary = {
    finalDiagnosis: adm.provisionalDiagnosis || adm.reason, treatmentGiven: 'IV fluids, antibiotics, analgesics and supportive care.', procedures: 'None',
    conditionAtDischarge: 'Stable, afebrile, ambulatory', medications: 'Tab Paracetamol 650 mg SOS, Tab Pantoprazole 40 mg OD x 5 days',
    followUp: 'Review in OPD after 7 days with reports', instructions: 'Adequate rest and oral fluids. Report immediately in case of fever or pain.',
  };
  await adm.save();
  await Ward.updateOne({ _id: adm.ward, 'beds.number': adm.bedNumber }, { $set: { 'beds.$.status': 'Cleaning' }, $unset: { 'beds.$.patient': '', 'beds.$.admission': '' } });
}

/* ------------------------------------------------------------------ */
/* Daily rollover                                                      */
/* ------------------------------------------------------------------ */
async function bookDay(ctx, date, count) {
  if (date.getDay() === 0) return;
  const patients = await Patient.aggregate([{ $match: { status: 'Active' } }, { $sample: { size: 60 } }]);
  for (const doc of ctx.clinic) {
    const existing = await Appointment.countDocuments({ doctor: doc.user._id, date, status: { $ne: 'Cancelled' } });
    const need = count(doc) - existing;
    for (let k = 0; k < need; k += 1) {
      const mins = 9 * 60 + (existing + k) * 20;
      if (mins > 16 * 60 + 40) break;
      const slot = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      if (await Appointment.exists({ doctor: doc.user._id, date, timeSlot: slot })) continue;
      await Appointment.create({
        appointmentNo: await nextCode('APT'), patient: pick(patients)._id, doctor: doc.user._id, department: doc.user.department, date, timeSlot: slot,
        type: chance(0.3) ? 'Follow-up' : 'New', source: pick(['Walk-in', 'Phone', 'Online']), status: 'Scheduled', createdBy: ctx.reception._id,
        reason: pick(CLINICAL[doc.code] || CLINICAL.GM)[0], simulated: true,
      });
    }
  }
}

async function registerPatients(ctx, date, n) {
  for (let i = 0; i < n; i += 1) {
    const female = chance(0.5);
    const age = pick([int(2, 12), int(18, 35), int(25, 50), int(40, 75)]);
    const last = pick(LAST);
    const first = female ? pick(FEMALE) : pick(MALE);
    const [city, state, pin] = pick(CITIES);
    const ins = pick(INSURERS);
    const when = at(date, int(9, 17), int(0, 59));
    const p = await Patient.create({
      uhid: await nextCode('UH', { yearly: false, pad: 6, sep: '' }),
      title: age < 13 ? (female ? 'Baby' : 'Master') : female ? 'Mrs' : 'Mr', firstName: first, lastName: last, gender: female ? 'Female' : 'Male',
      dob: new Date(Date.now() - age * 365.25 * DAY), bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O+', 'B+']), phone: `9${String(Date.now() + i).slice(-9)}`,
      address: { line1: `${int(1, 250)}, ${pick(STREETS)}`, city, state, pincode: `${pin}${int(10, 99)}` },
      emergencyContact: { name: `${pick(female ? MALE : FEMALE)} ${last}`, relation: pick(['Spouse', 'Parent', 'Sibling']), phone: `8${String(Date.now() + 99 + i).slice(-9)}` },
      insurance: chance(0.35) ? { provider: ins[0], tpa: ins[1], policyNumber: `POL${int(10000000, 99999999)}`, validTill: new Date(Date.now() + 300 * DAY), coverageAmount: 500000 } : undefined,
      registeredBy: ctx.reception._id,
    });
    await backdate(Patient, p._id, when);
  }
}

async function simulateDay(ctx, date) {
  const now = new Date();
  const isToday = dayStart(date).getTime() === dayStart(now).getTime();

  // 1. Close out earlier days' open appointments.
  const open = await Appointment.find({ date: { $lt: date }, status: { $in: ['Scheduled', 'Checked-in', 'In-consultation'] } }).populate('doctor');
  for (const a of open) {
    const when = new Date(slotTime(a.date, a.timeSlot).getTime() + 20 * 60000);
    if (a.status === 'Scheduled' && chance(0.1)) { a.status = chance(0.6) ? 'No-show' : 'Cancelled'; await a.save(); continue; }
    await completeVisit(ctx, a, when);
  }
  await Encounter.updateMany({ status: 'Open', createdAt: { $lt: date } }, { status: 'Completed', completedAt: date });

  // 2. Report pending diagnostics from earlier days.
  const pending = await LabOrder.find({ createdAt: { $lt: date }, status: { $in: ['Ordered', 'Sample Collected', 'In Progress'] } });
  for (const o of pending) await completeOrder(ctx, o, new Date(Math.min(o.createdAt.getTime() + int(3, 8) * 3600000, date.getTime() - 60000)));

  // 3. Beds: yesterday's cleaning is done; nursing rounds for in-patients.
  await Ward.updateMany({}, { $set: { 'beds.$[b].status': 'Available' } }, { arrayFilters: [{ 'b.status': 'Cleaning' }] });
  const admitted = await Admission.find({ status: 'Admitted' });
  const prev = addDays(date, -1);
  for (const a of admitted) {
    if (a.admittedAt > at(prev, 20)) continue;
    a.notes.push(
      { type: 'Vitals', text: 'Morning round vitals', vitals: { bpSystolic: int(110, 140), bpDiastolic: int(70, 90), pulse: int(70, 100), temperature: Math.round((98 + rand() * 1.6) * 10) / 10, spo2: int(94, 99), respRate: int(16, 22) }, by: ctx.nurse._id, at: at(prev, 8) },
      { type: 'Doctor', text: pick(['Clinically improving. Continue current management.', 'Afebrile, vitals stable. Plan discharge in 1-2 days.', 'Reviewed reports. Continue IV antibiotics.']), by: a.doctor, at: at(prev, 11) },
      { type: 'Nursing', text: pick(['Patient comfortable, medications given as per chart.', 'Slept well. Oral intake adequate.', 'IV line patent. No fresh complaints.']), by: ctx.nurse._id, at: at(prev, 20) },
    );
    await a.save();
  }

  // 4. Discharges (stays of 2-6 days) and new admissions to keep occupancy realistic.
  for (const a of admitted) {
    const stay = (date - dayStart(a.admittedAt)) / DAY;
    if (stay >= 2 && (stay >= 7 || chance(0.22))) await dischargePatient(ctx, a, at(date, int(10, 13), int(0, 59)));
  }
  const current = await Admission.countDocuments({ status: 'Admitted' });
  const target = int(26, 34);
  const admitHour = isToday ? Math.max(0, Math.min(now.getHours() - 1, 18)) : 18;
  for (let i = 0; i < Math.min(8, target - current); i += 1) await admitPatient(ctx, minTime(at(date, int(Math.min(7, admitHour), admitHour), int(0, 59)), now));

  // 5. Surgeries: earlier cases are closed; book tomorrow's day-care list.
  const sx = await Surgery.find({ scheduledAt: { $lt: date }, status: { $in: ['Scheduled', 'In Progress'] } });
  for (const s of sx) await finishSurgery(ctx, s, new Date(s.scheduledAt.getTime() + s.durationMins * 60000));
  await bookSurgeries(ctx, addDays(date, 1));

  // 6. New registrations, expenses, pharmacy restock.
  if (date.getDay() !== 0) await registerPatients(ctx, date, isToday ? int(0, 1) : int(1, 3));
  await monthlyExpenses(ctx, date);
  await restock(ctx, date);

  // 7. Rolling 7-day appointment book.
  await bookDay(ctx, date, () => int(5, 7));
  for (let d = 1; d <= 6; d += 1) await bookDay(ctx, addDays(date, d), () => int(2, 5));
}

async function finishSurgery(ctx, s, when) {
  s.checklist = { consent: true, fasting: true, siteMarked: true, bloodArranged: true, anaesthesiaCleared: true };
  s.startedAt ||= s.scheduledAt;
  s.endedAt = when;
  s.status = 'Completed';
  s.operativeNotes ||= `${s.procedure} performed uneventfully. Haemostasis achieved.`;
  s.postOpInstructions ||= 'Monitor vitals. Oral fluids after 4 hours. Review next day.';
  if (!s.billed && s.charges > 0) {
    const inv = await addCharges({
      patientId: s.patient, type: 'OT', userId: ctx.reception._id,
      items: [{ description: `OT charges - ${s.procedure} (${s.surgeryNo})`, category: 'OT', quantity: 1, rate: s.charges, refType: 'Surgery', refId: s._id }],
    });
    if (inv.type !== 'IPD') await recordPayment(inv, { amount: inv.balance, mode: pick(['Card', 'UPI']), paidAt: when }, ctx.reception);
    s.billed = true;
  }
  await s.save();
  await Theatre.updateOne({ _id: s.theatre }, { status: 'Available' });
}

async function bookSurgeries(ctx, date) {
  if (date.getDay() === 0) return;
  const existing = await Surgery.countDocuments({ scheduledAt: { $gte: date, $lt: addDays(date, 1) } });
  if (existing >= 2) return;
  const minor = await Theatre.findOne({ code: 'MOT' }) || await Theatre.findOne();
  const surgeons = ctx.doctors.filter((d) => ['SURG', 'ORTHO', 'ENT'].includes(d.code));
  if (!minor || !surgeons.length) return;
  const PROCS = { SURG: ['Excision of lipoma', 'Incision and drainage', 'Circumcision'], ORTHO: ['Implant removal', 'Closed reduction and casting'], ENT: ['Tonsillectomy', 'Septoplasty'] };
  const patients = await Patient.aggregate([{ $match: { status: 'Active' } }, { $sample: { size: 5 } }]);
  for (let i = existing; i < 2; i += 1) {
    const doc = pick(surgeons);
    await Surgery.create({
      surgeryNo: await nextCode('OT'), patient: patients[i]._id, theatre: minor._id, procedure: pick(PROCS[doc.code]), category: 'Day Care', priority: 'Elective',
      surgeon: doc.user._id, anaesthetist: ctx.anaesthetist?._id, anaesthesiaType: 'Local', scheduledAt: at(date, i === 0 ? 10 : 14, 30), durationMins: 45,
      preOpDiagnosis: 'Elective day-care procedure', checklist: { consent: true, fasting: true }, charges: pick([8000, 12000, 15000]), createdBy: doc.user._id,
    });
  }
}

async function monthlyExpenses(ctx, date) {
  const when = at(date, 11);
  const items = [];
  if (date.getDate() === 1) {
    items.push(['Salaries', 420000, 'Monthly payroll'], ['Rent', 120000, 'Building lease - Block C'], ['Housekeeping', int(25000, 32000), 'Outsourced housekeeping']);
  }
  if (date.getDate() === 5) items.push(['Utilities', int(38000, 52000), 'Electricity - JVVNL'], ['Utilities', int(6000, 9000), 'Water & sewerage']);
  if (date.getDate() === 12) items.push(['Maintenance', int(15000, 30000), 'Biomedical equipment AMC'], ['Professional Fees', int(30000, 50000), 'Visiting consultants']);
  if (date.getDate() === 18) items.push(['Medical Supplies', int(40000, 70000), 'Surgical consumables'], ['Marketing', int(10000, 20000), 'Health camp & print ads']);
  if (chance(0.25)) items.push(['Miscellaneous', int(1500, 9000), pick(['Office supplies', 'Courier charges', 'Vehicle fuel', 'Refreshments'])]);
  for (const [category, amount, description] of items) {
    await LedgerEntry.create({ entryNo: await nextCode('LED'), date: when, type: 'Expense', category, amount, mode: category === 'Miscellaneous' ? 'Cash' : 'Bank Transfer', description, payee: description.split(' - ')[1]?.trim(), createdBy: ctx.accountant?._id });
  }
}

async function restock(ctx, date) {
  // Top up badly depleted medicines, but leave a few at reorder level so alerts stay meaningful.
  const low = await Medicine.find({ active: true, $expr: { $lt: ['$stock', { $multiply: ['$reorderLevel', 0.3] }] } });
  for (const m of low.slice(0, Math.max(0, low.length - 2))) {
    const qty = m.reorderLevel * 3;
    const batchNo = `${m.name.slice(0, 3).toUpperCase().replace(/\W/g, 'X')}${int(1000, 9999)}R`;
    m.batches.push({ batchNo, expiryDate: new Date(date.getTime() + int(300, 800) * DAY), quantity: qty, purchasePrice: Math.round(m.mrp * 0.72 * 100) / 100, mrp: m.mrp, receivedAt: at(date, 10) });
    await m.save();
    await StockMovement.create({ itemType: 'Medicine', item: m._id, itemName: m.name, type: 'IN', quantity: qty, batchNo, note: 'Replenishment', by: ctx.pharmacist?._id });
  }
}

async function rollover(ctx) {
  const today = dayStart(new Date());
  const marker = await Counter.findById('demo-rollover');
  if (!marker) {
    // Fresh seed already covers today.
    await Counter.updateOne({ _id: 'demo-rollover' }, { seq: ymd(today) }, { upsert: true });
    return;
  }
  let d = addDays(fromYmd(marker.seq), 1);
  const earliest = addDays(today, -MAX_CATCHUP_DAYS);
  if (d < earliest) d = earliest;
  for (; d <= today; d = addDays(d, 1)) {
    console.log(`[simulator] rolling over ${d.toDateString()}`);
    await simulateDay(ctx, d);
    await Counter.updateOne({ _id: 'demo-rollover' }, { seq: ymd(d) });
  }
}

/* ------------------------------------------------------------------ */
/* Live tick for today                                                 */
/* ------------------------------------------------------------------ */
async function tick(ctx) {
  const now = new Date();
  const today = dayStart(now);
  const appts = await Appointment.find({ date: today, simulated: true, status: { $in: ['Scheduled', 'Checked-in', 'In-consultation'] } }).populate('doctor').sort('timeSlot');
  const byDoctor = new Map();
  for (const a of appts) {
    const k = String(a.doctor?._id);
    if (!byDoctor.has(k)) byDoctor.set(k, []);
    byDoctor.get(k).push(a);
  }
  for (const list of byDoctor.values()) {
    const remaining = [];
    for (const a of list) {
      const t = slotTime(today, a.timeSlot);
      if (t.getTime() <= now.getTime() - 25 * 60000) {
        if (a.status === 'In-consultation' && await userTouched(a)) { remaining.push(a); continue; }
        if (a.status === 'Scheduled' && chance(0.06)) { a.status = 'No-show'; await a.save(); continue; }
        await completeVisit(ctx, a, new Date(t.getTime() + 20 * 60000));
      } else remaining.push(a);
    }
    const busy = remaining.some((a) => a.status === 'In-consultation');
    const next = remaining.find((a) => a.status !== 'In-consultation' && slotTime(today, a.timeSlot) <= now);
    if (!busy && next) { await startVisit(ctx, next, now); await next.save(); }
    for (const a of remaining) {
      const t = slotTime(today, a.timeSlot);
      if (a.status === 'Scheduled' && t.getTime() <= now.getTime() + 40 * 60000 && t.getTime() >= now.getTime() - 60 * 60000) {
        await checkIn(ctx, a, new Date(Math.min(now.getTime(), t.getTime())));
        await a.save();
      }
    }
  }

  // Theatre list for today.
  const cases = await Surgery.find({ scheduledAt: { $gte: today, $lte: now }, status: { $in: ['Scheduled', 'In Progress'] } });
  for (const s of cases) {
    const end = new Date(s.scheduledAt.getTime() + s.durationMins * 60000);
    if (end <= now) await finishSurgery(ctx, s, end);
    else if (s.status === 'Scheduled') {
      s.checklist = { ...(s.checklist?.toObject?.() || {}), consent: true, fasting: true, siteMarked: true, anaesthesiaCleared: true };
      s.status = 'In Progress';
      s.startedAt = s.scheduledAt;
      await s.save();
      await Theatre.updateOne({ _id: s.theatre }, { status: 'In Use' });
    }
  }
}

/* ------------------------------------------------------------------ */
let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    if (!(await Counter.findById('demo-seeded'))) return;
    const ctx = await loadContext();
    if (!ctx) return;
    await rollover(ctx);
    await tick(ctx);
  } catch (err) {
    console.error('[simulator]', err);
  } finally {
    running = false;
  }
}

export function startDemoSimulator() {
  console.log('[simulator] demo activity simulator enabled');
  run();
  setInterval(run, TICK_MS);
}

// Exposed for manual runs / tests.
export const _internal = { run, simulateDay, tick };
