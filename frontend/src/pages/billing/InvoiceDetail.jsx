import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Printer, IndianRupee, Plus, Trash2, Percent, Ban, Undo2, ShieldCheck, Lock,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import {
  ageSex, date, dateTime, fullName, money,
} from '../../lib/format.js';
import {
  Button, Card, Confirm, DataTable, ErrorBox, Field, KV, Loading, Modal, PageHeader, Select, StatusBadge,
} from '../../components/ui.jsx';
import PrintDoc from '../../components/PrintDoc.jsx';

function amountInWords(n) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]}${x % 10 ? ` ${a[x % 10]}` : ''}`);
  const three = (x) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ''}` : two(x));
  let num = Math.floor(Math.abs(n));
  if (!num) return 'Zero';
  const parts = [];
  const crore = Math.floor(num / 1e7); num %= 1e7;
  const lakh = Math.floor(num / 1e5); num %= 1e5;
  const thousand = Math.floor(num / 1e3); num %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (num) parts.push(three(num));
  return parts.join(' ');
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(`/invoices/${id}`);
  const meta = useFetch('/invoices/meta');
  const [modal, setModal] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { invoice: inv, claims } = data;
  const p = inv.patient;
  const w = can('billing', 'rw');
  const cancelled = inv.status === 'Cancelled';
  const editable = w && !cancelled && !(inv.finalized && inv.payments.length);
  const statusLabel = !inv.finalized && !cancelled ? 'Open' : inv.status;

  const removeItem = async (item) => {
    try { await api.del(`/invoices/${id}/items/${item._id}`); toast.success('Line removed'); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <PageHeader
        crumbs={<><Link to="/billing">Billing</Link> / {inv.invoiceNo}</>}
        title={`Invoice ${inv.invoiceNo}`}
        sub={<>{inv.type} bill · {dateTime(inv.createdAt)} {inv.admission && <>· {can('ipd') ? <Link to={`/ipd/${inv.admission._id}`}>{inv.admission.admissionNo}</Link> : inv.admission.admissionNo}</>}</>}
        actions={(
          <>
            {editable && <Button icon={Plus} onClick={() => setModal('item')}>Add charge</Button>}
            {w && !cancelled && inv.status !== 'Paid' && <Button icon={Percent} onClick={() => setModal('discount')}>Discount</Button>}
            {w && !inv.finalized && !inv.admission && <Button icon={Lock} onClick={async () => { try { await api.post(`/invoices/${id}/finalize`); reload(); } catch (e) { toast.error(e); } }}>Finalise</Button>}
            {can('insurance', 'rw') && inv.finalized && inv.balance > 0 && !cancelled && <Button icon={ShieldCheck} onClick={() => navigate(`/insurance?new=1&invoice=${id}`)}>Insurance claim</Button>}
            {w && !cancelled && !inv.payments.length && <Button icon={Ban} variant="danger" onClick={() => setModal('cancel')}>Cancel</Button>}
            {w && inv.finalized && inv.balance < 0 && <Button icon={Undo2} onClick={() => setModal('refund')}>Refund {money(-inv.balance)}</Button>}
            <Button icon={Printer} onClick={() => setModal('print')}>Print</Button>
            {w && !cancelled && inv.balance > 0 && <Button variant="primary" icon={IndianRupee} onClick={() => setModal('pay')}>Collect payment</Button>}
          </>
        )}
      />
      {!inv.finalized && !cancelled && <div className="alert info mb-16">This is a running IPD bill. Charges are added as services are provided; room charges are added and the bill is finalised at discharge. Advance payments can be collected at any time.</div>}
      {cancelled && <div className="alert danger mb-16">Cancelled: {inv.cancelReason}</div>}
      <div className="grid grid-main-side">
        <div className="stack">
          <Card title="Charges" flush>
            <DataTable
              rows={inv.items}
              empty="No charges yet"
              columns={[
                { key: 'd', label: 'Description', render: (i) => <><div className="cell-main">{i.description}</div><div className="cell-sub">{date(i.addedAt)}</div></> },
                { key: 'c', label: 'Category', render: (i) => i.category },
                { key: 'q', label: 'Qty', align: 'right', render: (i) => i.quantity },
                { key: 'r', label: 'Rate', align: 'right', render: (i) => money(i.rate) },
                { key: 't', label: 'GST', align: 'right', render: (i) => (i.taxRate ? `${i.taxRate}%` : '-') },
                { key: 'a', label: 'Amount', align: 'right', render: (i) => money(i.amount) },
                { key: 'x', label: '', className: 'actions-cell', render: (i) => editable && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeItem(i)} aria-label="Remove" /> },
              ]}
            />
          </Card>
          <Card title="Payments & receipts" flush>
            <DataTable
              rows={inv.payments}
              empty="No payments received"
              columns={[
                { key: 'r', label: 'Receipt', render: (x) => <span className="mono">{x.receiptNo}</span> },
                { key: 'd', label: 'Date', render: (x) => dateTime(x.paidAt) },
                { key: 'm', label: 'Mode', render: (x) => x.mode },
                { key: 'ref', label: 'Reference', render: (x) => x.reference || '-' },
                { key: 'b', label: 'Received by', render: (x) => x.receivedBy?.name || '-' },
                { key: 'a', label: 'Amount', align: 'right', render: (x) => <b className={x.amount < 0 ? 'warning-text' : 'success-text'}>{x.amount < 0 ? `Refund ${money(-x.amount)}` : money(x.amount)}</b> },
              ]}
            />
          </Card>
          {claims.length > 0 && (
            <Card title="Insurance claims" flush>
              <DataTable
                rows={claims}
                onRowClick={can('insurance') ? () => navigate('/insurance') : undefined}
                columns={[
                  { key: 'n', label: 'Claim', render: (c) => <span className="mono">{c.claimNo}</span> },
                  { key: 'p', label: 'Provider', render: (c) => c.provider },
                  { key: 'c', label: 'Claimed', align: 'right', render: (c) => money(c.claimAmount) },
                  { key: 'a', label: 'Approved', align: 'right', render: (c) => money(c.approvedAmount) },
                  { key: 's', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
                ]}
              />
            </Card>
          )}
        </div>
        <div className="stack">
          <Card title="Summary">
            <KV items={[
              ['Status', <StatusBadge status={statusLabel} />], ['Subtotal', money(inv.subtotal)], ['GST', money(inv.taxTotal)],
              ['Discount', inv.discount ? `${money(inv.discount)}${inv.discountReason ? ` (${inv.discountReason})` : ''}` : '-'],
              ['Total', <b>{money(inv.total)}</b>], ['Paid', money(inv.amountPaid)],
              ['Balance', <b className={inv.balance > 0 ? 'danger-text' : inv.balance < 0 ? 'warning-text' : 'success-text'}>{inv.balance < 0 ? `${money(-inv.balance)} ${inv.finalized ? 'refundable' : 'advance available'}` : money(inv.balance)}</b>],
            ]}
            />
          </Card>
          <Card title="Patient">
            <KV items={[
              ['Name', <Link to={`/patients/${p._id}`}>{fullName(p)}</Link>], ['UHID', p.uhid], ['Age / Sex', ageSex(p)], ['Phone', p.phone],
              ['Insurance', p.insurance?.provider ? `${p.insurance.provider} · ${p.insurance.policyNumber}` : 'Self-pay'],
            ]}
            />
          </Card>
        </div>
      </div>

      <PayModal open={modal === 'pay'} inv={inv} modes={meta.data?.paymentModes} onClose={() => setModal(null)} onDone={reload} />
      <ItemModal open={modal === 'item'} id={id} categories={meta.data?.chargeCategories} onClose={() => setModal(null)} onDone={reload} />
      <DiscountModal open={modal === 'discount'} inv={inv} onClose={() => setModal(null)} onDone={reload} />
      <RefundModal open={modal === 'refund'} inv={inv} onClose={() => setModal(null)} onDone={reload} />
      <CancelModal open={modal === 'cancel'} id={id} onClose={() => setModal(null)} onDone={reload} />
      <Modal open={modal === 'print'} onClose={() => setModal(null)} title="Invoice" size="lg" printable footer={<><Button onClick={() => setModal(null)}>Close</Button><Button variant="primary" icon={Printer} onClick={() => window.print()}>Print</Button></>}>
        <InvoicePrint inv={inv} />
      </Modal>
    </>
  );
}

function InvoicePrint({ inv }) {
  const p = inv.patient;
  return (
    <PrintDoc title={inv.finalized ? 'Tax Invoice / Bill of Supply' : 'Interim Bill'}>
      <div className="doc-meta">
        <div><span>Bill No.</span><b>{inv.invoiceNo}</b></div><div><span>Date</span>{dateTime(inv.createdAt)}</div>
        <div><span>Patient</span><b>{fullName(p)}</b></div><div><span>UHID</span>{p.uhid}</div>
        <div><span>Age / Sex</span>{ageSex(p)}</div><div><span>Phone</span>{p.phone}</div>
        {inv.admission && <><div><span>IPD No.</span>{inv.admission.admissionNo}</div><div><span>Consultant</span>{inv.admission.doctor?.name}</div><div><span>Admitted</span>{dateTime(inv.admission.admittedAt)}</div><div><span>Discharged</span>{dateTime(inv.admission.dischargedAt)}</div></>}
        <div><span>Bill type</span>{inv.type}</div><div><span>Status</span>{inv.finalized ? inv.status : 'Open (interim)'}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {inv.items.map((i, n) => <tr key={i._id}><td>{n + 1}</td><td>{i.description}</td><td>{i.category}</td><td style={{ textAlign: 'right' }}>{i.quantity}</td><td style={{ textAlign: 'right' }}>{money(i.rate)}</td><td style={{ textAlign: 'right' }}>{i.taxRate ? `${i.taxRate}%` : '-'}</td><td style={{ textAlign: 'right' }}>{money(i.amount)}</td></tr>)}
        </tbody>
      </table>
      <table style={{ width: '45%', marginLeft: 'auto' }}>
        <tbody>
          <tr><td>Subtotal</td><td style={{ textAlign: 'right' }}>{money(inv.subtotal)}</td></tr>
          {inv.taxTotal > 0 && <tr><td>GST</td><td style={{ textAlign: 'right' }}>{money(inv.taxTotal)}</td></tr>}
          {inv.discount > 0 && <tr><td>Discount</td><td style={{ textAlign: 'right' }}>- {money(inv.discount)}</td></tr>}
          <tr><th>Net amount</th><th style={{ textAlign: 'right' }}>{money(inv.total)}</th></tr>
          <tr><td>Amount received</td><td style={{ textAlign: 'right' }}>{money(inv.amountPaid)}</td></tr>
          <tr><th>{inv.balance < 0 ? (inv.finalized ? 'Refundable' : 'Advance balance') : 'Balance due'}</th><th style={{ textAlign: 'right' }}>{money(Math.abs(inv.balance))}</th></tr>
        </tbody>
      </table>
      <p><b>Amount in words:</b> Rupees {amountInWords(inv.total)} only</p>
      {inv.payments.length > 0 && (
        <>
          <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>Payment details</div>
          <table>
            <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>{inv.payments.map((x) => <tr key={x._id}><td>{x.receiptNo}</td><td>{dateTime(x.paidAt)}</td><td>{x.mode}</td><td>{x.reference}</td><td style={{ textAlign: 'right' }}>{money(x.amount)}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <div className="sig"><span>Patient / attendant</span><span>Authorised signatory<br /><small>{inv.createdBy?.name}</small></span></div>
    </PrintDoc>
  );
}

function PayModal({ open, inv, modes = [], onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/invoices/${inv._id}/payments`, { amount: Number(amount || inv.balance), mode, reference });
      toast.success(`Payment recorded - receipt ${r.receiptNo}`);
      setAmount(''); setReference(''); onDone(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Collect payment" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Record payment</Button></>}>
      <div className="form-grid">
        <Field label="Amount" hint={`Outstanding ${money(inv.balance)}`}><input className="input" type="number" step="0.01" placeholder={inv.balance.toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        <Field label="Mode"><Select value={mode} onChange={(e) => setMode(e.target.value)} options={modes.filter((m) => !['Insurance', 'Advance'].includes(m))} /></Field>
        <Field label="Reference" className="span-all"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI txn id / card last 4 / cheque no." /></Field>
      </div>
    </Modal>
  );
}

function ItemModal({ open, id, categories = [], onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ description: '', category: 'Procedure', quantity: 1, rate: '', taxRate: 0 });
  const submit = async () => {
    try { await api.post(`/invoices/${id}/items`, f); toast.success('Charge added'); setF({ ...f, description: '', rate: '' }); onDone(); onClose(); } catch (e) { toast.error(e); }
  };
  const b = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal open={open} onClose={onClose} title="Add charge" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Add</Button></>}>
      <div className="form-grid">
        <Field label="Description" required className="span-all"><input className="input" {...b('description')} autoFocus /></Field>
        <Field label="Category"><Select {...b('category')} options={categories} /></Field>
        <Field label="Quantity"><input className="input" type="number" {...b('quantity')} /></Field>
        <Field label="Rate" required><input className="input" type="number" step="0.01" {...b('rate')} /></Field>
        <Field label="GST %"><input className="input" type="number" {...b('taxRate')} /></Field>
      </div>
    </Modal>
  );
}

function DiscountModal({ open, inv, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Apply discount" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => { try { await api.post(`/invoices/${inv._id}/discount`, { amount: Number(amount), reason }); toast.success('Discount applied'); onDone(); onClose(); } catch (e) { toast.error(e); } }}>Apply</Button></>}>
      <div className="form-grid">
        <Field label="Discount amount" hint={`Current ${money(inv.discount)}`}><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason / approved by" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function RefundModal({ open, inv, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Refund excess amount" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => { try { await api.post(`/invoices/${inv._id}/refund`, { amount: -inv.balance, mode, reference }); toast.success('Refund recorded'); onDone(); onClose(); } catch (e) { toast.error(e); } }}>Record refund</Button></>}>
      <p className="mb-16">Refund <b>{money(-inv.balance)}</b> collected in excess of the final bill.</p>
      <div className="form-grid">
        <Field label="Refund mode"><Select value={mode} onChange={(e) => setMode(e.target.value)} options={['Cash', 'Bank Transfer', 'UPI', 'Cheque']} /></Field>
        <Field label="Reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CancelModal({ open, id, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  return (
    <Confirm open={open} onClose={onClose} danger title="Cancel invoice" confirmLabel="Cancel invoice" onConfirm={async () => { try { await api.post(`/invoices/${id}/cancel`, { reason }); toast.success('Invoice cancelled'); onDone(); onClose(); } catch (e) { toast.error(e); } }}>
      <Field label="Reason" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Confirm>
  );
}
