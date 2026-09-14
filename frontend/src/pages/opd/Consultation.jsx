import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Save, CheckCircle2, Printer, Trash2, Plus, FlaskConical, ScanLine, AlertTriangle, History,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import {
  ageSex, date, fullName, initials, isoDate,
} from '../../lib/format.js';
import {
  Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Select, StatusBadge,
} from '../../components/ui.jsx';
import { MedicineSearch } from '../../components/pickers.jsx';
import Prescription from '../../components/Prescription.jsx';
import TestSelector from '../../components/TestSelector.jsx';

const FREQS = ['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', '1-1-1-1', '0-0-1 (HS)', 'SOS', 'Stat', 'Once a week'];
export default function Consultation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { data: enc, loading, error, reload, setData } = useFetch(`/encounters/${id}`);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [print, setPrint] = useState(false);
  const [order, setOrder] = useState(null);
  const [dxText, setDxText] = useState('');
  const past = useFetch(enc ? '/encounters' : null, { patient: enc?.patient?._id, limit: 6, status: 'Completed' });

  useEffect(() => {
    if (!enc) return;
    setForm({
      vitals: enc.vitals || {},
      chiefComplaint: enc.chiefComplaint || '',
      historyOfIllness: enc.historyOfIllness || '',
      pastHistory: enc.pastHistory || '',
      examination: enc.examination || '',
      diagnoses: enc.diagnoses || [],
      prescriptions: enc.prescriptions || [],
      advice: enc.advice || '',
      followUpDate: enc.followUpDate ? isoDate(enc.followUpDate) : '',
    });
  }, [enc]);

  if (loading && !enc) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!form) return <Loading />;
  const p = enc.patient;
  const readOnly = enc.status === 'Completed' || !can('opd', 'rw');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setV = (k, v) => setForm((f) => ({ ...f, vitals: { ...f.vitals, [k]: v === '' ? undefined : Number(v) } }));

  const payload = () => ({ ...form, followUpDate: form.followUpDate || null, prescriptions: form.prescriptions.map((m) => ({ ...m, medicine: m.medicine?._id || m.medicine })) });

  const save = async (silent) => {
    setBusy(true);
    try {
      await api.put(`/encounters/${id}`, payload());
      if (!silent) toast.success('Consultation saved');
      await reload();
      return true;
    } catch (e) { toast.error(e); return false; } finally { setBusy(false); }
  };

  const complete = async () => {
    if (!(await save(true))) return;
    try {
      await api.post(`/encounters/${id}/complete`);
      toast.success('Consultation completed');
      const fresh = await api.get(`/encounters/${id}`);
      setData(fresh);
      setPrint(true);
    } catch (e) { toast.error(e); }
  };

  const addDx = (code, description) => {
    if (!description.trim()) return;
    set('diagnoses', [...form.diagnoses, { code, description: description.trim(), type: 'Provisional' }]);
    setDxText('');
  };
  const addRx = (m) => set('prescriptions', [...form.prescriptions, {
    medicine: m._id ? { _id: m._id } : undefined,
    name: m._id ? `${m.name}${m.strength && !m.name.includes(m.strength.split(' ')[0]) ? ` ${m.strength}` : ''}` : m.name,
    dosage: m.form === 'Syrup' ? '5 ml' : ['Cream', 'Drops', 'Inhaler'].includes(m.form) ? 'As directed' : '1 tab',
    frequency: '1-0-1', duration: '5 days', route: m.form === 'Injection' ? 'IV' : ['Cream', 'Drops'].includes(m.form) ? 'Topical' : 'Oral', instructions: 'After food',
  }]);
  const updRx = (i, k, v) => set('prescriptions', form.prescriptions.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const v = form.vitals;

  return (
    <>
      <PageHeader
        crumbs={<><Link to="/opd">OPD</Link> / {enc.encounterNo}</>}
        title="Consultation"
        actions={(
          <>
            <Button icon={Printer} onClick={() => setPrint(true)}>Prescription</Button>
            {!readOnly && <Button icon={Save} loading={busy} onClick={() => save()}>Save draft</Button>}
            {!readOnly && <Button variant="primary" icon={CheckCircle2} onClick={complete}>Complete & print</Button>}
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
              <StatusBadge status={enc.status} />
              {enc.appointment?.tokenNo && <span className="badge primary plain">Token #{enc.appointment.tokenNo}</span>}
            </div>
            <div className="meta mt-8">
              <span>Age/Sex <b>{ageSex(p)}</b></span><span>Blood group <b>{p.bloodGroup}</b></span><span>Phone <b>{p.phone}</b></span>
              <span>Doctor <b>{enc.doctor?.name}</b></span><span>Date <b>{date(enc.createdAt)}</b></span>
              {p.chronicConditions?.length > 0 && <span>Chronic <b>{p.chronicConditions.join(', ')}</b></span>}
            </div>
          </div>
          {p.allergies?.length > 0 && <div className="alert danger"><AlertTriangle /><div><b>Allergies:</b> {p.allergies.join(', ')}</div></div>}
        </div>
      </div>

      <div className="grid grid-main-side">
        <div className="stack">
          <Card title="Vitals">
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              <Field label="BP systolic"><input className="input" type="number" disabled={readOnly} value={v.bpSystolic ?? ''} onChange={(e) => setV('bpSystolic', e.target.value)} placeholder="mmHg" /></Field>
              <Field label="BP diastolic"><input className="input" type="number" disabled={readOnly} value={v.bpDiastolic ?? ''} onChange={(e) => setV('bpDiastolic', e.target.value)} placeholder="mmHg" /></Field>
              <Field label="Pulse"><input className="input" type="number" disabled={readOnly} value={v.pulse ?? ''} onChange={(e) => setV('pulse', e.target.value)} placeholder="/min" /></Field>
              <Field label="Temp (°F)"><input className="input" type="number" step="0.1" disabled={readOnly} value={v.temperature ?? ''} onChange={(e) => setV('temperature', e.target.value)} /></Field>
              <Field label="SpO₂ (%)"><input className="input" type="number" disabled={readOnly} value={v.spo2 ?? ''} onChange={(e) => setV('spo2', e.target.value)} /></Field>
              <Field label="Resp. rate"><input className="input" type="number" disabled={readOnly} value={v.respRate ?? ''} onChange={(e) => setV('respRate', e.target.value)} placeholder="/min" /></Field>
              <Field label="Weight (kg)"><input className="input" type="number" step="0.1" disabled={readOnly} value={v.weight ?? ''} onChange={(e) => setV('weight', e.target.value)} /></Field>
              <Field label="Height (cm)"><input className="input" type="number" disabled={readOnly} value={v.height ?? ''} onChange={(e) => setV('height', e.target.value)} /></Field>
              <Field label="Blood sugar"><input className="input" type="number" disabled={readOnly} value={v.bloodSugar ?? ''} onChange={(e) => setV('bloodSugar', e.target.value)} placeholder="mg/dL" /></Field>
              <Field label="BMI"><input className="input" disabled value={v.weight && v.height ? (v.weight / ((v.height / 100) ** 2)).toFixed(1) : ''} /></Field>
            </div>
          </Card>

          <Card title="Clinical notes">
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Chief complaint" className="span-all"><input className="input" disabled={readOnly} value={form.chiefComplaint} onChange={(e) => set('chiefComplaint', e.target.value)} placeholder="e.g. Fever with chills for 3 days" /></Field>
              <Field label="History of present illness"><textarea className="textarea" disabled={readOnly} value={form.historyOfIllness} onChange={(e) => set('historyOfIllness', e.target.value)} /></Field>
              <Field label="Past / family history"><textarea className="textarea" disabled={readOnly} value={form.pastHistory} onChange={(e) => set('pastHistory', e.target.value)} /></Field>
              <Field label="Examination findings" className="span-all"><textarea className="textarea" disabled={readOnly} value={form.examination} onChange={(e) => set('examination', e.target.value)} /></Field>
            </div>
          </Card>

          <Card title="Diagnosis">
            {form.diagnoses.map((d, i) => (
              <div key={i} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span><span className="mono muted" style={{ minWidth: 60, display: 'inline-block' }}>{d.code || '-'}</span> <b>{d.description}</b></span>
                <div className="row">
                  <Select disabled={readOnly} value={d.type} onChange={(e) => set('diagnoses', form.diagnoses.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} options={['Provisional', 'Final']} style={{ width: 130 }} />
                  {!readOnly && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set('diagnoses', form.diagnoses.filter((_, j) => j !== i))} aria-label="Remove" />}
                </div>
              </div>
            ))}
            {!readOnly && (
              <>
                <div className="row mt-8">
                  <input className="input" style={{ flex: 1 }} placeholder="Type a diagnosis and press Enter" value={dxText} onChange={(e) => setDxText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDx('', dxText); } }} />
                  <Button icon={Plus} onClick={() => addDx('', dxText)}>Add</Button>
                </div>
              </>
            )}
          </Card>

          <Card title="Prescription">
            {!readOnly && <div className="mb-16"><MedicineSearch onPick={addRx} /></div>}
            {form.prescriptions.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Route</th><th>Instructions</th><th /></tr></thead>
                  <tbody>
                    {form.prescriptions.map((m, i) => (
                      <tr key={i}>
                        <td className="cell-main" style={{ minWidth: 160 }}>{m.name}</td>
                        <td><input className="input" disabled={readOnly} value={m.dosage || ''} onChange={(e) => updRx(i, 'dosage', e.target.value)} style={{ width: 90 }} /></td>
                        <td><input className="input" list="freqs" disabled={readOnly} value={m.frequency || ''} onChange={(e) => updRx(i, 'frequency', e.target.value)} style={{ width: 110 }} /></td>
                        <td><input className="input" disabled={readOnly} value={m.duration || ''} onChange={(e) => updRx(i, 'duration', e.target.value)} style={{ width: 90 }} /></td>
                        <td><Select disabled={readOnly} value={m.route || 'Oral'} onChange={(e) => updRx(i, 'route', e.target.value)} options={['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'Nasal', 'Rectal']} style={{ width: 110 }} /></td>
                        <td><input className="input" disabled={readOnly} value={m.instructions || ''} onChange={(e) => updRx(i, 'instructions', e.target.value)} /></td>
                        <td>{!readOnly && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set('prescriptions', form.prescriptions.filter((_, j) => j !== i))} aria-label="Remove" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="freqs">{FREQS.map((f) => <option key={f} value={f} />)}</datalist>
              </div>
            ) : <p className="muted">No medicines added.</p>}
          </Card>

          <Card title="Advice & follow-up">
            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
              <Field label="Advice / instructions"><textarea className="textarea" disabled={readOnly} value={form.advice} onChange={(e) => set('advice', e.target.value)} /></Field>
              <Field label="Follow-up date"><input type="date" className="input" disabled={readOnly} min={isoDate()} value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Investigations" actions={!readOnly && (
            <>
              {can('lab', 'rw') && <Button size="sm" icon={FlaskConical} onClick={() => setOrder('lab')}>Lab</Button>}
              {can('radiology', 'rw') && <Button size="sm" icon={ScanLine} onClick={() => setOrder('radiology')}>Imaging</Button>}
            </>
          )}
          >
            {enc.labOrders?.length ? enc.labOrders.map((o) => (
              <Link key={o._id} to={`/${o.category === 'lab' ? 'laboratory' : 'radiology'}/${o._id}`} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                <span><span className="mono small muted">{o.orderNo}</span><div>{o.items.map((i) => i.name).join(', ')}</div></span>
                <StatusBadge status={o.status} />
              </Link>
            )) : <p className="muted small">No investigations ordered.</p>}
          </Card>
          <Card title={<h3 className="row"><History size={15} />Previous visits</h3>}>
            {(past.data?.data || []).filter((e) => e._id !== id).length ? (
              <ul className="timeline">
                {past.data.data.filter((e) => e._id !== id).map((e) => (
                  <li key={e._id}>
                    <div className="when">{date(e.createdAt)} · {e.doctor?.name}</div>
                    <div className="strong small">{e.diagnoses?.map((d) => d.description).join(', ') || e.chiefComplaint || 'Consultation'}</div>
                    {e.prescriptions?.length > 0 && <div className="small muted">{e.prescriptions.map((m) => m.name).join(', ')}</div>}
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">No previous consultations.</p>}
          </Card>
        </div>
      </div>

      <Modal open={print} onClose={() => setPrint(false)} title="Prescription" size="lg" printable footer={<><Button onClick={() => setPrint(false)}>Close</Button>{enc.status === 'Completed' && <Button onClick={() => navigate('/opd')}>Back to queue</Button>}<Button variant="primary" icon={Printer} onClick={() => window.print()}>Print</Button></>}>
        <Prescription enc={{ ...enc, ...form, followUpDate: form.followUpDate || null }} />
      </Modal>
      <OrderModal category={order} encounter={enc} onClose={() => setOrder(null)} onDone={reload} />
    </>
  );
}

function OrderModal({ category, encounter, onClose, onDone }) {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [priority, setPriority] = useState('Routine');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTests([]); setNotes(''); setPriority('Routine'); }, [category]);
  const submit = async () => {
    setBusy(true);
    try {
      const o = await api.post('/lab-orders', { category, patient: encounter.patient._id, doctor: encounter.doctor._id, encounter: encounter._id, tests, priority, clinicalNotes: notes });
      toast.success(`Order ${o.orderNo} placed and billed`);
      onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={Boolean(category)} onClose={onClose} size="lg" title={category === 'lab' ? 'Order laboratory tests' : 'Order imaging studies'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!tests.length} loading={busy} onClick={submit}>Place order</Button></>}>
      {category && (
        <div className="stack">
          <TestSelector category={category} value={tests} onChange={setTests} />
          <div className="form-grid" style={{ gridTemplateColumns: '160px 1fr' }}>
            <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value)} options={['Routine', 'Urgent', 'STAT']} /></Field>
            <Field label="Clinical notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Relevant history for the lab / radiologist" /></Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
