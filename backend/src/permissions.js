// Role-based access control matrix. 'r' = read only, 'rw' = read and write.
export const ROLES = {
  admin: 'Administrator',
  doctor: 'Doctor',
  nurse: 'Nurse',
  receptionist: 'Front Office',
  pharmacist: 'Pharmacist',
  lab_technician: 'Lab Technician',
  radiologist: 'Radiologist',
  accountant: 'Accountant',
};

export const MODULES = [
  'dashboard', 'patients', 'appointments', 'opd', 'ipd', 'wards', 'ot', 'lab', 'radiology',
  'pharmacy', 'inventory', 'billing', 'insurance', 'accounting', 'staff', 'reports',
  'communication', 'settings', 'audit', 'backup',
];

const all = Object.fromEntries(MODULES.map((m) => [m, 'rw']));

export const MATRIX = {
  admin: all,
  doctor: {
    dashboard: 'r', patients: 'rw', appointments: 'rw', opd: 'rw', ipd: 'rw', wards: 'r', ot: 'rw',
    lab: 'rw', radiology: 'rw', pharmacy: 'r', billing: 'r', reports: 'r', communication: 'rw',
  },
  nurse: {
    dashboard: 'r', patients: 'rw', appointments: 'r', opd: 'rw', ipd: 'rw', wards: 'rw', ot: 'r',
    lab: 'r', radiology: 'r', pharmacy: 'r', inventory: 'r', staff: 'r',
  },
  receptionist: {
    dashboard: 'r', patients: 'rw', appointments: 'rw', opd: 'r', ipd: 'rw', wards: 'r', ot: 'r',
    billing: 'rw', insurance: 'r', communication: 'rw', staff: 'r', lab: 'r', radiology: 'r',
  },
  pharmacist: {
    dashboard: 'r', patients: 'r', pharmacy: 'rw', inventory: 'rw', billing: 'r', opd: 'r',
  },
  lab_technician: {
    dashboard: 'r', patients: 'r', lab: 'rw', inventory: 'r',
  },
  radiologist: {
    dashboard: 'r', patients: 'r', radiology: 'rw',
  },
  accountant: {
    dashboard: 'r', patients: 'r', billing: 'rw', insurance: 'rw', accounting: 'rw', reports: 'r',
    inventory: 'r', pharmacy: 'r', staff: 'r',
  },
};

export function permissionsFor(role) {
  return MATRIX[role] || {};
}

export function hasPermission(role, module, level = 'r') {
  const granted = permissionsFor(role)[module];
  if (!granted) return false;
  return level === 'r' ? true : granted === 'rw';
}
