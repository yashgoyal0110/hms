/* eslint-disable no-await-in-loop */
import {
  Admission, Appointment, Counter, Department, Encounter, InsuranceClaim, InventoryItem, Invoice, LabOrder, LabTest,
  LedgerEntry, Medicine, Message, PurchaseOrder, Setting, Shift, StockMovement, Supplier, Surgery, Theatre, User, Ward,
  Patient, nextCode,
} from '../models/index.js';
import { addCharges, getOrCreateIpdInvoice, recordPayment } from '../services/billing.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demoAccounts.js';

// Deterministic PRNG so every fresh demo install looks the same.
let seed = 20260924;
function rand() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const chance = (p) => rand() < p;
const DAY = 86400000;
function daysAgo(n, h = 10, m = 0) {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d;
}
async function backdate(Model, id, date, extra = {}) {
  await Model.collection.updateOne({ _id: id }, { $set: { createdAt: date, updatedAt: date, ...extra } });
}

export const MALE = ['Rahul', 'Amit', 'Suresh', 'Vikram', 'Arjun', 'Rohan', 'Karan', 'Manoj', 'Rajesh', 'Anil', 'Deepak', 'Sanjay', 'Harish', 'Nikhil', 'Farhan', 'Joseph', 'Gurpreet', 'Aditya', 'Varun', 'Mohit', 'Imran', 'Prakash', 'Ashok', 'Kunal'];
export const FEMALE = ['Priya', 'Anjali', 'Sneha', 'Pooja', 'Kavita', 'Sunita', 'Meera', 'Neha', 'Ritu', 'Divya', 'Lakshmi', 'Ayesha', 'Fatima', 'Simran', 'Nandini', 'Shalini', 'Geeta', 'Rekha', 'Swati', 'Tanvi', 'Mary', 'Isha'];
export const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Khan', 'Mehta', 'Joshi', 'Agarwal', 'Chopra', 'Das', 'Bose', 'Kulkarni', 'Pillai', 'Malhotra', 'Saxena', 'Yadav', 'Mishra', 'Fernandes', 'Kapoor', 'Rao'];
export const CITIES = [['Jaipur', 'Rajasthan', '3020'], ['Ajmer', 'Rajasthan', '3050'], ['Kota', 'Rajasthan', '3240'], ['Tonk', 'Rajasthan', '3040'], ['Alwar', 'Rajasthan', '3010']];
export const STREETS = ['Malviya Nagar', 'Vaishali Nagar', 'C-Scheme', 'Mansarovar', 'Raja Park', 'Tonk Road', 'Jagatpura', 'Bani Park', 'Sodala', 'Pratap Nagar'];
export const INSURERS = [['Star Health', 'Medi Assist'], ['HDFC ERGO', 'Paramount TPA'], ['ICICI Lombard', 'MD India'], ['Niva Bupa', 'Vidal Health'], ['CGHS', ''], ['Ayushman Bharat PM-JAY', '']];

export const CLINICAL = {
  GM: [
    ['Fever with body ache for 3 days', 'A90', 'Dengue fever (suspected)', ['Paracetamol 650', 'Pantoprazole 40']],
    ['Burning micturition since 2 days', 'N39.0', 'Urinary tract infection', ['Nitrofurantoin 100', 'Paracetamol 650']],
    ['Routine diabetes follow-up', 'E11.9', 'Type 2 diabetes mellitus', ['Metformin 500', 'Glimepiride 1']],
    ['Headache and giddiness', 'I10', 'Essential hypertension', ['Amlodipine 5', 'Telmisartan 40']],
    ['Cough with expectoration for 1 week', 'J20.9', 'Acute bronchitis', ['Azithromycin 500', 'Ambroxol Syrup', 'Cetirizine 10']],
    ['Loose stools since yesterday', 'A09', 'Acute gastroenteritis', ['ORS Sachet', 'Ondansetron 4', 'Racecadotril 100']],
  ],
  PED: [
    ['Fever and cold for 2 days', 'J06.9', 'Upper respiratory tract infection', ['Paracetamol Syrup', 'Cetirizine Syrup']],
    ['Vomiting and loose motions', 'A09', 'Acute gastroenteritis', ['ORS Sachet', 'Zinc Syrup', 'Ondansetron Syrup']],
    ['Routine immunisation visit', 'Z23', 'Encounter for immunization', []],
  ],
  OBG: [
    ['Antenatal check-up, 28 weeks', 'Z34.9', 'Supervision of normal pregnancy', ['Folic Acid 5', 'Iron + Folic Acid', 'Calcium 500']],
    ['Irregular menstrual cycles', 'N92.6', 'Irregular menstruation', ['Norethisterone 5']],
    ['Lower abdominal pain', 'N73.9', 'Pelvic inflammatory disease', ['Doxycycline 100', 'Metronidazole 400']],
  ],
  ORTHO: [
    ['Knee pain while climbing stairs', 'M17.1', 'Primary osteoarthritis of knee', ['Aceclofenac 100', 'Calcium 500', 'Diclofenac Gel']],
    ['Low back pain radiating to leg', 'M54.4', 'Lumbago with sciatica', ['Aceclofenac 100', 'Thiocolchicoside 4', 'Pregabalin 75']],
    ['Wrist pain after fall', 'S62.5', 'Fracture of wrist (suspected)', ['Aceclofenac 100', 'Pantoprazole 40']],
  ],
  CARD: [
    ['Chest discomfort on exertion', 'I20.9', 'Angina pectoris', ['Aspirin 75', 'Atorvastatin 20', 'Metoprolol 25']],
    ['Palpitations', 'R00.2', 'Palpitations', ['Metoprolol 25']],
    ['Hypertension review', 'I10', 'Essential hypertension', ['Telmisartan 40', 'Amlodipine 5']],
  ],
  ENT: [
    ['Ear pain and discharge', 'H66.9', 'Otitis media', ['Amoxicillin + Clavulanate 625', 'Ciprofloxacin Ear Drops']],
    ['Sore throat and difficulty swallowing', 'J03.9', 'Acute tonsillitis', ['Amoxicillin + Clavulanate 625', 'Paracetamol 650']],
  ],
  DERM: [
    ['Itchy rash on arms', 'L30.9', 'Dermatitis', ['Cetirizine 10', 'Mometasone Cream']],
    ['Acne on face', 'L70.0', 'Acne vulgaris', ['Clindamycin Gel', 'Doxycycline 100']],
  ],
  SURG: [
    ['Pain in right lower abdomen', 'K35.8', 'Acute appendicitis', ['Ceftriaxone 1g', 'Paracetamol 650']],
    ['Swelling in groin', 'K40.9', 'Inguinal hernia', ['Paracetamol 650']],
    ['Upper abdominal pain after fatty meals', 'K80.2', 'Cholelithiasis', ['Pantoprazole 40', 'Drotaverine 80']],
  ],
};

// "Paracetamol 650" + "650 mg" should not read "Paracetamol 650 650 mg".
export const medLabel = (m) => (m.strength && !m.name.includes(m.strength.split(' ')[0]) ? `${m.name} ${m.strength}` : m.name);
export const RAD_REPORTS = {
  XRCHEST: ['Both lung fields are clear. Cardiothoracic ratio is within normal limits. Costophrenic angles are clear. Bony thorax is normal.', 'No active cardiopulmonary disease.'],
  XRKNEE: ['Reduced medial joint space with marginal osteophytes. Subchondral sclerosis noted. No fracture.', 'Degenerative osteoarthritic changes, Kellgren-Lawrence grade II.'],
  XRLS: ['Straightening of lumbar lordosis. Mild reduction of L4-L5 disc space. No listhesis.', 'Early degenerative changes at L4-L5.'],
  XRWRIST: ['Undisplaced fracture of distal radius. Radiocarpal joint preserved.', 'Undisplaced distal radius fracture.'],
  USGABD: ['Liver normal in size with increased echotexture. Gall bladder shows multiple calculi, largest 9 mm. CBD normal. Kidneys normal.', 'Grade I fatty liver. Cholelithiasis.'],
  USGOBS: ['Single live intrauterine foetus in cephalic presentation. Liquor adequate. Placenta posterior, grade II.', 'Single live intrauterine pregnancy of ~28 weeks.'],
  ECHO: ['Normal chamber dimensions. No regional wall motion abnormality. LVEF 60%. Valves normal.', 'Normal study. LVEF 60%.'],
  CTBRAIN: ['No intracranial haemorrhage, infarct or space-occupying lesion. Ventricles normal.', 'Normal CT brain.'],
  CTABD: ['Inflamed appendix measuring 9 mm with periappendiceal fat stranding.', 'Features consistent with acute appendicitis.'],
  MRIBRAIN: ['Few T2/FLAIR hyperintensities in periventricular white matter. No acute infarct.', 'Mild chronic small vessel ischaemic changes.'],
  MRILS: ['L4-L5 diffuse disc bulge with posterocentral protrusion indenting thecal sac and narrowing left lateral recess.', 'L4-L5 disc protrusion with left L5 root compression.'],
};

export const DOSING = ['1-0-1', '1-0-0', '0-0-1', '1-1-1', 'SOS', '1-0-1 after food'];

export async function seedDemoData() {
  const marker = await Counter.findById('demo-seeded');
  if (marker) return;
  console.log('[seed] loading demo data...');
  const t0 = Date.now();

  await Setting.updateOne({ _id: 'hospital' }, {
    name: 'City Care Multispeciality Hospital',
    tagline: 'NABH accredited · 150 beds · 24x7 Emergency',
    address: 'Plot 21, Sector 5, Malviya Nagar, Jaipur, Rajasthan 302017',
    phone: '+91 141 400 5000',
    email: 'care@citycarehospital.in',
    website: 'www.citycarehospital.in',
    gstin: '08AABCC1234F1Z5',
    registrationNo: 'RJ/CE/2026/0412',
    prescriptionFooter: 'In case of emergency, call +91 141 400 5000 (24x7).',
  }, { upsert: true });

  /* ---------- Departments ---------- */
  const deptDefs = [
    ['General Medicine', 'GM', 'Clinical', 'Block A, Ground Floor'], ['Paediatrics', 'PED', 'Clinical', 'Block A, First Floor'],
    ['Obstetrics & Gynaecology', 'OBG', 'Clinical', 'Block B, First Floor'], ['Orthopaedics', 'ORTHO', 'Clinical', 'Block A, Second Floor'],
    ['Cardiology', 'CARD', 'Clinical', 'Block C, Ground Floor'], ['ENT', 'ENT', 'Clinical', 'Block A, First Floor'],
    ['Dermatology', 'DERM', 'Clinical', 'Block A, First Floor'], ['General Surgery', 'SURG', 'Clinical', 'Block B, Second Floor'],
    ['Anaesthesiology', 'ANES', 'Clinical', 'OT Complex'], ['Emergency Medicine', 'EM', 'Clinical', 'Emergency Wing'],
    ['Pathology', 'PATH', 'Diagnostic', 'Block C, Basement'], ['Radiology', 'RAD', 'Diagnostic', 'Block C, Ground Floor'],
    ['Pharmacy', 'PHAR', 'Support', 'Main Lobby'], ['Nursing', 'NURS', 'Support', 'All Blocks'],
    ['Front Office', 'FO', 'Administrative', 'Main Lobby'], ['Accounts & Finance', 'FIN', 'Administrative', 'Admin Block'],
  ];
  const depts = {};
  for (const [name, code, type, location] of deptDefs) {
    depts[code] = await Department.create({ name, code, type, location });
  }

  /* ---------- Staff ---------- */
  const mk = (d) => User.create({ password: DEMO_PASSWORD, joiningDate: daysAgo(int(200, 900)), ...d });
  const users = {};
  const empNo = async () => nextCode('EMP', { yearly: false, pad: 4 });
  // Keep the admin created at bootstrap as-is; add the demo admin account.
  users.admin = await mk({ employeeId: await empNo(), name: 'Anita Deshmukh', email: DEMO_ACCOUNTS[0].email, role: 'admin', designation: 'Hospital Administrator', department: depts.FIN._id, phone: '9829000001', gender: 'Female' });
  const doctorDefs = [
    ['Dr. Rajiv Mehta', 'dr.mehta@demo.hms', 'GM', 'Internal Medicine', 'MBBS, MD (Medicine)', 800, 'Male'],
    ['Dr. Sunita Rao', 'dr.rao@demo.hms', 'OBG', 'Obstetrics & Gynaecology', 'MBBS, MS (OBG)', 900, 'Female'],
    ['Dr. Arvind Kulkarni', 'dr.kulkarni@demo.hms', 'ORTHO', 'Orthopaedic Surgery', 'MBBS, MS (Ortho)', 1000, 'Male'],
    ['Dr. Neha Kapoor', 'dr.kapoor@demo.hms', 'PED', 'Paediatrics', 'MBBS, MD (Paediatrics)', 700, 'Female'],
    ['Dr. Vikram Singh', 'dr.singh@demo.hms', 'CARD', 'Cardiology', 'MBBS, MD, DM (Cardiology)', 1500, 'Male'],
    ['Dr. Farah Khan', 'dr.khan@demo.hms', 'DERM', 'Dermatology', 'MBBS, MD (DVL)', 800, 'Female'],
    ['Dr. Suresh Nair', 'dr.nair@demo.hms', 'ENT', 'Otorhinolaryngology', 'MBBS, MS (ENT)', 700, 'Male'],
    ['Dr. Karan Malhotra', 'dr.malhotra@demo.hms', 'SURG', 'General & Laparoscopic Surgery', 'MBBS, MS (Surgery)', 1000, 'Male'],
    ['Dr. Pooja Iyer', 'dr.iyer@demo.hms', 'ANES', 'Anaesthesiology', 'MBBS, MD (Anaesthesia)', 0, 'Female'],
    ['Dr. Aman Joshi', 'dr.joshi@demo.hms', 'EM', 'Emergency Medicine', 'MBBS, MD (EM)', 600, 'Male'],
  ];
  const doctors = [];
  for (const [name, email, code, specialization, qualification, fee, gender] of doctorDefs) {
    const u = await mk({
      employeeId: await empNo(), name, email, role: 'doctor', department: depts[code]._id, specialization, qualification, consultationFee: fee, gender,
      designation: code === 'EM' ? 'Consultant - Emergency' : 'Senior Consultant', registrationNo: `RMC-${int(20000, 49999)}`, phone: `98290${int(10000, 99999)}`,
      availability: { days: code === 'EM' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6], start: '09:00', end: code === 'CARD' ? '14:00' : '17:00', slotMinutes: 15 },
    });
    doctors.push({ user: u, code });
  }
  const clinicDocs = doctors.filter((d) => !['ANES', 'EM'].includes(d.code));
  const anaesthetist = doctors.find((d) => d.code === 'ANES').user;
  for (const d of doctors) await Department.updateOne({ _id: depts[d.code]._id }, { head: d.user._id });

  const staffDefs = [
    ['Priya Thomas', 'nurse.priya@demo.hms', 'nurse', 'NURS', 'Nursing Superintendent', 'Female'],
    ['Rekha Yadav', 'nurse.rekha@demo.hms', 'nurse', 'NURS', 'Staff Nurse', 'Female'],
    ['Joseph Fernandes', 'nurse.joseph@demo.hms', 'nurse', 'NURS', 'Staff Nurse', 'Male'],
    ['Kavita Bose', 'nurse.kavita@demo.hms', 'nurse', 'NURS', 'ICU Nurse', 'Female'],
    ['Rohit Saxena', 'reception@demo.hms', 'receptionist', 'FO', 'Front Office Executive', 'Male'],
    ['Simran Kaur', 'frontdesk@demo.hms', 'receptionist', 'FO', 'Front Office Executive', 'Female'],
    ['Manish Agarwal', 'pharmacy@demo.hms', 'pharmacist', 'PHAR', 'Chief Pharmacist', 'Male'],
    ['Deepa Pillai', 'lab@demo.hms', 'lab_technician', 'PATH', 'Senior Lab Technologist', 'Female'],
    ['Dr. Harish Reddy', 'radiology@demo.hms', 'radiologist', 'RAD', 'Consultant Radiologist', 'Male'],
    ['Sanjay Gupta', 'accounts@demo.hms', 'accountant', 'FIN', 'Accounts Manager', 'Male'],
  ];
  for (const [name, email, role, code, designation, gender] of staffDefs) {
    users[email] = await mk({ employeeId: await empNo(), name, email, role, department: depts[code]._id, designation, gender, phone: `98291${int(10000, 99999)}`, qualification: role === 'radiologist' ? 'MBBS, MD (Radiodiagnosis)' : undefined });
  }
  const reception = users['reception@demo.hms'];
  const nurse = users['nurse.priya@demo.hms'];
  const labTech = users['lab@demo.hms'];
  const radiologist = users['radiology@demo.hms'];
  const pharmacist = users['pharmacy@demo.hms'];
  const accountant = users['accounts@demo.hms'];

  /* ---------- Wards & theatres ---------- */
  const wardDefs = [
    ['General Ward - Male', 'GWM', 'General', 'Ground Floor', 1200, 300, 'Male', 20],
    ['General Ward - Female', 'GWF', 'General', 'Ground Floor', 1200, 300, 'Female', 20],
    ['Semi-Private Ward', 'SPW', 'Semi-Private', 'First Floor', 2500, 500, 'Any', 12],
    ['Private Rooms', 'PVT', 'Private', 'Second Floor', 4500, 800, 'Any', 10],
    ['Deluxe Suites', 'DLX', 'Deluxe', 'Third Floor', 7500, 1000, 'Any', 4],
    ['Intensive Care Unit', 'ICU', 'ICU', 'First Floor', 9000, 2500, 'Any', 10],
    ['Neonatal ICU', 'NICU', 'NICU', 'First Floor', 7000, 2000, 'Any', 6],
    ['Maternity Ward', 'MAT', 'Maternity', 'Second Floor', 2000, 500, 'Female', 10],
  ];
  const wards = [];
  for (const [name, code, type, floor, dailyRate, nursingRate, gender, n] of wardDefs) {
    wards.push(await Ward.create({
      name, code, type, floor, dailyRate, nursingRate, gender,
      beds: Array.from({ length: n }, (_, i) => ({ number: `${code}-${String(i + 1).padStart(2, '0')}`, status: i === n - 1 && chance(0.5) ? 'Maintenance' : 'Available' })),
    }));
  }
  const theatres = await Theatre.insertMany([
    { name: 'Operation Theatre 1', code: 'OT1', type: 'Major', location: 'OT Complex, Second Floor' },
    { name: 'Operation Theatre 2', code: 'OT2', type: 'Orthopaedic', location: 'OT Complex, Second Floor' },
    { name: 'Operation Theatre 3', code: 'OT3', type: 'Obstetric', location: 'Maternity Block' },
    { name: 'Minor OT', code: 'MOT', type: 'Minor', location: 'Emergency Wing' },
  ]);

  /* ---------- Diagnostics catalogue ---------- */
  const P = (name, unit, refRange, low, high) => ({ name, unit, refRange, low, high });
  const labTests = await LabTest.insertMany([
    { code: 'CBC', name: 'Complete Blood Count', category: 'lab', section: 'Haematology', sampleType: 'EDTA Blood', price: 350, turnaroundHours: 4, parameters: [P('Haemoglobin', 'g/dL', '12.0 - 16.0', 12, 16), P('Total WBC Count', '/µL', '4000 - 11000', 4000, 11000), P('Platelet Count', 'lakh/µL', '1.5 - 4.5', 1.5, 4.5), P('RBC Count', 'million/µL', '4.2 - 5.8', 4.2, 5.8), P('PCV', '%', '36 - 48', 36, 48), P('Neutrophils', '%', '40 - 75', 40, 75), P('Lymphocytes', '%', '20 - 45', 20, 45)] },
    { code: 'ESR', name: 'Erythrocyte Sedimentation Rate', category: 'lab', section: 'Haematology', sampleType: 'EDTA Blood', price: 150, turnaroundHours: 2, parameters: [P('ESR', 'mm/hr', '0 - 20', 0, 20)] },
    { code: 'FBS', name: 'Blood Sugar - Fasting', category: 'lab', section: 'Biochemistry', sampleType: 'Fluoride Plasma', price: 100, turnaroundHours: 2, parameters: [P('Fasting Blood Glucose', 'mg/dL', '70 - 100', 70, 100)] },
    { code: 'PPBS', name: 'Blood Sugar - Post Prandial', category: 'lab', section: 'Biochemistry', sampleType: 'Fluoride Plasma', price: 100, turnaroundHours: 2, parameters: [P('Post Prandial Glucose', 'mg/dL', '70 - 140', 70, 140)] },
    { code: 'HBA1C', name: 'Glycated Haemoglobin (HbA1c)', category: 'lab', section: 'Biochemistry', sampleType: 'EDTA Blood', price: 550, turnaroundHours: 6, parameters: [P('HbA1c', '%', '4.0 - 5.6', 4, 5.6)] },
    { code: 'LFT', name: 'Liver Function Test', category: 'lab', section: 'Biochemistry', sampleType: 'Serum', price: 650, turnaroundHours: 6, parameters: [P('Total Bilirubin', 'mg/dL', '0.2 - 1.2', 0.2, 1.2), P('Direct Bilirubin', 'mg/dL', '0.0 - 0.3', 0, 0.3), P('SGOT (AST)', 'U/L', '5 - 40', 5, 40), P('SGPT (ALT)', 'U/L', '7 - 56', 7, 56), P('Alkaline Phosphatase', 'U/L', '44 - 147', 44, 147), P('Total Protein', 'g/dL', '6.0 - 8.3', 6, 8.3), P('Albumin', 'g/dL', '3.5 - 5.0', 3.5, 5)] },
    { code: 'KFT', name: 'Kidney Function Test', category: 'lab', section: 'Biochemistry', sampleType: 'Serum', price: 600, turnaroundHours: 6, parameters: [P('Blood Urea', 'mg/dL', '15 - 40', 15, 40), P('Serum Creatinine', 'mg/dL', '0.6 - 1.2', 0.6, 1.2), P('Uric Acid', 'mg/dL', '3.5 - 7.2', 3.5, 7.2), P('Sodium', 'mmol/L', '135 - 145', 135, 145), P('Potassium', 'mmol/L', '3.5 - 5.1', 3.5, 5.1)] },
    { code: 'LIPID', name: 'Lipid Profile', category: 'lab', section: 'Biochemistry', sampleType: 'Serum', price: 700, turnaroundHours: 6, parameters: [P('Total Cholesterol', 'mg/dL', '< 200', null, 200), P('Triglycerides', 'mg/dL', '< 150', null, 150), P('HDL Cholesterol', 'mg/dL', '> 40', 40, null), P('LDL Cholesterol', 'mg/dL', '< 100', null, 100)] },
    { code: 'TFT', name: 'Thyroid Profile (T3, T4, TSH)', category: 'lab', section: 'Immunology', sampleType: 'Serum', price: 600, turnaroundHours: 12, parameters: [P('T3', 'ng/dL', '80 - 200', 80, 200), P('T4', 'µg/dL', '5.1 - 14.1', 5.1, 14.1), P('TSH', 'µIU/mL', '0.27 - 4.2', 0.27, 4.2)] },
    { code: 'CRP', name: 'C-Reactive Protein', category: 'lab', section: 'Immunology', sampleType: 'Serum', price: 450, turnaroundHours: 4, parameters: [P('CRP', 'mg/L', '< 6', null, 6)] },
    { code: 'NS1', name: 'Dengue NS1 Antigen', category: 'lab', section: 'Serology', sampleType: 'Serum', price: 600, turnaroundHours: 4, parameters: [P('Dengue NS1 Antigen', '', 'Negative')] },
    { code: 'WIDAL', name: 'Widal Test', category: 'lab', section: 'Serology', sampleType: 'Serum', price: 250, turnaroundHours: 6, parameters: [P('S. Typhi O', 'titre', '< 1:80'), P('S. Typhi H', 'titre', '< 1:160')] },
    { code: 'URINE', name: 'Urine Routine & Microscopy', category: 'lab', section: 'Clinical Pathology', sampleType: 'Urine', price: 200, turnaroundHours: 3, parameters: [P('Colour', '', 'Pale Yellow'), P('pH', '', '4.6 - 8.0', 4.6, 8), P('Protein', '', 'Nil'), P('Sugar', '', 'Nil'), P('Pus Cells', '/hpf', '0 - 5', 0, 5), P('RBCs', '/hpf', '0 - 2', 0, 2)] },
    { code: 'BGRP', name: 'Blood Group & Rh Typing', category: 'lab', section: 'Blood Bank', sampleType: 'EDTA Blood', price: 150, turnaroundHours: 2, parameters: [P('Blood Group', '', ''), P('Rh Factor', '', '')] },
    { code: 'VITD', name: 'Vitamin D (25-OH)', category: 'lab', section: 'Immunology', sampleType: 'Serum', price: 1200, turnaroundHours: 24, parameters: [P('25-OH Vitamin D', 'ng/mL', '30 - 100', 30, 100)] },
    { code: 'ELEC', name: 'Serum Electrolytes', category: 'lab', section: 'Biochemistry', sampleType: 'Serum', price: 450, turnaroundHours: 4, parameters: [P('Sodium', 'mmol/L', '135 - 145', 135, 145), P('Potassium', 'mmol/L', '3.5 - 5.1', 3.5, 5.1), P('Chloride', 'mmol/L', '98 - 107', 98, 107)] },
    { code: 'XRCHEST', name: 'X-Ray Chest PA View', category: 'radiology', section: 'X-Ray', price: 400, turnaroundHours: 2 },
    { code: 'XRKNEE', name: 'X-Ray Knee AP/Lateral', category: 'radiology', section: 'X-Ray', price: 500, turnaroundHours: 2 },
    { code: 'XRLS', name: 'X-Ray Lumbosacral Spine', category: 'radiology', section: 'X-Ray', price: 550, turnaroundHours: 2 },
    { code: 'XRWRIST', name: 'X-Ray Wrist AP/Lateral', category: 'radiology', section: 'X-Ray', price: 450, turnaroundHours: 2 },
    { code: 'USGABD', name: 'Ultrasound Whole Abdomen', category: 'radiology', section: 'Ultrasound', price: 1200, turnaroundHours: 4 },
    { code: 'USGOBS', name: 'Obstetric Ultrasound', category: 'radiology', section: 'Ultrasound', price: 1500, turnaroundHours: 4 },
    { code: 'ECHO', name: '2D Echocardiography', category: 'radiology', section: 'Cardiac Imaging', price: 2200, turnaroundHours: 4 },
    { code: 'CTBRAIN', name: 'CT Brain (Plain)', category: 'radiology', section: 'CT Scan', price: 2800, turnaroundHours: 6 },
    { code: 'CTABD', name: 'CECT Abdomen', category: 'radiology', section: 'CT Scan', price: 5500, turnaroundHours: 12 },
    { code: 'MRIBRAIN', name: 'MRI Brain', category: 'radiology', section: 'MRI', price: 6500, turnaroundHours: 24 },
    { code: 'MRILS', name: 'MRI Lumbosacral Spine', category: 'radiology', section: 'MRI', price: 7000, turnaroundHours: 24 },
  ]);
  const test = (code) => labTests.find((t) => t.code === code);

  /* ---------- Suppliers, medicines, inventory ---------- */
  const suppliers = await Supplier.insertMany([
    { name: 'Rajasthan Pharma Distributors', contactPerson: 'Mukesh Jain', phone: '9829012345', email: 'orders@rajpharma.in', gstin: '08AAACR5055K1Z3', address: 'MI Road, Jaipur', category: 'Pharmaceutical', paymentTerms: '30 days' },
    { name: 'MedLine Surgicals', contactPerson: 'Anil Sethi', phone: '9829023456', email: 'sales@medlinesurgicals.in', gstin: '08AAFCM1122L1Z9', address: 'Sitapura Industrial Area, Jaipur', category: 'Surgical', paymentTerms: '45 days' },
    { name: 'Apex Diagnostics Supply', contactPerson: 'Ritika Bansal', phone: '9829034567', email: 'support@apexdx.in', gstin: '08AAGCA7788M1Z2', address: 'Vishwakarma Industrial Area, Jaipur', category: 'Laboratory', paymentTerms: '30 days' },
    { name: 'CareWell Healthcare Pvt Ltd', contactPerson: 'Vivek Arora', phone: '9829045678', email: 'b2b@carewell.in', gstin: '08AABCC9090N1Z7', address: 'Tonk Road, Jaipur', category: 'Pharmaceutical', paymentTerms: '30 days' },
    { name: 'CleanPro Facility Supplies', contactPerson: 'Sameer Khan', phone: '9829056789', email: 'hello@cleanpro.in', address: 'Jhotwara, Jaipur', category: 'General', paymentTerms: '15 days' },
  ]);
  const medDefs = [
    ['Paracetamol 650', 'Paracetamol', 'Tablet', '650 mg', 'Micro Labs', 'Analgesic', 'OTC', 2.2, 500],
    ['Paracetamol Syrup', 'Paracetamol', 'Syrup', '250 mg/5 ml', 'GSK', 'Analgesic', 'OTC', 48, 60],
    ['Pantoprazole 40', 'Pantoprazole', 'Tablet', '40 mg', 'Alkem', 'Antacid', 'H', 9.5, 300],
    ['Azithromycin 500', 'Azithromycin', 'Tablet', '500 mg', 'Cipla', 'Antibiotic', 'H', 24, 150],
    ['Amoxicillin + Clavulanate 625', 'Amoxicillin + Clavulanic Acid', 'Tablet', '625 mg', 'Abbott', 'Antibiotic', 'H', 20, 200],
    ['Nitrofurantoin 100', 'Nitrofurantoin', 'Capsule', '100 mg', 'Sun Pharma', 'Antibiotic', 'H', 12, 100],
    ['Doxycycline 100', 'Doxycycline', 'Capsule', '100 mg', 'Cipla', 'Antibiotic', 'H', 6.5, 100],
    ['Metronidazole 400', 'Metronidazole', 'Tablet', '400 mg', 'Abbott', 'Antibiotic', 'H', 2.1, 150],
    ['Ceftriaxone 1g', 'Ceftriaxone', 'Injection', '1 g', 'Lupin', 'Antibiotic', 'H', 65, 100],
    ['Metformin 500', 'Metformin', 'Tablet', '500 mg', 'USV', 'Antidiabetic', 'H', 2.5, 400],
    ['Glimepiride 1', 'Glimepiride', 'Tablet', '1 mg', 'Sanofi', 'Antidiabetic', 'H', 5.5, 200],
    ['Insulin Glargine', 'Insulin Glargine', 'Injection', '100 IU/ml', 'Biocon', 'Antidiabetic', 'H', 680, 20],
    ['Amlodipine 5', 'Amlodipine', 'Tablet', '5 mg', 'Cipla', 'Antihypertensive', 'H', 3.2, 300],
    ['Telmisartan 40', 'Telmisartan', 'Tablet', '40 mg', 'Glenmark', 'Antihypertensive', 'H', 7.8, 300],
    ['Metoprolol 25', 'Metoprolol Succinate', 'Tablet', '25 mg', 'AstraZeneca', 'Beta Blocker', 'H', 6.4, 200],
    ['Atorvastatin 20', 'Atorvastatin', 'Tablet', '20 mg', 'Ranbaxy', 'Statin', 'H', 9.8, 200],
    ['Aspirin 75', 'Aspirin', 'Tablet', '75 mg', 'USV', 'Antiplatelet', 'H', 0.9, 300],
    ['Cetirizine 10', 'Cetirizine', 'Tablet', '10 mg', 'Dr Reddys', 'Antihistamine', 'OTC', 1.8, 300],
    ['Cetirizine Syrup', 'Cetirizine', 'Syrup', '5 mg/5 ml', 'Dr Reddys', 'Antihistamine', 'OTC', 42, 40],
    ['Ambroxol Syrup', 'Ambroxol', 'Syrup', '30 mg/5 ml', 'Mankind', 'Mucolytic', 'OTC', 85, 40],
    ['Ondansetron 4', 'Ondansetron', 'Tablet', '4 mg', 'Sun Pharma', 'Antiemetic', 'H', 5.2, 200],
    ['Ondansetron Syrup', 'Ondansetron', 'Syrup', '2 mg/5 ml', 'Sun Pharma', 'Antiemetic', 'H', 38, 30],
    ['Racecadotril 100', 'Racecadotril', 'Capsule', '100 mg', 'Dr Reddys', 'Antidiarrhoeal', 'H', 11, 100],
    ['ORS Sachet', 'Oral Rehydration Salts', 'Powder', '21 g', 'FDC', 'Electrolyte', 'OTC', 20, 200],
    ['Zinc Syrup', 'Zinc Sulphate', 'Syrup', '20 mg/5 ml', 'Mankind', 'Supplement', 'OTC', 45, 40],
    ['Folic Acid 5', 'Folic Acid', 'Tablet', '5 mg', 'Mankind', 'Supplement', 'OTC', 1.1, 300],
    ['Iron + Folic Acid', 'Ferrous Ascorbate + Folic Acid', 'Tablet', '100 mg', 'Emcure', 'Supplement', 'OTC', 7.5, 200],
    ['Calcium 500', 'Calcium Carbonate + Vit D3', 'Tablet', '500 mg', 'Torrent', 'Supplement', 'OTC', 6.2, 300],
    ['Norethisterone 5', 'Norethisterone', 'Tablet', '5 mg', 'Zydus', 'Hormone', 'H', 8.5, 60],
    ['Aceclofenac 100', 'Aceclofenac', 'Tablet', '100 mg', 'Intas', 'NSAID', 'H', 4.8, 300],
    ['Diclofenac Gel', 'Diclofenac', 'Cream', '1% w/w 30 g', 'Novartis', 'NSAID', 'OTC', 110, 30],
    ['Thiocolchicoside 4', 'Thiocolchicoside', 'Capsule', '4 mg', 'Sun Pharma', 'Muscle Relaxant', 'H', 14, 100],
    ['Pregabalin 75', 'Pregabalin', 'Capsule', '75 mg', 'Torrent', 'Neuropathic', 'H1', 12, 100],
    ['Drotaverine 80', 'Drotaverine', 'Tablet', '80 mg', 'Walter Bushnell', 'Antispasmodic', 'H', 8.5, 100],
    ['Ciprofloxacin Ear Drops', 'Ciprofloxacin', 'Drops', '0.3% 10 ml', 'Cipla', 'Antibiotic', 'H', 32, 30],
    ['Mometasone Cream', 'Mometasone Furoate', 'Cream', '0.1% 15 g', 'Glenmark', 'Corticosteroid', 'H', 165, 30],
    ['Clindamycin Gel', 'Clindamycin', 'Cream', '1% 20 g', 'Galderma', 'Antibiotic', 'H', 140, 30],
    ['Salbutamol Inhaler', 'Salbutamol', 'Inhaler', '100 mcg', 'Cipla', 'Bronchodilator', 'H', 155, 30],
    ['Normal Saline 500 ml', 'Sodium Chloride 0.9%', 'Infusion', '500 ml', 'Baxter', 'IV Fluid', 'H', 38, 200],
    ['Ringer Lactate 500 ml', 'Compound Sodium Lactate', 'Infusion', '500 ml', 'Baxter', 'IV Fluid', 'H', 42, 200],
    ['Pantoprazole Injection', 'Pantoprazole', 'Injection', '40 mg', 'Alkem', 'Antacid', 'H', 52, 100],
    ['Tramadol 50', 'Tramadol', 'Capsule', '50 mg', 'Intas', 'Opioid Analgesic', 'H1', 7, 60],
  ];
  const medicines = [];
  for (const [name, genericName, form, strength, manufacturer, category, schedule, mrp, reorderLevel] of medDefs) {
    const lowStock = chance(0.12);
    const batches = [];
    const nb = int(1, 2);
    for (let b = 0; b < nb; b += 1) {
      const expiring = b === 0 && chance(0.15);
      batches.push({
        batchNo: `${name.slice(0, 3).toUpperCase().replace(/\W/g, 'X')}${int(1000, 9999)}${String.fromCharCode(65 + b)}`,
        expiryDate: expiring ? new Date(Date.now() + int(20, 80) * DAY) : new Date(Date.now() + int(250, 900) * DAY),
        quantity: lowStock ? int(5, Math.max(6, Math.floor(reorderLevel / 2))) : int(reorderLevel, reorderLevel * 4),
        purchasePrice: Math.round(mrp * 0.72 * 100) / 100,
        mrp,
        supplier: pick([suppliers[0]._id, suppliers[3]._id]),
        receivedAt: daysAgo(int(10, 90)),
      });
    }
    medicines.push(await Medicine.create({
      code: await nextCode('MED', { yearly: false, pad: 5 }), name, genericName, form, strength, manufacturer, category, schedule, mrp, reorderLevel,
      gstRate: 12, unit: ['Tablet', 'Capsule'].includes(form) ? 'Tab/Cap' : form, rack: `R${int(1, 8)}-S${int(1, 5)}`, batches,
    }));
  }
  const medByName = new Map(medicines.map((m) => [m.name, m]));

  const invDefs = [
    ['Disposable Syringe 5 ml', 'Consumable', 'Nos', 2000, 500, 6], ['IV Cannula 20G', 'Consumable', 'Nos', 400, 100, 45], ['Surgical Gloves (Pair) 7.0', 'Surgical', 'Pair', 800, 200, 28],
    ['Examination Gloves (Box of 100)', 'Consumable', 'Box', 60, 20, 380], ['Face Mask 3-Ply (Box of 50)', 'Consumable', 'Box', 90, 30, 150], ['N95 Respirator', 'Consumable', 'Nos', 150, 50, 65],
    ['Gauze Swab 10x10 cm', 'Surgical', 'Pack', 300, 100, 55], ['Cotton Roll 500 g', 'Surgical', 'Roll', 40, 20, 210], ['Suture Vicryl 2-0', 'Surgical', 'Nos', 80, 30, 420],
    ['Urine Container', 'Laboratory', 'Nos', 500, 150, 4], ['EDTA Vacutainer', 'Laboratory', 'Nos', 600, 200, 9], ['Glucometer Strips (50)', 'Laboratory', 'Box', 12, 10, 850],
    ['Bed Sheet (Single)', 'Linen', 'Nos', 180, 60, 320], ['Patient Gown', 'Linen', 'Nos', 120, 40, 280], ['Hand Sanitizer 500 ml', 'Housekeeping', 'Bottle', 45, 30, 180],
    ['Surface Disinfectant 5 L', 'Housekeeping', 'Can', 8, 10, 1450], ['Printer Paper A4 (Ream)', 'Stationery', 'Ream', 25, 15, 290], ['Pulse Oximeter', 'Equipment', 'Nos', 12, 5, 1850],
    ['Digital BP Monitor', 'Equipment', 'Nos', 6, 4, 2600], ['Oxygen Mask with Tubing', 'Consumable', 'Nos', 70, 40, 95],
  ];
  const invItems = [];
  for (const [name, category, unit, quantity, reorderLevel, unitCost] of invDefs) {
    invItems.push(await InventoryItem.create({
      code: await nextCode('ITM', { yearly: false, pad: 5 }), name, category, unit, quantity, reorderLevel, unitCost,
      location: pick(['Central Store', 'OT Store', 'Ward Store', 'Lab Store']), supplier: category === 'Laboratory' ? suppliers[2]._id : category === 'Housekeeping' ? suppliers[4]._id : suppliers[1]._id,
    }));
  }

  /* ---------- Patients ---------- */
  const patients = [];
  // Mongoose treats createdAt as immutable, so registration dates are tracked separately.
  const regDate = new Map();
  for (let i = 0; i < 90; i += 1) {
    const female = chance(0.48);
    const age = pick([int(1, 12), int(18, 35), int(25, 50), int(36, 65), int(45, 80)]);
    const dob = new Date(Date.now() - age * 365.25 * DAY - int(0, 360) * DAY);
    const [city, state, pin] = pick(CITIES);
    const last = pick(LAST);
    const first = female ? pick(FEMALE) : pick(MALE);
    const insured = chance(0.35);
    const ins = pick(INSURERS);
    const createdAt = daysAgo(Math.round(((89 - i) / 89) * 75), int(9, 18), int(0, 59));
    const p = await Patient.create({
      uhid: await nextCode('UH', { yearly: false, pad: 6, sep: '' }),
      title: age < 13 ? (female ? 'Baby' : 'Master') : female ? pick(['Mrs', 'Ms']) : 'Mr',
      firstName: first, lastName: last, gender: female ? 'Female' : 'Male', dob,
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O+', 'B+', 'A-', 'O-', 'Unknown']),
      maritalStatus: age > 24 ? pick(['Married', 'Married', 'Single']) : 'Single',
      phone: `9${int(100000000, 999999999)}`, email: chance(0.6) ? `${first}.${last}${int(1, 99)}@example.com`.toLowerCase() : undefined,
      occupation: age < 18 ? 'Student' : pick(['Teacher', 'Engineer', 'Business', 'Homemaker', 'Farmer', 'Retired', 'Government Service', 'Shopkeeper']),
      address: { line1: `${int(1, 250)}, ${pick(STREETS)}`, city, state, pincode: `${pin}${int(10, 99)}` },
      idProof: { type: 'Aadhaar', number: `XXXX-XXXX-${int(1000, 9999)}` },
      emergencyContact: { name: `${pick(female ? MALE : FEMALE)} ${last}`, relation: pick(['Spouse', 'Parent', 'Sibling', 'Child']), phone: `9${int(100000000, 999999999)}` },
      allergies: chance(0.15) ? [pick(['Penicillin', 'Sulfa drugs', 'NSAIDs', 'Peanuts', 'Dust'])] : [],
      chronicConditions: age > 40 && chance(0.4) ? [pick(['Type 2 Diabetes', 'Hypertension', 'Hypothyroidism', 'Asthma'])] : [],
      insurance: insured ? { provider: ins[0], tpa: ins[1], policyNumber: `POL${int(10000000, 99999999)}`, validTill: new Date(Date.now() + int(60, 400) * DAY), coverageAmount: pick([300000, 500000, 500000, 1000000]) } : undefined,
      registeredBy: reception._id,
    });
    await backdate(Patient, p._id, createdAt);
    regDate.set(String(p._id), createdAt);
    patients.push(p);
  }

  const vitals = (p) => ({
    bpSystolic: int(108, 152), bpDiastolic: int(68, 96), pulse: int(66, 104), temperature: Math.round((97.6 + rand() * 3) * 10) / 10,
    spo2: int(94, 99), respRate: int(14, 22), weight: p.age < 13 ? int(10, 38) : int(48, 92), height: p.age < 13 ? int(80, 150) : int(150, 182), recordedBy: nurse._id,
  });

  function buildRx(names) {
    return names.map((n) => {
      const m = medByName.get(n);
      const syrup = m && ['Syrup', 'Drops', 'Cream', 'Inhaler'].includes(m.form);
      return {
        medicine: m?._id, name: m ? `${m.name}${m.strength && !m.name.includes(m.strength) ? '' : ''}` : n,
        dosage: syrup ? (m.form === 'Syrup' ? '5 ml' : 'As directed') : '1 tab', frequency: pick(DOSING), duration: `${pick([3, 5, 5, 7, 10, 30])} days`,
        route: m?.form === 'Injection' ? 'IV' : ['Cream', 'Drops'].includes(m?.form) ? 'Topical' : 'Oral',
        instructions: pick(['After food', 'Before food', 'At bedtime', '']),
      };
    });
  }

  /* ---------- Lab order helper ---------- */
  async function makeOrder({ patient, doctor, codes, date, complete, encounter, priority = 'Routine' }) {
    const cat = test(codes[0]).category;
    const order = new LabOrder({
      orderNo: await nextCode(cat === 'lab' ? 'LAB' : 'RAD'), category: cat, patient: patient._id, doctor: doctor._id, encounter: encounter?._id, priority,
      createdBy: doctor._id,
      items: codes.map((c) => {
        const t = test(c);
        return {
          test: t._id, code: t.code, name: t.name, section: t.section, price: t.price,
          results: (t.parameters || []).map((pp) => {
            let value = '';
            let flag = '';
            if (complete) {
              if (pp.low != null || pp.high != null) {
                const lo = pp.low ?? pp.high * 0.5; const hi = pp.high ?? pp.low * 1.6;
                const abnormal = chance(0.2);
                let v = lo + rand() * (hi - lo);
                if (abnormal) v = chance(0.5) && pp.high != null ? pp.high * (1.05 + rand() * 0.4) : (pp.low ?? lo) * (0.7 + rand() * 0.25);
                value = String(Math.round(v * (hi < 20 ? 10 : 1)) / (hi < 20 ? 10 : 1));
                if (pp.low != null && Number(value) < pp.low) flag = 'L';
                if (pp.high != null && Number(value) > pp.high) flag = 'H';
              } else if (pp.name === 'Blood Group') value = patient.bloodGroup.replace(/[+-]/, '') === 'Unknown' ? 'O' : patient.bloodGroup.replace(/[+-]/, '');
              else if (pp.name === 'Rh Factor') value = patient.bloodGroup.includes('-') ? 'Negative' : 'Positive';
              else if (pp.name === 'Colour') value = 'Pale Yellow';
              else value = pp.refRange || 'Negative';
            }
            return { parameter: pp.name, unit: pp.unit, refRange: pp.refRange, value, flag };
          }),
          findings: complete && cat === 'radiology' ? RAD_REPORTS[c]?.[0] : undefined,
          impression: complete && cat === 'radiology' ? RAD_REPORTS[c]?.[1] : undefined,
        };
      }),
    });
    if (complete) {
      order.status = 'Completed';
      const nowTs = Date.now();
      order.sampleCollectedAt = new Date(Math.min(date.getTime() + 20 * 60000, nowTs - 60000));
      order.collectedBy = labTech._id;
      order.completedAt = new Date(Math.min(date.getTime() + int(2, 6) * 3600000, nowTs));
      order.reportedBy = cat === 'lab' ? labTech._id : radiologist._id;
    } else {
      order.status = pick(['Ordered', 'Sample Collected', 'Ordered']);
      if (order.status === 'Sample Collected') { order.sampleCollectedAt = new Date(); order.collectedBy = labTech._id; }
    }
    const inv = await addCharges({
      patientId: patient._id, type: cat === 'lab' ? 'Laboratory' : 'Radiology', userId: reception._id,
      items: codes.map((c) => ({ description: `${test(c).name} (${order.orderNo})`, category: cat === 'lab' ? 'Laboratory' : 'Radiology', quantity: 1, rate: test(c).price, refType: 'LabOrder', refId: order._id })),
    });
    order.invoice = inv._id;
    if (inv.admission) order.admission = inv.admission;
    await order.save();
    await backdate(LabOrder, order._id, date);
    if (inv.type !== 'IPD') {
      await backdate(Invoice, inv._id, date);
      if (complete || chance(0.6)) await recordPayment(inv, { amount: inv.balance, mode: pick(['Cash', 'UPI', 'UPI', 'Card']), paidAt: new Date(date.getTime() + 15 * 60000) }, reception);
    }
    return order;
  }

  async function refundExcess(inv, at) {
    const amount = Math.round(-inv.balance * 100) / 100;
    inv.payments.push({ receiptNo: await nextCode('RFD'), amount: -amount, mode: 'Cash', reference: 'Refund of excess deposit', paidAt: at, receivedBy: accountant._id });
    inv.recalc(); await inv.save();
    await LedgerEntry.create({ entryNo: await nextCode('LED'), date: at, type: 'Expense', category: 'Patient Refunds', amount, mode: 'Cash', description: `Refund against ${inv.invoiceNo}`, invoice: inv._id, auto: true, createdBy: accountant._id });
  }

  /* ---------- Past OPD visits (last 45 days) ---------- */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let d = 45; d >= 1; d -= 1) {
    const date = daysAgo(d, 0, 0);
    if (date.getDay() === 0) continue;
    const perDay = int(7, 14);
    const used = new Set();
    for (let k = 0; k < perDay; k += 1) {
      const doc = pick(clinicDocs);
      const pool = patients.filter((p) => regDate.get(String(p._id)) <= new Date(date.getTime() + DAY));
      if (!pool.length) continue;
      const patient = pick(pool);
      const hour = int(9, 16); const minute = pick([0, 15, 30, 45]);
      const slot = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const key = `${doc.user._id}-${slot}`;
      if (used.has(key)) continue;
      used.add(key);
      const at = daysAgo(d, hour, minute);
      const outcome = rand();
      const status = outcome < 0.06 ? 'No-show' : outcome < 0.1 ? 'Cancelled' : 'Completed';
      const appt = await Appointment.create({
        appointmentNo: await nextCode('APT'), patient: patient._id, doctor: doc.user._id, department: doc.user.department,
        date, timeSlot: slot, type: chance(0.3) ? 'Follow-up' : 'New', source: pick(['Walk-in', 'Walk-in', 'Phone', 'Online']), status,
        tokenNo: status === 'Completed' ? k + 1 : undefined, createdBy: reception._id,
        checkedInAt: status === 'Completed' ? at : undefined, startedAt: status === 'Completed' ? new Date(at.getTime() + 10 * 60000) : undefined,
        completedAt: status === 'Completed' ? new Date(at.getTime() + 25 * 60000) : undefined,
        cancelReason: status === 'Cancelled' ? 'Patient requested' : undefined,
      });
      await backdate(Appointment, appt._id, new Date(at.getTime() - int(1, 3) * DAY));
      if (status !== 'Completed') continue;

      const fee = appt.type === 'Follow-up' ? Math.round(doc.user.consultationFee / 2) : doc.user.consultationFee;
      const inv = await addCharges({
        patientId: patient._id, type: 'OPD', userId: reception._id, appointment: appt._id, forceSeparate: true,
        items: [{ description: `${appt.type} consultation - ${doc.user.name}`, category: 'Consultation', quantity: 1, rate: fee, refType: 'Appointment', refId: appt._id }],
      });
      await backdate(Invoice, inv._id, at);
      await recordPayment(inv, { amount: inv.total, mode: pick(['Cash', 'UPI', 'UPI', 'Card']), paidAt: at }, reception);

      const [complaint, code, diagnosis, rx] = pick(CLINICAL[doc.code] || CLINICAL.GM);
      const enc = await Encounter.create({
        encounterNo: await nextCode('ENC'), patient: patient._id, doctor: doc.user._id, department: doc.user.department, appointment: appt._id,
        type: 'OPD', status: 'Completed', vitals: vitals(patient), chiefComplaint: complaint, historyOfIllness: `${complaint}. No similar episodes in the past.`,
        examination: 'General condition fair. Conscious, oriented. Chest clear, CVS S1S2 normal, abdomen soft.',
        diagnoses: [{ code, description: diagnosis, type: 'Final' }], prescriptions: buildRx(rx),
        advice: pick(['Plenty of oral fluids. Rest for 3 days.', 'Low salt, low fat diet. Regular walks.', 'Review with reports.', 'Avoid oily and spicy food.']),
        followUpDate: chance(0.5) ? new Date(at.getTime() + int(5, 30) * DAY) : undefined, completedAt: new Date(at.getTime() + 25 * 60000),
        rxDispensedAt: rx.length && chance(0.8) ? at : undefined,
      });
      await backdate(Encounter, enc._id, at);
      appt.invoice = inv._id; appt.encounter = enc._id; await appt.save();

      if (chance(0.3)) {
        const codes = doc.code === 'ORTHO' ? [pick(['XRKNEE', 'XRLS', 'XRWRIST'])] : doc.code === 'CARD' ? [pick(['ECHO', 'LIPID'])] : doc.code === 'OBG' ? [pick(['USGOBS', 'CBC'])] : [pick(['CBC', 'FBS', 'LFT', 'KFT', 'TFT', 'URINE', 'HBA1C', 'NS1', 'XRCHEST', 'USGABD'])];
        const order = await makeOrder({ patient, doctor: doc.user, codes, date: new Date(at.getTime() + 30 * 60000), complete: true, encounter: enc });
        enc.labOrders.push(order._id); await enc.save();
      }
      if (rx.length && enc.rxDispensedAt) {
        const lines = rx.slice(0, 2).map((n) => medByName.get(n)).filter(Boolean);
        if (lines.length) {
          const pinv = await addCharges({
            patientId: patient._id, type: 'Pharmacy', userId: pharmacist._id, forceSeparate: true,
            items: lines.map((m) => ({ description: `${medLabel(m)} - Batch ${m.batches[0].batchNo}`, category: 'Pharmacy', quantity: ['Tablet', 'Capsule'].includes(m.form) ? int(6, 20) : 1, rate: m.mrp, refType: 'Medicine', refId: m._id })),
          });
          await backdate(Invoice, pinv._id, new Date(at.getTime() + 40 * 60000));
          await recordPayment(pinv, { amount: pinv.total, mode: pick(['Cash', 'UPI']), paidAt: new Date(at.getTime() + 40 * 60000) }, pharmacist);
        }
      }
    }
  }

  /* ---------- Today's clinic & upcoming appointments ---------- */
  // Booked as "simulated" appointments; the demo simulator advances today's list with the clock
  // (check-in, consultation, completion) and keeps rolling the schedule forward every day.
  for (const doc of clinicDocs) {
    for (let d = 0; d <= 6; d += 1) {
      const date = daysAgo(-d, 0, 0);
      if (date.getDay() === 0) continue;
      const n = d === 0 ? int(5, 7) : int(2, 5);
      const pool = [...patients].sort(() => rand() - 0.5).slice(0, n);
      for (let k = 0; k < n; k += 1) {
        const mins = 9 * 60 + (d === 0 ? k * 20 : int(0, 22) * 20);
        const slot = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
        if (await Appointment.exists({ doctor: doc.user._id, date, timeSlot: slot })) continue;
        await Appointment.create({
          appointmentNo: await nextCode('APT'), patient: pool[k]._id, doctor: doc.user._id, department: doc.user.department, date, timeSlot: slot,
          type: chance(0.3) ? 'Follow-up' : 'New', source: pick(['Walk-in', 'Phone', 'Online']), status: 'Scheduled', createdBy: reception._id,
          reason: pick(CLINICAL[doc.code] || CLINICAL.GM)[0], simulated: true,
        });
      }
    }
  }

  /* ---------- Admissions ---------- */
  const IPD_CASES = [
    ['SURG', 'Acute appendicitis', 'Laparoscopic appendicectomy', 'CTABD'], ['SURG', 'Symptomatic cholelithiasis', 'Laparoscopic cholecystectomy', 'USGABD'],
    ['ORTHO', 'Fracture neck of femur', 'Hemiarthroplasty', 'XRKNEE'], ['ORTHO', 'Osteoarthritis knee (bilateral)', 'Total knee replacement', 'XRKNEE'],
    ['GM', 'Dengue fever with thrombocytopenia', null, 'NS1'], ['GM', 'Community acquired pneumonia', null, 'XRCHEST'],
    ['CARD', 'Acute coronary syndrome', null, 'ECHO'], ['OBG', 'Term pregnancy in labour', 'Lower segment caesarean section', 'USGOBS'],
    ['GM', 'Uncontrolled type 2 diabetes', null, 'HBA1C'], ['PED', 'Acute gastroenteritis with dehydration', null, 'ELEC'],
  ];
  const wardFor = (codeDept, female) => {
    if (codeDept === 'CARD') return wards.find((w) => w.code === 'ICU');
    if (codeDept === 'OBG') return wards.find((w) => w.code === 'MAT');
    return pick([female ? wards[1] : wards[0], wards[2], wards[3], female ? wards[1] : wards[0]]);
  };
  const usedPatients = new Set();
  async function admit(patient, dcase, admittedAt, discharged) {
    const [code, diagnosis, procedure, testCode] = dcase;
    const doc = doctors.find((d) => d.code === code).user;
    const ward = await Ward.findById(wardFor(code, patient.gender === 'Female')._id);
    const bed = ward.beds.find((b) => b.status === 'Available');
    if (!bed) return null;
    const adm = new Admission({
      admissionNo: await nextCode('IPD'), patient: patient._id, doctor: doc._id, department: doc.department, ward: ward._id, bedNumber: bed.number,
      admissionType: code === 'OBG' || chance(0.5) ? 'Planned' : 'Emergency', admittedAt, reason: diagnosis, provisionalDiagnosis: diagnosis,
      attendant: { name: patient.emergencyContact?.name, relation: patient.emergencyContact?.relation, phone: patient.emergencyContact?.phone },
      bedHistory: [{ ward: ward._id, wardName: ward.name, bedNumber: bed.number, dailyRate: ward.dailyRate + ward.nursingRate, from: admittedAt }],
      createdBy: reception._id, deposit: pick([5000, 10000, 15000]),
      notes: [
        { type: 'Vitals', text: 'Admission vitals', vitals: { bpSystolic: int(110, 150), bpDiastolic: int(70, 95), pulse: int(70, 110), temperature: 99.1, spo2: int(93, 99), respRate: int(16, 24) }, by: nurse._id, at: new Date(admittedAt.getTime() + 30 * 60000) },
        { type: 'Doctor', text: `Admitted with ${diagnosis.toLowerCase()}. Plan: investigations, IV fluids, ${procedure ? `posted for ${procedure.toLowerCase()}` : 'medical management'}.`, by: doc._id, at: new Date(admittedAt.getTime() + 60 * 60000) },
        { type: 'Nursing', text: 'Patient comfortable. IV line secured. Medications given as per chart.', by: nurse._id, at: new Date(admittedAt.getTime() + 5 * 3600000) },
      ],
    });
    await Ward.updateOne({ _id: ward._id, 'beds._id': bed._id }, { $set: { 'beds.$.status': 'Occupied', 'beds.$.patient': patient._id, 'beds.$.admission': adm._id } });
    await adm.save();
    const inv = await getOrCreateIpdInvoice(adm, reception._id);
    await backdate(Invoice, inv._id, admittedAt);
    await recordPayment(inv, { amount: adm.deposit, mode: pick(['Cash', 'Card', 'UPI', 'Bank Transfer']), reference: 'Admission deposit', paidAt: admittedAt }, reception);
    const orderAt = new Date(admittedAt.getTime() + 2 * 3600000);
    const imaging = test(testCode).category === 'radiology';
    await makeOrder({ patient, doctor: doc, codes: imaging ? ['CBC'] : ['CBC', testCode], date: orderAt, complete: discharged || chance(0.6), priority: code === 'CARD' ? 'STAT' : 'Urgent' });
    if (imaging) await makeOrder({ patient, doctor: doc, codes: [testCode], date: orderAt, complete: discharged || chance(0.6), priority: 'Urgent' });
    const inv2 = await Invoice.findById(inv._id);
    const ipdMeds = [medByName.get('Normal Saline 500 ml'), medByName.get('Pantoprazole Injection'), medByName.get('Ceftriaxone 1g'), medByName.get('Paracetamol 650')];
    for (const m of ipdMeds) inv2.items.push({ description: `${medLabel(m)} - Batch ${m.batches[0].batchNo}`, category: 'Pharmacy', quantity: int(2, 8), rate: m.mrp, refType: 'Medicine', refId: m._id });
    inv2.items.push({ description: `Doctor visit charges - ${doc.name}`, category: 'Consultation', quantity: int(2, 5), rate: 600 });
    inv2.recalc(); await inv2.save();

    if (procedure) {
      const theatre = code === 'ORTHO' ? theatres[1] : code === 'OBG' ? theatres[2] : theatres[0];
      const scheduledAt = new Date(admittedAt.getTime() + (discharged ? DAY : int(1, 2) * DAY));
      scheduledAt.setHours(pick([9, 11, 14]), 0, 0, 0);
      const done = discharged || scheduledAt < new Date();
      const s = await Surgery.create({
        surgeryNo: await nextCode('OT'), patient: patient._id, admission: adm._id, theatre: theatre._id, procedure, category: 'Major', priority: adm.admissionType === 'Emergency' ? 'Urgent' : 'Elective',
        surgeon: doc._id, anaesthetist: anaesthetist._id, anaesthesiaType: code === 'OBG' || code === 'ORTHO' ? 'Spinal' : 'General', scheduledAt, durationMins: pick([60, 90, 120]),
        status: done ? 'Completed' : 'Scheduled', preOpDiagnosis: diagnosis,
        checklist: { consent: true, fasting: true, siteMarked: true, bloodArranged: true, anaesthesiaCleared: true },
        startedAt: done ? scheduledAt : undefined, endedAt: done ? new Date(scheduledAt.getTime() + 90 * 60000) : undefined,
        operativeNotes: done ? `${procedure} performed uneventfully. Haemostasis achieved. Estimated blood loss minimal.` : undefined,
        postOpInstructions: done ? 'NPO for 6 hours, then sips. Monitor vitals hourly. Early ambulation.' : undefined,
        charges: pick([35000, 45000, 60000, 85000]), billed: done, createdBy: doc._id,
      });
      if (done) {
        const i3 = await Invoice.findById(inv._id);
        i3.items.push({ description: `OT charges - ${procedure} (${s.surgeryNo})`, category: 'OT', quantity: 1, rate: s.charges, refType: 'Surgery', refId: s._id });
        i3.recalc(); await i3.save();
      }
    }
    return { adm, invoiceId: inv._id, ward };
  }

  // Past (discharged) admissions.
  for (let i = 0; i < 16; i += 1) {
    const patient = pick(patients.filter((p) => !usedPatients.has(String(p._id)) && p.age >= 14));
    usedPatients.add(String(patient._id));
    const dcase = pick(IPD_CASES.filter((c) => (patient.gender === 'Male' ? c[0] !== 'OBG' : true) && c[0] !== 'PED'));
    const admittedAt = daysAgo(int(8, 55), int(8, 20), 0);
    const res = await admit(patient, dcase, admittedAt, true);
    if (!res) continue;
    const { adm, invoiceId } = res;
    const stay = int(2, 6);
    const dischargedAt = new Date(admittedAt.getTime() + stay * DAY);
    dischargedAt.setHours(12, 0, 0, 0);
    const inv = await Invoice.findById(invoiceId);
    inv.items.push({ description: `Room & nursing - ${adm.bedHistory[0].wardName} / ${adm.bedNumber} (${stay} days)`, category: 'Room', quantity: stay, rate: adm.bedHistory[0].dailyRate, refType: 'Admission', refId: adm._id });
    inv.finalized = true; inv.recalc(); await inv.save();
    const patientDoc = patients.find((p) => String(p._id) === String(adm.patient));
    if (inv.balance < 0) {
      await refundExcess(inv, dischargedAt);
    } else if (patientDoc.insurance?.provider && inv.balance > 1000 && chance(0.7)) {
      const claimAmount = Math.round(inv.balance);
      const status = pick(['Submitted', 'Under Review', 'Approved', 'Settled', 'Settled', 'Query Raised']);
      const claim = await InsuranceClaim.create({
        claimNo: await nextCode('CLM'), patient: adm.patient, invoice: inv._id, admission: adm._id, provider: patientDoc.insurance.provider, tpa: patientDoc.insurance.tpa,
        policyNumber: patientDoc.insurance.policyNumber, preAuthNo: `PA${int(100000, 999999)}`, claimAmount, status, submittedAt: dischargedAt,
        approvedAmount: ['Approved', 'Settled'].includes(status) ? Math.round(claimAmount * 0.9) : 0,
        history: [{ status: 'Submitted', note: 'Claim filed with discharge summary and final bill', at: dischargedAt, by: accountant._id }],
        createdBy: accountant._id,
      });
      if (status === 'Settled') {
        const settledAt = new Date(dischargedAt.getTime() + int(3, 8) * DAY);
        await recordPayment(inv, { amount: claim.approvedAmount, mode: 'Insurance', reference: claim.claimNo, paidAt: settledAt }, accountant);
        claim.settledAmount = claim.approvedAmount; claim.settledAt = settledAt;
        claim.history.push({ status: 'Settled', note: 'Payment received via NEFT', at: settledAt, by: accountant._id });
        await claim.save();
        const fresh = await Invoice.findById(inv._id);
        if (fresh.balance > 0) await recordPayment(fresh, { amount: fresh.balance, mode: 'Cash', reference: 'Co-pay', paidAt: settledAt }, accountant);
      } else if (status !== 'Submitted') {
        claim.history.push({ status, note: status === 'Query Raised' ? 'TPA requested indoor case papers' : 'Under processing', at: new Date(dischargedAt.getTime() + 2 * DAY), by: accountant._id });
        await claim.save();
      }
    } else if (inv.balance > 0) {
      await recordPayment(inv, { amount: inv.balance, mode: pick(['Card', 'UPI', 'Bank Transfer', 'Cash']), paidAt: dischargedAt }, reception);
    }
    adm.status = 'Discharged';
    adm.dischargedAt = dischargedAt;
    adm.bedHistory[0].to = dischargedAt;
    adm.dischargeSummary = {
      finalDiagnosis: dcase[1], treatmentGiven: dcase[2] ? `${dcase[2]} under anaesthesia. IV antibiotics, analgesics and supportive care.` : 'IV fluids, antibiotics, antipyretics and supportive care.',
      procedures: dcase[2] || 'None', conditionAtDischarge: 'Stable, afebrile, ambulatory', medications: 'Tab Paracetamol 650 mg SOS, Tab Pantoprazole 40 mg OD x 5 days',
      followUp: 'Review in OPD after 7 days with reports', instructions: 'Adequate rest. Keep wound clean and dry. Report immediately in case of fever or pain.',
    };
    await adm.save();
    await Ward.updateOne({ _id: adm.ward, 'beds.number': adm.bedNumber }, { $set: { 'beds.$.status': 'Available' }, $unset: { 'beds.$.patient': '', 'beds.$.admission': '' } });
    await backdate(Admission, adm._id, admittedAt);
  }

  // Currently admitted patients.
  for (let i = 0; i < 30; i += 1) {
    const candidates = patients.filter((p) => !usedPatients.has(String(p._id)));
    const patient = pick(candidates);
    usedPatients.add(String(patient._id));
    const dcase = patient.age < 14 ? IPD_CASES[9] : pick(IPD_CASES.filter((c) => (patient.gender === 'Male' ? c[0] !== 'OBG' : true) && c[0] !== 'PED'));
    const admittedAt = daysAgo(int(0, 5), int(7, 21), 0);
    const res = await admit(patient, dcase, admittedAt, false);
    if (res) await backdate(Admission, res.adm._id, admittedAt);
  }
  // Theatre schedule for today/tomorrow (day-care style).
  for (let i = 0; i < 3; i += 1) {
    const doc = pick(doctors.filter((d) => ['SURG', 'ORTHO', 'ENT'].includes(d.code)));
    const at = daysAgo(-(i === 0 ? 0 : 1), pick([10, 13, 15]), 30);
    await Surgery.create({
      surgeryNo: await nextCode('OT'), patient: pick(patients)._id, theatre: theatres[3]._id, procedure: doc.code === 'ENT' ? 'Tonsillectomy' : doc.code === 'ORTHO' ? 'Implant removal' : 'Excision of lipoma',
      category: 'Day Care', priority: 'Elective', surgeon: doc.user._id, anaesthetist: anaesthetist._id, anaesthesiaType: 'Local', scheduledAt: at, durationMins: 45,
      preOpDiagnosis: doc.code === 'ENT' ? 'Chronic tonsillitis' : 'Soft tissue swelling', checklist: { consent: i !== 2, fasting: true, siteMarked: i === 0 },
      charges: 12000, createdBy: doc.user._id,
    });
  }

  /* ---------- Pending diagnostic work today ---------- */
  for (let i = 0; i < 7; i += 1) {
    const doc = pick(clinicDocs).user;
    const codes = i < 5 ? [pick(['CBC', 'LFT', 'KFT', 'LIPID', 'TFT', 'URINE', 'FBS'])] : [pick(['XRCHEST', 'USGABD', 'XRKNEE', 'MRILS'])];
    await makeOrder({ patient: pick(patients), doctor: doc, codes, date: new Date(Date.now() - int(10, 180) * 60000), complete: false, priority: i === 0 ? 'STAT' : pick(['Routine', 'Routine', 'Urgent']) });
  }

  /* ---------- Expenses ---------- */
  for (let m = 2; m >= 0; m -= 1) {
    const base = new Date(); base.setMonth(base.getMonth() - m, 1); base.setHours(11, 0, 0, 0);
    if (base > new Date()) continue;
    const entries = [
      ['Salaries', 420000, 'Bank Transfer', 'Monthly payroll'], ['Utilities', int(38000, 52000), 'Bank Transfer', 'Electricity - JVVNL'], ['Utilities', int(6000, 9000), 'Bank Transfer', 'Water & sewerage'],
      ['Rent', 120000, 'Bank Transfer', 'Building lease - Block C'], ['Maintenance', int(15000, 30000), 'Bank Transfer', 'Biomedical equipment AMC'], ['Housekeeping', int(25000, 32000), 'Bank Transfer', 'Outsourced housekeeping'],
      ['Marketing', int(10000, 20000), 'UPI', 'Health camp & print ads'], ['Medical Supplies', int(40000, 70000), 'Bank Transfer', 'Surgical consumables'], ['Professional Fees', int(30000, 50000), 'Bank Transfer', 'Visiting consultants'],
    ];
    for (const [category, amount, mode, description] of entries) {
      const date = category === 'Salaries' ? new Date(base) : new Date(base.getTime() + int(0, 20) * DAY);
      if (date > new Date()) continue;
      await LedgerEntry.create({ entryNo: await nextCode('LED'), date, type: 'Expense', category, amount, mode, description, payee: description.split(' - ')[1]?.trim(), createdBy: accountant._id });
    }
  }

  /* ---------- Purchase orders ---------- */
  const po1 = await PurchaseOrder.create({
    poNo: await nextCode('PO'), supplier: suppliers[0]._id, status: 'Ordered', expectedDate: new Date(Date.now() + 3 * DAY), createdBy: pharmacist._id,
    items: medicines.filter((m) => m.stock <= m.reorderLevel).slice(0, 4).concat(medicines.slice(0, 2)).map((m) => ({ itemType: 'Medicine', item: m._id, name: m.name, quantity: m.reorderLevel * 2, unitCost: Math.round(m.mrp * 0.7 * 100) / 100 })),
  });
  await PurchaseOrder.create({
    poNo: await nextCode('PO'), supplier: suppliers[1]._id, status: 'Draft', createdBy: pharmacist._id, notes: 'Quarterly surgical consumables',
    items: invItems.slice(0, 4).map((it) => ({ itemType: 'InventoryItem', item: it._id, name: it.name, quantity: it.reorderLevel * 2, unitCost: it.unitCost })),
  });
  const po3 = await PurchaseOrder.create({
    poNo: await nextCode('PO'), supplier: suppliers[2]._id, status: 'Received', receivedAt: daysAgo(12), createdBy: pharmacist._id,
    items: invItems.filter((i) => i.category === 'Laboratory').map((it) => ({ itemType: 'InventoryItem', item: it._id, name: it.name, quantity: 100, unitCost: it.unitCost })),
  });
  await LedgerEntry.create({ entryNo: await nextCode('LED'), date: daysAgo(12), type: 'Expense', category: 'Medical Supplies', amount: po3.total, mode: 'Bank Transfer', description: `Purchase order ${po3.poNo}`, payee: suppliers[2].name, reference: po3.poNo, auto: true, createdBy: pharmacist._id });
  void po1;
  for (const it of invItems.slice(0, 8)) {
    await StockMovement.create({ itemType: 'InventoryItem', item: it._id, itemName: it.name, type: 'OUT', quantity: -int(5, 40), department: pick(['Emergency', 'General Ward - Male', 'ICU', 'OT Complex']), note: 'Issued to department', by: nurse._id });
  }

  /* ---------- Communication log ---------- */
  for (let i = 0; i < 12; i += 1) {
    const p = pick(patients);
    const m = await Message.create({
      patient: p._id, channel: 'SMS', to: p.phone, template: 'appointment_booked', automatic: true, status: 'Logged', error: 'SMS gateway not configured; message recorded only',
      body: `Dear ${p.firstName} ${p.lastName}, your appointment with ${pick(clinicDocs).user.name} is confirmed. - City Care Multispeciality Hospital`,
    });
    await backdate(Message, m._id, daysAgo(int(0, 10), int(9, 18)));
  }

  /* ---------- Duty roster (this week) ---------- */
  const rosterStaff = await User.find({ role: { $in: ['nurse', 'receptionist', 'pharmacist', 'lab_technician'] } });
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  for (const u of rosterStaff) {
    for (let d = 0; d < 7; d += 1) {
      const shift = d === 6 ? 'Off' : pick(['Morning', 'Morning', 'Evening', 'Night', 'General']);
      await Shift.create({ user: u._id, date: new Date(weekStart.getTime() + d * DAY), shift, department: u.department, location: u.role === 'nurse' ? pick(['General Ward - Male', 'ICU', 'Emergency', 'Maternity Ward']) : undefined });
    }
  }

  await Counter.create({ _id: 'demo-seeded', seq: 1 });
  console.log(`[seed] demo data loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
