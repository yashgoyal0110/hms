import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock, BedDouble, UserPlus, FlaskConical, ScanLine, Pill, Scissors, IndianRupee, Wallet, RefreshCw,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../lib/auth.jsx';
import { useFetch } from '../lib/hooks.js';
import {
  ageSex, compactMoney, date, fullName, money0, num, slot12,
} from '../lib/format.js';
import {
  Button, Card, DataTable, ErrorBox, Loading, PageHeader, Stat, StatusBadge,
} from '../components/ui.jsx';

const axis = { fontSize: 11, fill: '#6b7682' };

export default function Dashboard() {
  const { user, can, role } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch('/reports/dashboard');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const k = data.kpis;
  const apptStatus = data.appointmentStatus || {};
  const showBeds = can('ipd') || can('wards');
  const showOpdChart = can('appointments') || can('opd') || can('reports');
  const both = can('lab') && can('radiology');
  const kpis = [
    (can('appointments') || can('opd')) && { key: 'appt', icon: CalendarClock, label: 'Appointments today', value: num(k.todayAppointments), foot: `${apptStatus.Completed || 0} completed · ${(apptStatus['Checked-in'] || 0) + (apptStatus['In-consultation'] || 0)} in queue` },
    showBeds && { key: 'beds', icon: BedDouble, label: 'Bed occupancy', value: `${k.occupancyRate}%`, foot: `${k.occupiedBeds} of ${k.totalBeds} beds · ${k.admissionsToday} admitted, ${k.dischargesToday} discharged today` },
    k.revenueToday !== null && { key: 'rev', icon: IndianRupee, label: 'Collections today', value: money0(k.revenueToday), foot: `Outstanding ${compactMoney(k.outstanding)} across ${k.outstandingCount} bills` },
    both && { key: 'dx', icon: FlaskConical, label: 'Pending diagnostics', value: num(k.pendingLab + k.pendingRadiology), foot: `${k.pendingLab} lab · ${k.pendingRadiology} imaging` },
    !both && can('lab') && { key: 'lab', icon: FlaskConical, label: 'Lab orders pending', value: num(k.pendingLab), foot: 'Awaiting sample or report' },
    !both && can('radiology') && { key: 'rad', icon: ScanLine, label: 'Imaging studies pending', value: num(k.pendingRadiology), foot: 'Awaiting reporting' },
    can('pharmacy') && { key: 'stock', icon: Pill, label: 'Medicines to reorder', value: num(k.lowStock), foot: 'At or below reorder level', tone: k.lowStock ? 'warning' : '' },
    can('ot') && { key: 'ot', icon: Scissors, label: 'Surgeries today', value: num(k.surgeriesToday), foot: 'Scheduled in theatre' },
    can('patients') && { key: 'reg', icon: UserPlus, label: 'New registrations today', value: num(k.newPatients), foot: 'Patients registered today' },
  ].filter(Boolean);
  const glance = [
    can('patients') && { icon: UserPlus, label: 'New registrations', value: k.newPatients, to: '/patients' },
    can('ipd') && { icon: BedDouble, label: 'Patients admitted (current)', value: k.admitted, to: '/ipd' },
    can('ot') && { icon: Scissors, label: 'Surgeries scheduled today', value: k.surgeriesToday, to: '/ot' },
    can('lab') && { icon: FlaskConical, label: 'Lab orders pending', value: k.pendingLab, to: '/laboratory' },
    can('radiology') && { icon: ScanLine, label: 'Imaging studies pending', value: k.pendingRadiology, to: '/radiology' },
    can('pharmacy') && { icon: Pill, label: 'Medicines at or below reorder level', value: k.lowStock, to: '/pharmacy?tab=alerts', tone: k.lowStock ? 'warning' : '' },
    can('billing') && k.outstanding !== null && { icon: Wallet, label: 'Outstanding receivables', value: money0(k.outstanding), to: '/billing?status=Unpaid,Partially Paid' },
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={`${greet}, ${user.name.split(' ').slice(0, 2).join(' ')}`}
        sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={(
          <>
            <Button icon={RefreshCw} onClick={reload}>Refresh</Button>
            {can('patients', 'rw') && <Button variant="primary" icon={UserPlus} onClick={() => navigate('/patients/new')}>Register patient</Button>}
            {can('appointments', 'rw') && <Button icon={CalendarClock} onClick={() => navigate('/appointments?book=1')}>Book appointment</Button>}
          </>
        )}
      />

      <div className="grid grid-4 mb-16">
        {kpis.slice(0, 4).map((x) => <Stat key={x.key} icon={x.icon} label={x.label} value={x.value} foot={x.foot} tone={x.tone} />)}
      </div>

      {role === 'doctor' && data.myQueue && (
        <Card title="My OPD queue today" actions={<Link to="/opd">Open consultation desk</Link>} flush className="mb-16">
          <DataTable
            rows={data.myQueue}
            empty="No patients waiting"
            onRowClick={() => navigate('/opd')}
            columns={[
              { key: 'token', label: 'Token', render: (a) => (a.tokenNo ? <b className="mono">#{a.tokenNo}</b> : '-') },
              { key: 'time', label: 'Slot', render: (a) => slot12(a.timeSlot) },
              { key: 'patient', label: 'Patient', render: (a) => <><div className="cell-main">{fullName(a.patient)}</div><div className="cell-sub">{a.patient?.uhid} · {ageSex(a.patient)}</div></> },
              { key: 'type', label: 'Visit', render: (a) => a.type },
              { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            ]}
          />
        </Card>
      )}

      <div className="grid grid-main-side mb-16">
        {data.revenueTrend ? (
          <Card title="Collections - last 14 days">
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={data.revenueTrend} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f5b6e" stopOpacity={0.18} /><stop offset="100%" stopColor="#0f5b6e" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef1f4" vertical={false} />
                  <XAxis dataKey="date" tick={axis} tickFormatter={(d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} tickLine={false} axisLine={false} />
                  <YAxis tick={axis} tickFormatter={compactMoney} width={64} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => money0(v)} labelFormatter={date} />
                  <Area type="monotone" dataKey="total" name="Collections" stroke="#0f5b6e" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : showOpdChart ? (
          <Card title="OPD load by department - last 14 days"><DeptChart data={data.departmentLoad} /></Card>
        ) : showBeds ? <BedOccupancy data={data.occupancy} canLink={can('wards')} /> : <div />}
        <Card title="Today at a glance">
          <div className="stack" style={{ gap: 10 }}>
            {glance.length ? glance.map((g) => <Glance key={g.label} {...g} />) : <p className="muted small">Nothing to show for your role.</p>}
          </div>
        </Card>
      </div>

      {(data.revenueTrend || showOpdChart) && (showBeds || showOpdChart) && (
        <div className="grid grid-2">
          {showBeds ? <BedOccupancy data={data.occupancy} canLink={can('wards')} /> : <div />}
          {data.revenueTrend && showOpdChart ? <Card title="OPD load by department - last 14 days"><DeptChart data={data.departmentLoad} /></Card>
            : can('ipd') ? <Card title="Current admissions" flush actions={<Link to="/ipd">All admissions</Link>}><AdmissionsTable rows={data.recentAdmissions} onOpen={(a) => navigate(`/ipd/${a._id}`)} /></Card> : <div />}
        </div>
      )}
      {data.revenueTrend && showOpdChart && can('ipd') && (
        <Card title="Recent admissions" flush className="mt-16" actions={<Link to="/ipd">All admissions</Link>}>
          <AdmissionsTable rows={data.recentAdmissions} onOpen={(a) => navigate(`/ipd/${a._id}`)} />
        </Card>
      )}
    </>
  );
}

function BedOccupancy({ data, canLink }) {
  return (
    <Card title="Bed occupancy by ward" actions={canLink && <Link to="/wards">Bed board</Link>}>
      <div className="stack" style={{ gap: 10 }}>
        {data.map((w) => {
          const pct = w.total ? Math.round((w.occupied / w.total) * 100) : 0;
          return (
            <div key={w.ward}>
              <div className="row between small"><span className="strong">{w.ward}</span><span className="muted mono">{w.occupied}/{w.total} occupied · {w.available} free</span></div>
              <div style={{ height: 6, background: 'var(--neutral-bg)', borderRadius: 3, marginTop: 5 }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct > 85 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--primary)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DeptChart({ data }) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
          <CartesianGrid stroke="#eef1f4" horizontal={false} />
          <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="department" tick={axis} width={130} tickLine={false} axisLine={false} />
          <Tooltip />
          <Bar dataKey="count" name="Appointments" fill="#0f5b6e" radius={[0, 3, 3, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdmissionsTable({ rows, onOpen }) {
  return (
    <DataTable
      rows={rows}
      onRowClick={onOpen}
      empty="No current admissions"
      columns={[
        { key: 'p', label: 'Patient', render: (a) => <><div className="cell-main">{fullName(a.patient)}</div><div className="cell-sub">{a.patient?.uhid}</div></> },
        { key: 'w', label: 'Ward / Bed', render: (a) => <>{a.ward?.name}<div className="cell-sub">{a.bedNumber}</div></> },
        { key: 'd', label: 'Doctor', render: (a) => a.doctor?.name },
        { key: 'at', label: 'Admitted', render: (a) => date(a.admittedAt) },
      ]}
    />
  );
}

function Glance({ icon: Icon, label, value, to, tone }) {
  return (
    <Link to={to} className="row between" style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', textDecoration: 'none' }}>
      <span className="row" style={{ gap: 10 }}><Icon size={16} color="#6b7682" />{label}</span>
      <b className={`mono ${tone ? `${tone}-text` : ''}`}>{value}</b>
    </Link>
  );
}
