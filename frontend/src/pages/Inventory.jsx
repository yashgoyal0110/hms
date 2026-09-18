import { useEffect, useState } from 'react';
import {
  Plus, Pencil, ArrowDownToLine, ArrowUpFromLine, Trash2, Truck,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useDebounced, useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  date, dateTime, isoDate, money,
} from '../lib/format.js';
import {
  Badge, Button, Card, DataTable, ErrorBox, Field, KV, Modal, PageHeader, Pagination, Select, StatusBadge, Tabs,
} from '../components/ui.jsx';

const CATS = ['Consumable', 'Surgical', 'Linen', 'Equipment', 'Laboratory', 'Housekeeping', 'Stationery', 'Other'];

export default function Inventory() {
  const [tab, setTab] = useState('items');
  return (
    <>
      <PageHeader title="Inventory & Purchase" sub="Central store, departmental issues, suppliers and purchase orders" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'items', label: 'Store items' }, { value: 'po', label: 'Purchase orders' }, { value: 'suppliers', label: 'Suppliers' }]} />
      {tab === 'items' && <Items />}
      {tab === 'po' && <PurchaseOrders />}
      {tab === 'suppliers' && <Suppliers />}
    </>
  );
}

function Items() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, reload } = useFetch('/inventory/items', { q: dq, category, stock, page, limit: 25 });
  const [edit, setEdit] = useState(null);
  const [move, setMove] = useState(null);
  const w = can('inventory', 'rw');
  return (
    <Card flush>
      <div className="card-header">
        <div className="filters">
          <input className="input search" placeholder="Search item, code or location" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="All categories" options={CATS} />
          <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }} placeholder="All stock levels" options={[{ value: 'low', label: 'At / below reorder level' }]} />
        </div>
        {w && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ name: '', category: 'Consumable', unit: 'Nos', quantity: 0, reorderLevel: 10, unitCost: 0, location: 'Central Store' })}>Add item</Button>}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'c', label: 'Code', render: (i) => <span className="mono small">{i.code}</span> },
          { key: 'n', label: 'Item', render: (i) => <><div className="cell-main">{i.name}</div><div className="cell-sub">{i.category} · {i.location}</div></> },
          { key: 's', label: 'Supplier', render: (i) => i.supplier?.name || '-' },
          { key: 'u', label: 'Unit cost', align: 'right', render: (i) => money(i.unitCost) },
          { key: 'q', label: 'In stock', align: 'right', render: (i) => <b className={i.quantity <= i.reorderLevel ? 'warning-text' : ''}>{i.quantity} <span className="muted small">{i.unit}</span></b> },
          { key: 'r', label: 'Reorder at', align: 'right', render: (i) => i.reorderLevel },
          { key: 'v', label: 'Value', align: 'right', render: (i) => money(i.quantity * i.unitCost) },
          { key: 'st', label: 'Status', render: (i) => <StatusBadge status={i.quantity === 0 ? 'Out of Stock' : i.quantity <= i.reorderLevel ? 'Low Stock' : 'In Stock'} /> },
          {
            key: 'x', label: '', className: 'actions-cell',
            render: (i) => w && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button size="sm" icon={ArrowUpFromLine} onClick={() => setMove({ item: i, type: 'OUT' })}>Issue</Button>
                <Button size="sm" icon={ArrowDownToLine} onClick={() => setMove({ item: i, type: 'IN' })}>Receive</Button>
                <Button size="sm" icon={Pencil} onClick={() => setEdit(i)} aria-label="Edit" />
              </div>
            ),
          },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      <ItemEditor item={edit} onClose={() => setEdit(null)} onDone={reload} />
      <MoveModal move={move} onClose={() => setMove(null)} onDone={reload} />
    </Card>
  );
}

function ItemEditor({ item, onClose, onDone }) {
  const toast = useToast();
  const suppliers = useFetch(item ? '/suppliers' : null, { limit: 200, active: 'true' });
  const [f, setF] = useState(null);
  useEffect(() => setF(item ? { ...item, supplier: item.supplier?._id || item.supplier || '' } : null), [item]);
  if (!f) return null;
  const b = (k, num) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value }) });
  const save = async () => {
    try {
      const body = { ...f, supplier: f.supplier || undefined };
      if (f._id) await api.put(`/inventory/items/${f._id}`, body); else await api.post('/inventory/items', body);
      toast.success('Item saved'); onDone(); onClose();
    } catch (e) { toast.error(e); }
  };
  return (
    <Modal open onClose={onClose} title={f._id ? `Edit ${f.name}` : 'Add store item'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Item name" required className="span-all"><input className="input" {...b('name')} /></Field>
        <Field label="Category"><Select {...b('category')} options={CATS} /></Field>
        <Field label="Unit"><input className="input" {...b('unit')} /></Field>
        {!f._id && <Field label="Opening stock"><input className="input" type="number" {...b('quantity', true)} /></Field>}
        <Field label="Reorder level"><input className="input" type="number" {...b('reorderLevel', true)} /></Field>
        <Field label="Unit cost"><input className="input" type="number" step="0.01" {...b('unitCost', true)} /></Field>
        <Field label="Location"><input className="input" {...b('location')} /></Field>
        <Field label="Preferred supplier"><Select {...b('supplier')} placeholder="-" options={(suppliers.data?.data || []).map((s) => ({ value: s._id, label: s.name }))} /></Field>
      </div>
    </Modal>
  );
}

function MoveModal({ move, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ quantity: '', department: '', note: '' });
  useEffect(() => { if (move) setF({ quantity: '', department: '', note: '' }); }, [move]);
  if (!move) return null;
  const out = move.type === 'OUT';
  const save = async () => {
    try {
      await api.post(`/inventory/items/${move.item._id}/stock`, { type: move.type, quantity: Number(f.quantity), department: f.department, note: f.note });
      toast.success(out ? 'Stock issued' : 'Stock received'); onDone(); onClose();
    } catch (e) { toast.error(e); }
  };
  return (
    <Modal open onClose={onClose} title={`${out ? 'Issue' : 'Receive'} - ${move.item.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!Number(f.quantity)} onClick={save}>{out ? 'Issue stock' : 'Receive stock'}</Button></>}>
      <p className="muted mb-16">Current stock: <b>{move.item.quantity} {move.item.unit}</b></p>
      <div className="form-grid">
        <Field label="Quantity" required><input className="input" type="number" min="1" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} autoFocus /></Field>
        {out && <Field label="Issued to (department / ward)"><input className="input" list="depts" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>}
        <Field label="Note" className="span-all"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <datalist id="depts">{['Emergency', 'ICU', 'OT Complex', 'General Ward - Male', 'General Ward - Female', 'Maternity Ward', 'Laboratory', 'OPD'].map((d) => <option key={d} value={d} />)}</datalist>
    </Modal>
  );
}

function PurchaseOrders() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useFetch('/inventory/purchase-orders', { status, page, limit: 25 });
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  return (
    <Card flush>
      <div className="card-header">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={['Draft', 'Ordered', 'Received', 'Cancelled']} style={{ width: 180 }} />
        {can('inventory', 'rw') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setCreating(true)}>New purchase order</Button>}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={(p) => setOpen(p._id)}
        columns={[
          { key: 'n', label: 'PO No.', render: (p) => <span className="mono strong">{p.poNo}</span> },
          { key: 'd', label: 'Date', render: (p) => date(p.createdAt) },
          { key: 's', label: 'Supplier', render: (p) => p.supplier?.name },
          { key: 'i', label: 'Items', align: 'right', render: (p) => p.items.length },
          { key: 't', label: 'Value', align: 'right', render: (p) => money(p.total) },
          { key: 'e', label: 'Expected', render: (p) => date(p.expectedDate) },
          { key: 'st', label: 'Status', render: (p) => <StatusBadge status={p.status} /> },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      <NewPO open={creating} onClose={() => setCreating(false)} onDone={(po) => { reload(); setOpen(po._id); }} />
      <PODetail id={open} onClose={() => setOpen(null)} onChange={reload} />
    </Card>
  );
}

function ItemLookup({ onPick }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('Medicine');
  const dq = useDebounced(q, 200);
  const { data } = useFetch(dq ? (kind === 'Medicine' ? '/pharmacy/medicines' : '/inventory/items') : null, { q: dq, limit: 8 });
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <Select value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'Medicine', label: 'Medicine' }, { value: 'InventoryItem', label: 'Store item' }]} style={{ width: 140 }} />
      <div className="combo" style={{ flex: 1 }}>
        <input className="input" placeholder="Search item to add" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && data?.data?.length > 0 && (
          <div className="combo-list">
            {data.data.map((it) => (
              <div key={it._id} className="combo-item" onMouseDown={() => { onPick({ itemType: kind, item: it._id, name: it.name, quantity: kind === 'Medicine' ? it.reorderLevel * 2 : it.reorderLevel, unitCost: kind === 'Medicine' ? Math.round((it.batches?.[0]?.purchasePrice || it.mrp * 0.7) * 100) / 100 : it.unitCost }); setQ(''); }}>
                <div className="cell-main">{it.name} <span className="muted small">{it.strength}</span></div>
                <div className="cell-sub">In stock {it.stock ?? it.quantity}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewPO({ open, onClose, onDone }) {
  const toast = useToast();
  const suppliers = useFetch(open ? '/suppliers' : null, { limit: 200, active: 'true' });
  const [supplier, setSupplier] = useState('');
  const [expectedDate, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => { if (!open) { setLines([]); setSupplier(''); setError(null); } }, [open]);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const save = async (status) => {
    setError(null);
    try {
      const po = await api.post('/inventory/purchase-orders', { supplier, expectedDate: expectedDate || undefined, notes, status, items: lines });
      toast.success(`Purchase order ${po.poNo} ${status === 'Ordered' ? 'placed' : 'saved as draft'}`);
      onDone(po); onClose();
    } catch (e) { setError(e); }
  };
  const upd = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: Number(v) } : l)));
  return (
    <Modal open={open} onClose={onClose} title="New purchase order" size="xl" footer={<><Button onClick={onClose}>Cancel</Button><Button disabled={!supplier || !lines.length} onClick={() => save('Draft')}>Save draft</Button><Button variant="primary" disabled={!supplier || !lines.length} onClick={() => save('Ordered')}>Place order</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Supplier" required className="span-2"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Select supplier" options={(suppliers.data?.data || []).map((s) => ({ value: s._id, label: `${s.name} (${s.category})` }))} /></Field>
          <Field label="Expected delivery"><input type="date" className="input" min={isoDate()} value={expectedDate} onChange={(e) => setExpected(e.target.value)} /></Field>
          <Field label="Notes" className="span-all"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <ItemLookup onPick={(l) => setLines([...lines.filter((x) => x.item !== l.item), l])} />
        <table className="table">
          <thead><tr><th>Item</th><th>Type</th><th style={{ width: 110 }}>Qty</th><th style={{ width: 130 }}>Unit cost</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {!lines.length && <tr><td colSpan={6} className="empty">Add items to this order</td></tr>}
            {lines.map((l, i) => (
              <tr key={l.item}>
                <td className="cell-main">{l.name}</td><td>{l.itemType === 'Medicine' ? 'Medicine' : 'Store item'}</td>
                <td><input className="input" type="number" min="1" value={l.quantity} onChange={(e) => upd(i, 'quantity', e.target.value)} /></td>
                <td><input className="input" type="number" step="0.01" value={l.unitCost} onChange={(e) => upd(i, 'unitCost', e.target.value)} /></td>
                <td className="num">{money(l.quantity * l.unitCost)}</td>
                <td><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4} className="num">Total</td><td className="num">{money(total)}</td><td /></tr></tfoot>
        </table>
      </div>
    </Modal>
  );
}

function PODetail({ id, onClose, onChange }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: po, reload } = useFetch(id ? `/inventory/purchase-orders/${id}` : null);
  const [receiving, setReceiving] = useState(false);
  const [grn, setGrn] = useState({});
  useEffect(() => { setReceiving(false); setGrn({}); }, [id]);
  if (!id) return null;
  const status = async (s) => { try { await api.post(`/inventory/purchase-orders/${id}/status`, { status: s }); toast.success(`Purchase order ${s.toLowerCase()}`); reload(); onChange(); } catch (e) { toast.error(e); } };
  const receive = async () => {
    try {
      await api.post(`/inventory/purchase-orders/${id}/receive`, { items: Object.entries(grn).map(([k, v]) => ({ _id: k, ...v })) });
      toast.success('Goods received and stock updated'); reload(); onChange(); setReceiving(false);
    } catch (e) { toast.error(e); }
  };
  const setG = (lineId, k, v) => setGrn({ ...grn, [lineId]: { ...(grn[lineId] || {}), [k]: v } });
  const w = can('inventory', 'rw');
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={po ? `Purchase order ${po.poNo}` : 'Purchase order'}
      footer={po && w && (
        <>
          {['Draft', 'Ordered'].includes(po.status) && <Button variant="danger" onClick={() => status('Cancelled')}>Cancel PO</Button>}
          {po.status === 'Draft' && <Button variant="primary" onClick={() => status('Ordered')}>Place order</Button>}
          {po.status === 'Ordered' && !receiving && <Button variant="primary" icon={Truck} onClick={() => setReceiving(true)}>Receive goods</Button>}
          {receiving && <Button variant="primary" onClick={receive}>Confirm receipt</Button>}
        </>
      )}
    >
      {po && (
        <div className="stack">
          <div className="grid grid-2">
            <KV items={[['Supplier', po.supplier?.name], ['GSTIN', po.supplier?.gstin], ['Phone', po.supplier?.phone], ['Address', po.supplier?.address]]} />
            <KV items={[['Status', <StatusBadge status={po.status} />], ['Created', `${dateTime(po.createdAt)} · ${po.createdBy?.name || ''}`], ['Expected', date(po.expectedDate)], ['Received', dateTime(po.receivedAt)], ['Notes', po.notes]]} />
          </div>
          {receiving && <div className="alert info">Enter batch number, expiry and MRP for each medicine line. Store items are added to stock directly.</div>}
          <table className="table">
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Amount</th>{receiving && <><th>Batch no.</th><th>Expiry</th><th>MRP</th></>}</tr></thead>
            <tbody>
              {po.items.map((l) => (
                <tr key={l._id}>
                  <td><div className="cell-main">{l.name}</div><div className="cell-sub">{l.itemType === 'Medicine' ? 'Medicine' : 'Store item'}</div></td>
                  <td className="num">{l.quantity}</td><td className="num">{money(l.unitCost)}</td><td className="num">{money(l.quantity * l.unitCost)}</td>
                  {receiving && (l.itemType === 'Medicine' ? (
                    <>
                      <td><input className="input" value={grn[l._id]?.batchNo || ''} onChange={(e) => setG(l._id, 'batchNo', e.target.value)} /></td>
                      <td><input className="input" type="date" min={isoDate()} value={grn[l._id]?.expiryDate || ''} onChange={(e) => setG(l._id, 'expiryDate', e.target.value)} /></td>
                      <td><input className="input" type="number" step="0.01" style={{ width: 90 }} value={grn[l._id]?.mrp || ''} onChange={(e) => setG(l._id, 'mrp', e.target.value)} /></td>
                    </>
                  ) : <td colSpan={3} className="muted small">-</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="num">Total</td><td className="num">{money(po.total)}</td>{receiving && <td colSpan={3} />}</tr></tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Suppliers() {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, reload } = useFetch('/suppliers', { q: dq, limit: 100 });
  const [edit, setEdit] = useState(null);
  const save = async () => {
    try {
      if (edit._id) await api.put(`/suppliers/${edit._id}`, edit); else await api.post('/suppliers', edit);
      toast.success('Supplier saved'); setEdit(null); reload();
    } catch (e) { toast.error(e); }
  };
  const b = (k) => ({ value: edit?.[k] ?? '', onChange: (e) => setEdit({ ...edit, [k]: e.target.value }) });
  return (
    <Card flush>
      <div className="card-header">
        <input className="input search" style={{ maxWidth: 320 }} placeholder="Search suppliers" value={q} onChange={(e) => setQ(e.target.value)} />
        {can('inventory', 'rw') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ name: '', category: 'Pharmaceutical', active: true })}>Add supplier</Button>}
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        onRowClick={can('inventory', 'rw') ? (s) => setEdit(s) : undefined}
        columns={[
          { key: 'n', label: 'Supplier', render: (s) => <><div className="cell-main">{s.name}</div><div className="cell-sub">{s.address}</div></> },
          { key: 'c', label: 'Category', render: (s) => s.category },
          { key: 'p', label: 'Contact', render: (s) => <>{s.contactPerson}<div className="cell-sub">{s.phone} · {s.email}</div></> },
          { key: 'g', label: 'GSTIN', render: (s) => <span className="mono small">{s.gstin || '-'}</span> },
          { key: 't', label: 'Terms', render: (s) => s.paymentTerms || '-' },
          { key: 's', label: 'Status', render: (s) => (s.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
        ]}
      />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?._id ? 'Edit supplier' : 'Add supplier'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Name" required className="span-all"><input className="input" {...b('name')} /></Field>
            <Field label="Category"><Select {...b('category')} options={['Pharmaceutical', 'Surgical', 'Equipment', 'General', 'Laboratory']} /></Field>
            <Field label="Contact person"><input className="input" {...b('contactPerson')} /></Field>
            <Field label="Phone"><input className="input" {...b('phone')} /></Field>
            <Field label="Email"><input className="input" type="email" {...b('email')} /></Field>
            <Field label="GSTIN"><input className="input" {...b('gstin')} /></Field>
            <Field label="Payment terms"><input className="input" {...b('paymentTerms')} /></Field>
            <Field label="Address" className="span-all"><input className="input" {...b('address')} /></Field>
            <Field label="Status"><Select value={edit.active ? 'true' : 'false'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}
