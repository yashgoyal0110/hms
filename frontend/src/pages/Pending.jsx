import { PageHeader, Card, Empty } from '../components/ui.jsx';
import { Construction } from 'lucide-react';

export default function Pending({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <Card><Empty icon={Construction} title="This module is being deployed">It will be available shortly.</Empty></Card>
    </>
  );
}
