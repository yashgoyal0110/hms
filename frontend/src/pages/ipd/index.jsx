import { Route, Routes } from 'react-router-dom';
import AdmissionList from './AdmissionList.jsx';
import AdmissionDetail from './AdmissionDetail.jsx';

export default function IpdModule() {
  return (
    <Routes>
      <Route index element={<AdmissionList />} />
      <Route path=":id" element={<AdmissionDetail />} />
    </Routes>
  );
}
