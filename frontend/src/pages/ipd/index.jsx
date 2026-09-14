import { Route, Routes } from 'react-router-dom';
import AdmissionList from './AdmissionList.jsx';

export default function IpdModule() {
  return (
    <Routes>
      <Route index element={<AdmissionList />} />
    </Routes>
  );
}
