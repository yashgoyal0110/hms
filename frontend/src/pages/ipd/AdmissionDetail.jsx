import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  NotebookPen, ArrowLeftRight, LogOut, Printer, FlaskConical, Scissors, Receipt,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import {
  ageSex, date, dateTime, fullName, initials, money,
} from '../../lib/format.js';
import {
  Button, Card, DataTable, ErrorBox, Field, KV, Loading, Modal, PageHeader, Select, StatusBadge, Tabs,
} from '../../components/ui.jsx';
import PrintDoc from '../../components/PrintDoc.jsx';
import { BedChooser } from './AdmitModal.jsx';

export default function AdmissionDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: a, loading, error, reload } = useFetch(`/admissions/${id}`);
  const [tab, setTab] = useState('notes');
  const [modal, setModal] = useState(null);

  if (loading && !a) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const p = a.patient;
  const active = a.status === 'Admitted';
  const w = can('ipd', 'rw') && active;
  const stay = Math.max(1, Math.round(((a.dischargedAt ? new Date(a.dischargedAt) : new Date()) - new Date(a.admittedAt)) / 86400000));
  const vitals = a.notes.filter((n) => n.vitals && Object.values(n.vitals).some((x) => x !== undefined && x !== null));

  return (
    <>
      <PageHeader
        crumbs={<><Link to="/ipd">IPD</Link> / {a.admissionNo}</>}
        title={`Admission ${a.admissionNo}`}
        actions={(
          <>
            {w && <Button icon={NotebookPen} onClick={() => setModal('note')}>Add note / vitals</Button>}
            {w && <Button icon={ArrowLeftRight} onClick={() => setModal('transfer')}>Transfer bed</Button>}
            {w && can('lab', 'rw') && <Button icon={FlaskConical} onClick={() => navigate(`/laboratory?new=1&patient=${p._id}`)}>Order tests</Button>}
            {w && can('ot', 'rw') && <Button icon={Scissors} onClick={() => navigate(`/ot?schedule=1&patient=${p._id}`)}>Schedule surgery</Button>}
            {!active && <Button icon={Printer} onClick={() => setModal('summary')}>Discharge summary</Button>}
            {w && <Button variant="primary" icon={LogOut} onClick={() => setModal('discharge')}>Discharge</Button>}
          </>
        )}
      />
      <div className="card mb-16">
        <div className="patient-banner">
          <span className="avatar">{initials(fullName(p))}</span>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ gap: 10 }}>
              <Link to={`/patients/${p._id}`} className="strong" style={{ fontSize: 15 }}>{fullName(p)}</Link>
              <span className="mono muted">{p.uhid}</span>
              <StatusBadge status={a.status} />
            </div>
            <div className="meta mt-8">
              <span>Age/Sex <b>{ageSex(p)}</b></span><span>Ward <b>{a.ward?.name}</b></span><span>Bed <b>{a.bedNumber}</b></span>
              <span>Consultant <b>{a.doctor?.name}</b></span><span>Admitted <b>{dateTime(a.admittedAt)}</b></span><span>Stay <b>{stay} day{stay > 1 ? 's' : ''}</b></span>
              {p.allergies?.length > 0 && <span>Allergies <b className="danger-text">{p.allergies.join(', ')}</b></span>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-main-side">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'notes', label: 'Clinical notes', count: a.notes.length }, { value: 'beds', label: 'Bed history' }, ...(a.dischargeSummary?.finalDiagnosis ? [{ value: 'dis', label: 'Discharge summary' }] : [])]} />
          {tab === 'notes' && (
            <Card>
              {a.notes.length ? (
                <ul className="timeline">
                  {[...a.notes].reverse().map((n) => (
                    <li key={n._id}>
                      <div className="when">{dateTime(n.at)} · {n.by?.name} · <span className="badge plain" style={{ height: 18 }}>{n.type}</span></div>
                      {n.text && <div style={{ marginTop: 3 }}>{n.text}</div>}
                      {n.vitals && Object.values(n.vitals).some(Boolean) && (
                        <div className="small muted" style={{ marginTop: 2 }}>
                          {[n.vitals.bpSystolic && `BP ${n.vitals.bpSystolic}/${n.vitals.bpDiastolic}`, n.vitals.pulse && `Pulse ${n.vitals.pulse}`, n.vitals.temperature && `Temp ${n.vitals.temperature}°F`, n.vitals.spo2 && `SpO₂ ${n.vitals.spo2}%`, n.vitals.respRate && `RR ${n.vitals.respRate}`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No notes recorded.</p>}
            </Card>
          )}
          {tab === 'beds' && (
            <Card flush>
              <DataTable
                rows={a.bedHistory}
                columns={[
                  { key: 'w', label: 'Ward', render: (b) => b.wardName },
                  { key: 'b', label: 'Bed', render: (b) => b.bedNumber },
                  { key: 'r', label: 'Rate / day', align: 'right', render: (b) => money(b.dailyRate) },
                  { key: 'f', label: 'From', render: (b) => dateTime(b.from) },
                  { key: 't', label: 'To', render: (b) => (b.to ? dateTime(b.to) : <span className="badge info">Current</span>) },
                ]}
              />
            </Card>
          )}
          {tab === 'dis' && <Card><SummaryView a={a} /></Card>}
        </div>
        <div className="stack">
          <Card title="Admission details">
            <KV items={[
              ['Type', a.admissionType], ['Department', a.department?.name], ['Reason', a.reason], ['Provisional Dx', a.provisionalDiagnosis],
              ['Expected discharge', date(a.expectedDischarge)], ['Attendant', a.attendant?.name ? `${a.attendant.name} (${a.attendant.relation || '-'}) ${a.attendant.phone || ''}` : ''],
              a.dischargedAt && ['Discharged', dateTime(a.dischargedAt)],
            ]}
            />
          </Card>
          {can('billing') && a.invoice && (
            <Card title="Billing" actions={<Button size="sm" icon={Receipt} onClick={() => navigate(`/billing/${a.invoice._id}`)}>Open bill</Button>}>
              <KV items={[
                ['Bill no.', <span className="mono">{a.invoice.invoiceNo}</span>], ['Charges to date', money(a.invoice.total)], ['Paid / advance', money(a.invoice.amountPaid)],
                ['Balance', <b className={a.invoice.balance > 0 ? 'danger-text' : 'success-text'}>{money(a.invoice.balance)}</b>],
                ['Bill status', <StatusBadge status={a.invoice.finalized ? a.invoice.status : 'Open'} />],
              ]}
              />
              {active && <p className="small muted mt-8">Room & nursing charges are added automatically at discharge.</p>}
            </Card>
          )}
        </div>
      </div>

      <NoteModal open={modal === 'note'} id={id} onClose={() => setModal(null)} onDone={reload} />
      <TransferModal open={modal === 'transfer'} a={a} onClose={() => setModal(null)} onDone={reload} />
      <DischargeModal open={modal === 'discharge'} a={a} onClose={() => setModal(null)} onDone={() => { reload(); setModal('summary'); }} />
      <Modal open={modal === 'summary'} onClose={() => setModal(null)} title="Discharge summary" size="lg" printable footer={<><Button onClick={() => setModal(null)}>Close</Button><Button variant="primary" icon={Printer} onClick={() => window.print()}>Print</Button></>}>
        <PrintDoc title="Discharge Summary">
          <div className="doc-meta">
            <div><span>Patient</span><b>{fullName(p)}</b> ({ageSex(p)})</div><div><span>UHID</span>{p.uhid}</div>
            <div><span>IPD No.</span>{a.admissionNo}</div><div><span>Ward / Bed</span>{a.ward?.name} / {a.bedNumber}</div>
            <div><span>Admitted on</span>{dateTime(a.admittedAt)}</div><div><span>Discharged on</span>{dateTime(a.dischargedAt)}</div>
            <div><span>Consultant</span>{a.doctor?.name}</div><div><span>Discharge type</span>{a.status}</div>
          </div>
          <SummaryView a={a} print />
          <div className="sig"><span>Patient / attendant signature</span><span>{a.doctor?.name}<br /><small>{a.doctor?.qualification}</small></span></div>
        </PrintDoc>
      </Modal>
    </>
  );
}

function SummaryView({ a, print }) {
  const s = a.dischargeSummary || {};
  const rows = [
    ['Reason for admission', a.reason], ['Final diagnosis', s.finalDiagnosis], ['Procedures', s.procedures], ['Treatment given', s.treatmentGiven],
    ['Condition at discharge', s.conditionAtDischarge], ['Discharge medication', s.medications], ['Follow-up', s.followUp], ['Instructions', s.instructions],
  ];
  if (print) {
    return <table><tbody>{rows.map(([k, v]) => <tr key={k}><th style={{ width: 180 }}>{k}</th><td style={{ whiteSpace: 'pre-wrap' }}>{v || '-'}</td></tr>)}</tbody></table>;
  }
  return <KV items={rows} />;
}

function NoteModal({ open, id, onClose, onDone }) {
  const toast = useToast();
  const [type, setType] = useState('Nursing');
  const [text, setText] = useState('');
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const vitals = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '').map(([k, x]) => [k, Number(x)]));
      await api.post(`/admissions/${id}/notes`, { type: Object.keys(vitals).length && !text ? 'Vitals' : type, text, vitals: Object.keys(vitals).length ? vitals : undefined });
      toast.success('Note added');
      setText(''); setV({}); onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const vi = (k, label) => <Field label={label}><input className="input" type="number" step="0.1" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>;
  return (
    <Modal open={open} onClose={onClose} title="Add clinical note" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save</Button></>}>
      <div className="stack">
        <Field label="Note type"><Select value={type} onChange={(e) => setType(e.target.value)} options={['Nursing', 'Doctor', 'Medication', 'Vitals']} /></Field>
        <Field label="Note"><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Observations, orders, medication administered…" /></Field>
        <div className="form-section-title">Vitals (optional)</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {vi('bpSystolic', 'BP systolic')}{vi('bpDiastolic', 'BP diastolic')}{vi('pulse', 'Pulse')}{vi('temperature', 'Temp (°F)')}{vi('spo2', 'SpO₂ (%)')}{vi('respRate', 'Resp. rate')}
        </div>
      </div>
    </Modal>
  );
}

function TransferModal({ open, a, onClose, onDone }) {
  const toast = useToast();
  const [ward, setWard] = useState('');
  const [bed, setBed] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/admissions/${a._id}/transfer`, { ward, bedNumber: bed, reason });
      toast.success(`Transferred to ${bed}`);
      onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Transfer to another bed" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!bed} loading={busy} onClick={submit}>Transfer</Button></>}>
      <div className="stack">
        <p className="muted">Currently in {a.ward?.name} / {a.bedNumber}. The previous bed will be marked for cleaning.</p>
        <BedChooser ward={ward} setWard={setWard} bed={bed} setBed={setBed} gender={a.patient?.gender} />
        <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shifted to ICU for monitoring" /></Field>
      </div>
    </Modal>
  );
}

function DischargeModal({ open, a, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState('Discharged');
  const [s, setS] = useState({ finalDiagnosis: a.provisionalDiagnosis || '', treatmentGiven: '', procedures: '', conditionAtDischarge: 'Stable', medications: '', followUp: 'Review in OPD after 7 days', instructions: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admissions/${a._id}/discharge`, { status, summary: s });
      toast.success(`Discharged. Final bill ${res.invoice.invoiceNo}: balance ${money(res.invoice.balance)}`);
      onClose(); onDone();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const b = (k) => ({ value: s[k], onChange: (e) => setS({ ...s, [k]: e.target.value }) });
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Discharge patient" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!s.finalDiagnosis} onClick={submit}>Confirm discharge</Button></>}>
      <div className="stack">
        <div className="alert info">Discharging finalises the IPD bill and adds room & nursing charges for the length of stay. The bed is released for cleaning.</div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Discharge type"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['Discharged', 'LAMA', 'Referred', 'Expired']} /></Field>
          <Field label="Condition at discharge"><input className="input" {...b('conditionAtDischarge')} /></Field>
          <Field label="Final diagnosis" required className="span-all"><input className="input" {...b('finalDiagnosis')} /></Field>
          <Field label="Procedures performed"><textarea className="textarea" {...b('procedures')} /></Field>
          <Field label="Treatment given"><textarea className="textarea" {...b('treatmentGiven')} /></Field>
          <Field label="Discharge medication"><textarea className="textarea" {...b('medications')} /></Field>
          <Field label="Instructions"><textarea className="textarea" {...b('instructions')} /></Field>
          <Field label="Follow-up" className="span-all"><input className="input" {...b('followUp')} /></Field>
        </div>
      </div>
    </Modal>
  );
}
