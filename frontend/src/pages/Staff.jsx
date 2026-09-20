import { useEffect, useMemo, useState } from 'react';
import {
  Plus, KeyRound, ChevronLeft, ChevronRight, Check, Minus,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useDebounced, useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  addDays, dateTime, initials, isoDate, money,
} from '../lib/format.js';
import {
  Badge, Button, Card, DataTable, ErrorBox, Field, Modal, PageHeader, Pagination, Select, Tabs,
} from '../components/ui.jsx';
import { DepartmentSelect } from '../components/pickers.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Staff() {
  const [tab, setTab] = useState('staff');
  return (
    <>
      <PageHeader title="Staff & Roster" sub="Employees, departments, duty roster and access roles" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'staff', label: 'Staff directory' }, { value: 'departments', label: 'Departments' }, { value: 'roster', label: 'Duty roster' }, { value: 'roles', label: 'Roles & permissions' }]} />
      {tab === 'staff' && <StaffList />}
      {tab === 'departments' && <Departments />}
      {tab === 'roster' && <Roster />}
      {tab === 'roles' && <Roles />}
    </>
  );
}

function StaffList() {
  const { can } = useAuth();
  const roles = useFetch('/users/roles');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, reload } = useFetch('/users', { q: dq, role, department, active, page, limit: 25 });
  const [edit, setEdit] = useState(null);
  const [reset, setReset] = useState(null);
  const roleOpts = Object.entries(roles.data || {}).map(([value, label]) => ({ value, label }));
  const w = can('staff', 'rw');
  return (
    <Card flush>
      <div className="card-header">
        <div className="filters">
          <input className="input search" placeholder="Search name, email, phone, employee ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} placeholder="All roles" options={roleOpts} />
          <DepartmentSelect value={department} onChange={(v) => { setDepartment(v); setPage(1); }} includeAll />
          <Select value={active} onChange={(e) => setActive(e.target.value)} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }, { value: '', label: 'All' }]} />
        </div>
        {w && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ name: '', email: '', password: '', role: 'nurse', phone: '', gender: '', department: '', designation: '', specialization: '', qualification: '', registrationNo: '', consultationFee: 0, availability: { days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00', slotMinutes: 15 }, active: true })}>Add staff</Button>}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={w ? (u) => setEdit({ ...u, department: u.department?._id || '' }) : undefined}
        columns={[
          { key: 'n', label: 'Name', render: (u) => <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><span className="avatar">{initials(u.name)}</span><div><div className="cell-main">{u.name}</div><div className="cell-sub">{u.employeeId} · {u.email}</div></div></div> },
          { key: 'r', label: 'Role', render: (u) => <Badge tone="primary">{roles.data?.[u.role] || u.role}</Badge> },
          { key: 'd', label: 'Department', render: (u) => <>{u.department?.name || '-'}<div className="cell-sub">{u.designation}</div></> },
          { key: 's', label: 'Specialisation', render: (u) => u.specialization || '-' },
          { key: 'p', label: 'Phone', render: (u) => u.phone || '-' },
          { key: 'l', label: 'Last sign-in', render: (u) => (u.lastLogin ? dateTime(u.lastLogin) : <span className="muted">Never</span>) },
          { key: 'a', label: 'Status', render: (u) => (u.active ? <Badge tone="success" plain={false}>Active</Badge> : <Badge plain={false}>Inactive</Badge>) },
          { key: 'x', label: '', className: 'actions-cell', render: (u) => w && <Button size="sm" icon={KeyRound} onClick={(e) => { e.stopPropagation(); setReset(u); }}>Reset password</Button> },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      <UserEditor user={edit} roleOpts={roleOpts} onClose={() => setEdit(null)} onDone={reload} />
      <ResetPassword user={reset} onClose={() => setReset(null)} />
    </Card>
  );
}

function UserEditor({ user, roleOpts, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(user ? JSON.parse(JSON.stringify(user)) : null); setError(null); }, [user]);
  if (!f) return null;
  const b = (k, num) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value }) });
  const av = f.availability || {};
  const setAv = (k, v) => setF({ ...f, availability: { ...av, [k]: v } });
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = { ...f, department: f.department || undefined, gender: f.gender || undefined };
      if (f._id) { delete body.password; await api.put(`/users/${f._id}`, body); } else await api.post('/users', body);
      toast.success('Staff record saved'); onDone(); onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={f._id ? `Edit ${f.name}` : 'Add staff member'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Full name" required className="span-2"><input className="input" {...b('name')} /></Field>
          <Field label="Gender"><Select {...b('gender')} placeholder="-" options={['Male', 'Female', 'Other']} /></Field>
          <Field label="Email (login)" required><input className="input" type="email" {...b('email')} /></Field>
          {!f._id && <Field label="Initial password" required hint="8+ chars, upper, lower, number"><input className="input" type="text" {...b('password')} /></Field>}
          <Field label="Phone"><input className="input" {...b('phone')} /></Field>
          <Field label="Role" required><Select {...b('role')} options={roleOpts} /></Field>
          <Field label="Department"><DepartmentSelect value={f.department} onChange={(v) => setF({ ...f, department: v })} /></Field>
          <Field label="Designation"><input className="input" {...b('designation')} /></Field>
          <Field label="Qualification"><input className="input" {...b('qualification')} /></Field>
          <Field label="Joining date"><input className="input" type="date" value={f.joiningDate ? isoDate(f.joiningDate) : ''} onChange={(e) => setF({ ...f, joiningDate: e.target.value })} /></Field>
          {f._id && <Field label="Status"><Select value={f.active ? 'true' : 'false'} onChange={(e) => setF({ ...f, active: e.target.value === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive (cannot sign in)' }]} /></Field>}
        </div>
        {f.role === 'doctor' && (
          <>
            <div className="form-section-title">Clinical profile & OPD availability</div>
            <div className="form-grid">
              <Field label="Specialisation"><input className="input" {...b('specialization')} /></Field>
              <Field label="Medical council reg. no."><input className="input" {...b('registrationNo')} /></Field>
              <Field label="Consultation fee"><input className="input" type="number" {...b('consultationFee', true)} /></Field>
              <Field label="OPD start"><input className="input" type="time" value={av.start || ''} onChange={(e) => setAv('start', e.target.value)} /></Field>
              <Field label="OPD end"><input className="input" type="time" value={av.end || ''} onChange={(e) => setAv('end', e.target.value)} /></Field>
              <Field label="Slot length (min)"><Select value={String(av.slotMinutes || 15)} onChange={(e) => setAv('slotMinutes', Number(e.target.value))} options={['10', '15', '20', '30']} /></Field>
              <Field label="OPD days" className="span-all">
                <div className="row">
                  {DAYS.map((d, i) => (
                    <label key={d} className="checkbox"><input type="checkbox" checked={(av.days || []).includes(i)} onChange={(e) => setAv('days', e.target.checked ? [...(av.days || []), i].sort() : (av.days || []).filter((x) => x !== i))} />{d}</label>
                  ))}
                </div>
              </Field>
            </div>
            {f.consultationFee > 0 && <p className="small muted">Follow-up visits are billed at 50% ({money(f.consultationFee / 2)}).</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

function ResetPassword({ user, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  useEffect(() => setPw(''), [user]);
  return (
    <Modal open={Boolean(user)} onClose={onClose} title={`Reset password - ${user?.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => { try { await api.post(`/users/${user._id}/reset-password`, { password: pw }); toast.success('Password reset. The user must sign in again.'); onClose(); } catch (e) { toast.error(e); } }}>Reset</Button></>}>
      <Field label="New password" hint="Share securely with the user; they can change it after signing in. Resetting also unlocks a locked account."><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

function Departments() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/departments', { active: 'all', limit: 200 });
  const [edit, setEdit] = useState(null);
  const b = (k) => ({ value: edit?.[k] ?? '', onChange: (e) => setEdit({ ...edit, [k]: e.target.value }) });
  const save = async () => {
    try {
      const body = { ...edit, head: edit.head?._id || edit.head || undefined };
      if (edit._id) await api.put(`/departments/${edit._id}`, body); else await api.post('/departments', body);
      toast.success('Department saved'); setEdit(null); reload();
    } catch (e) { toast.error(e); }
  };
  return (
    <Card flush>
      <div className="card-header"><h3>{data?.total ?? ''} departments</h3>{can('staff', 'rw') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ name: '', code: '', type: 'Clinical', location: '', description: '', active: true })}>Add department</Button>}</div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={can('staff', 'rw') ? (d) => setEdit(d) : undefined}
        columns={[
          { key: 'c', label: 'Code', render: (d) => <span className="mono">{d.code}</span> },
          { key: 'n', label: 'Department', render: (d) => <span className="cell-main">{d.name}</span> },
          { key: 't', label: 'Type', render: (d) => d.type },
          { key: 'l', label: 'Location', render: (d) => d.location || '-' },
          { key: 'h', label: 'Head', render: (d) => d.head?.name || '-' },
          { key: 's', label: 'Status', render: (d) => (d.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
        ]}
      />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?._id ? 'Edit department' : 'Add department'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Name" required className="span-2"><input className="input" {...b('name')} /></Field>
            <Field label="Code" required><input className="input" {...b('code')} /></Field>
            <Field label="Type"><Select {...b('type')} options={['Clinical', 'Diagnostic', 'Administrative', 'Support']} /></Field>
            <Field label="Location"><input className="input" {...b('location')} /></Field>
            <Field label="Status"><Select value={edit.active ? 'true' : 'false'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} /></Field>
            <Field label="Description" className="span-all"><input className="input" {...b('description')} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

const SHIFT_TONE = { Morning: 'info', Evening: 'warning', Night: 'primary', General: 'success', Off: '', Leave: 'danger' };

function Roster() {
  const { can } = useAuth();
  const toast = useToast();
  const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const [start, setStart] = useState(monday(new Date()));
  const [roleFilter, setRoleFilter] = useState('nurse,receptionist,pharmacist,lab_technician');
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const staff = useFetch('/users/directory', { role: roleFilter });
  const shifts = useFetch('/shifts', { from: isoDate(start), to: isoDate(days[6]) });
  const map = useMemo(() => {
    const m = {};
    (shifts.data || []).forEach((s) => { m[`${s.user?._id}|${isoDate(s.date)}`] = s; });
    return m;
  }, [shifts.data]);
  const w = can('staff', 'rw');
  const set = async (u, d, shift) => {
    try { await api.put('/shifts', { user: u._id, date: isoDate(d), shift, department: u.department?._id }); shifts.reload(); } catch (e) { toast.error(e); }
  };
  return (
    <Card flush>
      <div className="card-header">
        <div className="row">
          <Button size="sm" icon={ChevronLeft} onClick={() => setStart(addDays(start, -7))} aria-label="Previous week" />
          <b>{days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - {days[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
          <Button size="sm" icon={ChevronRight} onClick={() => setStart(addDays(start, 7))} aria-label="Next week" />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} options={[{ value: 'nurse,receptionist,pharmacist,lab_technician', label: 'Nursing & support staff' }, { value: 'nurse', label: 'Nurses' }, { value: 'doctor', label: 'Doctors' }, { value: 'receptionist,accountant', label: 'Administration' }]} style={{ width: 220 }} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Staff</th>{days.map((d) => <th key={d.toISOString()} className="center">{DAYS[d.getDay()]}<div style={{ fontWeight: 400 }}>{d.getDate()}</div></th>)}</tr></thead>
          <tbody>
            {(staff.data || []).map((u) => (
              <tr key={u._id}>
                <td style={{ minWidth: 180 }}><div className="cell-main">{u.name}</div><div className="cell-sub">{u.designation || u.role}</div></td>
                {days.map((d) => {
                  const s = map[`${u._id}|${isoDate(d)}`];
                  return (
                    <td key={d.toISOString()} className="center" style={{ minWidth: 104 }}>
                      {w ? (
                        <select className="select" style={{ height: 28, fontSize: 12 }} value={s?.shift || ''} onChange={(e) => set(u, d, e.target.value)}>
                          <option value="">-</option>
                          {Object.keys(SHIFT_TONE).map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      ) : s ? <Badge tone={SHIFT_TONE[s.shift]}>{s.shift}</Badge> : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-body small muted">Morning 07:00-15:00 · Evening 15:00-23:00 · Night 23:00-07:00 · General 09:00-17:00</div>
    </Card>
  );
}

function Roles() {
  const { data } = useFetch('/users/permissions');
  if (!data) return null;
  const roles = Object.keys(data.roles);
  const label = (m) => m.charAt(0).toUpperCase() + m.slice(1).replace('opd', 'OPD').replace('ipd', 'IPD');
  return (
    <Card flush title="Access matrix" actions={<span className="small muted"><Check size={13} /> full access · R read only · <Minus size={13} /> no access</span>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Module</th>{roles.map((r) => <th key={r} className="center">{data.roles[r]}</th>)}</tr></thead>
          <tbody>
            {data.modules.map((m) => (
              <tr key={m}>
                <td className="cell-main">{label(m).replace('Ot', 'Operation theatre')}</td>
                {roles.map((r) => {
                  const g = data.matrix[r]?.[m];
                  return <td key={r} className="center">{g === 'rw' ? <Check size={15} color="var(--success)" /> : g === 'r' ? <span className="badge info plain">R</span> : <Minus size={14} color="#c0c7cf" />}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-body small muted">Permissions are enforced on the server for every request. Assign roles from the staff directory.</div>
    </Card>
  );
}
