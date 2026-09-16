import { Route, Routes } from 'react-router-dom';
import OrderList from './OrderList.jsx';
import OrderDetail from './OrderDetail.jsx';

export default function DiagnosticsModule({ category }) {
  return (
    <Routes>
      <Route index element={<OrderList category={category} key={category} />} />
      <Route path=":id" element={<OrderDetail category={category} />} />
    </Routes>
  );
}
