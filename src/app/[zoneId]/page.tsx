
import { getLocalitiesByZoneId, getZoneById } from '@/lib/data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, PlusCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DeleteLocalityButton } from '@/components/actions/DeleteLocalityButton';
import { EditLocalityButton } from '@/components/actions/EditLocalityButton'; // Added
import { AddLocalityButton } from '@/components/actions/AddLocalityButton'; // Added
import { Button } from '@/components/ui/button'; // Added

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
    description: `Browse localities for the ${zone.name} zone. Data is read from XML files.`,
  };
}

export default async function ZonePage({ params }: ZonePageProps) {
  const { zoneId } = params;
  const zone = await getZoneById(zoneId);
  
  const localities = zone?.localities || [];

  if (!zone) { 
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: zone.name }]} />
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Localities in {zone.name}</h1>
          <AddLocalityButton zoneId={zoneId} zoneName={zone.name} />
        </div>
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
                  <div className="flex-shrink-0 flex items-center space-x-1">
                    <EditLocalityButton zoneId={zoneId} locality={locality} />
                    <DeleteLocalityButton zoneId={zoneId} localityId={locality.id} localityName={locality.name} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No localities found in the XML file for this zone (<code>IVOXS/ZoneBranch/{zone.id}.xml</code>).
          </p>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management</h2>
        <p className="text-muted-foreground">
          Localities for the <strong>{zone.name}</strong> zone are managed by editing the XML file at <code>IVOXS/ZoneBranch/{zone.id}.xml</code>.
          Ensure this file contains <code>&lt;MenuItem&gt;</code> tags representing each locality. Deleting a locality here will remove it from this list and attempt to delete its department XML.
        </p>
      </div>
    </div>
  );
}

