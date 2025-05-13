
import { getLocalitiesByZoneId, getZoneById } from '@/lib/data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportXmlForm } from '@/components/import/ImportXmlForm';
import { importZoneBranchMenuItemsXml } from '@/app/import-xml/actions'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud, MapPin } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DeleteLocalityButton } from '@/components/directory/DeleteLocalityButton';


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

function ZoneImportFormWrapper({ zoneId, zoneName }: { zoneId: string, zoneName: string }) {
  const zoneSpecificImportDescription = (
    <>
      Upload an XML file to import or update localities specifically for the <strong>{zoneName}</strong> zone.
      The expected root tag in the XML file is <code>&lt;CiscoIPPhoneMenu&gt;</code>, containing <code>&lt;MenuItem&gt;</code> elements, where each <code>&lt;Name&gt;</code> tag represents a locality.
    </>
  );

  const boundImportAction = importZoneBranchMenuItemsXml.bind(null, zoneId);

  return (
    <ImportXmlForm
      formTitle={`Import Localities for ${zoneName}`}
      formDescription={zoneSpecificImportDescription}
      importAction={boundImportAction}
    />
  );
}


export default async function ZonePage({ params }: ZonePageProps) {
  const { zoneId } = params;
  const zone = await getZoneById(zoneId);
  const localities = await getLocalitiesByZoneId(zoneId);

  if (!zone || !localities) { 
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: zone.name }]} />
        <h1 className="text-3xl font-bold mb-8 text-foreground">Localities in {zone.name}</h1>
        {localities.length > 0 ? (
          <div className="space-y-4">
            {localities.map((locality) => (
              <Card key={locality.id} className="shadow-sm hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-1">
                      <MapPin className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">
                        <Link href={`/${zoneId}/${locality.id}`} className="hover:underline hover:text-primary transition-colors">
                          {locality.name}
                        </Link>
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground ml-8 sm:ml-0">
                      View extensions and details for {locality.name}. (ID: {locality.id})
                    </p>
                  </div>
                  <div className="shrink-0 mt-2 sm:mt-0">
                    <DeleteLocalityButton
                      zoneId={zone.id}
                      localityId={locality.id}
                      localityName={locality.name}
                    />
                  </div>
                </CardContent>
              </Card>
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
        <ZoneImportFormWrapper zoneId={zone.id} zoneName={zone.name} />
      </div>
    </div>
  );
}
