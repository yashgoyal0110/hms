import { Route, Routes } from 'react-router-dom';
import PatientList from './PatientList.jsx';

export default function PatientsModule() {
  return (
    <Routes>
      <Route index element={<PatientList />} />
    </Routes>
  );
}
