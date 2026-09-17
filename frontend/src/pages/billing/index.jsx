import { Route, Routes } from 'react-router-dom';
import InvoiceList from './InvoiceList.jsx';

export default function BillingModule() {
  return (
    <Routes>
      <Route index element={<InvoiceList />} />
    </Routes>
  );
}
