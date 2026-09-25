import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Trash2, PackagePlus, Pencil, ShoppingCart, Eye,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useDebounced, useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  ageSex, date, dateTime, fullName, isoDate, medLabel, money,
} from '../lib/format.js';
import {
  Badge, Button, Card, DataTable, ErrorBox, Field, KV, Modal, PageHeader, Pagination, Select, Stat, StatusBadge, Tabs,
} from '../components/ui.jsx';
import { MedicineSearch, PatientPicker } from '../components/pickers.jsx';

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Infusion', 'Ointment', 'Cream', 'Drops', 'Inhaler', 'Powder', 'Other'];

export default function Pharmacy() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (can('pharmacy', 'rw') ? 'dispense' : 'stock');
  const [rx, setRx] = useState(null);
  const alerts = useFetch('/pharmacy/alerts');
  const setTab = (t) => setParams({ tab: t });

  return (
    <>
      <PageHeader title="Pharmacy" sub="Dispensing, stock by batch, expiry tracking and sales" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ...(can('pharmacy', 'rw') ? [{ value: 'dispense', label: 'Dispense' }, { value: 'rx', label: 'Pending prescriptions' }] : []),
          { value: 'stock', label: 'Medicines & stock' },
          { value: 'alerts', label: 'Alerts', count: alerts.data ? alerts.data.lowStock.length + alerts.data.expiring.length : undefined },
          { value: 'sales', label: 'Sales register' },
        ]}
      />
      {tab === 'dispense' && <Dispense rx={rx} clearRx={() => setRx(null)} onDone={alerts.reload} />}
      {tab === 'rx' && <PendingRx onPick={(e) => { setRx(e); setTab('dispense'); }} />}
      {tab === 'stock' && <Stock />}
      {tab === 'alerts' && <Alerts data={alerts.data} reload={alerts.reload} />}
      {tab === 'sales' && <Sales />}
    </>
  );
}

function guessQty(m) {
  const freq = String(m.frequency || '');
  const perDay = freq.includes('-') ? freq.split(/[- ]/).slice(0, 4).map(Number).filter((n) => !Number.isNaN(n)).reduce((a, b) => a + b, 0) : 1;
  const days = parseInt(m.duration, 10) || 1;
  const med = m.medicine;
  if (med && !['Tablet', 'Capsule'].includes(med.form)) return 1;
  return Math.max(1, (perDay || 1) * days);
}

function Dispense({ rx, clearRx, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [lines, setLines] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!rx) return;
    setPatient(rx.patient);
    setLines(rx.prescriptions.filter((m) => m.medicine?._id).map((m) => ({
      medicine: m.medicine._id, name: medLabel(m.medicine), mrp: m.medicine.mrp, stock: m.medicine.stock, quantity: guessQty(m), note: `${m.dosage || ''} ${m.frequency || ''} × ${m.duration || ''}`,
    })));
  }, [rx]);

  const add = (m) => {
    if (!m._id) return;
    if (lines.some((l) => l.medicine === m._id)) { toast.info(`${m.name} is already in the list`); return; }
    setLines([...lines, { medicine: m._id, name: medLabel(m), mrp: m.mrp, stock: m.stock, quantity: 1 }]);
  };
  const subtotal = lines.reduce((s, l) => s + l.mrp * (Number(l.quantity) || 0), 0);
  const net = Math.max(0, subtotal - (Number(discount) || 0));
  const unmatched = rx ? rx.prescriptions.filter((m) => !m.medicine?._id) : [];

  const reset = () => { setPatient(null); setLines([]); setDiscount(0); setReference(''); setError(null); clearRx(); };
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.post('/pharmacy/dispense', {
        patient: patient._id, encounter: rx?._id, discount: Number(discount) || 0,
        items: lines.map((l) => ({ medicine: l.medicine, quantity: Number(l.quantity) })),
        payment: { mode, reference },
      });
      setResult(res);
      toast.success(res.billedToIpd ? 'Dispensed and added to the IPD bill' : `Dispensed - ${res.invoice.invoiceNo}`);
      reset();
      onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-main-side">
      <Card title="Dispense medicines" actions={rx && <Badge tone="info">From prescription {rx.encounterNo}</Badge>}>
        <div className="stack">
          <ErrorBox error={error} />
          <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} /></Field>
          <Field label="Add medicine"><MedicineSearch onPick={add} inStock placeholder="Search in-stock medicines" /></Field>
          {unmatched.length > 0 && <div className="alert warning">Not in pharmacy master (dispense manually or substitute): {unmatched.map((m) => m.name).join(', ')}</div>}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Medicine</th><th className="num">Stock</th><th className="num">MRP</th><th style={{ width: 100 }}>Qty</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {!lines.length && <tr><td colSpan={6} className="empty">No medicines added</td></tr>}
                {lines.map((l, i) => (
                  <tr key={l.medicine}>
                    <td><div className="cell-main">{l.name}</div>{l.note && <div className="cell-sub">{l.note}</div>}</td>
                    <td className={`num ${Number(l.quantity) > l.stock ? 'danger-text strong' : ''}`}>{l.stock}</td>
                    <td className="num">{money(l.mrp)}</td>
                    <td><input className="input" type="number" min="1" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} /></td>
                    <td className="num">{money(l.mrp * (Number(l.quantity) || 0))}</td>
                    <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
      <Card title="Payment">
        <div className="stack">
          <KV items={[['Items', lines.length], ['Subtotal', money(subtotal)]]} />
          <Field label="Discount"><input className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <div className="row between" style={{ fontSize: 18 }}><b>Net payable</b><b className="mono">{money(net)}</b></div>
          <Field label="Payment mode"><Select value={mode} onChange={(e) => setMode(e.target.value)} options={['Cash', 'Card', 'UPI', 'Bank Transfer']} /></Field>
          <Field label="Reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / card ref (optional)" /></Field>
          <p className="small muted">For admitted patients the medicines are added to the running IPD bill instead of being collected here.</p>
          <Button variant="primary" icon={ShoppingCart} loading={busy} disabled={!patient || !lines.length} onClick={submit} style={{ height: 40 }}>Dispense & bill</Button>
          {(lines.length > 0 || patient) && <Button onClick={reset}>Clear</Button>}
          {result && (
            <div className="alert success">
              <div>
                {result.billedToIpd ? 'Added to IPD bill ' : 'Invoice '}<b>{result.invoice.invoiceNo}</b>{result.receiptNo ? ` · Receipt ${result.receiptNo}` : ''}
                <div className="mt-8"><Button size="sm" onClick={() => navigate(`/billing/${result.invoice._id}`)}>View / print bill</Button></div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PendingRx({ onPick }) {
  const { data, loading } = useFetch('/pharmacy/prescriptions', { date: isoDate() });
  return (
    <Card flush title="Prescriptions awaiting dispensing (last 3 days)">
      <DataTable
        loading={loading}
        rows={data}
        empty="No pending prescriptions"
        columns={[
          { key: 'at', label: 'Prescribed', render: (e) => dateTime(e.createdAt) },
          { key: 'p', label: 'Patient', render: (e) => <><div className="cell-main">{fullName(e.patient)}</div><div className="cell-sub">{e.patient?.uhid} · {ageSex(e.patient)}</div></> },
          { key: 'd', label: 'Doctor', render: (e) => e.doctor?.name },
          { key: 'm', label: 'Medicines', render: (e) => e.prescriptions.map((m) => m.name).join(', ') },
          { key: 'x', label: '', className: 'actions-cell', render: (e) => <Button size="sm" variant="primary" onClick={() => onPick(e)}>Dispense</Button> },
        ]}
      />
    </Card>
  );
}

function Stock() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, reload } = useFetch('/pharmacy/medicines', { q: dq, stock, page, limit: 25 });
  const [edit, setEdit] = useState(null);
  const [receive, setReceive] = useState(null);
  const [view, setView] = useState(null);
  return (
    <Card flush>
      <div className="card-header">
        <div className="filters">
          <input className="input search" placeholder="Search brand, generic, code or manufacturer" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }} placeholder="All stock levels" options={[{ value: 'low', label: 'At / below reorder level' }, { value: 'out', label: 'Out of stock' }]} />
        </div>
        {can('pharmacy', 'rw') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ name: '', genericName: '', form: 'Tablet', strength: '', manufacturer: '', category: '', schedule: 'H', mrp: 0, gstRate: 12, reorderLevel: 50, rack: '' })}>Add medicine</Button>}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'code', label: 'Code', render: (m) => <span className="mono small">{m.code}</span> },
          { key: 'n', label: 'Medicine', render: (m) => <><div className="cell-main">{m.name} <span className="muted small">{m.strength}</span></div><div className="cell-sub">{m.genericName} · {m.form} · {m.manufacturer}</div></> },
          { key: 'sch', label: 'Schedule', render: (m) => m.schedule },
          { key: 'rack', label: 'Rack', render: (m) => m.rack || '-' },
          { key: 'mrp', label: 'MRP', align: 'right', render: (m) => money(m.mrp) },
          { key: 'stock', label: 'Stock', align: 'right', render: (m) => <b className={m.stock === 0 ? 'danger-text' : m.stock <= m.reorderLevel ? 'warning-text' : ''}>{m.stock}</b> },
          { key: 'ro', label: 'Reorder at', align: 'right', render: (m) => m.reorderLevel },
          { key: 's', label: 'Status', render: (m) => <StatusBadge status={m.stock === 0 ? 'Out of Stock' : m.stock <= m.reorderLevel ? 'Low Stock' : 'In Stock'} /> },
          {
            key: 'x', label: '', className: 'actions-cell',
            render: (m) => (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button size="sm" icon={Eye} onClick={() => setView(m._id)} aria-label="Batches" />
                {can('pharmacy', 'rw') && <Button size="sm" icon={PackagePlus} onClick={() => setReceive(m)}>Receive</Button>}
                {can('pharmacy', 'rw') && <Button size="sm" icon={Pencil} onClick={() => setEdit(m)} aria-label="Edit" />}
              </div>
            ),
          },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      <MedicineEditor med={edit} onClose={() => setEdit(null)} onDone={reload} />
      <ReceiveStock med={receive} onClose={() => setReceive(null)} onDone={reload} />
      <MedicineView id={view} onClose={() => setView(null)} onChange={reload} />
    </Card>
  );
}

function MedicineEditor({ med, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(med ? { ...med } : null), [med]);
  if (!f) return null;
  const b = (k, num) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value }) });
  const save = async () => {
    setBusy(true);
    try {
      if (f._id) await api.put(`/pharmacy/medicines/${f._id}`, f); else await api.post('/pharmacy/medicines', f);
      toast.success('Medicine saved'); onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={f._id ? `Edit ${f.name}` : 'Add medicine'} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Brand name" required className="span-2"><input className="input" {...b('name')} /></Field>
        <Field label="Generic name"><input className="input" {...b('genericName')} /></Field>
        <Field label="Form"><Select {...b('form')} options={FORMS} /></Field>
        <Field label="Strength"><input className="input" {...b('strength')} placeholder="e.g. 500 mg" /></Field>
        <Field label="Manufacturer"><input className="input" {...b('manufacturer')} /></Field>
        <Field label="Category"><input className="input" {...b('category')} placeholder="e.g. Antibiotic" /></Field>
        <Field label="Schedule"><Select {...b('schedule')} options={['OTC', 'H', 'H1', 'X', 'G']} /></Field>
        <Field label="MRP (per unit)"><input className="input" type="number" step="0.01" {...b('mrp', true)} /></Field>
        <Field label="GST %"><input className="input" type="number" {...b('gstRate', true)} /></Field>
        <Field label="Reorder level"><input className="input" type="number" {...b('reorderLevel', true)} /></Field>
        <Field label="Rack / bin"><input className="input" {...b('rack')} /></Field>
      </div>
    </Modal>
  );
}

function ReceiveStock({ med, onClose, onDone }) {
  const toast = useToast();
  const suppliers = useFetch(med ? '/suppliers' : null, { limit: 200, active: 'true' });
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (med) setF({ batchNo: '', expiryDate: '', quantity: '', purchasePrice: '', mrp: med.mrp, supplier: '' }); }, [med]);
  if (!med) return null;
  const b = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/pharmacy/medicines/${med._id}/batches`, { ...f, quantity: Number(f.quantity), purchasePrice: Number(f.purchasePrice) || 0, mrp: Number(f.mrp) });
      toast.success(`Stock received for ${med.name}`); onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Receive stock - ${med.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Add to stock</Button></>}>
      <div className="form-grid">
        <Field label="Batch number" required><input className="input" {...b('batchNo')} /></Field>
        <Field label="Expiry date" required><input className="input" type="date" min={isoDate()} {...b('expiryDate')} /></Field>
        <Field label="Quantity" required><input className="input" type="number" min="1" {...b('quantity')} /></Field>
        <Field label="Purchase price / unit"><input className="input" type="number" step="0.01" {...b('purchasePrice')} /></Field>
        <Field label="MRP / unit"><input className="input" type="number" step="0.01" {...b('mrp')} /></Field>
        <Field label="Supplier"><Select {...b('supplier')} placeholder="-" options={(suppliers.data?.data || []).map((s) => ({ value: s._id, label: s.name }))} /></Field>
      </div>
    </Modal>
  );
}

function MedicineView({ id, onClose, onChange }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, reload } = useFetch(id ? `/pharmacy/medicines/${id}` : null);
  const [adj, setAdj] = useState(null);
  const submitAdjust = async () => {
    try {
      await api.post(`/pharmacy/medicines/${id}/adjust`, { batchId: adj.batch._id, quantity: Number(adj.quantity), reason: adj.reason, note: adj.note });
      toast.success('Stock adjusted'); setAdj(null); reload(); onChange();
    } catch (e) { toast.error(e); }
  };
  if (!id) return null;
  const m = data?.medicine;
  return (
    <Modal open onClose={onClose} title={m ? `${m.name} ${m.strength || ''}` : 'Medicine'} size="xl">
      {m && (
        <div className="stack">
          <KV items={[['Generic', m.genericName], ['Form', m.form], ['Manufacturer', m.manufacturer], ['Total stock', m.stock], ['MRP', money(m.mrp)]]} />
          <div className="form-section-title">Batches</div>
          <DataTable
            rows={m.batches}
            columns={[
              { key: 'b', label: 'Batch', render: (b) => <span className="mono">{b.batchNo}</span> },
              { key: 'e', label: 'Expiry', render: (b) => <span className={new Date(b.expiryDate) < new Date(Date.now() + 90 * 86400000) ? 'danger-text strong' : ''}>{date(b.expiryDate)}</span> },
              { key: 'q', label: 'Qty', align: 'right', render: (b) => b.quantity },
              { key: 'pp', label: 'Cost', align: 'right', render: (b) => money(b.purchasePrice) },
              { key: 'mrp', label: 'MRP', align: 'right', render: (b) => money(b.mrp) },
              { key: 's', label: 'Supplier', render: (b) => b.supplier?.name || '-' },
              { key: 'r', label: 'Received', render: (b) => date(b.receivedAt) },
              {
                key: 'x', label: '', className: 'actions-cell',
                render: (b) => can('pharmacy', 'rw') && (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" onClick={() => setAdj({ batch: b, quantity: '', reason: 'Physical count', note: '' })}>Adjust</Button>
                    {b.quantity > 0 && new Date(b.expiryDate) < new Date() && <Button size="sm" variant="danger" onClick={() => setAdj({ batch: b, quantity: -b.quantity, reason: 'Expired', note: 'Expired stock written off' })}>Write off</Button>}
                  </div>
                ),
              },
            ]}
          />
          <div className="form-section-title">Recent stock movements</div>
          <DataTable
            rows={data.movements}
            columns={[
              { key: 'd', label: 'Date', render: (x) => dateTime(x.createdAt) },
              { key: 't', label: 'Type', render: (x) => x.type },
              { key: 'q', label: 'Qty', align: 'right', render: (x) => <span className={x.quantity < 0 ? 'danger-text' : 'success-text'}>{x.quantity > 0 ? '+' : ''}{x.quantity}</span> },
              { key: 'b', label: 'Batch', render: (x) => x.batchNo },
              { key: 'r', label: 'Reference', render: (x) => x.reference || x.note },
              { key: 'u', label: 'By', render: (x) => x.by?.name },
            ]}
          />
        </div>
      )}
      <Modal open={Boolean(adj)} onClose={() => setAdj(null)} title={`Adjust batch ${adj?.batch.batchNo || ''}`} footer={<><Button onClick={() => setAdj(null)}>Cancel</Button><Button variant="primary" onClick={submitAdjust} disabled={!Number(adj?.quantity)}>Save adjustment</Button></>}>
        {adj && (
          <div className="form-grid">
            <Field label="Quantity change" hint={`Current ${adj.batch.quantity}. Use a negative number to reduce.`}><input className="input" type="number" value={adj.quantity} onChange={(e) => setAdj({ ...adj, quantity: e.target.value })} /></Field>
            <Field label="Reason"><Select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} options={['Physical count', 'Damaged', 'Expired', 'Returned to supplier', 'Other']} /></Field>
            <Field label="Note" className="span-all"><input className="input" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Modal>
  );
}

function Alerts({ data, reload }) {
  const { can } = useAuth();
  const toast = useToast();
  const expired = useMemo(() => (data?.expiring || []).filter((b) => new Date(b.expiryDate) < new Date()), [data]);
  if (!data) return null;
  const writeOff = async (b) => {
    try { await api.post(`/pharmacy/medicines/${b._id}/adjust`, { batchId: b.batchId, quantity: -b.quantity, reason: 'Expired' }); toast.success(`${b.name} batch ${b.batchNo} written off`); reload(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack">
      <div className="grid grid-3">
        <Stat label="At or below reorder level" value={data.lowStock.length} tone={data.lowStock.length ? 'warning' : ''} />
        <Stat label="Batches expiring in 90 days" value={data.expiring.length - expired.length} tone="warning" />
        <Stat label="Expired batches in stock" value={expired.length} tone={expired.length ? 'danger' : ''} />
      </div>
      <div className="grid grid-2">
        <Card flush title="Low stock - reorder required">
          <DataTable
            rows={data.lowStock}
            empty="All medicines are above reorder level"
            columns={[
              { key: 'n', label: 'Medicine', render: (m) => <><div className="cell-main">{m.name}</div><div className="cell-sub">{m.code} · {m.form}</div></> },
              { key: 's', label: 'Stock', align: 'right', render: (m) => <b className={m.stock ? 'warning-text' : 'danger-text'}>{m.stock}</b> },
              { key: 'r', label: 'Reorder at', align: 'right', render: (m) => m.reorderLevel },
            ]}
          />
        </Card>
        <Card flush title="Expiring & expired batches">
          <DataTable
            rows={data.expiring}
            rowKey="batchId"
            empty="No batches expiring soon"
            columns={[
              { key: 'n', label: 'Medicine', render: (b) => <><div className="cell-main">{b.name}</div><div className="cell-sub mono">{b.batchNo}</div></> },
              { key: 'e', label: 'Expiry', render: (b) => <span className={new Date(b.expiryDate) < new Date() ? 'danger-text strong' : 'warning-text'}>{date(b.expiryDate)}</span> },
              { key: 'q', label: 'Qty', align: 'right', render: (b) => b.quantity },
              { key: 'x', label: '', className: 'actions-cell', render: (b) => can('pharmacy', 'rw') && new Date(b.expiryDate) < new Date() && <Button size="sm" variant="danger" onClick={() => writeOff(b)}>Write off</Button> },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function Sales() {
  const navigate = useNavigate();
  const [day, setDay] = useState(isoDate());
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch('/pharmacy/sales', { date: day, page, limit: 25 });
  const total = (data?.data || []).reduce((s, i) => s + i.total, 0);
  return (
    <Card flush>
      <div className="card-header">
        <input type="date" className="input" style={{ width: 170 }} value={day} onChange={(e) => { setDay(e.target.value); setPage(1); }} />
        <span className="small">Page total <b>{money(total)}</b></span>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={(i) => navigate(`/billing/${i._id}`)}
        empty="No pharmacy sales on this date"
        columns={[
          { key: 'n', label: 'Bill', render: (i) => <span className="mono">{i.invoiceNo}</span> },
          { key: 't', label: 'Time', render: (i) => dateTime(i.createdAt) },
          { key: 'p', label: 'Patient', render: (i) => <>{fullName(i.patient)}<div className="cell-sub">{i.patient?.uhid}</div></> },
          { key: 'items', label: 'Items', align: 'right', render: (i) => i.items.length },
          { key: 'total', label: 'Amount', align: 'right', render: (i) => money(i.total) },
          { key: 's', label: 'Status', render: (i) => <StatusBadge status={i.status} /> },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
    </Card>
  );
}
