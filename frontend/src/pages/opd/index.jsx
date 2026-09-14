import { Route, Routes } from 'react-router-dom';
import OpdDesk from './OpdDesk.jsx';

export default function OpdModule() {
  return (
    <Routes>
      <Route index element={<OpdDesk />} />
    </Routes>
  );
}
