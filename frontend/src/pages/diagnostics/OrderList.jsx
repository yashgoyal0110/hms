import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useDebounced, useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import {
  ageSex, dateTime, fullName, money,
} from '../../lib/format.js';
import {
  Badge, Button, Card, DataTable, ErrorBox, Field, Modal, PageHeader, Pagination, Select, StatusBadge, Tabs,
} from '../../components/ui.jsx';
import { PatientPicker, StaffSelect } from '../../components/pickers.jsx';
import TestSelector from '../../components/TestSelector.jsx';

const PENDING = 'Ordered,Sample Collected,In Progress';

export default function OrderList({ category }) {
  const { can, role, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const statusFor = { pending: PENDING, completed: 'Completed', cancelled: 'Cancelled', all: '' };
  const orders = useFetch(tab !== 'catalogue' ? '/lab-orders' : null, { category, status: statusFor[tab], q: dq, priority, page, limit: 25 });
  const lab = category === 'lab';
  const base = lab ? '/laboratory' : '/radiology';

  return (
    <>
      <PageHeader
        title={lab ? 'Laboratory' : 'Radiology'}
        sub={lab ? 'Pathology orders, sample collection, result entry and reports' : 'Imaging requests, reporting and film release'}
        actions={can(category, 'rw') && <Button variant="primary" icon={Plus} onClick={() => setParams({ new: '1' })}>New order</Button>}
      />
      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setPage(1); }}
        tabs={[{ value: 'pending', label: 'Worklist' }, { value: 'completed', label: 'Reported' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All orders' }, { value: 'catalogue', label: lab ? 'Test catalogue' : 'Study catalogue' }]}
      />
      {tab === 'catalogue' ? <Catalogue category={category} /> : (
        <Card flush>
          <div className="card-header">
            <div className="filters">
              <input className="input search" placeholder="Search patient, UHID or order no." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="All priorities" options={['Routine', 'Urgent', 'STAT']} />
            </div>
          </div>
          <DataTable
            loading={orders.loading}
            rows={orders.data?.data}
            onRowClick={(o) => navigate(`${base}/${o._id}`)}
            empty={tab === 'pending' ? 'Worklist is clear' : 'No orders found'}
            columns={[
              { key: 'no', label: 'Order', render: (o) => <><span className="mono strong">{o.orderNo}</span><div className="cell-sub">{dateTime(o.createdAt)}</div></> },
              { key: 'p', label: 'Patient', render: (o) => <><div className="cell-main">{fullName(o.patient)}</div><div className="cell-sub">{o.patient?.uhid} · {ageSex(o.patient)}</div></> },
              { key: 't', label: lab ? 'Tests' : 'Studies', render: (o) => o.items.map((i) => i.name).join(', ') },
              { key: 'd', label: 'Referred by', render: (o) => o.doctor?.name || '-' },
              { key: 'pr', label: 'Priority', render: (o) => (o.priority === 'Routine' ? <span className="muted">Routine</span> : <StatusBadge status={o.priority} />) },
              { key: 's', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
          <Pagination page={orders.data?.page} pages={orders.data?.pages} total={orders.data?.total} onPage={setPage} />
        </Card>
      )}
      <NewOrder
        category={category}
        open={params.get('new') === '1'}
        presetPatientId={params.get('patient')}
        defaultDoctor={role === 'doctor' ? user._id : ''}
        onClose={() => setParams({}, { replace: true })}
        onDone={(o) => { toast.success(`Order ${o.orderNo} created and billed`); navigate(`${base}/${o._id}`); }}
      />
    </>
  );
}

function NewOrder({ category, open, onClose, onDone, presetPatientId, defaultDoctor }) {
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [tests, setTests] = useState([]);
  const [priority, setPriority] = useState('Routine');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && presetPatientId) api.get(`/patients/${presetPatientId}`).then((r) => setPatient(r.patient)).catch(() => {});
    if (!open) { setPatient(null); setTests([]); setError(null); setNotes(''); }
  }, [open, presetPatientId]);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const o = await api.post('/lab-orders', { category, patient: patient?._id, doctor: doctor || undefined, tests, priority, clinicalNotes: notes });
      onDone(o); onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={category === 'lab' ? 'New laboratory order' : 'New imaging order'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!patient || !tests.length} onClick={submit}>Create order</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
          <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
          <Field label="Referring doctor"><StaffSelect role="doctor" value={doctor} onChange={setDoctor} placeholder="Self / external" /></Field>
          <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value)} options={['Routine', 'Urgent', 'STAT']} /></Field>
        </div>
        <TestSelector category={category} value={tests} onChange={setTests} />
        <Field label="Clinical notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="small muted">Charges are billed automatically - to the running IPD bill for admitted patients, otherwise as a new invoice.</p>
      </div>
    </Modal>
  );
}

function Catalogue({ category }) {
  const { can } = useAuth();
  const { data, loading, reload } = useFetch('/lab-tests', { category, active: 'all', limit: 500 });
  const [edit, setEdit] = useState(null);
  return (
    <Card flush title={`${data?.total ?? ''} ${category === 'lab' ? 'tests' : 'studies'}`} actions={can(category, 'rw') && <Button size="sm" icon={Plus} onClick={() => setEdit({ category, code: '', name: '', section: '', sampleType: '', price: 0, turnaroundHours: 24, parameters: [], active: true })}>Add</Button>}>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'code', label: 'Code', render: (t) => <span className="mono">{t.code}</span> },
          { key: 'name', label: 'Name', render: (t) => <span className="cell-main">{t.name}</span> },
          { key: 'sec', label: 'Section', render: (t) => t.section },
          ...(category === 'lab' ? [{ key: 'sample', label: 'Sample', render: (t) => t.sampleType || '-' }, { key: 'par', label: 'Parameters', align: 'right', render: (t) => t.parameters.length }] : []),
          { key: 'tat', label: 'TAT', align: 'right', render: (t) => `${t.turnaroundHours} h` },
          { key: 'price', label: 'Price', align: 'right', render: (t) => money(t.price) },
          { key: 'st', label: 'Status', render: (t) => (t.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
          { key: 'x', label: '', className: 'actions-cell', render: (t) => can(category, 'rw') && <Button size="sm" icon={Pencil} onClick={() => setEdit(t)} aria-label="Edit" /> },
        ]}
      />
      <TestEditor test={edit} onClose={() => setEdit(null)} onDone={reload} />
    </Card>
  );
}

function TestEditor({ test, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(test ? JSON.parse(JSON.stringify(test)) : null); }, [test]);
  if (!f) return null;
  const b = (k, num) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value }) });
  const setP = (i, k, v) => setF({ ...f, parameters: f.parameters.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, parameters: f.parameters.map((p) => ({ ...p, low: p.low === '' ? undefined : p.low, high: p.high === '' ? undefined : p.high })) };
      if (f._id) await api.put(`/lab-tests/${f._id}`, body); else await api.post('/lab-tests', body);
      toast.success('Catalogue updated'); onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title={f._id ? `Edit ${f.name}` : 'Add to catalogue'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Code" required><input className="input" {...b('code')} disabled={Boolean(f._id)} /></Field>
        <Field label="Name" required className="span-2"><input className="input" {...b('name')} /></Field>
        <Field label="Section" required><input className="input" {...b('section')} placeholder={f.category === 'lab' ? 'e.g. Biochemistry' : 'e.g. CT Scan'} /></Field>
        {f.category === 'lab' && <Field label="Sample type"><input className="input" {...b('sampleType')} /></Field>}
        <Field label="Price" required><input type="number" className="input" {...b('price', true)} /></Field>
        <Field label="Turnaround (hours)"><input type="number" className="input" {...b('turnaroundHours', true)} /></Field>
        <Field label="Status"><Select value={f.active ? 'true' : 'false'} onChange={(e) => setF({ ...f, active: e.target.value === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} /></Field>
      </div>
      {f.category === 'lab' && (
        <>
          <div className="form-section-title mt-16">Result parameters</div>
          <table className="table">
            <thead><tr><th>Parameter</th><th>Unit</th><th>Reference range (text)</th><th>Low</th><th>High</th><th /></tr></thead>
            <tbody>
              {f.parameters.map((p, i) => (
                <tr key={i}>
                  <td><input className="input" value={p.name || ''} onChange={(e) => setP(i, 'name', e.target.value)} /></td>
                  <td><input className="input" value={p.unit || ''} onChange={(e) => setP(i, 'unit', e.target.value)} style={{ width: 90 }} /></td>
                  <td><input className="input" value={p.refRange || ''} onChange={(e) => setP(i, 'refRange', e.target.value)} /></td>
                  <td><input className="input" type="number" step="any" value={p.low ?? ''} onChange={(e) => setP(i, 'low', e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 80 }} /></td>
                  <td><input className="input" type="number" step="any" value={p.high ?? ''} onChange={(e) => setP(i, 'high', e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 80 }} /></td>
                  <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setF({ ...f, parameters: f.parameters.filter((_, j) => j !== i) })} aria-label="Remove" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button size="sm" icon={Plus} className="mt-8" onClick={() => setF({ ...f, parameters: [...f.parameters, { name: '', unit: '', refRange: '' }] })}>Add parameter</Button>
          <p className="small muted mt-8">Low / high limits are used to flag results automatically (H / L, and Critical beyond 2× / 0.5×).</p>
        </>
      )}
    </Modal>
  );
}
