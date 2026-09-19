import { useEffect, useState } from 'react';
import {
  Save, DatabaseBackup, Download, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useDebounced, useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { dateTime, isoDate } from '../lib/format.js';
import {
  Badge, Button, Card, DataTable, Field, KV, PageHeader, Pagination, Tabs,
} from '../components/ui.jsx';

export default function Settings() {
  const { can } = useAuth();
  const [tab, setTab] = useState('hospital');
  return (
    <>
      <PageHeader title="Settings & Security" sub="Hospital profile, data protection, backups and audit trail" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'hospital', label: 'Hospital profile' },
          ...(can('backup') ? [{ value: 'backup', label: 'Backups' }] : []),
          ...(can('audit') ? [{ value: 'audit', label: 'Audit trail' }] : []),
        ]}
      />
      {tab === 'hospital' && <Hospital />}
      {tab === 'backup' && <Backups />}
      {tab === 'audit' && <Audit />}
    </>
  );
}

function Hospital() {
  const { settings, reloadSettings, can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(settings || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) setF(settings); }, [settings]);
  const b = (k, num) => ({ value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value }), disabled: !can('settings', 'rw') });
  const save = async () => {
    setBusy(true);
    try { await api.put('/settings', f); await reloadSettings(); toast.success('Settings saved'); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Hospital profile" actions={can('settings', 'rw') && <Button variant="primary" icon={Save} loading={busy} onClick={save}>Save</Button>}>
      <div className="form-section">
        <div className="form-section-title">Identity (appears on prescriptions, reports and invoices)</div>
        <div className="form-grid">
          <Field label="Hospital name" className="span-2"><input className="input" {...b('name')} /></Field>
          <Field label="Tagline"><input className="input" {...b('tagline')} /></Field>
          <Field label="Address" className="span-all"><input className="input" {...b('address')} /></Field>
          <Field label="Phone"><input className="input" {...b('phone')} /></Field>
          <Field label="Email"><input className="input" {...b('email')} /></Field>
          <Field label="Website"><input className="input" {...b('website')} /></Field>
          <Field label="Registration no."><input className="input" {...b('registrationNo')} /></Field>
          <Field label="GSTIN"><input className="input" {...b('gstin')} /></Field>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title">Billing defaults</div>
        <div className="form-grid">
          <Field label="Currency symbol"><input className="input" {...b('currency')} /></Field>
          <Field label="Registration fee"><input className="input" type="number" {...b('registrationFee', true)} /></Field>
          <Field label="Default consultation fee"><input className="input" type="number" {...b('defaultConsultationFee', true)} /></Field>
          <Field label="Invoice footer" className="span-all"><input className="input" {...b('invoiceFooter')} /></Field>
          <Field label="Prescription footer" className="span-all"><input className="input" {...b('prescriptionFooter')} /></Field>
        </div>
      </div>
    </Card>
  );
}

function fmtSize(n) {
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

function Backups() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, reload, loading } = useFetch('/backups');
  const trigger = async () => {
    try { const r = await api.post('/backups'); toast.success(r.message); setTimeout(reload, 35000); reload(); } catch (e) { toast.error(e); }
  };
  const s = data?.status;
  return (
    <div className="stack">
      <div className="grid grid-3">
        <Card><KV items={[['Last backup', s ? dateTime(s.lastRun) : 'Not yet run'], ['Result', s ? <Badge tone={s.status === 'success' ? 'success' : 'danger'} plain={false}>{s.status}</Badge> : '-'], ['Trigger', s?.reason]]} /></Card>
        <Card><KV items={[['Schedule', 'Automatic, every 24 hours'], ['Retention', '14 days (configurable)'], ['Format', 'mongodump archive, gzip']]} /></Card>
        <Card><KV items={[['Stored backups', data?.files?.length ?? '-'], ['Pending request', data?.pending ? 'Yes - starting shortly' : 'No']]} /></Card>
      </div>
      <Card
        flush
        title="Backup archives"
        actions={(
          <>
            <Button size="sm" icon={RefreshCw} onClick={reload} aria-label="Refresh" />
            {can('backup', 'rw') && <Button size="sm" variant="primary" icon={DatabaseBackup} disabled={data?.pending} onClick={trigger}>Back up now</Button>}
          </>
        )}
      >
        <DataTable
          loading={loading}
          rows={data?.files}
          rowKey="name"
          empty="No backups yet - the first scheduled backup runs shortly after start-up"
          columns={[
            { key: 'n', label: 'File', render: (f) => <span className="mono">{f.name}</span> },
            { key: 'd', label: 'Created', render: (f) => dateTime(f.createdAt) },
            { key: 's', label: 'Size', align: 'right', render: (f) => fmtSize(f.size) },
            { key: 'x', label: '', className: 'actions-cell', render: (f) => can('backup', 'rw') && <a className="btn btn-sm" href={`/api/backups/${f.name}`}><Download size={14} />Download</a> },
          ]}
        />
        <div className="card-body small muted">
          Restore (server administrator): <span className="mono">docker exec -i hms-mongo mongorestore --archive --gzip --drop -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin &lt; backup.archive.gz</span>
        </div>
      </Card>
    </div>
  );
}

function Audit() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(isoDate());
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading } = useFetch('/audit', { q: dq, from, to, page, limit: 50 });
  return (
    <Card flush>
      <div className="card-header">
        <div className="filters">
          <input className="input search" placeholder="Search user, action, module or IP" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">to</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 't', label: 'Time', render: (a) => dateTime(a.at) },
          { key: 'u', label: 'User', render: (a) => <>{a.userName || '-'}<div className="cell-sub">{a.role}</div></> },
          { key: 'a', label: 'Action', render: (a) => <Badge tone={a.action.startsWith('LOGIN_FAILED') ? 'danger' : a.action.startsWith('DELETE') ? 'warning' : a.action.startsWith('LOGIN') ? 'info' : ''}>{a.action}</Badge> },
          { key: 'e', label: 'Module', render: (a) => a.entity },
          { key: 'p', label: 'Request', render: (a) => <span className="mono small">{a.method} {a.path}</span> },
          { key: 'i', label: 'IP address', render: (a) => <span className="mono small">{a.ip}</span> },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
    </Card>
  );
}
