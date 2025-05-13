import { getLocalitiesByZoneId, getZoneById } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ImportXmlForm } from '@/components/import/ImportXmlForm';
// Changed from importSingleZoneXml to importZoneBranchMenuItemsXml
import { importZoneBranchMenuItemsXml } from '@/app/import-xml/actions'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud } from 'lucide-react';
import { Separator } from '@/components/ui/separator';


interface ZonePageProps {
  params: {
    zoneId: string;
  };
}

export async function generateMetadata({ params }: ZonePageProps): Promise<Metadata> {
  const zone = await getZoneById(params.zoneId);
  if (!zone) {
    return {
      title: 'Zone Not Found',
    };
  }
  return {
    title: `Localities in ${zone.name} - TelDirectory`,
    description: `Browse localities and manage data for the ${zone.name} zone.`,
  };
}

// This is a Server Component.
function ZoneImportFormWrapper({ zoneId, zoneName }: { zoneId: string, zoneName: string }) {
  const zoneSpecificImportDescription = (
    <>
      Upload an XML file to import or update localities specifically for the <strong>{zoneName}</strong> zone.
      The expected root tag in the XML file is <code>&lt;CiscoIPPhoneMenu&gt;</code>, containing <code>&lt;MenuItem&gt;</code> elements, where each <code>&lt;Name&gt;</code> tag represents a locality.
    </>
  );

  // Bind the zoneId to the server action.
  // The resulting boundImportAction is a server action that takes (xmlContent: string).
  // Changed to use importZoneBranchMenuItemsXml
  const boundImportAction = importZoneBranchMenuItemsXml.bind(null, zoneId);

  return (
    <ImportXmlForm
      formTitle={`Import Localities for ${zoneName}`}
      formDescription={zoneSpecificImportDescription}
      importAction={boundImportAction} // Pass the bound server action
    />
  );
}


export default async function ZonePage({ params }: ZonePageProps) {
  const { zoneId } = params;
  const zone = await getZoneById(zoneId);
  const localities = await getLocalitiesByZoneId(zoneId);

  if (!zone || !localities) { // localities can be undefined if zone is not found.
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: zone.name }]} />
        <h1 className="text-3xl font-bold mb-8 text-foreground">Localities in {zone.name}</h1>
        {localities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {localities.map((locality) => (
              <NavigationCard
                key={locality.id}
                title={locality.name}
                href={`/${zoneId}/${locality.id}`}
                description={`View extensions for ${locality.name}.`}
                iconType="locality"
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No localities found in this zone. You can import them using the form below.</p>
        )}
      </div>

      <Separator />

      <div>
        <div className="flex items-center gap-3 mb-4">
          <UploadCloud className="h-8 w-8 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Import Localities for {zone.name}</h2>
        </div>
        <p className="mb-6 text-muted-foreground">
          Use this form to import or update the list of localities specifically for the <strong>{zone.name}</strong> zone.
          Ensure the XML file contains a <code>&lt;CiscoIPPhoneMenu&gt;</code> root element with <code>&lt;MenuItem&gt;</code> tags representing each locality.
        </p>
        {/* 
          ImportXmlForm is a client component.
          ZoneImportFormWrapper (a server component) binds zone.id to the importZoneBranchMenuItemsXml server action
          and passes this bound server action to the ImportXmlForm client component.
        */}
        <ZoneImportFormWrapper zoneId={zone.id} zoneName={zone.name} />
      </div>
    </div>
  );
}

