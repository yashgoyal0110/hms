import { useEffect, useState } from 'react';
import { Send, Plus, X, CalendarClock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  addDays, dateTime, fullName, isoDate,
} from '../lib/format.js';
import {
  Badge, Button, Card, DataTable, Field, Modal, PageHeader, Pagination, Select, StatusBadge, Tabs,
} from '../components/ui.jsx';
import { PatientPicker } from '../components/pickers.jsx';

export default function Communication() {
  const [tab, setTab] = useState('compose');
  const gateways = useFetch('/messages/gateways');
  const g = gateways.data || {};
  return (
    <>
      <PageHeader title="Patient Communication" sub="SMS, WhatsApp and email notifications, reminders and campaigns" />
      <div className="alert info mb-16">
        <div>
          Gateways: SMS/WhatsApp <b>{g.sms ? 'connected' : 'not configured'}</b> · Email <b>{g.email ? 'connected' : 'not configured'}</b>.
          {(!g.sms || !g.email) && ' Messages for unconfigured channels are recorded in the log with status “Logged”. Configure SMTP_* and SMS_WEBHOOK_URL in the server environment to enable delivery.'}
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'compose', label: 'Send message' }, { value: 'log', label: 'Message log' }, { value: 'templates', label: 'Templates' }]} />
      {tab === 'compose' && <Compose onSent={() => setTab('log')} />}
      {tab === 'log' && <Log />}
      {tab === 'templates' && <Templates />}
    </>
  );
}

function Compose({ onSent }) {
  const toast = useToast();
  const { can } = useAuth();
  const templates = useFetch('/templates');
  const [recipients, setRecipients] = useState([]);
  const [channel, setChannel] = useState('SMS');
  const [template, setTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  const applyTemplate = (key) => {
    setTemplate(key);
    const t = templates.data?.find((x) => x.key === key);
    if (t) { setChannel(t.channel); setSubject(t.subject || ''); setBody(t.body); }
  };
  const addTomorrow = async () => {
    const r = await api.get('/appointments', { date: isoDate(addDays(new Date(), 1)), status: 'Scheduled', limit: 500 });
    const list = r.data.map((a) => a.patient).filter(Boolean);
    setRecipients((cur) => [...cur, ...list.filter((p) => !cur.some((c) => c._id === p._id))]);
    applyTemplate('appointment_reminder');
    toast.info(`${list.length} patients with appointments tomorrow added`);
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post('/messages', { patients: recipients.map((p) => p._id), channel, subject, body, template });
      setResults(r.results);
      toast.success(`${r.results.filter((x) => x.status !== 'Skipped').length} message(s) processed`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  if (!can('communication', 'rw')) return <p className="muted">You have read-only access.</p>;
  return (
    <div className="grid grid-main-side">
      <Card title="Compose">
        <div className="stack">
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Template"><Select value={template} onChange={(e) => applyTemplate(e.target.value)} placeholder="Custom message" options={(templates.data || []).filter((t) => t.active).map((t) => ({ value: t.key, label: t.name }))} /></Field>
            <Field label="Channel"><Select value={channel} onChange={(e) => setChannel(e.target.value)} options={['SMS', 'WhatsApp', 'Email']} /></Field>
          </div>
          {channel === 'Email' && <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
          <Field label="Message" hint={`Placeholders: {{patientName}}, {{uhid}}, {{hospitalName}}, {{hospitalPhone}} · ${body.length} characters${channel === 'SMS' ? ` · ${Math.max(1, Math.ceil(body.length / 160))} SMS` : ''}`}>
            <textarea className="textarea" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Button variant="primary" icon={Send} loading={busy} disabled={!recipients.length || !body.trim()} onClick={send}>Send to {recipients.length} recipient{recipients.length === 1 ? '' : 's'}</Button>
          {results && (
            <div>
              <div className="form-section-title">Delivery results</div>
              {results.map((r, i) => <div key={i} className="row between small" style={{ padding: '3px 0' }}><span className="mono">{r.patient}</span><span><StatusBadge status={r.status} /> {r.error && <span className="muted">{r.error}</span>}</span></div>)}
              <Button size="sm" className="mt-8" onClick={onSent}>View message log</Button>
            </div>
          )}
        </div>
      </Card>
      <Card title={`Recipients (${recipients.length})`} actions={recipients.length > 0 && <Button size="sm" onClick={() => setRecipients([])}>Clear</Button>}>
        <div className="stack">
          <PatientPicker value={null} onChange={(p) => p && setRecipients((cur) => (cur.some((c) => c._id === p._id) ? cur : [...cur, p]))} placeholder="Add patient" />
          <Button size="sm" icon={CalendarClock} onClick={addTomorrow}>Add tomorrow’s appointments</Button>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {recipients.map((p) => (
              <div key={p._id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span><div className="cell-main">{fullName(p)}</div><div className="cell-sub">{p.uhid} · {channel === 'Email' ? p.email || 'no email' : p.phone}</div></span>
                <Button size="sm" variant="ghost" icon={X} onClick={() => setRecipients(recipients.filter((x) => x._id !== p._id))} aria-label="Remove" />
              </div>
            ))}
            {!recipients.length && <p className="muted small">No recipients selected.</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Log() {
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch('/messages', { channel, status, page, limit: 25 });
  return (
    <Card flush>
      <div className="card-header">
        <div className="filters">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="All channels" options={['SMS', 'WhatsApp', 'Email']} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={['Sent', 'Logged', 'Failed', 'Queued']} />
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data?.data}
        columns={[
          { key: 'd', label: 'Time', render: (m) => dateTime(m.createdAt) },
          { key: 'p', label: 'Patient', render: (m) => <>{fullName(m.patient)}<div className="cell-sub">{m.to}</div></> },
          { key: 'c', label: 'Channel', render: (m) => <Badge>{m.channel}</Badge> },
          { key: 'b', label: 'Message', render: (m) => <div style={{ maxWidth: 480 }}>{m.subject && <b>{m.subject} - </b>}{m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body}</div> },
          { key: 'src', label: 'Source', render: (m) => (m.automatic ? <span className="muted">Automatic{m.template ? ` · ${m.template}` : ''}</span> : m.sentBy?.name) },
          { key: 's', label: 'Status', render: (m) => <span title={m.error}><StatusBadge status={m.status} /></span> },
        ]}
      />
      <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
    </Card>
  );
}

function Templates() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useFetch('/templates');
  const [edit, setEdit] = useState(null);
  useEffect(() => {}, []);
  const save = async () => {
    try {
      if (edit._id) await api.put(`/templates/${edit._id}`, edit); else await api.post('/templates', edit);
      toast.success('Template saved'); setEdit(null); reload();
    } catch (e) { toast.error(e); }
  };
  const b = (k) => ({ value: edit?.[k] ?? '', onChange: (e) => setEdit({ ...edit, [k]: e.target.value }) });
  return (
    <Card flush>
      <div className="card-header"><span className="small muted">Templates marked automatic are sent when the event occurs (booking, report ready, payment, discharge).</span>{can('communication', 'rw') && <Button size="sm" variant="primary" icon={Plus} onClick={() => setEdit({ key: '', name: '', channel: 'SMS', subject: '', body: '', autoSend: false, active: true })}>New template</Button>}</div>
      <DataTable
        loading={loading}
        rows={data}
        onRowClick={can('communication', 'rw') ? (t) => setEdit(t) : undefined}
        columns={[
          { key: 'n', label: 'Template', render: (t) => <><div className="cell-main">{t.name}</div><div className="cell-sub mono">{t.key}</div></> },
          { key: 'c', label: 'Channel', render: (t) => <Badge>{t.channel}</Badge> },
          { key: 'b', label: 'Content', render: (t) => <div style={{ maxWidth: 520 }} className="small">{t.body}</div> },
          { key: 'a', label: 'Trigger', render: (t) => (t.autoSend ? <Badge tone="success">Automatic</Badge> : <span className="muted">Manual</span>) },
          { key: 's', label: 'Status', render: (t) => (t.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
        ]}
      />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} size="lg" title={edit?._id ? 'Edit template' : 'New template'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        {edit && (
          <div className="form-grid">
            <Field label="Name" required className="span-2"><input className="input" {...b('name')} /></Field>
            <Field label="Key" required hint="Unique identifier"><input className="input" {...b('key')} disabled={Boolean(edit._id)} /></Field>
            <Field label="Channel"><Select {...b('channel')} options={['SMS', 'WhatsApp', 'Email']} /></Field>
            <Field label="Send automatically"><Select value={edit.autoSend ? 'true' : 'false'} onChange={(e) => setEdit({ ...edit, autoSend: e.target.value === 'true' })} options={[{ value: 'false', label: 'No - manual only' }, { value: 'true', label: 'Yes - on system event' }]} /></Field>
            <Field label="Status"><Select value={edit.active ? 'true' : 'false'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'true' })} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} /></Field>
            {edit.channel === 'Email' && <Field label="Subject" className="span-all"><input className="input" {...b('subject')} /></Field>}
            <Field label="Body" className="span-all"><textarea className="textarea" rows={6} {...b('body')} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}
