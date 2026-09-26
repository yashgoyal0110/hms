// Generates a realistic, unique demo patient for the registration form (demo mode only).
const MALE = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Kabir', 'Ishaan', 'Siddharth', 'Rahul', 'Vikram', 'Karan', 'Manish', 'Harsh', 'Nikhil', 'Imran', 'Joseph', 'Gurpreet', 'Deepak', 'Sanjay', 'Pranav', 'Yash', 'Tarun', 'Ankit', 'Ravi'];
const FEMALE = ['Ananya', 'Diya', 'Isha', 'Kavya', 'Priya', 'Sneha', 'Neha', 'Pooja', 'Riya', 'Meera', 'Aditi', 'Shreya', 'Tanvi', 'Nandini', 'Ayesha', 'Fatima', 'Simran', 'Lakshmi', 'Divya', 'Swati', 'Mary', 'Kritika', 'Sakshi', 'Megha'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Khan', 'Mehta', 'Joshi', 'Agarwal', 'Chopra', 'Das', 'Bose', 'Kulkarni', 'Pillai', 'Malhotra', 'Saxena', 'Yadav', 'Mishra', 'Fernandes', 'Kapoor', 'Rao', 'Jain', 'Bansal', 'Chauhan', 'Rathore'];
const PLACES = [['Malviya Nagar', 'Jaipur', 'Rajasthan', '302017'], ['Vaishali Nagar', 'Jaipur', 'Rajasthan', '302021'], ['C-Scheme', 'Jaipur', 'Rajasthan', '302001'], ['Mansarovar', 'Jaipur', 'Rajasthan', '302020'], ['Civil Lines', 'Ajmer', 'Rajasthan', '305001'], ['Talwandi', 'Kota', 'Rajasthan', '324005'], ['Sector 14', 'Gurugram', 'Haryana', '122001'], ['Andheri West', 'Mumbai', 'Maharashtra', '400053']];
const OCCUPATIONS = ['Teacher', 'Software Engineer', 'Business', 'Homemaker', 'Farmer', 'Government Service', 'Shopkeeper', 'Accountant', 'Driver', 'Nurse', 'Bank Officer', 'Electrician'];
const ALLERGIES = ['Penicillin', 'Sulfa drugs', 'NSAIDs', 'Peanuts', 'Dust', 'Latex'];
const CONDITIONS = ['Type 2 Diabetes', 'Hypertension', 'Hypothyroidism', 'Asthma'];
const MEDS = { 'Type 2 Diabetes': 'Metformin 500 mg', Hypertension: 'Amlodipine 5 mg', Hypothyroidism: 'Levothyroxine 50 mcg', Asthma: 'Salbutamol inhaler' };
const INSURERS = [['Star Health', 'Medi Assist'], ['HDFC ERGO', 'Paramount TPA'], ['ICICI Lombard', 'MD India'], ['Niva Bupa', 'Vidal Health']];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function demoPatient() {
  // Timestamp-derived digits keep the phone (and therefore the name+phone duplicate key) unique on every click.
  const stamp = String(Date.now()).slice(-9);
  const female = Math.random() < 0.5;
  const age = pick([int(2, 12), int(18, 35), int(25, 50), int(40, 70), int(60, 85)]);
  const dob = new Date(); dob.setFullYear(dob.getFullYear() - age); dob.setMonth(int(0, 11), int(1, 28));
  const firstName = female ? pick(FEMALE) : pick(MALE);
  const lastName = pick(LAST);
  const [area, city, state, pincode] = pick(PLACES);
  const condition = age > 40 && Math.random() < 0.5 ? pick(CONDITIONS) : null;
  const insured = Math.random() < 0.4;
  const [provider, tpa] = pick(INSURERS);
  const valid = new Date(); valid.setDate(valid.getDate() + int(90, 500));
  const child = age < 13;
  return {
    title: child ? (female ? 'Baby' : 'Master') : female ? (age > 24 ? 'Mrs' : 'Ms') : 'Mr',
    firstName,
    lastName,
    gender: female ? 'Female' : 'Male',
    dob: iso(dob),
    bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O+', 'B+', 'A-', 'O-']),
    maritalStatus: age > 24 ? pick(['Married', 'Married', 'Single']) : 'Single',
    phone: `9${stamp}`,
    altPhone: '',
    email: `${firstName}.${lastName}.${stamp.slice(-5)}@example.com`.toLowerCase(),
    occupation: age < 23 ? 'Student' : age >= 60 ? pick(['Retired', 'Retired', 'Homemaker', 'Business']) : pick(OCCUPATIONS),
    address: { line1: `${int(1, 250)}, ${area}`, city, state, pincode },
    idProof: { type: 'Aadhaar', number: `${int(2000, 9999)} ${int(1000, 9999)} ${stamp.slice(-4)}` },
    emergencyContact: { name: `${female ? pick(MALE) : pick(FEMALE)} ${lastName}`, relation: child ? 'Parent' : pick(['Spouse', 'Parent', 'Sibling', 'Child']), phone: `8${String(Date.now() + 7).slice(-9)}` },
    allergies: Math.random() < 0.25 ? [pick(ALLERGIES)] : [],
    chronicConditions: condition ? [condition] : [],
    currentMedications: condition ? [MEDS[condition]] : [],
    insurance: insured
      ? { provider, tpa, policyNumber: `POL${stamp.slice(-8)}`, validTill: iso(valid), coverageAmount: pick([300000, 500000, 1000000]) }
      : { provider: '', policyNumber: '', tpa: '', validTill: '', coverageAmount: '' },
    referredBy: Math.random() < 0.3 ? `Dr. ${pick(MALE)} ${pick(LAST)}` : '',
    notes: '',
    chargeRegistration: true,
  };
}
