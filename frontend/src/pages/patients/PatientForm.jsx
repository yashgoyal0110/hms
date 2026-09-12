import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useForm } from '../../lib/hooks.js';
import { isoDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import {
  Button, Card, ErrorBox, Field, Loading, PageHeader, Select,
} from '../../components/ui.jsx';
import { TagInput } from '../../components/pickers.jsx';

const EMPTY = {
  title: '', firstName: '', lastName: '', gender: '', dob: '', bloodGroup: 'Unknown', maritalStatus: '', phone: '', altPhone: '', email: '', occupation: '',
  address: { line1: '', city: '', state: '', pincode: '' }, idProof: { type: 'Aadhaar', number: '' }, emergencyContact: { name: '', relation: '', phone: '' },
  allergies: [], chronicConditions: [], currentMedications: [], insurance: { provider: '', policyNumber: '', tpa: '', validTill: '', coverageAmount: '' },
  referredBy: '', notes: '', chargeRegistration: true,
};

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { values, setValues, set, bind } = useForm(EMPTY);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null);
  const [ageInput, setAgeInput] = useState('');
  useEffect(() => {
    if (!id) return;
    api.get(`/patients/${id}`).then(({ patient: p }) => {
      setValues({
        ...EMPTY, ...p,
        dob: p.dob ? isoDate(p.dob) : '',
        address: { ...EMPTY.address, ...p.address },
        idProof: { ...EMPTY.idProof, ...p.idProof },
        emergencyContact: { ...EMPTY.emergencyContact, ...p.emergencyContact },
        insurance: { ...EMPTY.insurance, ...p.insurance, validTill: p.insurance?.validTill ? isoDate(p.insurance.validTill) : '' },
      });
      setLoading(false);
    }).catch((e) => { setError(e); setLoading(false); });
  }, [id, setValues]);

  const applyAge = (a) => {
    setAgeInput(a);
    const n = Number(a);
    if (n > 0 && n < 130) {
      const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setMonth(0, 1);
      set('dob', isoDate(d));
    }
  };

  const submit = async (e, allowDuplicate = false) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    const body = { ...values, allowDuplicate };
    if (!body.insurance.provider) delete body.insurance;
    else if (body.insurance.coverageAmount === '') delete body.insurance.coverageAmount;
    if (!body.dob) delete body.dob;
    try {
      const p = id ? await api.put(`/patients/${id}`, body) : await api.post('/patients', body);
      toast.success(id ? 'Patient details updated' : `Patient registered - UHID ${p.uhid}`);
      navigate(`/patients/${p._id}`, { replace: true });
    } catch (err) {
      if (err.status === 409 && err.data?.duplicate) setDup(err.data.duplicate);
      else setError(err);
    } finally { setBusy(false); }
  };

  if (loading) return <Loading />;
  return (
    <>
      <PageHeader
        crumbs={<><Link to="/patients">Patients</Link> / {id ? 'Edit' : 'New registration'}</>}
        title={id ? `Edit patient - ${values.uhid || ''}` : 'Register new patient'}
        sub={id ? undefined : 'A unique health ID (UHID) is generated automatically on save.'}
      />
      <form onSubmit={submit}>
        <div className="stack">
          <ErrorBox error={error} />
          {dup && (
            <div className="alert warning">
              <div>
                A patient named <b>{dup.firstName} {dup.lastName}</b> with phone <b>{dup.phone}</b> already exists ({dup.uhid}).
                <div className="row mt-8">
                  <Button size="sm" onClick={() => navigate(`/patients/${dup._id}`)}>Open existing record</Button>
                  <Button size="sm" onClick={() => { setDup(null); submit(null, true); }}>Register as new patient anyway</Button>
                </div>
              </div>
            </div>
          )}
          <Card title="Personal details">
            <div className="form-grid">
              <Field label="Title"><Select {...bind('title')} placeholder="-" options={['Mr', 'Mrs', 'Ms', 'Master', 'Baby', 'Dr']} /></Field>
              <Field label="First name" required><input className="input" required {...bind('firstName')} autoFocus /></Field>
              <Field label="Last name"><input className="input" {...bind('lastName')} /></Field>
              <Field label="Gender" required><Select required {...bind('gender')} placeholder="Select" options={['Male', 'Female', 'Other']} /></Field>
              <Field label="Date of birth"><input className="input" type="date" max={isoDate()} {...bind('dob')} /></Field>
              <Field label="Age (years)" hint="Fills an approximate date of birth"><input className="input" type="number" min="0" max="130" value={ageInput} onChange={(e) => applyAge(e.target.value)} /></Field>
              <Field label="Blood group"><Select {...bind('bloodGroup')} options={['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} /></Field>
              <Field label="Marital status"><Select {...bind('maritalStatus')} placeholder="-" options={['Single', 'Married', 'Divorced', 'Widowed']} /></Field>
              <Field label="Occupation"><input className="input" {...bind('occupation')} /></Field>
              <Field label="ID proof type"><Select {...bind('idProof.type')} options={['Aadhaar', 'PAN', 'Passport', 'Voter ID', 'Driving Licence', 'ABHA']} /></Field>
              <Field label="ID number"><input className="input" {...bind('idProof.number')} /></Field>
              <Field label="Referred by"><input className="input" {...bind('referredBy')} /></Field>
            </div>
          </Card>
          <Card title="Contact & address">
            <div className="form-grid">
              <Field label="Mobile number" required><input className="input" required pattern="[0-9+\- ]{8,15}" {...bind('phone')} /></Field>
              <Field label="Alternate phone"><input className="input" {...bind('altPhone')} /></Field>
              <Field label="Email"><input className="input" type="email" {...bind('email')} /></Field>
              <Field label="Address" className="span-2"><input className="input" {...bind('address.line1')} /></Field>
              <Field label="City"><input className="input" {...bind('address.city')} /></Field>
              <Field label="State"><input className="input" {...bind('address.state')} /></Field>
              <Field label="PIN code"><input className="input" {...bind('address.pincode')} /></Field>
              <Field label="Emergency contact name"><input className="input" {...bind('emergencyContact.name')} /></Field>
              <Field label="Relation"><input className="input" {...bind('emergencyContact.relation')} /></Field>
              <Field label="Emergency contact phone"><input className="input" {...bind('emergencyContact.phone')} /></Field>
            </div>
          </Card>
          <Card title="Medical information">
            <div className="form-grid">
              <Field label="Known allergies" className="span-2" hint="Press Enter after each item"><TagInput value={values.allergies} onChange={(v) => set('allergies', v)} placeholder="e.g. Penicillin" /></Field>
              <Field label="Chronic conditions" className="span-2"><TagInput value={values.chronicConditions} onChange={(v) => set('chronicConditions', v)} placeholder="e.g. Hypertension" /></Field>
              <Field label="Current medications" className="span-all"><TagInput value={values.currentMedications} onChange={(v) => set('currentMedications', v)} placeholder="e.g. Metformin 500 mg" /></Field>
              <Field label="Notes" className="span-all"><textarea className="textarea" {...bind('notes')} /></Field>
            </div>
          </Card>
          <Card title="Insurance (optional)">
            <div className="form-grid">
              <Field label="Insurance provider"><input className="input" {...bind('insurance.provider')} placeholder="e.g. Star Health" /></Field>
              <Field label="Policy number"><input className="input" {...bind('insurance.policyNumber')} /></Field>
              <Field label="TPA"><input className="input" {...bind('insurance.tpa')} /></Field>
              <Field label="Valid till"><input className="input" type="date" {...bind('insurance.validTill')} /></Field>
              <Field label="Sum insured"><input className="input" type="number" min="0" {...bind('insurance.coverageAmount', { type: 'number' })} /></Field>
            </div>
          </Card>
          <div className="row between">
            {!id ? <label className="checkbox"><input type="checkbox" {...bind('chargeRegistration', { type: 'checkbox' })} />Generate registration fee invoice</label> : <span />}
            <div className="row">
              <Button onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={busy}>{id ? 'Save changes' : 'Register patient'}</Button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
