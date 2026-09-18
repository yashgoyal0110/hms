import { useState } from 'react';
import { Plus, Download, Trash2 } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useDebounced, useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import {
  compactMoney, date, downloadCsv, isoDate, money,
} from '../lib/format.js';
import {
  Badge, Button, Card, Confirm, DataTable, Field, Modal, PageHeader, Pagination, Select, Stat, Tabs,
} from '../components/ui.jsx';

const axis = { fontSize: 11, fill: '#6b7682' };

export default function Accounting() {
  const { can } = useAuth();
  const [tab, setTab] = useState('ledger');
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(isoDate());
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [add, setAdd] = useState(null);
  const [del, setDel] = useState(null);
  const toast = useToast();
  const dq = useDebounced(q);
  const meta = useFetch('/ledger/meta');
  const ledger = useFetch(tab === 'ledger' ? '/ledger' : null, { from, to, type, category, q: dq, page, limit: 50 });
  const summary = useFetch(tab === 'pl' ? '/ledger/summary' : null, { from, to });
  const s = ledger.data?.summary || {};

  const exportCsv = async () => {
    const all = await api.get('/ledger', { from, to, type, category, q: dq, limit: 500 });
    downloadCsv(`ledger-${from}-to-${to}.csv`, all.data, [
      { label: 'Entry', value: 'entryNo' }, { label: 'Date', value: (e) => date(e.date) }, { label: 'Type', value: 'type' }, { label: 'Category', value: 'category' },
      { label: 'Description', value: 'description' }, { label: 'Payee', value: 'payee' }, { label: 'Mode', value: 'mode' }, { label: 'Reference', value: 'reference' }, { label: 'Amount', value: 'amount' },
    ]);
  };
  const cats = type === 'Income' ? meta.data?.incomeCategories : type === 'Expense' ? meta.data?.expenseCategories : [...(meta.data?.incomeCategories || []), ...(meta.data?.expenseCategories || [])];

  return (
    <>
      <PageHeader
        title="Accounts"
        sub="Cash book, expenses and profit & loss"
        actions={can('accounting', 'rw') && (
          <>
            <Button icon={Plus} onClick={() => setAdd('Income')}>Other income</Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdd('Expense')}>Record expense</Button>
          </>
        )}
      />
      <div className="filters mb-16">
        <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <span className="muted">to</span>
        <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'ledger', label: 'Ledger' }, { value: 'pl', label: 'Profit & loss' }]} />
      {tab === 'ledger' ? (
        <>
          <div className="grid grid-3 mb-16">
            <Stat label="Income" value={money(s.income)} tone="success" />
            <Stat label="Expenses" value={money(s.expense)} tone="danger" />
            <Stat label="Net" value={money(s.net)} tone={s.net < 0 ? 'danger' : ''} />
          </div>
          <Card flush>
            <div className="card-header">
              <div className="filters">
                <input className="input search" placeholder="Search description, payee or reference" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                <Select value={type} onChange={(e) => { setType(e.target.value); setCategory(''); setPage(1); }} placeholder="Income & expense" options={['Income', 'Expense']} />
                <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="All categories" options={cats || []} />
              </div>
              <Button size="sm" icon={Download} onClick={exportCsv}>Export</Button>
            </div>
            <DataTable
              loading={ledger.loading}
              rows={ledger.data?.data}
              columns={[
                { key: 'd', label: 'Date', render: (e) => date(e.date) },
                { key: 'n', label: 'Entry', render: (e) => <span className="mono small">{e.entryNo}</span> },
                { key: 'c', label: 'Category', render: (e) => <>{e.category}{e.auto && <div className="cell-sub">System</div>}</> },
                { key: 'desc', label: 'Description', render: (e) => <>{e.description}{e.payee && <div className="cell-sub">{e.payee}</div>}</> },
                { key: 'm', label: 'Mode', render: (e) => e.mode },
                { key: 'in', label: 'Income', align: 'right', render: (e) => (e.type === 'Income' ? <span className="success-text">{money(e.amount)}</span> : '') },
                { key: 'out', label: 'Expense', align: 'right', render: (e) => (e.type === 'Expense' ? <span className="danger-text">{money(e.amount)}</span> : '') },
                { key: 'x', label: '', className: 'actions-cell', render: (e) => can('accounting', 'rw') && !e.auto && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(e)} aria-label="Delete" /> },
              ]}
            />
            <Pagination page={ledger.data?.page} pages={ledger.data?.pages} total={ledger.data?.total} onPage={setPage} />
          </Card>
        </>
      ) : <ProfitLoss data={summary.data} />}
      <EntryModal type={add} meta={meta.data} onClose={() => setAdd(null)} onDone={() => { ledger.reload(); summary.reload(); }} />
      <Confirm open={Boolean(del)} onClose={() => setDel(null)} danger title="Delete entry" message={`Delete ${del?.entryNo} (${money(del?.amount)})?`} confirmLabel="Delete" onConfirm={async () => { try { await api.del(`/ledger/${del._id}`); toast.success('Entry deleted'); setDel(null); ledger.reload(); } catch (e) { toast.error(e); } }} />
    </>
  );
}

function ProfitLoss({ data }) {
  if (!data) return null;
  const inc = data.income.reduce((s, x) => s + x.total, 0);
  const exp = data.expense.reduce((s, x) => s + x.total, 0);
  return (
    <div className="stack">
      <div className="grid grid-3">
        <Stat label="Total income" value={money(inc)} tone="success" />
        <Stat label="Total expenses" value={money(exp)} tone="danger" />
        <Stat label="Net surplus" value={money(inc - exp)} foot={inc ? `Margin ${(((inc - exp) / inc) * 100).toFixed(1)}%` : ''} tone={inc - exp < 0 ? 'danger' : ''} />
      </div>
      <Card title="Monthly income vs expense">
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data.monthly}>
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickFormatter={compactMoney} width={70} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar dataKey="income" name="Income" fill="#0f5b6e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#c2410c" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-3">
        <Card title="Income by department" flush>
          <DataTable rows={data.income} rowKey="category" columns={[{ key: 'c', label: 'Category', render: (x) => x.category }, { key: 't', label: 'Amount', align: 'right', render: (x) => money(x.total) }, { key: 'p', label: 'Share', align: 'right', render: (x) => `${((x.total / (inc || 1)) * 100).toFixed(1)}%` }]} />
        </Card>
        <Card title="Expenses by head" flush>
          <DataTable rows={data.expense} rowKey="category" columns={[{ key: 'c', label: 'Category', render: (x) => x.category }, { key: 't', label: 'Amount', align: 'right', render: (x) => money(x.total) }, { key: 'p', label: 'Share', align: 'right', render: (x) => `${((x.total / (exp || 1)) * 100).toFixed(1)}%` }]} />
        </Card>
        <Card title="Collections by payment mode" flush>
          <DataTable rows={data.byMode} rowKey="mode" columns={[{ key: 'm', label: 'Mode', render: (x) => <Badge>{x.mode}</Badge> }, { key: 't', label: 'Amount', align: 'right', render: (x) => money(x.total) }]} />
        </Card>
      </div>
    </div>
  );
}

function EntryModal({ type, meta, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ date: isoDate(), category: '', amount: '', mode: 'Bank Transfer', description: '', payee: '', reference: '' });
  const [busy, setBusy] = useState(false);
  const b = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const submit = async () => {
    setBusy(true);
    try { await api.post('/ledger', { ...f, type, amount: Number(f.amount) }); toast.success(`${type} recorded`); setF({ ...f, amount: '', description: '', payee: '', reference: '' }); onDone(); onClose(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={Boolean(type)} onClose={onClose} title={type === 'Expense' ? 'Record expense' : 'Record other income'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!f.category || !f.amount} onClick={submit}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Date" required><input type="date" className="input" {...b('date')} /></Field>
        <Field label="Category" required><Select {...b('category')} placeholder="Select" options={(type === 'Expense' ? meta?.expenseCategories : meta?.incomeCategories) || []} /></Field>
        <Field label="Amount" required><input type="number" className="input" {...b('amount')} /></Field>
        <Field label="Mode"><Select {...b('mode')} options={['Cash', 'Bank Transfer', 'UPI', 'Card', 'Cheque']} /></Field>
        <Field label={type === 'Expense' ? 'Paid to' : 'Received from'}><input className="input" {...b('payee')} /></Field>
        <Field label="Reference / voucher no."><input className="input" {...b('reference')} /></Field>
        <Field label="Description" className="span-all"><input className="input" {...b('description')} /></Field>
      </div>
    </Modal>
  );
}
