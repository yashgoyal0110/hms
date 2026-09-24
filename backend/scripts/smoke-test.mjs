// End-to-end API workflow test. Run inside the API container:
//   docker exec -i hms-api node - < backend/scripts/smoke-test.mjs
// Requires the demo data (SEED_DEMO=true). Creates a few extra records.
const BASE = process.env.BASE || 'http://127.0.0.1:4000/api';
const PW = 'Demo@1234';
let pass = 0; let fail = 0;

function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    login: async (email) => call('POST', '/auth/login', { email, password: PW }),
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b || {}), put: (p, b) => call('PUT', p, b), patch: (p, b) => call('PATCH', p, b),
  };
}

function check(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}
const ok = (r) => r.status >= 200 && r.status < 300;
const today = new Date().toISOString().slice(0, 10);

const admin = client(); const doc = client(); const nurse = client(); const rec = client(); const pharm = client(); const lab = client(); const rad = client(); const acc = client();

console.log('Auth & RBAC');
for (const [c, e] of [[admin, 'admin'], [doc, 'dr.mehta'], [nurse, 'nurse.priya'], [rec, 'reception'], [pharm, 'pharmacy'], [lab, 'lab'], [rad, 'radiology'], [acc, 'accounts']]) {
  const r = await c.login(`${e}@demo.hms`);
  check(`login ${e}`, ok(r) && r.data.permissions, r.data);
}
const bad = await client().login('admin@demo.hms'.replace('admin', 'nobody'));
check('invalid login rejected', bad.status === 401);
check('unauthenticated request rejected', (await client().get('/patients')).status === 401);

console.log('Registration & appointments');
const pr = await rec.post('/patients', { firstName: 'Smoke', lastName: `Test${Date.now() % 10000}`, gender: 'Male', phone: '9000000001', dob: '1985-05-05', allergies: ['Penicillin'], chargeRegistration: true, insurance: { provider: 'Star Health', policyNumber: 'POLTEST1', tpa: 'Medi Assist' } });
check('register patient', ok(pr) && pr.data.uhid, pr.data);
const P = pr.data;
const dir = await rec.get('/users/directory?role=doctor');
const mehta = dir.data.find((u) => u.name.includes('Mehta'));
let slots = await rec.get(`/appointments/slots?doctor=${mehta._id}&date=${today}`);
let slot = slots.data.slots?.find((s) => s.available)?.time;
let apptDate = today;
if (!slot) {
  const d = new Date(Date.now() + 86400000); if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  apptDate = d.toISOString().slice(0, 10);
  slots = await rec.get(`/appointments/slots?doctor=${mehta._id}&date=${apptDate}`);
  slot = slots.data.slots.find((s) => s.available)?.time;
}
check('slots available', Boolean(slot), slots.data);
const ap = await rec.post('/appointments', { patient: P._id, doctor: mehta._id, date: apptDate, timeSlot: slot, type: 'New', reason: 'Fever' });
check('book appointment', ok(ap), ap.data);
check('double booking blocked', (await rec.post('/appointments', { patient: P._id, doctor: mehta._id, date: apptDate, timeSlot: slot })).status === 409);
const ci = await rec.post(`/appointments/${ap.data._id}/status`, { status: 'Checked-in' });
check('check-in issues token + bill', ok(ci) && ci.data.tokenNo > 0 && ci.data.invoice, ci.data);
const st = await doc.post(`/appointments/${ap.data._id}/status`, { status: 'In-consultation' });
check('start consultation creates encounter', ok(st) && st.data.encounter, st.data);
const encId = st.data.encounter;

console.log('OPD / EMR');
const med = (await doc.get('/pharmacy/medicines?q=Paracetamol 650&limit=1')).data.data[0];
const up = await doc.put(`/encounters/${encId}`, {
  vitals: { bpSystolic: 128, bpDiastolic: 84, pulse: 92, temperature: 101.2, weight: 72, height: 175 }, chiefComplaint: 'Fever 3 days',
  diagnoses: [{ code: 'A90', description: 'Dengue fever', type: 'Provisional' }],
  prescriptions: [{ medicine: med._id, name: med.name, dosage: '1 tab', frequency: '1-1-1', duration: '3 days' }],
});
check('save consultation (BMI computed)', ok(up) && up.data.vitals.bmi === 23.5, up.data.vitals);
const tests = (await doc.get('/lab-tests?category=lab&q=CBC')).data.data;
const lo = await doc.post('/lab-orders', { category: 'lab', patient: P._id, encounter: encId, tests: [tests[0]._id], priority: 'Urgent' });
check('order lab test (billed)', ok(lo) && lo.data.invoice, lo.data);
const done = await doc.post(`/encounters/${encId}/complete`);
check('complete consultation', ok(done) && done.data.status === 'Completed');
const apAfter = await rec.get(`/appointments/${ap.data._id}`);
check('appointment auto-completed', apAfter.data.status === 'Completed');

console.log('Laboratory');
check('collect sample', ok(await lab.post(`/lab-orders/${lo.data._id}/collect`)));
const order = (await lab.get(`/lab-orders/${lo.data._id}`)).data;
const item = order.items[0];
const res = await lab.put(`/lab-orders/${order._id}/results`, { items: [{ _id: item._id, results: item.results.map((r) => ({ ...r, value: r.parameter === 'Platelet Count' ? '0.6' : '5000' })) }] });
check('enter results with auto-flags', ok(res) && res.data.items[0].results.some((r) => r.flag), res.data.items?.[0]?.results);
const fin = await lab.post(`/lab-orders/${order._id}/complete`);
check('finalise report', ok(fin) && fin.data.status === 'Completed');

console.log('Pharmacy');
const rx = await pharm.get('/pharmacy/prescriptions');
check('prescription in pharmacy queue', rx.data.some((e) => e._id === encId));
const disp = await pharm.post('/pharmacy/dispense', { patient: P._id, encounter: encId, items: [{ medicine: med._id, quantity: 9 }], payment: { mode: 'UPI' } });
check('dispense FEFO + bill + pay', ok(disp) && disp.data.invoice.status === 'Paid', disp.data);
check('over-dispense blocked', (await pharm.post('/pharmacy/dispense', { patient: P._id, items: [{ medicine: med._id, quantity: 999999 }] })).status === 400);

console.log('Billing');
const inv = await rec.get(`/invoices?patient=${P._id}&limit=50`);
const unpaid = inv.data.data.filter((i) => i.balance > 0);
for (const i of unpaid) {
  const pay = await rec.post(`/invoices/${i._id}/payments`, { amount: i.balance, mode: 'Cash' });
  check(`pay ${i.invoiceNo} (${i.type})`, ok(pay) && pay.data.receiptNo, pay.data);
}
check('overpayment blocked', (await rec.post(`/invoices/${unpaid[0]._id}/payments`, { amount: 10, mode: 'Cash' })).status === 400);
const gen = await rec.post('/invoices', { patient: P._id, type: 'General', items: [{ description: 'Dressing', category: 'Procedure', quantity: 1, rate: 250 }], payment: { mode: 'Card' } });
check('manual bill with payment', ok(gen) && gen.data.status === 'Paid', gen.data);

console.log('IPD, OT & discharge');
const wards = (await rec.get('/wards')).data;
const ward = wards.find((w) => w.code === 'PVT');
const bed = ward.beds.find((b) => b.status === 'Available');
const adm = await rec.post('/admissions', { patient: P._id, doctor: mehta._id, ward: ward._id, bedNumber: bed.number, reason: 'Dengue with thrombocytopenia', deposit: 5000, depositMode: 'Cash' });
check('admit with deposit', ok(adm) && adm.data.invoice, adm.data);
check('duplicate admission blocked', (await rec.post('/admissions', { patient: P._id, doctor: mehta._id, ward: ward._id, bedNumber: bed.number, reason: 'x' })).status >= 400);
check('nursing note with vitals', ok(await nurse.post(`/admissions/${adm.data._id}/notes`, { type: 'Nursing', text: 'Stable', vitals: { pulse: 88, temperature: 99.1 } })));
const icu = wards.find((w) => w.code === 'ICU');
const icuBed = icu.beds.find((b) => b.status === 'Available');
check('transfer to ICU', ok(await nurse.post(`/admissions/${adm.data._id}/transfer`, { ward: icu._id, bedNumber: icuBed.number, reason: 'Monitoring' })));
const lab2 = await doc.post('/lab-orders', { category: 'lab', patient: P._id, tests: [tests[0]._id] });
check('IPD lab order goes to running bill', ok(lab2) && String(lab2.data.invoice) === String(adm.data.invoice));
const th = (await doc.get('/theatres')).data.data[3];
const when = new Date(Date.now() + 3 * 86400000); when.setHours(7, 0, 0, 0);
const sx = await doc.post('/surgeries', { patient: P._id, theatre: th._id, procedure: 'Excision biopsy', surgeon: mehta._id, scheduledAt: when, durationMins: 30, charges: 8000 });
check('schedule surgery', ok(sx), sx.data);
check('theatre clash blocked', (await doc.post('/surgeries', { patient: P._id, theatre: th._id, procedure: 'Clash', surgeon: mehta._id, scheduledAt: when, durationMins: 30 })).status === 409);
check('start blocked without checklist', (await doc.post(`/surgeries/${sx.data._id}/status`, { status: 'In Progress' })).status === 400);
await doc.put(`/surgeries/${sx.data._id}`, { checklist: { consent: true, fasting: true, siteMarked: true, anaesthesiaCleared: true } });
check('start surgery', ok(await doc.post(`/surgeries/${sx.data._id}/status`, { status: 'In Progress' })));
check('complete surgery (billed)', ok(await doc.post(`/surgeries/${sx.data._id}/status`, { status: 'Completed', operativeNotes: 'Uneventful' })));
const dis = await doc.post(`/admissions/${adm.data._id}/discharge`, { summary: { finalDiagnosis: 'Dengue fever', conditionAtDischarge: 'Stable' } });
check('discharge finalises bill with room charges', ok(dis) && dis.data.invoice.finalized && dis.data.invoice.items.some((i) => i.category === 'Room') && dis.data.invoice.items.some((i) => i.category === 'OT'), dis.data.invoice?.items?.map((i) => i.category));
const wardsAfter = (await rec.get('/wards')).data;
check('bed released for cleaning', wardsAfter.find((w) => w.code === 'ICU').beds.find((b) => b.number === icuBed.number).status === 'Cleaning');

console.log('Insurance');
const claim = await acc.post('/claims', { invoice: dis.data.invoice._id, claimAmount: 10000 });
check('file claim from patient policy', ok(claim) && claim.data.policyNumber === 'POLTEST1', claim.data);
check('approve claim', ok(await acc.post(`/claims/${claim.data._id}/status`, { status: 'Approved', approvedAmount: 9000 })));
const settle = await acc.post(`/claims/${claim.data._id}/status`, { status: 'Settled', settledAmount: 9000 });
check('settle claim posts insurance payment', ok(settle));
const invAfter = (await acc.get(`/invoices/${dis.data.invoice._id}`)).data.invoice;
check('invoice shows insurance payment', invAfter.payments.some((p) => p.mode === 'Insurance' && p.amount === 9000));
if (invAfter.balance > 0) check('collect co-pay', ok(await acc.post(`/invoices/${invAfter._id}/payments`, { amount: invAfter.balance, mode: 'Card' })));

console.log('Inventory & accounts');
const sup = (await pharm.get('/suppliers')).data.data[0];
const po = await pharm.post('/inventory/purchase-orders', { supplier: sup._id, status: 'Ordered', items: [{ itemType: 'Medicine', item: med._id, quantity: 100, unitCost: 1.5 }] });
check('create purchase order', ok(po), po.data);
check('receive requires batch', (await pharm.post(`/inventory/purchase-orders/${po.data._id}/receive`, { items: [] })).status === 400);
const grn = await pharm.post(`/inventory/purchase-orders/${po.data._id}/receive`, { items: [{ _id: po.data.items[0]._id, batchNo: `SMK${Date.now() % 100000}`, expiryDate: '2028-12-31', mrp: 2.2 }] });
check('goods receipt updates stock', ok(grn) && grn.data.status === 'Received');
const item2 = (await pharm.get('/inventory/items')).data.data[0];
check('issue store item', ok(await pharm.post(`/inventory/items/${item2._id}/stock`, { type: 'OUT', quantity: 1, department: 'ICU' })));
check('record expense', ok(await acc.post('/ledger', { type: 'Expense', category: 'Utilities', amount: 1234, mode: 'Bank Transfer', description: 'Smoke test' })));
const pl = await acc.get('/ledger/summary');
check('P&L summary', ok(pl) && pl.data.income.length > 0);

console.log('Reports, communication, admin');
const dash = await admin.get('/reports/dashboard');
check('dashboard', ok(dash) && dash.data.kpis.totalBeds > 0);
const an = await acc.get('/reports/analytics');
check('analytics', ok(an) && an.data.revenueByType.length > 0);
const msg = await rec.post('/messages', { patients: [P._id], channel: 'SMS', body: 'Hello {{patientName}} from {{hospitalName}}' });
check('send patient SMS (logged without gateway)', ok(msg) && ['Sent', 'Logged'].includes(msg.data.results[0].status), msg.data);
check('auto messages recorded', (await rec.get(`/messages?patient=${P._id}`)).data.total >= 3);
const nu = await admin.post('/users', { name: 'Smoke Nurse', email: `smoke${Date.now()}@demo.hms`, password: 'Weak', role: 'nurse' });
check('weak password rejected', nu.status === 400);
check('roster upsert', ok(await admin.put('/shifts', { user: mehta._id, date: today, shift: 'General' })));
check('audit trail records actions', (await admin.get('/audit?limit=5')).data.total > 0);
check('backup trigger', (await admin.post('/backups')).status === 202);
check('public queue', ok(await client().get('/public/queue')));
check('doctor notifications (critical lab result)', (await doc.get('/notifications')).data.data.some((n) => n.title.includes('result') || n.title.includes('Report')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
