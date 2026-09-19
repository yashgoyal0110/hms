import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useFetch } from '../lib/hooks.js';
import {
  compactMoney, date, downloadCsv, isoDate, money, num,
} from '../lib/format.js';
import {
  Button, Card, DataTable, Loading, PageHeader, Stat,
} from '../components/ui.jsx';

const axis = { fontSize: 11, fill: '#6b7682' };
const PALETTE = ['#0f5b6e', '#2f7f93', '#5aa3b3', '#c2410c', '#7c6f9f', '#a16207', '#4d7c0f', '#9f1239'];

const presets = () => {
  const t = new Date();
  return [
    ['Last 7 days', isoDate(new Date(Date.now() - 6 * 86400000)), isoDate(t)],
    ['Last 30 days', isoDate(new Date(Date.now() - 29 * 86400000)), isoDate(t)],
    ['This month', isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), isoDate(t)],
    ['Last 90 days', isoDate(new Date(Date.now() - 89 * 86400000)), isoDate(t)],
  ];
};

function CsvButton({ name, rows, cols }) {
  return <Button size="sm" icon={Download} onClick={() => downloadCsv(`${name}.csv`, rows || [], cols)} aria-label="Export CSV" />;
}

export default function Reports() {
  const [range, setRange] = useState(presets()[1].slice(1));
  const [from, to] = range;
  const { data: d, loading } = useFetch('/reports/analytics', { from, to });

  const totals = d && {
    income: d.revenueByType.reduce((s, x) => s + x.value, 0),
    expense: d.expenseByCategory.reduce((s, x) => s + x.value, 0),
    opd: d.opdByDepartment.reduce((s, x) => s + x.total, 0),
  };

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        sub={`Management information for ${date(from)} - ${date(to)}`}
      />
      <div className="filters mb-16 no-print">
        {presets().map(([label, f, t]) => <Button key={label} size="sm" variant={from === f && to === t ? 'primary' : ''} onClick={() => setRange([f, t])}>{label}</Button>)}
        <input type="date" className="input" value={from} onChange={(e) => setRange([e.target.value, to])} />
        <span className="muted">to</span>
        <input type="date" className="input" value={to} onChange={(e) => setRange([from, e.target.value])} />
      </div>
      {loading && !d ? <Loading /> : d && (
        <div className="stack">
          <div className="grid grid-4">
            <Stat label="Collections" value={compactMoney(totals.income)} foot={money(totals.income)} />
            <Stat label="Expenses" value={compactMoney(totals.expense)} foot={`Net ${money(totals.income - totals.expense)}`} />
            <Stat label="OPD appointments" value={num(totals.opd)} foot={`${num(d.newPatients)} new registrations`} />
            <Stat label="Admissions" value={num(d.ipd.admissions)} foot={`${d.ipd.discharges} discharges · ALOS ${d.ipd.avgLengthOfStay} days`} />
          </div>

          <Card title="Daily income and expenses">
            <div style={{ height: 280 }}>
              <ResponsiveContainer>
                <AreaChart data={d.daily}>
                  <CartesianGrid stroke="#eef1f4" vertical={false} />
                  <XAxis dataKey="date" tick={axis} tickFormatter={(x) => new Date(x).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={axis} tickFormatter={compactMoney} width={70} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => money(v)} labelFormatter={date} />
                  <Legend />
                  <Area type="monotone" dataKey="income" name="Income" stroke="#0f5b6e" fill="#0f5b6e" fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="expense" name="Expense" stroke="#c2410c" fill="#c2410c" fillOpacity={0.08} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-2">
            <Card title="Revenue by service line" actions={<CsvButton name="revenue-by-service" rows={d.revenueByType} cols={[{ label: 'Service', value: 'name' }, { label: 'Amount', value: 'value' }]} />}>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={d.revenueByType} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid stroke="#eef1f4" horizontal={false} />
                    <XAxis type="number" tick={axis} tickFormatter={compactMoney} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={axis} width={90} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="value" name="Revenue" fill="#0f5b6e" radius={[0, 3, 3, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Patient demographics (new registrations)" actions={<CsvButton name="demographics" rows={d.demographics} cols={[{ label: 'Age band', value: 'band' }, { label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }, { label: 'Other', value: 'Other' }]} />}>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={d.demographics}>
                    <CartesianGrid stroke="#eef1f4" vertical={false} />
                    <XAxis dataKey="band" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} allowDecimals={false} tickLine={false} axisLine={false} width={30} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Male" stackId="a" fill={PALETTE[0]} />
                    <Bar dataKey="Female" stackId="a" fill={PALETTE[2]} />
                    <Bar dataKey="Other" stackId="a" fill={PALETTE[4]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-2">
            <Card title="OPD by department" flush actions={<CsvButton name="opd-by-department" rows={d.opdByDepartment} cols={[{ label: 'Department', value: 'department' }, { label: 'Appointments', value: 'total' }, { label: 'Completed', value: 'completed' }, { label: 'No-show', value: 'noShow' }]} />}>
              <DataTable
                rows={d.opdByDepartment}
                columns={[
                  { key: 'd', label: 'Department', render: (x) => x.department },
                  { key: 't', label: 'Booked', align: 'right', render: (x) => x.total },
                  { key: 'c', label: 'Seen', align: 'right', render: (x) => x.completed },
                  { key: 'n', label: 'No-show', align: 'right', render: (x) => x.noShow },
                  { key: 'r', label: 'No-show %', align: 'right', render: (x) => `${x.total ? ((x.noShow / x.total) * 100).toFixed(1) : 0}%` },
                ]}
              />
            </Card>
            <Card title="Doctor-wise consultations" flush actions={<CsvButton name="doctor-consultations" rows={d.doctorStats} cols={[{ label: 'Doctor', value: 'doctor' }, { label: 'Specialisation', value: 'specialization' }, { label: 'Consultations', value: 'consultations' }, { label: 'Unique patients', value: 'uniquePatients' }]} />}>
              <DataTable
                rows={d.doctorStats}
                columns={[
                  { key: 'd', label: 'Doctor', render: (x) => <>{x.doctor}<div className="cell-sub">{x.specialization}</div></> },
                  { key: 'c', label: 'Consultations', align: 'right', render: (x) => x.consultations },
                  { key: 'u', label: 'Unique patients', align: 'right', render: (x) => x.uniquePatients },
                ]}
              />
            </Card>
          </div>

          <div className="grid grid-3">
            <Card title="Top diagnoses" flush actions={<CsvButton name="top-diagnoses" rows={d.topDiagnoses} cols={[{ label: 'Diagnosis', value: 'name' }, { label: 'ICD-10', value: 'code' }, { label: 'Count', value: 'count' }]} />}>
              <DataTable rows={d.topDiagnoses} rowKey="name" columns={[{ key: 'n', label: 'Diagnosis', render: (x) => <>{x.name}<div className="cell-sub">{x.code}</div></> }, { key: 'c', label: 'Cases', align: 'right', render: (x) => x.count }]} />
            </Card>
            <Card title="Top investigations" flush actions={<CsvButton name="top-investigations" rows={d.topTests} cols={[{ label: 'Test', value: 'name' }, { label: 'Category', value: 'category' }, { label: 'Count', value: 'count' }, { label: 'Revenue', value: 'revenue' }]} />}>
              <DataTable rows={d.topTests} rowKey="name" columns={[{ key: 'n', label: 'Test', render: (x) => <>{x.name}<div className="cell-sub">{x.category === 'lab' ? 'Laboratory' : 'Radiology'}</div></> }, { key: 'c', label: 'Count', align: 'right', render: (x) => x.count }, { key: 'r', label: 'Revenue', align: 'right', render: (x) => money(x.revenue) }]} />
            </Card>
            <Card title="Top medicines by sales" flush actions={<CsvButton name="top-medicines" rows={d.topMedicines} cols={[{ label: 'Medicine', value: 'name' }, { label: 'Qty', value: 'qty' }, { label: 'Revenue', value: 'revenue' }]} />}>
              <DataTable rows={d.topMedicines} rowKey="name" columns={[{ key: 'n', label: 'Medicine', render: (x) => x.name }, { key: 'q', label: 'Qty', align: 'right', render: (x) => x.qty }, { key: 'r', label: 'Sales', align: 'right', render: (x) => money(x.revenue) }]} />
            </Card>
          </div>

          <div className="grid grid-3">
            <Card title="Collections by payment mode" flush>
              <DataTable rows={d.revenueByMode} rowKey="name" columns={[{ key: 'n', label: 'Mode', render: (x) => x.name }, { key: 'v', label: 'Amount', align: 'right', render: (x) => money(x.value) }, { key: 'p', label: 'Share', align: 'right', render: (x) => `${((x.value / (totals.income || 1)) * 100).toFixed(1)}%` }]} />
            </Card>
            <Card title="Expenses by head" flush>
              <DataTable rows={d.expenseByCategory} rowKey="name" columns={[{ key: 'n', label: 'Head', render: (x) => x.name }, { key: 'v', label: 'Amount', align: 'right', render: (x) => money(x.value) }]} />
            </Card>
            <Card title="Invoices by status" flush>
              <DataTable rows={d.invoiceStatus} rowKey="status" columns={[{ key: 's', label: 'Status', render: (x) => x.status }, { key: 'c', label: 'Count', align: 'right', render: (x) => x.count }, { key: 't', label: 'Value', align: 'right', render: (x) => money(x.total) }]} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
