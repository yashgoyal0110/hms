import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useDebounced, useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  date, dateTime, fullName, money,
} from '../lib/format.js';
import {
  Button, Card, DataTable, ErrorBox, Field, KV, Modal, PageHeader, Pagination, Select, StatusBadge,
} from '../components/ui.jsx';

const STATUSES = ['Submitted', 'Under Review', 'Query Raised', 'Approved', 'Partially Approved', 'Rejected', 'Settled'];

export default function Insurance() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const dq = useDebounced(q);
  const { data, loading, reload } = useFetch('/claims', { q: dq, status, page, limit: 25 });
  const summary = Object.fromEntries((data?.summary || []).map((s) => [s._id, s]));

  return (
    <>
      <PageHeader title="Insurance Claims" sub="Cashless and reimbursement claims with TPAs and insurers" actions={can('insurance', 'rw') && <Button variant="primary" icon={Plus} onClick={() => setParams({ new: '1' })}>New claim</Button>} />
      <div className="grid grid-4 mb-16">
        {[['Pending with insurer', ['Submitted', 'Under Review']], ['Queries to answer', ['Query Raised']], ['Approved (awaiting settlement)', ['Approved', 'Partially Approved']], ['Settled', ['Settled']]].map(([label, list]) => {
          const count = list.reduce((s, k) => s + (summary[k]?.count || 0), 0);
          const amt = list.reduce((s, k) => s + (summary[k]?.amount || 0), 0);
          return (
            <div key={label} className="card stat" style={{ cursor: 'pointer' }} onClick={() => setStatus(list.join(','))}>
              <div className="label">{label}</div><div className="value">{count}</div><div className="foot">{money(amt)} claimed</div>
            </div>
          );
        })}
      </div>
      <Card flush>
        <div className="card-header">
          <div className="filters">
            <input className="input search" placeholder="Search claim no., policy, provider or pre-auth" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={STATUSES} />
          </div>
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          onRowClick={(c) => setOpen(c._id)}
          columns={[
            { key: 'n', label: 'Claim', render: (c) => <><span className="mono strong">{c.claimNo}</span><div className="cell-sub">{date(c.submittedAt)}</div></> },
            { key: 'p', label: 'Patient', render: (c) => <><div className="cell-main">{fullName(c.patient)}</div><div className="cell-sub">{c.patient?.uhid}</div></> },
            { key: 'i', label: 'Insurer / TPA', render: (c) => <>{c.provider}<div className="cell-sub">{c.tpa || '-'} · {c.policyNumber}</div></> },
            { key: 'inv', label: 'Bill', render: (c) => <span className="mono small">{c.invoice?.invoiceNo}</span> },
            { key: 'c', label: 'Claimed', align: 'right', render: (c) => money(c.claimAmount) },
            { key: 'a', label: 'Approved', align: 'right', render: (c) => (c.approvedAmount ? money(c.approvedAmount) : '-') },
            { key: 's', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
        <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      </Card>
      <NewClaim open={params.get('new') === '1'} invoiceId={params.get('invoice')} onClose={() => setParams({}, { replace: true })} onDone={(c) => { reload(); setOpen(c._id); }} />
      <ClaimDetail id={open} onClose={() => setOpen(null)} onChange={reload} />
    </>
  );
}

function NewClaim({ open, invoiceId, onClose, onDone }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useFetch(open && !invoiceId ? '/invoices' : null, { q: dq, status: 'Unpaid,Partially Paid', limit: 10 });
  const [inv, setInv] = useState(null);
  const [f, setF] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) { setInv(null); setError(null); return; }
    if (invoiceId) api.get(`/invoices/${invoiceId}`).then((r) => setInv(r.invoice)).catch(setError);
  }, [open, invoiceId]);
  useEffect(() => {
    if (inv) {
      const ins = inv.patient?.insurance || {};
      setF({ provider: ins.provider || '', tpa: ins.tpa || '', policyNumber: ins.policyNumber || '', preAuthNo: '', claimAmount: inv.balance, remarks: '' });
    }
  }, [inv]);
  const pick = async (row) => { const r = await api.get(`/invoices/${row._id}`); setInv(r.invoice); };
  const submit = async () => {
    setBusy(true); setError(null);
    try { const c = await api.post('/claims', { ...f, invoice: inv._id, claimAmount: Number(f.claimAmount) }); toast.success(`Claim ${c.claimNo} submitted`); onDone(c); onClose(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const b = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal open={open} onClose={onClose} title="New insurance claim" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!inv} loading={busy} onClick={submit}>Submit claim</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        {!inv ? (
          <>
            <input className="input" placeholder="Search outstanding invoices by patient, UHID or invoice no." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <DataTable
              rows={list.data?.data}
              loading={list.loading}
              onRowClick={pick}
              empty="No outstanding invoices"
              columns={[
                { key: 'n', label: 'Invoice', render: (i) => <span className="mono">{i.invoiceNo}</span> },
                { key: 'p', label: 'Patient', render: (i) => fullName(i.patient) },
                { key: 't', label: 'Type', render: (i) => i.type },
                { key: 'b', label: 'Balance', align: 'right', render: (i) => money(i.balance) },
              ]}
            />
          </>
        ) : (
          <>
            <div className="alert info">Bill <b>{inv.invoiceNo}</b> · {fullName(inv.patient)} ({inv.patient.uhid}) · Outstanding <b>{money(inv.balance)}</b></div>
            <div className="form-grid">
              <Field label="Insurance company" required><input className="input" {...b('provider')} /></Field>
              <Field label="TPA"><input className="input" {...b('tpa')} /></Field>
              <Field label="Policy number" required><input className="input" {...b('policyNumber')} /></Field>
              <Field label="Pre-authorisation no."><input className="input" {...b('preAuthNo')} /></Field>
              <Field label="Claim amount" required><input className="input" type="number" {...b('claimAmount')} /></Field>
              <Field label="Remarks" className="span-all"><textarea className="textarea" {...b('remarks')} placeholder="Documents enclosed, diagnosis, etc." /></Field>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ClaimDetail({ id, onClose, onChange }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: c, reload } = useFetch(id ? `/claims/${id}` : null);
  const [f, setF] = useState({ status: '', note: '', approvedAmount: '', settledAmount: '', preAuthNo: '' });
  useEffect(() => { if (c) setF({ status: '', note: '', approvedAmount: c.approvedAmount || c.claimAmount, settledAmount: c.approvedAmount || '', preAuthNo: c.preAuthNo || '' }); }, [c]);
  if (!id) return null;
  const closed = c && ['Settled', 'Rejected'].includes(c.status);
  const update = async () => {
    try {
      await api.post(`/claims/${id}/status`, { ...f, approvedAmount: Number(f.approvedAmount), settledAmount: Number(f.settledAmount) });
      toast.success(f.status === 'Settled' ? 'Claim settled and payment posted to the bill' : 'Claim updated');
      reload(); onChange();
    } catch (e) { toast.error(e); }
  };
  const b = (k) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Modal open onClose={onClose} title={c ? `Claim ${c.claimNo}` : 'Claim'} size="lg">
      {c && (
        <div className="grid grid-2">
          <div className="stack">
            <KV items={[
              ['Status', <StatusBadge status={c.status} />], ['Patient', fullName(c.patient)], ['Bill', <Link to={`/billing/${c.invoice?._id}`}>{c.invoice?.invoiceNo}</Link>],
              ['Insurer', c.provider], ['TPA', c.tpa], ['Policy', c.policyNumber], ['Pre-auth', c.preAuthNo], ['Claimed', money(c.claimAmount)],
              ['Approved', c.approvedAmount ? money(c.approvedAmount) : '-'], ['Settled', c.settledAmount ? `${money(c.settledAmount)} on ${date(c.settledAt)}` : '-'], ['Remarks', c.remarks],
            ]}
            />
            {can('insurance', 'rw') && !closed && (
              <div className="card" style={{ padding: 12 }}>
                <div className="form-section-title">Update status</div>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <Field label="New status"><Select {...b('status')} placeholder="Select" options={STATUSES.filter((s) => s !== 'Submitted' && s !== c.status)} /></Field>
                  <Field label="Pre-auth no."><input className="input" {...b('preAuthNo')} /></Field>
                  {['Approved', 'Partially Approved'].includes(f.status) && <Field label="Approved amount"><input className="input" type="number" {...b('approvedAmount')} /></Field>}
                  {f.status === 'Settled' && <Field label="Settled amount" hint="Posted to the bill as an insurance payment"><input className="input" type="number" {...b('settledAmount')} /></Field>}
                  <Field label="Note" className="span-all"><input className="input" {...b('note')} /></Field>
                </div>
                <Button variant="primary" className="mt-8" disabled={!f.status} onClick={update}>Update claim</Button>
              </div>
            )}
          </div>
          <div>
            <div className="form-section-title">History</div>
            <ul className="timeline">
              {[...c.history].reverse().map((h) => (
                <li key={h._id}><div className="when">{dateTime(h.at)} · {h.by?.name}</div><div className="strong">{h.status}</div>{h.note && <div className="small">{h.note}</div>}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
