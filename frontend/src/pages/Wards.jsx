import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFetch } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { ageSex, date, fullName, money } from '../lib/format.js';
import {
  Button, Card, ErrorBox, Field, Loading, Modal, PageHeader, Select, Stat,
} from '../components/ui.jsx';

export default function Wards() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: wards, loading, error, reload } = useFetch('/wards');
  const [filter, setFilter] = useState('');
  const [bedMenu, setBedMenu] = useState(null);
  const [addWard, setAddWard] = useState(false);

  if (loading && !wards) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const all = wards.flatMap((w) => w.beds);
  const count = (s) => all.filter((b) => b.status === s).length;

  const setStatus = async (ward, bed, status) => {
    try {
      await api.patch(`/wards/${ward._id}/beds/${bed._id}`, { status });
      toast.success(`${bed.number} marked ${status.toLowerCase()}`);
      setBedMenu(null); reload();
    } catch (e) { toast.error(e); }
  };

  return (
    <>
      <PageHeader title="Wards & Beds" sub="Live bed board across all wards" />
      <div className="grid grid-4 mb-16">
        <Stat label="Total beds" value={all.length} foot={`${wards.length} wards`} />
        <Stat label="Occupied" value={count('Occupied')} foot={`${all.length ? Math.round((count('Occupied') / all.length) * 100) : 0}% occupancy`} tone="danger" />
        <Stat label="Available" value={count('Available')} tone="success" />
        <Stat label="Cleaning / maintenance / reserved" value={count('Cleaning') + count('Maintenance') + count('Reserved')} />
      </div>
      <div className="row between mb-16">
        <div className="legend"><span className="l-av">Available</span><span className="l-oc">Occupied</span><span className="l-cl">Cleaning</span><span className="l-rs">Reserved</span><span className="l-mn">Maintenance</span></div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="All ward types" options={[...new Set(wards.map((w) => w.type))]} style={{ width: 200 }} />
      </div>
      <div className="stack">
        {wards.filter((w) => !filter || w.type === filter).map((w) => (
          <Card
            key={w._id}
            title={<div><h3>{w.name} <span className="muted small">· {w.code} · {w.type} · {w.floor}</span></h3></div>}
            actions={<span className="small muted">{money(w.dailyRate)} + {money(w.nursingRate)} nursing / day · {w.beds.filter((b) => b.status === 'Occupied').length}/{w.beds.length} occupied{w.gender !== 'Any' ? ` · ${w.gender} only` : ''}</span>}
          >
            <div className="bed-grid">
              {w.beds.map((b) => (
                <div
                  key={b._id}
                  className={`bed ${b.status}`}
                  onClick={() => (b.status === 'Occupied' && b.admission ? navigate(`/ipd/${b.admission._id || b.admission}`) : can('wards', 'rw') && setBedMenu({ ward: w, bed: b }))}
                  title={b.status}
                >
                  <div className="no"><span>{b.number}</span></div>
                  {b.status === 'Occupied' && b.patient ? (
                    <>
                      <div className="strong" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(b.patient)}</div>
                      <div className="muted">{ageSex(b.patient)} · {b.admission?.doctor?.name?.replace('Dr. ', 'Dr ')}</div>
                      <div className="muted">Since {date(b.admission?.admittedAt)}</div>
                    </>
                  ) : <div className="muted">{b.status}</div>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Modal open={Boolean(bedMenu)} onClose={() => setBedMenu(null)} title={`Bed ${bedMenu?.bed.number}`}>
        {bedMenu && (
          <div className="stack">
            <p>Current status: <b>{bedMenu.bed.status}</b></p>
            <div className="row">
              {['Available', 'Cleaning', 'Reserved', 'Maintenance'].filter((s) => s !== bedMenu.bed.status).map((s) => (
                <Button key={s} onClick={() => setStatus(bedMenu.ward, bedMenu.bed, s)}>Mark {s.toLowerCase()}</Button>
              ))}
            </div>
            {bedMenu.bed.status === 'Available' && can('ipd', 'rw') && <Button variant="primary" onClick={() => navigate('/ipd?admit=1')}>Admit a patient</Button>}
          </div>
        )}
      </Modal>
    </>
  );
}
