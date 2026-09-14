import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BedDouble } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useDebounced, useFetch } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import {
  ageSex, date, dateTime, fullName,
} from '../../lib/format.js';
import {
  Button, Card, DataTable, PageHeader, Pagination, Select, StatusBadge,
} from '../../components/ui.jsx';
import { StaffSelect } from '../../components/pickers.jsx';
import AdmitModal from './AdmitModal.jsx';

export default function AdmissionList() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('Admitted');
  const [doctor, setDoctor] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const admitOpen = params.get('admit') === '1';
  const { data, loading, reload } = useFetch('/admissions', { status, doctor, q: dq, page, limit: 25 });

  const days = (a) => Math.max(1, Math.round(((a.dischargedAt ? new Date(a.dischargedAt) : new Date()) - new Date(a.admittedAt)) / 86400000));

  return (
    <>
      <PageHeader
        title="IPD Admissions"
        sub="In-patient admissions, transfers and discharges"
        actions={can('ipd', 'rw') && <Button variant="primary" icon={BedDouble} onClick={() => setParams({ admit: '1' })}>Admit patient</Button>}
      />
      <Card flush>
        <div className="card-header">
          <div className="filters">
            <input className="input search" placeholder="Search patient or IPD number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={['Admitted', 'Discharged', 'LAMA', 'Referred', 'Expired']} />
            <StaffSelect role="doctor" value={doctor} onChange={setDoctor} includeAll />
          </div>
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          onRowClick={(a) => navigate(`/ipd/${a._id}`)}
          columns={[
            { key: 'no', label: 'IPD No.', render: (a) => <span className="mono strong">{a.admissionNo}</span> },
            { key: 'p', label: 'Patient', render: (a) => <><div className="cell-main">{fullName(a.patient)}</div><div className="cell-sub">{a.patient?.uhid} · {ageSex(a.patient)}</div></> },
            { key: 'w', label: 'Ward / Bed', render: (a) => <>{a.ward?.name}<div className="cell-sub">{a.bedNumber}</div></> },
            { key: 'd', label: 'Consultant', render: (a) => <>{a.doctor?.name}<div className="cell-sub">{a.department?.name}</div></> },
            { key: 'r', label: 'Diagnosis', render: (a) => a.provisionalDiagnosis || a.reason },
            { key: 'at', label: 'Admitted', render: (a) => <>{dateTime(a.admittedAt)}<div className="cell-sub">{a.admissionType}</div></> },
            { key: 'los', label: 'Stay', align: 'right', render: (a) => `${days(a)} d` },
            { key: 'out', label: status === 'Admitted' ? 'Exp. discharge' : 'Discharged', render: (a) => (a.dischargedAt ? date(a.dischargedAt) : date(a.expectedDischarge)) },
            { key: 's', label: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          ]}
        />
        <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      </Card>
      <AdmitModal
        open={admitOpen}
        presetPatientId={params.get('patient')}
        onClose={() => setParams({}, { replace: true })}
        onDone={(a) => { toast.success(`Admitted - ${a.admissionNo}`); reload(); navigate(`/ipd/${a._id}`); }}
      />
    </>
  );
}
