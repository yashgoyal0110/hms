import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import {
  Button, ErrorBox, Field, Modal, Select,
} from '../../components/ui.jsx';
import { PatientPicker, StaffSelect } from '../../components/pickers.jsx';

export function BedChooser({ ward, setWard, bed, setBed, gender }) {
  const { data: wards } = useFetch('/wards');
  const w = (wards || []).find((x) => x._id === ward);
  const free = (w?.beds || []).filter((b) => ['Available', 'Reserved'].includes(b.status));
  return (
    <>
      <Field label="Ward" required>
        <select className="select" value={ward} onChange={(e) => { setWard(e.target.value); setBed(''); }}>
          <option value="">Select ward</option>
          {(wards || []).map((x) => {
            const avail = x.beds.filter((b) => b.status === 'Available').length;
            const mismatch = gender && x.gender !== 'Any' && x.gender !== gender;
            return <option key={x._id} value={x._id} disabled={!avail || mismatch}>{x.name} - {avail} free · {money(x.dailyRate + x.nursingRate)}/day{mismatch ? ` (${x.gender} only)` : ''}</option>;
          })}
        </select>
      </Field>
      <Field label="Bed" required>
        <select className="select" value={bed} onChange={(e) => setBed(e.target.value)} disabled={!ward}>
          <option value="">{ward ? `Select bed (${free.length} available)` : 'Select a ward first'}</option>
          {free.map((b) => <option key={b._id} value={b.number}>{b.number}{b.status === 'Reserved' ? ' (reserved)' : ''}</option>)}
        </select>
      </Field>
    </>
  );
}

export default function AdmitModal({ open, onClose, onDone, presetPatientId }) {
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState('');
  const [ward, setWard] = useState('');
  const [bed, setBed] = useState('');
  const [f, setF] = useState({ admissionType: 'Planned', reason: '', provisionalDiagnosis: '', expectedDischarge: '', deposit: '', depositMode: 'Cash', attendant: { name: '', relation: '', phone: '' } });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && presetPatientId) api.get(`/patients/${presetPatientId}`).then((r) => setPatient(r.patient)).catch(() => {});
    if (!open) { setPatient(null); setWard(''); setBed(''); setError(null); }
  }, [open, presetPatientId]);
  useEffect(() => {
    if (patient?.emergencyContact?.name) setF((x) => ({ ...x, attendant: { name: patient.emergencyContact.name, relation: patient.emergencyContact.relation || '', phone: patient.emergencyContact.phone || '' } }));
  }, [patient]);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const a = await api.post('/admissions', {
        ...f, patient: patient?._id, doctor, ward, bedNumber: bed, deposit: Number(f.deposit) || 0, expectedDischarge: f.expectedDischarge || undefined,
      });
      onDone(a); onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const bind = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const bindA = (k) => ({ value: f.attendant[k], onChange: (e) => setF({ ...f, attendant: { ...f.attendant, [k]: e.target.value } }) });

  return (
    <Modal open={open} onClose={onClose} title="Admit patient" size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!patient || !doctor || !bed || !f.reason} onClick={submit}>Admit patient</Button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Patient" required><PatientPicker value={patient} onChange={setPatient} autoFocus /></Field>
        <div className="form-grid">
          <Field label="Admitting consultant" required><StaffSelect role="doctor" value={doctor} onChange={setDoctor} /></Field>
          <Field label="Admission type"><Select {...bind('admissionType')} options={['Planned', 'Emergency', 'Referral', 'Day Care']} /></Field>
          <BedChooser ward={ward} setWard={setWard} bed={bed} setBed={setBed} gender={patient?.gender} />
          <Field label="Reason for admission" required className="span-2"><input className="input" {...bind('reason')} /></Field>
          <Field label="Provisional diagnosis" className="span-2"><input className="input" {...bind('provisionalDiagnosis')} /></Field>
          <Field label="Expected discharge"><input type="date" className="input" {...bind('expectedDischarge')} /></Field>
          <Field label="Advance deposit"><input type="number" min="0" className="input" {...bind('deposit')} /></Field>
          <Field label="Deposit mode"><Select {...bind('depositMode')} options={['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque']} /></Field>
        </div>
        <div className="form-section-title">Attendant</div>
        <div className="form-grid">
          <Field label="Name"><input className="input" {...bindA('name')} /></Field>
          <Field label="Relation"><input className="input" {...bindA('relation')} /></Field>
          <Field label="Phone"><input className="input" {...bindA('phone')} /></Field>
        </div>
      </div>
    </Modal>
  );
}
