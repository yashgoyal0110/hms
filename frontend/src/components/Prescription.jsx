import PrintDoc from './PrintDoc.jsx';
import { ageSex, date, fullName } from '../lib/format.js';
import { useAuth } from '../lib/auth.jsx';

export default function Prescription({ enc }) {
  const { settings } = useAuth();
  const p = enc.patient || {};
  const v = enc.vitals || {};
  return (
    <PrintDoc title="Outpatient Prescription" footer={settings?.prescriptionFooter}>
      <div className="doc-meta">
        <div><span>Patient</span><b>{fullName(p)}</b> ({ageSex(p)})</div>
        <div><span>Date</span>{date(enc.createdAt)}</div>
        <div><span>UHID</span>{p.uhid}</div>
        <div><span>Visit No.</span>{enc.encounterNo}</div>
        <div><span>Consultant</span>{enc.doctor?.name}</div>
        <div><span>Department</span>{enc.department?.name || enc.doctor?.specialization}</div>
      </div>
      {(v.bpSystolic || v.pulse || v.temperature || v.weight) && (
        <p style={{ marginBottom: 8 }}>
          <b>Vitals: </b>
          {[v.bpSystolic && `BP ${v.bpSystolic}/${v.bpDiastolic} mmHg`, v.pulse && `Pulse ${v.pulse}/min`, v.temperature && `Temp ${v.temperature}°F`, v.spo2 && `SpO₂ ${v.spo2}%`, v.weight && `Wt ${v.weight} kg`, v.bmi && `BMI ${v.bmi}`].filter(Boolean).join(' · ')}
        </p>
      )}
      {p.allergies?.length > 0 && <p style={{ marginBottom: 8 }}><b>Allergies: </b>{p.allergies.join(', ')}</p>}
      {enc.chiefComplaint && <p style={{ marginBottom: 6 }}><b>Chief complaint: </b>{enc.chiefComplaint}</p>}
      {enc.examination && <p style={{ marginBottom: 6 }}><b>Examination: </b>{enc.examination}</p>}
      {enc.diagnoses?.length > 0 && <p style={{ marginBottom: 10 }}><b>Diagnosis: </b>{enc.diagnoses.map((d) => `${d.description}${d.code ? ` (${d.code})` : ''}`).join('; ')}</p>}
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'serif', margin: '6px 0' }}>℞</div>
      {enc.prescriptions?.length ? (
        <table>
          <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead>
          <tbody>
            {enc.prescriptions.map((m, i) => (
              <tr key={m._id || i}><td>{i + 1}</td><td><b>{m.name}</b><div style={{ fontSize: 11 }}>{m.route}</div></td><td>{m.dosage}</td><td>{m.frequency}</td><td>{m.duration}</td><td>{m.instructions}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p>No medicines prescribed.</p>}
      {enc.labOrders?.length > 0 && <p style={{ marginBottom: 6 }}><b>Investigations: </b>{enc.labOrders.flatMap((o) => o.items?.map((i) => i.name) || []).join(', ')}</p>}
      {enc.advice && <p style={{ marginBottom: 6 }}><b>Advice: </b>{enc.advice}</p>}
      {enc.followUpDate && <p><b>Follow-up on: </b>{date(enc.followUpDate)}</p>}
      <div className="sig">
        <span />
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, minWidth: 200 }}>{enc.doctor?.name}</div>
          <div style={{ fontSize: 11 }}>{enc.doctor?.qualification}</div>
          {enc.doctor?.registrationNo && <div style={{ fontSize: 11 }}>Reg. No. {enc.doctor.registrationNo}</div>}
        </div>
      </div>
    </PrintDoc>
  );
}
