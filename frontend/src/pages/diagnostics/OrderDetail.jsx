import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  TestTube, Save, CheckCircle2, Printer, XCircle,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { ageSex, dateTime, fullName } from '../../lib/format.js';
import {
  Button, Card, Confirm, ErrorBox, Field, KV, Loading, Modal, PageHeader, StatusBadge,
} from '../../components/ui.jsx';
import PrintDoc from '../../components/PrintDoc.jsx';

function flagOf(value, param) {
  const n = parseFloat(value);
  if (!param || Number.isNaN(n)) return '';
  const { low, high } = param;
  if (low != null && n < low) return n < low * 0.5 ? 'Critical' : 'L';
  if (high != null && n > high) return n > high * 2 ? 'Critical' : 'H';
  return '';
}

export default function OrderDetail({ category }) {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const { data: o, loading, error, reload, setData } = useFetch(`/lab-orders/${id}`);
  const [items, setItems] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [print, setPrint] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!o) return;
    setItems(o.items.map((i) => ({ _id: i._id, results: i.results.map((r) => ({ ...r })), findings: i.findings || '', impression: i.impression || '' })));
    setRemarks(o.reportRemarks || '');
  }, [o]);

  if (loading && !o) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const lab = category === 'lab';
  const base = lab ? '/laboratory' : '/radiology';
  const editable = can(category, 'rw') && !['Completed', 'Cancelled'].includes(o.status);
  const p = o.patient;

  const setResult = (ii, ri, value) => setItems((list) => list.map((it, a) => (a !== ii ? it : {
    ...it,
    results: it.results.map((r, b) => (b !== ri ? r : { ...r, value, flag: flagOf(value, o.items[ii].test?.parameters?.find((x) => x.name === r.parameter)) })),
  })));
  const setText = (ii, k, v) => setItems((list) => list.map((it, a) => (a === ii ? { ...it, [k]: v } : it)));

  const save = async (silent) => {
    setBusy(true);
    try {
      const res = await api.put(`/lab-orders/${id}/results`, { items, reportRemarks: remarks });
      if (!silent) toast.success('Results saved');
      await reload();
      return res;
    } catch (e) { toast.error(e); return null; } finally { setBusy(false); }
  };
  const act = async (path, msg) => {
    try { await api.post(`/lab-orders/${id}/${path}`); toast.success(msg); const fresh = await api.get(`/lab-orders/${id}`); setData(fresh); return true; } catch (e) { toast.error(e); return false; }
  };
  const finalize = async () => {
    if (!(await save(true))) return;
    if (await act('complete', 'Report finalised and patient notified')) setPrint(true);
  };

  return (
    <>
      <PageHeader
        crumbs={<><Link to={base}>{lab ? 'Laboratory' : 'Radiology'}</Link> / {o.orderNo}</>}
        title={`${lab ? 'Lab order' : 'Imaging order'} ${o.orderNo}`}
        actions={(
          <>
            {editable && lab && o.status === 'Ordered' && <Button icon={TestTube} onClick={() => act('collect', 'Sample collected')}>Mark sample collected</Button>}
            {editable && <Button icon={XCircle} variant="danger" onClick={() => setCancel(true)}>Cancel order</Button>}
            {editable && <Button icon={Save} loading={busy} onClick={() => save()}>Save</Button>}
            {editable && <Button variant="primary" icon={CheckCircle2} onClick={finalize}>Finalise report</Button>}
            {o.status === 'Completed' && <Button variant="primary" icon={Printer} onClick={() => setPrint(true)}>Print report</Button>}
          </>
        )}
      />
      <div className="grid grid-main-side">
        <div className="stack">
          {o.items.map((item, ii) => (
            <Card key={item._id} title={<div><h3>{item.name}</h3><div className="cell-sub">{item.section}{item.test?.sampleType ? ` · ${item.test.sampleType}` : ''}</div></div>}>
              {lab && item.results.length > 0 ? (
                <table className="table">
                  <thead><tr><th>Parameter</th><th style={{ width: 180 }}>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead>
                  <tbody>
                    {(items[ii]?.results || []).map((r, ri) => (
                      <tr key={ri}>
                        <td className="cell-main">{r.parameter}</td>
                        <td>{editable ? <input className="input" value={r.value || ''} onChange={(e) => setResult(ii, ri, e.target.value)} /> : <b className={r.flag ? 'danger-text' : ''}>{r.value || '-'}</b>}</td>
                        <td className="muted">{r.unit}</td>
                        <td className="muted">{r.refRange}</td>
                        <td>{r.flag && <span className={`badge ${r.flag === 'Critical' ? 'danger' : 'warning'}`}>{r.flag === 'H' ? 'High' : r.flag === 'L' ? 'Low' : 'Critical'}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="stack">
                  <Field label="Findings">{editable ? <textarea className="textarea" rows={5} value={items[ii]?.findings || ''} onChange={(e) => setText(ii, 'findings', e.target.value)} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{item.findings || '-'}</p>}</Field>
                  <Field label="Impression">{editable ? <textarea className="textarea" rows={2} value={items[ii]?.impression || ''} onChange={(e) => setText(ii, 'impression', e.target.value)} /> : <p className="strong" style={{ whiteSpace: 'pre-wrap' }}>{item.impression || '-'}</p>}</Field>
                </div>
              )}
            </Card>
          ))}
          <Card title="Report remarks">
            {editable ? <textarea className="textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Comments to appear at the end of the report" /> : <p>{o.reportRemarks || '-'}</p>}
          </Card>
        </div>
        <div className="stack">
          <Card title="Order">
            <KV items={[
              ['Status', <StatusBadge status={o.status} />], ['Priority', o.priority], ['Patient', <Link to={`/patients/${p._id}`}>{fullName(p)}</Link>], ['UHID', p.uhid], ['Age / Sex', ageSex(p)],
              ['Referred by', o.doctor?.name || 'Self'], ['Ordered', dateTime(o.createdAt)], ['Clinical notes', o.clinicalNotes],
              lab && ['Sample collected', o.sampleCollectedAt ? `${dateTime(o.sampleCollectedAt)} · ${o.collectedBy?.name || ''}` : ''],
              ['Reported', o.completedAt ? `${dateTime(o.completedAt)} · ${o.reportedBy?.name || ''}` : ''],
            ]}
            />
          </Card>
        </div>
      </div>

      <Modal open={print} onClose={() => setPrint(false)} title="Report" size="lg" printable footer={<><Button onClick={() => setPrint(false)}>Close</Button><Button variant="primary" icon={Printer} onClick={() => window.print()}>Print</Button></>}>
        <PrintDoc title={lab ? 'Laboratory Report' : 'Radiology Report'}>
          <div className="doc-meta">
            <div><span>Patient</span><b>{fullName(p)}</b></div><div><span>Order No.</span>{o.orderNo}</div>
            <div><span>UHID</span>{p.uhid}</div><div><span>Age / Sex</span>{ageSex(p)}</div>
            <div><span>Referred by</span>{o.doctor?.name || 'Self'}</div><div><span>{lab ? 'Collected' : 'Ordered'}</span>{dateTime(lab ? o.sampleCollectedAt : o.createdAt)}</div>
            <div><span>Reported</span>{dateTime(o.completedAt)}</div><div><span>Priority</span>{o.priority}</div>
          </div>
          {o.items.map((it) => (
            <div key={it._id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, margin: '6px 0' }}>{it.name} <span style={{ fontWeight: 400, color: '#555' }}>({it.section})</span></div>
              {lab && it.results.length ? (
                <table>
                  <thead><tr><th>Investigation</th><th>Result</th><th>Unit</th><th>Biological reference interval</th></tr></thead>
                  <tbody>{it.results.map((r, i) => <tr key={i}><td>{r.parameter}</td><td style={{ fontWeight: r.flag ? 700 : 400 }}>{r.value}{r.flag ? ` [${r.flag}]` : ''}</td><td>{r.unit}</td><td>{r.refRange}</td></tr>)}</tbody>
                </table>
              ) : (
                <>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }}><b>Findings: </b>{it.findings}</p>
                  <p style={{ whiteSpace: 'pre-wrap' }}><b>Impression: </b>{it.impression}</p>
                </>
              )}
            </div>
          ))}
          {o.reportRemarks && <p><b>Remarks: </b>{o.reportRemarks}</p>}
          <p style={{ textAlign: 'center', marginTop: 10, fontSize: 11 }}>*** End of report ***</p>
          <div className="sig"><span /><span style={{ textAlign: 'center' }}>{o.reportedBy?.name}<br /><small>{o.reportedBy?.qualification || o.reportedBy?.designation}</small></span></div>
        </PrintDoc>
      </Modal>
      <Confirm
        open={cancel}
        onClose={() => setCancel(false)}
        danger
        title="Cancel order"
        confirmLabel="Cancel order"
        onConfirm={async () => { try { await api.post(`/lab-orders/${id}/cancel`, { reason }); toast.success('Order cancelled; unpaid charges reversed'); setCancel(false); reload(); } catch (e) { toast.error(e); } }}
      >
        <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Confirm>
    </>
  );
}
