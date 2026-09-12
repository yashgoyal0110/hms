import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pencil, CalendarPlus, FlaskConical, BedDouble, Receipt, Printer, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useFetch } from '../../lib/hooks.js';
import { api } from '../../lib/api.js';
import {
  ageSex, date, dateTime, fullName, initials, money, slot12,
} from '../../lib/format.js';
import {
  Button, Card, DataTable, ErrorBox, KV, Loading, Modal, PageHeader, StatusBadge, Tabs,
} from '../../components/ui.jsx';
import Prescription from '../../components/Prescription.jsx';

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data, loading, error } = useFetch(`/patients/${id}`);
  const hist = useFetch(`/patients/${id}/history`);
  const [tab, setTab] = useState('overview');
  const [rx, setRx] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { patient: p, activeAdmission, outstanding } = data;
  const h = hist.data || {};

  const openRx = async (e) => setRx(await api.get(`/encounters/${e._id}`));

  return (
    <>
      <PageHeader
        crumbs={<><Link to="/patients">Patients</Link> / {p.uhid}</>}
        title={`${p.title ? `${p.title}. ` : ''}${fullName(p)}`}
        actions={(
          <>
            {can('patients', 'rw') && <Button icon={Pencil} onClick={() => navigate(`/patients/${id}/edit`)}>Edit</Button>}
            {can('appointments', 'rw') && <Button icon={CalendarPlus} onClick={() => navigate(`/appointments?book=1&patient=${id}`)}>Book appointment</Button>}
            {can('lab', 'rw') && <Button icon={FlaskConical} onClick={() => navigate(`/laboratory?new=1&patient=${id}`)}>Order tests</Button>}
            {can('ipd', 'rw') && !activeAdmission && <Button icon={BedDouble} onClick={() => navigate(`/ipd?admit=1&patient=${id}`)}>Admit</Button>}
            {can('billing', 'rw') && <Button icon={Receipt} onClick={() => navigate(`/billing/new?patient=${id}`)}>New bill</Button>}
          </>
        )}
      />

      <div className="card mb-16">
        <div className="patient-banner">
          <span className="avatar">{initials(fullName(p))}</span>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="row" style={{ gap: 10 }}>
              <b style={{ fontSize: 15 }}>{fullName(p)}</b>
              <span className="mono muted">{p.uhid}</span>
              <StatusBadge status={p.status} />
              {activeAdmission && <Link to={`/ipd/${activeAdmission._id}`}><span className="badge info">Admitted · {activeAdmission.ward?.name} / {activeAdmission.bedNumber}</span></Link>}
            </div>
            <div className="meta mt-8">
              <span>Age/Sex <b>{ageSex(p) || '-'}</b></span>
              <span>DOB <b>{date(p.dob)}</b></span>
              <span>Blood group <b>{p.bloodGroup}</b></span>
              <span>Phone <b>{p.phone}</b></span>
              <span>Visits <b>{data.visits}</b></span>
              {outstanding > 0 && <span>Outstanding <b className="danger-text">{money(outstanding)}</b></span>}
            </div>
          </div>
          {(p.allergies?.length > 0) && (
            <div className="alert danger" style={{ maxWidth: 320 }}>
              <AlertTriangle />
              <div><b>Allergies:</b> {p.allergies.join(', ')}</div>
            </div>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'visits', label: 'Consultations', count: h.encounters?.length },
          { value: 'appointments', label: 'Appointments', count: h.appointments?.length },
          { value: 'admissions', label: 'Admissions', count: h.admissions?.length },
          { value: 'diagnostics', label: 'Lab & Imaging', count: h.labOrders?.length },
          { value: 'surgeries', label: 'Surgeries', count: h.surgeries?.length },
          ...(can('billing') ? [{ value: 'billing', label: 'Billing', count: h.invoices?.length }] : []),
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-main-side">
          <div className="stack">
            <Card title="Demographics">
              <div className="grid grid-2">
                <KV items={[
                  ['Gender', p.gender], ['Marital status', p.maritalStatus], ['Occupation', p.occupation], ['Email', p.email], ['Alternate phone', p.altPhone],
                  ['ID proof', p.idProof?.number ? `${p.idProof.type} - ${p.idProof.number}` : ''],
                ]}
                />
                <KV items={[
                  ['Address', [p.address?.line1, p.address?.city, p.address?.state, p.address?.pincode].filter(Boolean).join(', ')],
                  ['Emergency contact', p.emergencyContact?.name ? `${p.emergencyContact.name} (${p.emergencyContact.relation || '-'}) · ${p.emergencyContact.phone || ''}` : ''],
                  ['Referred by', p.referredBy], ['Registered', `${date(p.createdAt)}${p.registeredBy ? ` by ${p.registeredBy.name}` : ''}`],
                ]}
                />
              </div>
            </Card>
            <Card title="Recent consultations" flush>
              <EncounterTable rows={(h.encounters || []).slice(0, 5)} onOpen={openRx} />
            </Card>
          </div>
          <div className="stack">
            <Card title="Clinical summary">
              <KV items={[
                ['Chronic conditions', p.chronicConditions?.length ? p.chronicConditions.map((c) => <span key={c} className="tag">{c}</span>) : 'None recorded'],
                ['Allergies', p.allergies?.length ? p.allergies.map((c) => <span key={c} className="tag danger">{c}</span>) : 'No known allergies'],
                ['Current medication', p.currentMedications?.length ? p.currentMedications.join(', ') : '-'],
                ['Notes', p.notes],
              ]}
              />
            </Card>
            <Card title="Insurance">
              {p.insurance?.provider ? (
                <KV items={[
                  ['Provider', p.insurance.provider], ['Policy no.', p.insurance.policyNumber], ['TPA', p.insurance.tpa],
                  ['Valid till', date(p.insurance.validTill)], ['Sum insured', p.insurance.coverageAmount ? money(p.insurance.coverageAmount) : ''],
                ]}
                />
              ) : <p className="muted">Self-pay patient. No insurance on file.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'visits' && <Card flush><EncounterTable rows={h.encounters} onOpen={openRx} /></Card>}

      {tab === 'appointments' && (
        <Card flush>
          <DataTable
            rows={h.appointments}
            columns={[
              { key: 'no', label: 'Appointment', render: (a) => <span className="mono">{a.appointmentNo}</span> },
              { key: 'date', label: 'Date & slot', render: (a) => `${date(a.date)} · ${slot12(a.timeSlot)}` },
              { key: 'doc', label: 'Doctor', render: (a) => <>{a.doctor?.name}<div className="cell-sub">{a.department?.name}</div></> },
              { key: 'type', label: 'Type', render: (a) => a.type },
              { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            ]}
          />
        </Card>
      )}

      {tab === 'admissions' && (
        <Card flush>
          <DataTable
            rows={h.admissions}
            onRowClick={(a) => navigate(`/ipd/${a._id}`)}
            columns={[
              { key: 'no', label: 'IPD No.', render: (a) => <span className="mono">{a.admissionNo}</span> },
              { key: 'ward', label: 'Ward / Bed', render: (a) => `${a.ward?.name} / ${a.bedNumber}` },
              { key: 'doc', label: 'Consultant', render: (a) => a.doctor?.name },
              { key: 'reason', label: 'Reason', render: (a) => a.reason },
              { key: 'in', label: 'Admitted', render: (a) => dateTime(a.admittedAt) },
              { key: 'out', label: 'Discharged', render: (a) => dateTime(a.dischargedAt) },
              { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            ]}
          />
        </Card>
      )}

      {tab === 'diagnostics' && (
        <Card flush>
          <DataTable
            rows={h.labOrders}
            onRowClick={(o) => navigate(`/${o.category === 'lab' ? 'laboratory' : 'radiology'}/${o._id}`)}
            columns={[
              { key: 'no', label: 'Order', render: (o) => <span className="mono">{o.orderNo}</span> },
              { key: 'cat', label: 'Type', render: (o) => (o.category === 'lab' ? 'Laboratory' : 'Radiology') },
              { key: 'tests', label: 'Tests', render: (o) => o.items.map((i) => i.name).join(', ') },
              { key: 'doc', label: 'Ordered by', render: (o) => o.doctor?.name || '-' },
              { key: 'date', label: 'Date', render: (o) => dateTime(o.createdAt) },
              { key: 'status', label: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
        </Card>
      )}

      {tab === 'surgeries' && (
        <Card flush>
          <DataTable
            rows={h.surgeries}
            columns={[
              { key: 'no', label: 'OT No.', render: (s) => <span className="mono">{s.surgeryNo}</span> },
              { key: 'proc', label: 'Procedure', render: (s) => s.procedure },
              { key: 'surgeon', label: 'Surgeon', render: (s) => s.surgeon?.name },
              { key: 'ot', label: 'Theatre', render: (s) => s.theatre?.name },
              { key: 'when', label: 'Scheduled', render: (s) => dateTime(s.scheduledAt) },
              { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status} /> },
            ]}
          />
        </Card>
      )}

      {tab === 'billing' && (
        <Card flush>
          <DataTable
            rows={h.invoices}
            onRowClick={(i) => navigate(`/billing/${i._id}`)}
            columns={[
              { key: 'no', label: 'Invoice', render: (i) => <span className="mono">{i.invoiceNo}</span> },
              { key: 'type', label: 'Type', render: (i) => i.type },
              { key: 'date', label: 'Date', render: (i) => date(i.createdAt) },
              { key: 'total', label: 'Total', align: 'right', render: (i) => money(i.total) },
              { key: 'paid', label: 'Paid', align: 'right', render: (i) => money(i.amountPaid) },
              { key: 'bal', label: 'Balance', align: 'right', render: (i) => <span className={i.balance > 0 ? 'danger-text strong' : ''}>{money(i.balance)}</span> },
              { key: 'status', label: 'Status', render: (i) => <StatusBadge status={i.finalized ? i.status : 'Open'} /> },
            ]}
          />
        </Card>
      )}

      <Modal open={Boolean(rx)} onClose={() => setRx(null)} title={`Consultation ${rx?.encounterNo || ''}`} size="lg" printable footer={<><Button onClick={() => setRx(null)}>Close</Button><Button variant="primary" icon={Printer} onClick={() => window.print()}>Print prescription</Button></>}>
        {rx && <Prescription enc={rx} />}
      </Modal>
    </>
  );
}

function EncounterTable({ rows, onOpen }) {
  return (
    <DataTable
      rows={rows}
      onRowClick={onOpen}
      empty="No consultations recorded"
      columns={[
        { key: 'date', label: 'Date', render: (e) => dateTime(e.createdAt) },
        { key: 'doc', label: 'Doctor', render: (e) => <>{e.doctor?.name}<div className="cell-sub">{e.department?.name}</div></> },
        { key: 'cc', label: 'Complaint', render: (e) => e.chiefComplaint || '-' },
        { key: 'dx', label: 'Diagnosis', render: (e) => e.diagnoses?.map((d) => d.description).join(', ') || '-' },
        { key: 'type', label: 'Type', render: (e) => e.type },
        { key: 'status', label: 'Status', render: (e) => <StatusBadge status={e.status} /> },
      ]}
    />
  );
}
