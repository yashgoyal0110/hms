import { Route, Routes } from 'react-router-dom';
import InvoiceList from './InvoiceList.jsx';
import InvoiceNew from './InvoiceNew.jsx';
import InvoiceDetail from './InvoiceDetail.jsx';

export default function BillingModule() {
  return (
    <Routes>
      <Route index element={<InvoiceList />} />
      <Route path="new" element={<InvoiceNew />} />
      <Route path=":id" element={<InvoiceDetail />} />
    </Routes>
  );
}
