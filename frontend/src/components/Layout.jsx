import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarClock, Stethoscope, BedDouble, Building2, Scissors, FlaskConical, ScanLine, Pill,
  Boxes, Receipt, ShieldCheck, Landmark, UserCog, BarChart3, MessageSquare, Settings, Bell, Search, LogOut, KeyRound, Menu, MonitorPlay,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { ago, initials } from '../lib/format.js';
import { useDebounced } from '../lib/hooks.js';
import { Dropdown } from './ui.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { LogoMark, PRODUCT } from './Brand.jsx';

export const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard', end: true }] },
  {
    group: 'Patient Care',
    items: [
      { to: '/patients', label: 'Patients', icon: Users, module: 'patients' },
      { to: '/appointments', label: 'Appointments & Queue', icon: CalendarClock, module: 'appointments' },
      { to: '/opd', label: 'OPD Consultations', icon: Stethoscope, module: 'opd' },
      { to: '/ipd', label: 'IPD Admissions', icon: BedDouble, module: 'ipd' },
      { to: '/wards', label: 'Wards & Beds', icon: Building2, module: 'wards' },
      { to: '/ot', label: 'Operation Theatre', icon: Scissors, module: 'ot' },
    ],
  },
  {
    group: 'Diagnostics',
    items: [
      { to: '/laboratory', label: 'Laboratory', icon: FlaskConical, module: 'lab' },
      { to: '/radiology', label: 'Radiology', icon: ScanLine, module: 'radiology' },
    ],
  },
  {
    group: 'Supply Chain',
    items: [
      { to: '/pharmacy', label: 'Pharmacy', icon: Pill, module: 'pharmacy' },
      { to: '/inventory', label: 'Inventory & Purchase', icon: Boxes, module: 'inventory' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { to: '/billing', label: 'Billing', icon: Receipt, module: 'billing' },
      { to: '/insurance', label: 'Insurance Claims', icon: ShieldCheck, module: 'insurance' },
      { to: '/accounting', label: 'Accounts', icon: Landmark, module: 'accounting' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { to: '/staff', label: 'Staff & Roster', icon: UserCog, module: 'staff' },
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3, module: 'reports' },
      { to: '/communication', label: 'Communication', icon: MessageSquare, module: 'communication' },
      { to: '/settings', label: 'Settings & Security', icon: Settings, module: 'settings' },
    ],
  },
];

function PatientSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 250);
  const navigate = useNavigate();
  const { can } = useAuth();
  useEffect(() => {
    if (!dq.trim() || !can('patients')) { setResults([]); return; }
    api.get('/patients', { q: dq, limit: 8 }).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!can('patients')) return null;
  return (
    <div className="global-search combo">
      <Search />
      <input
        className="input"
        placeholder="Search patient by name, UHID or phone"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="combo-list">
          {results.map((p) => (
            <div key={p._id} className="combo-item" onMouseDown={() => { navigate(`/patients/${p._id}`); setQ(''); setOpen(false); }}>
              <div className="cell-main">{p.fullName}</div>
              <div className="cell-sub">{p.uhid} · {p.gender} · {p.phone}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [data, setData] = useState({ data: [], unread: 0 });
  const navigate = useNavigate();
  const load = () => api.get('/notifications').then(setData).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <Dropdown
      className="notif-panel"
      trigger={({ toggle }) => (
        <button type="button" className="btn btn-ghost btn-icon" style={{ position: 'relative' }} onClick={() => { toggle(); load(); }} aria-label="Notifications">
          <Bell size={17} />
          {data.unread > 0 && <span className="dot" />}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <b>Notifications</b>
            {data.unread > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={async () => { await api.post('/notifications/read-all'); load(); }}>Mark all read</button>}
          </div>
          {!data.data.length && <div className="empty">No notifications</div>}
          {data.data.map((n) => (
            <div
              key={n._id}
              className={`notif-item ${n.read ? '' : 'unread'}`}
              onClick={async () => { await api.post(`/notifications/${n._id}/read`); close(); if (n.link) navigate(n.link); load(); }}
            >
              <b className={n.type === 'critical' ? 'danger-text' : ''}>{n.title}</b>
              <div>{n.message}</div>
              <div className="muted small">{ago(n.createdAt)}</div>
            </div>
          ))}
        </>
      )}
    </Dropdown>
  );
}

export default function Layout() {
  const { user, roleLabel, can, logout, settings } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <LogoMark size={32} />
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">{PRODUCT.name}</div>
            <div className="brand-sub" title={settings?.name}>{settings?.name || PRODUCT.tagline}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => can(i.module));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={g.group}>
                <div className="nav-group-title">{g.group}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end}><i.icon />{i.label}</NavLink>
                ))}
              </div>
            );
          })}
          {can('appointments') && (
            <div className="nav-group">
              <div className="nav-group-title">Displays</div>
              <a href="/display/queue" target="_blank" rel="noreferrer"><MonitorPlay />Queue display board</a>
            </div>
          )}
        </nav>
        <div className="sidebar-foot">{PRODUCT.name} v{PRODUCT.version} · {roleLabel}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-ghost btn-icon menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu"><Menu size={18} /></button>
          <PatientSearch />
          <div className="spacer" />
          <Notifications />
          <Dropdown
            trigger={({ toggle }) => (
              <button type="button" className="user-chip" onClick={toggle}>
                <span className="avatar">{initials(user?.name)}</span>
                <span className="who"><b>{user?.name}</b><span>{roleLabel}{user?.department?.name ? ` · ${user.department.name}` : ''}</span></span>
              </button>
            )}
          >
            <div style={{ padding: '8px 10px' }}>
              <div className="strong">{user?.name}</div>
              <div className="muted small">{user?.email}</div>
            </div>
            <div className="dropdown-sep" />
            <button type="button" data-close onClick={() => setPwOpen(true)}><KeyRound />Change password</button>
            <button type="button" data-close onClick={logout}><LogOut />Sign out</button>
          </Dropdown>
        </header>
        <main className="content">
          <ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
