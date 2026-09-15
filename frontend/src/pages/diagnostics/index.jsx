import { Route, Routes } from 'react-router-dom';
import OrderList from './OrderList.jsx';

export default function DiagnosticsModule({ category }) {
  return (
    <Routes>
      <Route index element={<OrderList category={category} key={category} />} />
    </Routes>
  );
}
