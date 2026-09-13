import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Download } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useDebounced, useFetch } from '../../lib/hooks.js';
import { ageSex, date, downloadCsv, fullName } from '../../lib/format.js';
import { api } from '../../lib/api.js';
import {
  Button, Card, DataTable, PageHeader, Pagination, Select, StatusBadge,
} from '../../components/ui.jsx';

export default function PatientList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading } = useFetch('/patients', { q: dq, gender, page, limit: 25 });

  const exportCsv = async () => {
    const all = await api.get('/patients', { q: dq, gender, limit: 500 });
    downloadCsv('patients.csv', all.data, [
      { label: 'UHID', value: 'uhid' }, { label: 'Name', value: (p) => fullName(p) }, { label: 'Gender', value: 'gender' },
      { label: 'DOB', value: (p) => date(p.dob) }, { label: 'Phone', value: 'phone' }, { label: 'Email', value: 'email' },
      { label: 'City', value: (p) => p.address?.city }, { label: 'Blood group', value: 'bloodGroup' }, { label: 'Registered', value: (p) => date(p.createdAt) },
    ]);
  };

  return (
    <>
      <PageHeader
        title="Patients"
        sub="Master patient index - registration and electronic medical records"
        actions={(
          <>
            <Button icon={Download} onClick={exportCsv}>Export</Button>
            {can('patients', 'rw') && <Button variant="primary" icon={UserPlus} onClick={() => navigate('/patients/new')}>Register patient</Button>}
          </>
        )}
      />
      <Card flush>
        <div className="card-header">
          <div className="filters">
            <input className="input search" placeholder="Search name, UHID, phone or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} autoFocus />
            <Select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }} placeholder="All genders" options={['Male', 'Female', 'Other']} />
          </div>
        </div>
        <DataTable
          loading={loading}
          rows={data?.data}
          onRowClick={(p) => navigate(`/patients/${p._id}`)}
          columns={[
            { key: 'uhid', label: 'UHID', render: (p) => <span className="mono strong">{p.uhid}</span> },
            { key: 'name', label: 'Patient', render: (p) => <><div className="cell-main">{p.title ? `${p.title}. ` : ''}{fullName(p)}</div><div className="cell-sub">{ageSex(p)}{p.bloodGroup !== 'Unknown' ? ` · ${p.bloodGroup}` : ''}</div></> },
            { key: 'phone', label: 'Contact', render: (p) => <><div>{p.phone}</div><div className="cell-sub">{p.email}</div></> },
            { key: 'city', label: 'City', render: (p) => p.address?.city || '-' },
            { key: 'ins', label: 'Insurance', render: (p) => p.insurance?.provider || <span className="muted">Self-pay</span> },
            { key: 'reg', label: 'Registered', render: (p) => date(p.createdAt) },
            { key: 'status', label: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          ]}
        />
        <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} />
      </Card>
    </>
  );
}
