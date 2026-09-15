import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import {
  ageSex, dateTime, fullName, isoDate, slot12, time,
} from '../../lib/format.js';
import {
  Button, Card, DataTable, ErrorBox, Field, Modal, PageHeader, Pagination, Select, StatusBadge, Tabs,
} from '../../components/ui.jsx';
import { PatientPicker, StaffSelect } from '../../components/pickers.jsx';

export default function OpdDesk() {
  const { role, user, can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [doctor, setDoctor] = useState(role === 'doctor' ? user._id : '');
  const [tab, setTab] = useState('queue');
  const [page, setPage] = useState(1);
  const [day, setDay] = useState(isoDate());
  const [walkIn, setWalkIn] = useState(false);
  const queue = useFetch('/appointments', { date: isoDate(), doctor, status: 'Checked-in,In-consultation,Scheduled', limit: 200 });
  const history = useFetch(tab === 'history' ? '/encounters' : null, { doctor, date: day, page, limit: 25 });

  const start = async (a) => {
    try {
      if (a.status === 'In-consultation' && a.encounter) return navigate(`/opd/${a.encounter}`);
      const res = await api.post(`/appointments/${a._id}/status`, { status: 'In-consultation' });
      navigate(`/opd/${res.encounter}`);
    } catch (e) { toast.error(e); }
    return null;
  };

  const rows = (queue.data?.data || []).sort((x, y) => {
    const order = { 'In-consultation': 0, 'Checked-in': 1, Scheduled: 2 };
    return order[x.status] - order[y.status] || (x.tokenNo || 999) - (y.tokenNo || 999) || x.timeSlot.localeCompare(y.timeSlot);
  });

  return (
    <>
      <PageHeader
        title="OPD Consultations"
        sub="Consultation desk - patient queue, clinical notes and prescriptions"
        actions={can('opd', 'rw') && <Button variant="primary" icon={Plus} onClick={() => setWalkIn(true)}>New consultation</Button>}
      />
      <Card flush>
        <div className="card-header">
          <div className="filters">
            <StaffSelect role="doctor" value={doctor} onChange={setDoctor} includeAll />
            {tab === 'history' && <input type="date" className="input" value={day} onChange={(e) => { setDay(e.target.value); setPage(1); }} />}
          </div>
          <Button size="sm" icon={RefreshCw} onClick={() => { queue.reload(); history.reload(); }} aria-label="Refresh" />
        </div>
        <div style={{ padding: '0 16px' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'queue', label: "Today's queue", count: rows.length }, { value: 'history', label: 'Consultation register' }]} />
        </div>
        {tab === 'queue' ? (
          <DataTable
            loading={queue.loading}
            rows={rows}
            empty="No patients in the queue"
            columns={[
              { key: 'tok', label: 'Token', render: (a) => (a.tokenNo ? <b className="mono">#{a.tokenNo}</b> : <span className="muted">-</span>) },
              { key: 'slot', label: 'Slot', render: (a) => slot12(a.timeSlot) },
              { key: 'p', label: 'Patient', render: (a) => <><div className="cell-main">{fullName(a.patient)}</div><div className="cell-sub">{a.patient?.uhid} · {ageSex(a.patient)}</div></> },
              { key: 'd', label: 'Doctor', render: (a) => a.doctor?.name },
              { key: 'r', label: 'Reason', render: (a) => a.reason || '-' },
              { key: 'w', label: 'Checked in', render: (a) => (a.checkedInAt ? time(a.checkedInAt) : '-') },
              { key: 's', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
              {
                key: 'x', label: '', className: 'actions-cell',
                render: (a) => can('opd', 'rw') && a.status !== 'Scheduled' && (
                  <Button size="sm" variant={a.status === 'In-consultation' ? '' : 'primary'} onClick={() => start(a)}>{a.status === 'In-consultation' ? 'Resume' : 'Start consultation'}</Button>
                ),
              },
            ]}
          />
        ) : (
          <>
            <DataTable
              loading={history.loading}
              rows={history.data?.data}
              onRowClick={(e) => navigate(`/opd/${e._id}`)}
              columns={[
                { key: 'no', label: 'Visit No.', render: (e) => <span className="mono">{e.encounterNo}</span> },
                { key: 'at', label: 'Time', render: (e) => dateTime(e.createdAt) },
                { key: 'p', label: 'Patient', render: (e) => <><div className="cell-main">{fullName(e.patient)}</div><div className="cell-sub">{e.patient?.uhid}</div></> },
                { key: 'd', label: 'Doctor', render: (e) => e.doctor?.name },
                { key: 'dx', label: 'Diagnosis', render: (e) => e.diagnoses?.map((d) => d.description).join(', ') || '-' },
                { key: 's', label: 'Status', render: (e) => <StatusBadge status={e.status} /> },
              ]}
            />
            <Pagination page={history.data?.page} pages={history.data?.pages} total={history.data?.total} onPage={setPage} />
          </>
        )}
      </Card>
      <WalkIn open={walkIn} onClose={() => setWalkIn(false)} defaultDoctor={role === 'doctor' ? user._id : ''} onCreated={(e) => navigate(`/opd/${e._id}`)} />
    </>
  );
}

function WalkIn({ open, onClose, onCreated, defaultDoctor }) {
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [type, setType] = useState('OPD');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const e = await api.post('/encounters', { patient: patient?._id, doctor, type });
      onCreated(e);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New consultation" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!patient || !doctor} onClick={submit}>Start</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <p className="muted small">Use this for emergency or in-patient reviews that are not linked to an appointment. For regular OPD visits, book and check in the appointment first so that a token and consultation bill are generated.</p>
        <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
        <Field label="Doctor" required><StaffSelect role="doctor" value={doctor} onChange={setDoctor} /></Field>
        <Field label="Encounter type"><Select value={type} onChange={(e) => setType(e.target.value)} options={['OPD', 'Emergency', 'IPD']} /></Field>
      </div>
    </Modal>
  );
}
