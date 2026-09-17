import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useDebounced, useFetch } from '../../lib/hooks.js';
import {
  date, downloadCsv, fullName, isoDate, money,
} from '../../lib/format.js';
import {
  Button, Card, DataTable, PageHeader, Pagination, Select, Stat, StatusBadge,
} from '../../components/ui.jsx';

export default function InvoiceList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(isoDate());
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const query = { q: dq, status, type, from, to };
  const { data, loading } = useFetch('/invoices', { ...query, page, limit: 25 });
  const s = data?.summary || {};

  return (
    <>
      <PageHeader
        title="Billing"
        sub="Patient invoices, collections and receivables"
        actions={(
          <>
            {can('billing', 'rw') && <Button variant="primary" icon={Plus} onClick={() => navigate('/billing/new')}>New bill</Button>}
          </>
        )}
      />
      <div className="grid grid-3 mb-16">
        <Stat label="Billed (filtered)" value={money(s.total)} foot={`${data?.total ?? 0} invoices`} />
        <Stat label="Collected" value={money(s.paid)} tone="success" />
        <Stat label="Outstanding" value={money(s.due)} tone={s.due > 0 ? 'danger' : ''} />
      </div>
      <Card flush>
        <div className="card-header">
          <div className="filters">
            <input className="input search" placeholder="Search invoice no., patient, UHID or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={[{ value: 'Unpaid,Partially Paid', label: 'Outstanding' }, 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled']} />
            <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder="All types" options={['OPD', 'IPD', 'Pharmacy', 'Laboratory', 'Radiology', 'OT', 'General']} />
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="muted">to</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          onRowClick={(i) => navigate(`/billing/${i._id}`)}
          columns={[
            { key: 'n', label: 'Invoice', render: (i) => <><span className="mono strong">{i.invoiceNo}</span><div className="cell-sub">{date(i.createdAt)}</div></> },
            { key: 'p', label: 'Patient', render: (i) => <><div className="cell-main">{fullName(i.patient)}</div><div className="cell-sub">{i.patient?.uhid}</div></> },
            { key: 't', label: 'Type', render: (i) => i.type },
            { key: 'total', label: 'Total', align: 'right', render: (i) => money(i.total) },
            { key: 'paid', label: 'Paid', align: 'right', render: (i) => money(i.amountPaid) },
            { key: 'bal', label: 'Balance', align: 'right', render: (i) => <span className={i.balance > 0 ? 'danger-text strong' : i.balance < 0 ? 'warning-text strong' : ''}>{money(i.balance)}</span> },
            { key: 's', label: 'Status', render: (i) => <StatusBadge status={!i.finalized && i.status !== 'Cancelled' ? 'Open' : i.status} /> },
          ]}
        />
        <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      </Card>
    </>
  );
}
