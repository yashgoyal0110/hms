import { Route, Routes } from 'react-router-dom';
import OpdDesk from './OpdDesk.jsx';
import Consultation from './Consultation.jsx';

export default function OpdModule() {
  return (
    <Routes>
      <Route index element={<OpdDesk />} />
      <Route path=":id" element={<Consultation />} />
    </Routes>
  );
}
