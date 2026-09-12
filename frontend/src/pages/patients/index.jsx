import { Route, Routes } from 'react-router-dom';
import PatientList from './PatientList.jsx';
import PatientForm from './PatientForm.jsx';
import PatientProfile from './PatientProfile.jsx';

export default function PatientsModule() {
  return (
    <Routes>
      <Route index element={<PatientList />} />
      <Route path="new" element={<PatientForm />} />
      <Route path=":id/edit" element={<PatientForm />} />
      <Route path=":id" element={<PatientProfile />} />
    </Routes>
  );
}
