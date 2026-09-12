import Pending from './pages/Pending.jsx';
import PatientsModule from './pages/patients/index.jsx';

// Module routes. Each entry is permission-guarded by its module key.
export const routes = [
  { path: '/patients/*', module: 'patients', element: <PatientsModule /> },
  { path: '/appointments', module: 'appointments', element: <Pending title="Appointments & Queue" /> },
  { path: '/opd/*', module: 'opd', element: <Pending title="OPD Consultations" /> },
  { path: '/ipd/*', module: 'ipd', element: <Pending title="IPD Admissions" /> },
  { path: '/wards', module: 'wards', element: <Pending title="Wards & Beds" /> },
  { path: '/ot', module: 'ot', element: <Pending title="Operation Theatre" /> },
  { path: '/laboratory/*', module: 'lab', element: <Pending title="Laboratory" /> },
  { path: '/radiology/*', module: 'radiology', element: <Pending title="Radiology" /> },
  { path: '/pharmacy', module: 'pharmacy', element: <Pending title="Pharmacy" /> },
  { path: '/inventory', module: 'inventory', element: <Pending title="Inventory & Purchase" /> },
  { path: '/billing/*', module: 'billing', element: <Pending title="Billing" /> },
  { path: '/insurance', module: 'insurance', element: <Pending title="Insurance Claims" /> },
  { path: '/accounting', module: 'accounting', element: <Pending title="Accounts" /> },
  { path: '/staff', module: 'staff', element: <Pending title="Staff & Roster" /> },
  { path: '/reports', module: 'reports', element: <Pending title="Reports & Analytics" /> },
  { path: '/communication', module: 'communication', element: <Pending title="Communication" /> },
  { path: '/settings', module: 'settings', element: <Pending title="Settings & Security" /> },
];
