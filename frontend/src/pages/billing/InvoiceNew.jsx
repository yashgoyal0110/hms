import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { money } from '../../lib/format.js';
import {
  Button, Card, ErrorBox, Field, KV, PageHeader, Select,
} from '../../components/ui.jsx';
import { PatientPicker } from '../../components/pickers.jsx';

const blank = () => ({ description: '', category: 'Procedure', quantity: 1, rate: '', taxRate: 0 });
export default function InvoiceNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const meta = useFetch('/invoices/meta');
  const [patient, setPatient] = useState(null);
  const [items, setItems] = useState([blank()]);
  const [type, setType] = useState('General');
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [notes, setNotes] = useState('');
  const [payNow, setPayNow] = useState(true);
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pid = params.get('patient');
    if (pid) api.get(`/patients/${pid}`).then((r) => setPatient(r.patient)).catch(() => {});
  }, [params]);

  const upd = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const sub = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0);
  const tax = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.rate) || 0) * ((Number(i.taxRate) || 0) / 100), 0);
  const total = Math.max(0, sub + tax - (Number(discount) || 0));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const valid = items.filter((i) => i.description && i.rate !== '');
      const inv = await api.post('/invoices', {
        patient: patient?._id, type, items: valid, discount: Number(discount) || 0, discountReason, notes,
        payment: payNow ? { mode, reference, amount: total } : undefined,
      });
      toast.success(`Invoice ${inv.invoiceNo} created`);
      navigate(`/billing/${inv._id}`, { replace: true });
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader crumbs={<><Link to="/billing">Billing</Link> / New</>} title="New bill" sub="Consultation, lab, pharmacy and IPD charges are billed automatically; use this for services and miscellaneous charges." />
      <div className="grid grid-main-side">
        <div className="stack">
          <ErrorBox error={error} />
          <Card title="Patient">
            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
              <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
              <Field label="Bill type"><Select value={type} onChange={(e) => setType(e.target.value)} options={['General', 'OPD', 'Laboratory', 'Radiology', 'Pharmacy', 'OT']} /></Field>
            </div>
          </Card>
          <Card title="Line items" actions={<Button size="sm" icon={Plus} onClick={() => setItems([...items, blank()])}>Add line</Button>}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Description</th><th>Category</th><th style={{ width: 80 }}>Qty</th><th style={{ width: 110 }}>Rate</th><th style={{ width: 80 }}>GST %</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td><input className="input" value={it.description} onChange={(e) => upd(i, 'description', e.target.value)} placeholder="Service / item" /></td>
                      <td><Select value={it.category} onChange={(e) => upd(i, 'category', e.target.value)} options={meta.data?.chargeCategories || []} /></td>
                      <td><input className="input" type="number" min="0" value={it.quantity} onChange={(e) => upd(i, 'quantity', e.target.value)} /></td>
                      <td><input className="input" type="number" min="0" step="0.01" value={it.rate} onChange={(e) => upd(i, 'rate', e.target.value)} /></td>
                      <td><input className="input" type="number" min="0" value={it.taxRate} onChange={(e) => upd(i, 'taxRate', e.target.value)} /></td>
                      <td className="num">{money((Number(it.quantity) || 0) * (Number(it.rate) || 0))}</td>
                      <td><Button size="sm" variant="ghost" icon={Trash2} disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Card>
        </div>
        <Card title="Summary">
          <div className="stack">
            <KV items={[['Subtotal', money(sub)], ['GST', money(tax)]]} />
            <Field label="Discount"><input className="input" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
            {Number(discount) > 0 && <Field label="Discount reason"><input className="input" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} /></Field>}
            <div className="row between" style={{ fontSize: 18 }}><b>Total</b><b className="mono">{money(total)}</b></div>
            <label className="checkbox"><input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />Collect full payment now</label>
            {payNow && (
              <>
                <Field label="Payment mode"><Select value={mode} onChange={(e) => setMode(e.target.value)} options={['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque']} /></Field>
                <Field label="Reference"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
              </>
            )}
            <Button variant="primary" loading={busy} disabled={!patient || !items.some((i) => i.description && i.rate !== '')} onClick={submit} style={{ height: 40 }}>Create bill</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
