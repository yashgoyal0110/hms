import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  CalendarPlus, ChevronLeft, ChevronRight, MonitorPlay, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  addDays, ageSex, date, fullName, isoDate, money, slot12,
} from '../lib/format.js';
import {
  Button, Card, Confirm, DataTable, Dropdown, ErrorBox, Field, Modal, PageHeader, Select, StatusBadge, Tabs,
} from '../components/ui.jsx';
import { DepartmentSelect, PatientPicker, StaffSelect } from '../components/pickers.jsx';

export default function Appointments() {
  const { can, role, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [day, setDay] = useState(isoDate());
  const [doctor, setDoctor] = useState(role === 'doctor' ? user._id : '');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('list');
  const [booking, setBooking] = useState(params.get('book') === '1');
  const [cancel, setCancel] = useState(null);
  const [reschedule, setReschedule] = useState(null);
  const { data, loading, reload: reloadDay } = useFetch('/appointments', { date: day, doctor, department, status, limit: 300 });
  const rows = data?.data || [];
  const upcoming = useFetch(view === 'upcoming' ? '/appointments' : null, {
    from: isoDate(addDays(new Date(), 1)), to: isoDate(addDays(new Date(), 30)), doctor, department, status: status || 'Scheduled', sort: 'date', limit: 500,
  });
  const upcomingRows = [...(upcoming.data?.data || [])].sort((a, b) => new Date(a.date) - new Date(b.date) || a.timeSlot.localeCompare(b.timeSlot));
  const reload = () => { reloadDay(); upcoming.reload(); };

  useEffect(() => {
    if (params.get('book') === '1') setBooking(true);
  }, [params]);

  const counts = useMemo(() => {
    const c = {};
    rows.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [rows]);

  const act = async (a, next, extra = {}) => {
    try {
      const res = await api.post(`/appointments/${a._id}/status`, { status: next, ...extra });
      if (next === 'Checked-in') toast.success(`Checked in - token #${res.tokenNo}${res.invoice ? '. Consultation bill generated.' : ''}`);
      else toast.success(`Appointment marked ${next.toLowerCase()}`);
      if (next === 'In-consultation' && res.encounter) navigate(`/opd/${res.encounter}`);
      reload();
    } catch (e) { toast.error(e); }
  };

  const byDoctor = useMemo(() => {
    const m = new Map();
    rows.filter((a) => !['Cancelled', 'No-show'].includes(a.status)).forEach((a) => {
      const k = a.doctor?._id;
      if (!m.has(k)) m.set(k, { doctor: a.doctor, list: [] });
      m.get(k).list.push(a);
    });
    return [...m.values()];
  }, [rows]);

  const canWrite = can('appointments', 'rw');

  return (
    <>
      <PageHeader
        title="Appointments & Queue"
        sub="Scheduling, check-in and token management for outpatient clinics"
        actions={(
          <>
            <a className="btn" href="/display/queue" target="_blank" rel="noreferrer"><MonitorPlay size={15} />Queue display</a>
            {canWrite && <Button variant="primary" icon={CalendarPlus} onClick={() => setBooking(true)}>Book appointment</Button>}
          </>
        )}
      />

      <Card flush>
        <div className="card-header">
          <div className="filters">
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" icon={ChevronLeft} onClick={() => setDay(isoDate(addDays(day, -1)))} aria-label="Previous day" />
              <input type="date" className="input" style={{ width: 150 }} value={day} onChange={(e) => setDay(e.target.value)} />
              <Button size="sm" icon={ChevronRight} onClick={() => setDay(isoDate(addDays(day, 1)))} aria-label="Next day" />
              {day !== isoDate() && <Button size="sm" onClick={() => setDay(isoDate())}>Today</Button>}
            </div>
            <DepartmentSelect value={department} onChange={setDepartment} includeAll type="Clinical" />
            <StaffSelect role="doctor" value={doctor} onChange={setDoctor} includeAll department={department || undefined} />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={['Scheduled', 'Checked-in', 'In-consultation', 'Completed', 'Cancelled', 'No-show']} />
          </div>
          <div className="row">
            <Button size="sm" icon={RefreshCw} onClick={reload} aria-label="Refresh" />
          </div>
        </div>
        <div style={{ padding: '0 16px' }}>
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { value: 'list', label: 'Appointment list', count: rows.length },
              { value: 'queue', label: 'Doctor-wise queue' },
              { value: 'upcoming', label: 'Upcoming (30 days)', count: upcoming.data ? upcoming.data.total : undefined },
            ]}
          />
          {view !== 'upcoming' && <div className="row small muted" style={{ marginTop: -6, marginBottom: 10, gap: 14 }}>
            {['Scheduled', 'Checked-in', 'In-consultation', 'Completed', 'Cancelled', 'No-show'].map((s) => <span key={s}>{s}: <b className="mono">{counts[s] || 0}</b></span>)}
          </div>}
        </div>
        {view === 'upcoming' && (
          <DataTable
            loading={upcoming.loading}
            rows={upcomingRows}
            empty="No upcoming appointments in the next 30 days"
            columns={[
              { key: 'date', label: 'Date', render: (a) => <><b>{date(a.date)}</b><div className="cell-sub">{new Date(a.date).toLocaleDateString('en-IN', { weekday: 'long' })}</div></> },
              { key: 'slot', label: 'Slot', render: (a) => <span className="mono strong">{slot12(a.timeSlot)}</span> },
              { key: 'p', label: 'Patient', render: (a) => <><Link to={`/patients/${a.patient?._id}`} className="cell-main">{fullName(a.patient)}</Link><div className="cell-sub">{a.patient?.uhid} · {a.patient?.phone}</div></> },
              { key: 'd', label: 'Doctor', render: (a) => <>{a.doctor?.name}<div className="cell-sub">{a.department?.name}</div></> },
              { key: 't', label: 'Visit', render: (a) => <>{a.type}<div className="cell-sub">{a.source}</div></> },
              { key: 's', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              {
                key: 'x', label: '', className: 'actions-cell',
                render: (a) => canWrite && a.status === 'Scheduled' && (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" onClick={() => setReschedule(a)}>Reschedule</Button>
                    <Button size="sm" variant="danger" onClick={() => setCancel(a)}>Cancel</Button>
                  </div>
                ),
              },
            ]}
          />
        )}
        {view === 'upcoming' ? null : view === 'list' ? (
          <DataTable
            loading={loading}
            rows={rows}
            empty={`No appointments on ${date(day)}`}
            columns={[
              { key: 'slot', label: 'Slot', render: (a) => <span className="mono strong">{slot12(a.timeSlot)}</span> },
              { key: 'tok', label: 'Token', render: (a) => (a.tokenNo ? <span className="badge primary plain mono">#{a.tokenNo}</span> : '-') },
              { key: 'p', label: 'Patient', render: (a) => <><Link to={`/patients/${a.patient?._id}`} className="cell-main">{fullName(a.patient)}</Link><div className="cell-sub">{a.patient?.uhid} · {ageSex(a.patient)} · {a.patient?.phone}</div></> },
              { key: 'd', label: 'Doctor', render: (a) => <>{a.doctor?.name}<div className="cell-sub">{a.department?.name}</div></> },
              { key: 't', label: 'Visit', render: (a) => <>{a.type}<div className="cell-sub">{a.source}</div></> },
              { key: 's', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              {
                key: 'x',
                label: '',
                className: 'actions-cell',
                render: (a) => canWrite && (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {a.status === 'Scheduled' && <Button size="sm" variant="primary" onClick={() => act(a, 'Checked-in')}>Check in</Button>}
                    {a.status === 'Checked-in' && can('opd', 'rw') && <Button size="sm" variant="primary" onClick={() => act(a, 'In-consultation')}>Start consultation</Button>}
                    {a.status === 'In-consultation' && a.encounter && <Button size="sm" onClick={() => navigate(`/opd/${a.encounter}`)}>Open</Button>}
                    {['Scheduled', 'Checked-in'].includes(a.status) && (
                      <Dropdown trigger={({ toggle }) => <Button size="sm" onClick={toggle}>More</Button>}>
                        {a.status === 'Scheduled' && <button type="button" data-close onClick={() => setReschedule(a)}>Reschedule</button>}
                        {a.status === 'Scheduled' && <button type="button" data-close onClick={() => act(a, 'No-show')}>Mark no-show</button>}
                        <button type="button" data-close onClick={() => setCancel(a)}>Cancel appointment</button>
                      </Dropdown>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <div className="card-body">
            {!byDoctor.length && <p className="muted">No active appointments.</p>}
            <div className="grid grid-3">
              {byDoctor.map(({ doctor: d, list }) => {
                const current = list.find((a) => a.status === 'In-consultation');
                const waiting = list.filter((a) => a.status === 'Checked-in').sort((x, y) => x.tokenNo - y.tokenNo);
                const done = list.filter((a) => a.status === 'Completed').length;
                const pending = list.filter((a) => a.status === 'Scheduled').length;
                return (
                  <div key={d?._id} className="card">
                    <div className="card-header"><div><h3>{d?.name}</h3><div className="cell-sub">{d?.specialization}</div></div></div>
                    <div className="card-body">
                      <div className="small muted">Now consulting</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }} className="mono">{current ? `#${current.tokenNo}` : '-'}</div>
                      {current && <div className="small">{fullName(current.patient)}</div>}
                      <div className="small muted mt-16">Waiting ({waiting.length})</div>
                      <div className="stack mt-8" style={{ gap: 4 }}>
                        {waiting.slice(0, 6).map((a) => <div key={a._id} className="row between small"><span><b className="mono">#{a.tokenNo}</b> {fullName(a.patient)}</span><span className="muted">{slot12(a.timeSlot)}</span></div>)}
                        {!waiting.length && <span className="small muted">No one waiting</span>}
                      </div>
                      <div className="row small muted mt-16" style={{ gap: 12 }}><span>Completed {done}</span><span>Yet to arrive {pending}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <BookAppointment
        open={booking}
        presetPatientId={params.get('patient')}
        onClose={() => { setBooking(false); if (params.get('book')) { params.delete('book'); params.delete('patient'); setParams(params, { replace: true }); } }}
        onBooked={(a) => { setDay(isoDate(a.date)); if (view === 'upcoming' && isoDate(a.date) === isoDate()) setView('list'); reload(); }}
      />
      <Reschedule appt={reschedule} onClose={() => setReschedule(null)} onDone={reload} />
      <CancelDialog appt={cancel} onClose={() => setCancel(null)} onDone={reload} />
    </>
  );
}

function SlotPicker({ doctor, day, value, onChange }) {
  const { data, loading } = useFetch(doctor && day ? '/appointments/slots' : null, { doctor, date: day });
  if (!doctor) return <p className="muted small">Select a doctor to see available slots.</p>;
  if (loading) return <p className="muted small">Loading slots…</p>;
  if (!data?.working) return <p className="warning-text small">Doctor is not available on this day.</p>;
  if (!data.slots.length) return <p className="muted small">No slots configured.</p>;
  return (
    <>
      <div className="slots">
        {data.slots.map((s) => (
          <button type="button" key={s.time} className={`slot ${value === s.time ? 'selected' : ''}`} disabled={!s.available} onClick={() => onChange(s.time)}>{slot12(s.time)}</button>
        ))}
      </div>
      <p className="small muted mt-8">{data.slots.filter((s) => s.available).length} slots available · Consultation fee {money(data.fee)}</p>
    </>
  );
}

export function BookAppointment({ open, onClose, onBooked, presetPatientId }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [department, setDepartment] = useState('');
  const [doctor, setDoctor] = useState('');
  const [day, setDay] = useState(isoDate());
  const [slot, setSlot] = useState('');
  const [type, setType] = useState('New');
  const [source, setSource] = useState('Walk-in');
  const [reason, setReason] = useState('');
  const [checkIn, setCheckIn] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && presetPatientId) api.get(`/patients/${presetPatientId}`).then((r) => setPatient(r.patient)).catch(() => {});
    if (!open) { setPatient(null); setSlot(''); setReason(''); setError(null); setCheckIn(false); }
  }, [open, presetPatientId]);
  useEffect(() => { setSlot(''); }, [doctor, day]);

  const submit = async () => {
    setError(null);
    if (!patient) return setError(new Error('Select a patient'));
    if (!doctor) return setError(new Error('Select a doctor'));
    if (!slot) return setError(new Error('Select a time slot'));
    setBusy(true);
    try {
      const a = await api.post('/appointments', { patient: patient._id, doctor, department: department || undefined, date: day, timeSlot: slot, type, source, reason });
      if (checkIn && day === isoDate()) await api.post(`/appointments/${a._id}/status`, { status: 'Checked-in' });
      toast.success(`Appointment ${a.appointmentNo} booked for ${slot12(slot)}`);
      onBooked?.(a);
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
    return null;
  };

  return (
    <Modal open={open} onClose={onClose} title="Book appointment" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Confirm booking</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Patient" required hint={<>Not registered yet? <a href="/patients/new" onClick={(e) => { e.preventDefault(); onClose(); navigate('/patients/new'); }}>Register a new patient</a></>}>
          <PatientPicker value={patient} onChange={setPatient} autoFocus />
        </Field>
        <div className="form-grid">
          <Field label="Department"><DepartmentSelect value={department} onChange={(v) => { setDepartment(v); setDoctor(''); }} type="Clinical" includeAll /></Field>
          <Field label="Doctor" required><StaffSelect role="doctor" value={doctor} onChange={setDoctor} department={department || undefined} placeholder="Select doctor" /></Field>
          <Field label="Date" required hint="Any future date can be booked">
            <input type="date" className="input" min={isoDate()} value={day} onChange={(e) => setDay(e.target.value)} />
            <div className="row" style={{ gap: 4, marginTop: 4 }}>
              {[['Today', 0], ['Tomorrow', 1], ['+1 week', 7], ['+2 weeks', 14]].map(([label, n]) => (
                <button type="button" key={label} className={`tag ${day === isoDate(addDays(new Date(), n)) ? 'active' : ''}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => setDay(isoDate(addDays(new Date(), n)))}>{label}</button>
              ))}
            </div>
          </Field>
          <Field label="Visit type"><Select value={type} onChange={(e) => setType(e.target.value)} options={['New', 'Follow-up', 'Emergency', 'Teleconsult']} /></Field>
          <Field label="Source"><Select value={source} onChange={(e) => setSource(e.target.value)} options={['Walk-in', 'Phone', 'Online', 'Referral']} /></Field>
          <Field label="Reason for visit" className="span-2"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever for 3 days" /></Field>
        </div>
        <Field label="Time slot" required><SlotPicker doctor={doctor} day={day} value={slot} onChange={setSlot} /></Field>
        {day === isoDate() && <label className="checkbox"><input type="checkbox" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />Check in immediately (issues token and consultation bill)</label>}
      </div>
    </Modal>
  );
}

function Reschedule({ appt, onClose, onDone }) {
  const toast = useToast();
  const [day, setDay] = useState(isoDate());
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (appt) { setDay(isoDate(appt.date)); setSlot(''); } }, [appt]);
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/appointments/${appt._id}`, { date: day, timeSlot: slot });
      toast.success('Appointment rescheduled');
      onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={Boolean(appt)} onClose={onClose} title="Reschedule appointment" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!slot} loading={busy} onClick={save}>Save</Button></>}>
      {appt && (
        <div className="stack">
          <p>{fullName(appt.patient)} with {appt.doctor?.name}</p>
          <Field label="New date"><input type="date" className="input" min={isoDate()} value={day} onChange={(e) => { setDay(e.target.value); setSlot(''); }} /></Field>
          <SlotPicker doctor={appt.doctor?._id} day={day} value={slot} onChange={setSlot} />
        </div>
      )}
    </Modal>
  );
}

function CancelDialog({ appt, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  return (
    <Confirm
      open={Boolean(appt)}
      onClose={onClose}
      title="Cancel appointment"
      danger
      confirmLabel="Cancel appointment"
      onConfirm={async () => {
        try {
          await api.post(`/appointments/${appt._id}/status`, { status: 'Cancelled', reason });
          toast.success('Appointment cancelled');
          onDone(); onClose(); setReason('');
        } catch (e) { toast.error(e); }
      }}
    >
      <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient requested" /></Field>
    </Confirm>
  );
}
