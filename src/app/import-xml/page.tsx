import { ImportXmlForm } from '@/components/import/ImportXmlForm';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Import XML Data - TelDirectory',
  description: 'Import zone and locality data from an XML file.',
};

export default function ImportXmlPage() {
  return (
    <div>
      <Breadcrumbs items={[{ label: 'Import XML' }]} />
      <h1 className="text-3xl font-bold mb-8 text-foreground">Import Zone Data</h1>
      <ImportXmlForm />
    </div>
  );
}
