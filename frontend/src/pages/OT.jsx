import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus, ChevronLeft, ChevronRight, Play, CheckCircle2, ClipboardCheck,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  addDays, ageSex, date, dateTime, fullName, isoDate, money, time,
} from '../lib/format.js';
import {
  Button, Card, DataTable, Dropdown, ErrorBox, Field, KV, Modal, PageHeader, Select, StatusBadge, Tabs,
} from '../components/ui.jsx';
import { PatientPicker, StaffSelect } from '../components/pickers.jsx';

const CHECKS = [['consent', 'Informed consent signed'], ['fasting', 'Nil by mouth confirmed'], ['siteMarked', 'Surgical site marked'], ['bloodArranged', 'Blood arranged / cross-matched'], ['anaesthesiaCleared', 'Pre-anaesthetic clearance']];

export default function OT() {
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [day, setDay] = useState(isoDate());
  const [tab, setTab] = useState('schedule');
  const theatres = useFetch('/theatres', { active: 'true' });
  const list = useFetch('/surgeries', { date: day, limit: 200 });
  const upcoming = useFetch(tab === 'upcoming' ? '/surgeries' : null, { from: isoDate(), to: isoDate(addDays(new Date(), 14)), status: 'Scheduled,Postponed', limit: 200 });
  const [open, setOpen] = useState(null);
  const w = can('ot', 'rw');
  const reload = () => { list.reload(); theatres.reload(); upcoming.reload(); };

  const setTheatreStatus = async (t, status) => {
    try { await api.put(`/theatres/${t._id}`, { status }); toast.success(`${t.name} marked ${status.toLowerCase()}`); theatres.reload(); } catch (e) { toast.error(e); }
  };

  const columns = [
    { key: 't', label: 'Time', render: (s) => <><b className="mono">{time(s.scheduledAt)}</b><div className="cell-sub">{s.durationMins} min</div></> },
    { key: 'ot', label: 'Theatre', render: (s) => s.theatre?.name },
    { key: 'p', label: 'Patient', render: (s) => <><div className="cell-main">{fullName(s.patient)}</div><div className="cell-sub">{s.patient?.uhid} · {ageSex(s.patient)}</div></> },
    { key: 'proc', label: 'Procedure', render: (s) => <>{s.procedure}<div className="cell-sub">{s.category} · {s.priority}</div></> },
    { key: 'team', label: 'Team', render: (s) => <>{s.surgeon?.name}<div className="cell-sub">{s.anaesthetist ? `Anaes: ${s.anaesthetist.name}` : 'Anaesthetist not assigned'}</div></> },
    { key: 'chk', label: 'Checklist', render: (s) => { const done = CHECKS.filter(([k]) => s.checklist?.[k]).length; return <span className={done === CHECKS.length ? 'success-text' : 'warning-text'}>{done}/{CHECKS.length}</span>; } },
    { key: 's', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <>
      <PageHeader title="Operation Theatre" sub="Theatre scheduling, safety checklist and operative notes" actions={w && <Button variant="primary" icon={Plus} onClick={() => setParams({ schedule: '1' })}>Schedule surgery</Button>} />
      <div className="grid grid-4 mb-16">
        {(theatres.data?.data || []).map((t) => (
          <div key={t._id} className="card stat">
            <div className="row between"><span className="label">{t.name}</span><StatusBadge status={t.status} /></div>
            <div className="small muted">{t.type} · {t.location}</div>
            {w && (
              <Dropdown trigger={({ toggle }) => <Button size="sm" className="mt-8" onClick={toggle}>Set status</Button>} align="left">
                {['Available', 'In Use', 'Cleaning', 'Maintenance'].filter((s) => s !== t.status).map((s) => <button type="button" key={s} data-close onClick={() => setTheatreStatus(t, s)}>{s}</button>)}
              </Dropdown>
            )}
          </div>
        ))}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'schedule', label: 'Day schedule' }, { value: 'upcoming', label: 'Upcoming (14 days)' }]} />
      <Card flush>
        {tab === 'schedule' && (
          <div className="card-header">
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" icon={ChevronLeft} onClick={() => setDay(isoDate(addDays(day, -1)))} aria-label="Previous day" />
              <input type="date" className="input" style={{ width: 150 }} value={day} onChange={(e) => setDay(e.target.value)} />
              <Button size="sm" icon={ChevronRight} onClick={() => setDay(isoDate(addDays(day, 1)))} aria-label="Next day" />
              {day !== isoDate() && <Button size="sm" onClick={() => setDay(isoDate())}>Today</Button>}
            </div>
            <span className="small muted">{list.data?.total || 0} cases</span>
          </div>
        )}
        <DataTable
          loading={tab === 'schedule' ? list.loading : upcoming.loading}
          rows={tab === 'schedule' ? list.data?.data : upcoming.data?.data}
          onRowClick={(s) => setOpen(s._id)}
          empty="No surgeries scheduled"
          columns={tab === 'schedule' ? columns : [{ key: 'd', label: 'Date', render: (s) => date(s.scheduledAt) }, ...columns]}
        />
      </Card>
      <ScheduleModal open={params.get('schedule') === '1'} presetPatientId={params.get('patient')} theatres={theatres.data?.data || []} onClose={() => setParams({}, { replace: true })} onDone={(s) => { setDay(isoDate(s.scheduledAt)); reload(); }} />
      <SurgeryDetail id={open} onClose={() => setOpen(null)} onChange={reload} />
    </>
  );
}

function ScheduleModal({ open, onClose, onDone, presetPatientId, theatres }) {
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [f, setF] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ procedure: '', theatre: '', surgeon: '', anaesthetist: '', anaesthesiaType: 'General', category: 'Major', priority: 'Elective', date: isoDate(addDays(new Date(), 1)), time: '09:00', durationMins: 60, preOpDiagnosis: '', charges: '' });
      if (presetPatientId) api.get(`/patients/${presetPatientId}`).then((r) => setPatient(r.patient)).catch(() => {});
    } else { setPatient(null); setError(null); }
  }, [open, presetPatientId]);
  const b = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const s = await api.post('/surgeries', {
        ...f, patient: patient?._id, scheduledAt: new Date(`${f.date}T${f.time}`), durationMins: Number(f.durationMins), charges: Number(f.charges) || 0, anaesthetist: f.anaesthetist || undefined,
      });
      toast.success(`Surgery ${s.surgeryNo} scheduled`); onDone(s); onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Schedule surgery" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!patient || !f.procedure || !f.theatre || !f.surgeon} onClick={submit}>Schedule</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} /></Field>
        <div className="form-grid">
          <Field label="Procedure" required className="span-2"><input className="input" {...b('procedure')} /></Field>
          <Field label="Pre-op diagnosis"><input className="input" {...b('preOpDiagnosis')} /></Field>
          <Field label="Theatre" required><Select {...b('theatre')} placeholder="Select" options={theatres.map((t) => ({ value: t._id, label: `${t.name} (${t.type})` }))} /></Field>
          <Field label="Surgeon" required><StaffSelect role="doctor" value={f.surgeon} onChange={(v) => setF({ ...f, surgeon: v })} /></Field>
          <Field label="Anaesthetist"><StaffSelect role="doctor" value={f.anaesthetist} onChange={(v) => setF({ ...f, anaesthetist: v })} /></Field>
          <Field label="Anaesthesia"><Select {...b('anaesthesiaType')} options={['General', 'Spinal', 'Epidural', 'Regional', 'Local', 'Sedation']} /></Field>
          <Field label="Category"><Select {...b('category')} options={['Major', 'Minor', 'Day Care']} /></Field>
          <Field label="Priority"><Select {...b('priority')} options={['Elective', 'Urgent', 'Emergency']} /></Field>
          <Field label="Date" required><input type="date" className="input" {...b('date')} /></Field>
          <Field label="Start time" required><input type="time" className="input" {...b('time')} /></Field>
          <Field label="Duration (min)"><input type="number" className="input" {...b('durationMins')} /></Field>
          <Field label="OT charges" hint="Billed when the surgery is completed"><input type="number" className="input" {...b('charges')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function SurgeryDetail({ id, onClose, onChange }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: s, reload } = useFetch(id ? `/surgeries/${id}` : null);
  const [notes, setNotes] = useState({ operativeNotes: '', postOpInstructions: '' });
  useEffect(() => { if (s) setNotes({ operativeNotes: s.operativeNotes || '', postOpInstructions: s.postOpInstructions || '' }); }, [s]);
  if (!id) return null;
  const w = can('ot', 'rw');
  const refresh = () => { reload(); onChange(); };
  const toggle = async (k) => {
    try { await api.put(`/surgeries/${id}`, { checklist: { ...s.checklist, [k]: !s.checklist?.[k] } }); refresh(); } catch (e) { toast.error(e); }
  };
  const setStatus = async (status, extra = {}) => {
    try { await api.post(`/surgeries/${id}/status`, { status, ...extra }); toast.success(`Surgery ${status.toLowerCase()}`); refresh(); } catch (e) { toast.error(e); }
  };
  const saveNotes = async () => { try { await api.put(`/surgeries/${id}`, notes); toast.success('Notes saved'); refresh(); } catch (e) { toast.error(e); } };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={s ? `${s.surgeryNo} - ${s.procedure}` : 'Surgery'}
      footer={s && w && (
        <>
          {s.status === 'Scheduled' && <Button onClick={() => setStatus('Postponed')}>Postpone</Button>}
          {['Scheduled', 'Postponed'].includes(s.status) && <Button variant="danger" onClick={() => setStatus('Cancelled')}>Cancel surgery</Button>}
          {s.status === 'Postponed' && <Button onClick={() => setStatus('Scheduled')}>Reinstate</Button>}
          {s.status === 'Scheduled' && <Button variant="primary" icon={Play} onClick={() => setStatus('In Progress')}>Start surgery</Button>}
          {s.status === 'In Progress' && <Button variant="primary" icon={CheckCircle2} onClick={() => setStatus('Completed', notes)}>Complete surgery</Button>}
        </>
      )}
    >
      {s && (
        <div className="grid grid-2">
          <div className="stack">
            <KV items={[
              ['Status', <StatusBadge status={s.status} />], ['Patient', <Link to={`/patients/${s.patient._id}`}>{fullName(s.patient)}</Link>], ['UHID', s.patient.uhid],
              ['IPD', s.admission?.admissionNo || 'Not admitted'], ['Theatre', s.theatre?.name], ['Scheduled', `${dateTime(s.scheduledAt)} · ${s.durationMins} min`],
              ['Surgeon', s.surgeon?.name], ['Anaesthetist', s.anaesthetist?.name], ['Anaesthesia', s.anaesthesiaType], ['Pre-op Dx', s.preOpDiagnosis],
              ['Charges', `${money(s.charges)}${s.billed ? ' (billed)' : ''}`], ['Started', dateTime(s.startedAt)], ['Ended', dateTime(s.endedAt)],
            ]}
            />
          </div>
          <div className="stack">
            <div>
              <div className="form-section-title row" style={{ gap: 6 }}><ClipboardCheck size={14} />WHO surgical safety checklist</div>
              {CHECKS.map(([k, label]) => (
                <label key={k} className="checkbox" style={{ display: 'flex', padding: '5px 0' }}>
                  <input type="checkbox" checked={Boolean(s.checklist?.[k])} disabled={!w || s.status !== 'Scheduled'} onChange={() => toggle(k)} />{label}
                </label>
              ))}
              <p className="small muted">Consent, site marking and anaesthesia clearance are mandatory before starting.</p>
            </div>
            {['In Progress', 'Completed'].includes(s.status) && (
              <>
                <Field label="Operative notes"><textarea className="textarea" rows={4} disabled={!w} value={notes.operativeNotes} onChange={(e) => setNotes({ ...notes, operativeNotes: e.target.value })} /></Field>
                <Field label="Post-operative instructions"><textarea className="textarea" disabled={!w} value={notes.postOpInstructions} onChange={(e) => setNotes({ ...notes, postOpInstructions: e.target.value })} /></Field>
                {w && <Button onClick={saveNotes}>Save notes</Button>}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
