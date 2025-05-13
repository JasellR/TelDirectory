import { getExtensionsByLocalityId, getLocalityById, getZoneById } from '@/lib/data';
import { ExtensionTable } from '@/components/directory/ExtensionTable';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ImportXmlForm } from '@/components/import/ImportXmlForm';
import { importExtensionsForLocalityXml } from '@/app/import-xml/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { ReactNode } from 'react';

interface LocalityPageProps {
  params: {
    zoneId: string;
    localityId: string;
  };
}

export async function generateMetadata({ params }: LocalityPageProps): Promise<Metadata> {
  const locality = await getLocalityById(params.zoneId, params.localityId);
  if (!locality) {
    return {
      title: 'Locality Not Found',
    };
  }
  return {
    title: `Extensions in ${locality.name} - TelDirectory`,
    description: `Find department extensions for ${locality.name}.`,
  };
}

// Server Component Wrapper for the Import Form
function LocalityExtensionsImportFormWrapper({ 
  zoneId, 
  localityId, 
  localityName 
}: { 
  zoneId: string, 
  localityId: string, 
  localityName: string 
}) {
  const formDescription: ReactNode = (
    <>
      Upload an XML file to import or update extensions specifically for the <strong>{localityName}</strong> locality.
      The expected root tag is <code>&lt;CiscoIPPhoneDirectory&gt;</code>, containing <code>&lt;DirectoryEntry&gt;</code> elements.
      Each <code>&lt;DirectoryEntry&gt;</code> should have a <code>&lt;Name&gt;</code> (for department/label) and <code>&lt;Telephone&gt;</code> tag.
    </>
  );

  // Bind zoneId and localityId to the server action.
  const boundImportAction = importExtensionsForLocalityXml.bind(null, zoneId, localityId);

  return (
    <ImportXmlForm
      formTitle={`Import Extensions for ${localityName}`}
      formDescription={formDescription}
      importAction={boundImportAction}
    />
  );
}


export default async function LocalityPage({ params }: LocalityPageProps) {
  const { zoneId, localityId } = params;
  const zone = await getZoneById(zoneId);
  const locality = await getLocalityById(zoneId, localityId);
  const extensions = await getExtensionsByLocalityId(zoneId, localityId);

  if (!zone || !locality) { // Extensions can be empty, so not checking here for notFound
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs 
          items={[
            { label: zone.name, href: `/${zoneId}` },
            { label: locality.name }
          ]} 
        />
        <ExtensionTable extensions={extensions || []} localityName={locality.name} />
      </div>

      <Separator />

      <div>
        <div className="flex items-center gap-3 mb-4">
          <UploadCloud className="h-8 w-8 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Import Extensions for {locality.name}</h2>
        </div>
        <p className="mb-6 text-muted-foreground">
          Use this form to import or update the phone extensions specifically for the <strong>{locality.name}</strong> locality within the <strong>{zone.name}</strong> zone.
          Ensure the XML file has a <code>&lt;CiscoIPPhoneDirectory&gt;</code> root element, containing <code>&lt;DirectoryEntry&gt;</code> items.
        </p>
        <LocalityExtensionsImportFormWrapper 
          zoneId={zone.id} 
          localityId={locality.id} 
          localityName={locality.name} 
        />
      </div>
    </div>
  );
}