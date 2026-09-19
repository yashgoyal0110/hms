import PatientsModule from './pages/patients/index.jsx';
import Appointments from './pages/Appointments.jsx';
import OpdModule from './pages/opd/index.jsx';
import IpdModule from './pages/ipd/index.jsx';
import Wards from './pages/Wards.jsx';
import DiagnosticsModule from './pages/diagnostics/index.jsx';
import Pharmacy from './pages/Pharmacy.jsx';
import BillingModule from './pages/billing/index.jsx';
import Insurance from './pages/Insurance.jsx';
import Accounting from './pages/Accounting.jsx';
import Inventory from './pages/Inventory.jsx';
import OT from './pages/OT.jsx';
import Staff from './pages/Staff.jsx';
import Reports from './pages/Reports.jsx';
import Communication from './pages/Communication.jsx';
import Settings from './pages/Settings.jsx';

// Module routes. Each entry is permission-guarded by its module key.
export const routes = [
  { path: '/patients/*', module: 'patients', element: <PatientsModule /> },
  { path: '/appointments', module: 'appointments', element: <Appointments /> },
  { path: '/opd/*', module: 'opd', element: <OpdModule /> },
  { path: '/ipd/*', module: 'ipd', element: <IpdModule /> },
  { path: '/wards', module: 'wards', element: <Wards /> },
  { path: '/ot', module: 'ot', element: <OT /> },
  { path: '/laboratory/*', module: 'lab', element: <DiagnosticsModule category="lab" /> },
  { path: '/radiology/*', module: 'radiology', element: <DiagnosticsModule category="radiology" /> },
  { path: '/pharmacy', module: 'pharmacy', element: <Pharmacy /> },
  { path: '/inventory', module: 'inventory', element: <Inventory /> },
  { path: '/billing/*', module: 'billing', element: <BillingModule /> },
  { path: '/insurance', module: 'insurance', element: <Insurance /> },
  { path: '/accounting', module: 'accounting', element: <Accounting /> },
  { path: '/staff', module: 'staff', element: <Staff /> },
  { path: '/reports', module: 'reports', element: <Reports /> },
  { path: '/communication', module: 'communication', element: <Communication /> },
  { path: '/settings', module: 'settings', element: <Settings /> },
];
