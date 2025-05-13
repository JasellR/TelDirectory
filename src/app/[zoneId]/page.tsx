
import { getZoneDetails, getZoneItems } from '@/lib/data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, PlusCircle, GitBranch, Building } from 'lucide-react'; // Added GitBranch
import { Separator } from '@/components/ui/separator';
import { DeleteLocalityButton } from '@/components/actions/DeleteLocalityButton';
import { EditLocalityButton } from '@/components/actions/EditLocalityButton';
import { AddLocalityButton } from '@/components/actions/AddLocalityButton';

interface ZonePageProps {
  params: {
    zoneId: string;
  };
}

export async function generateMetadata({ params }: ZonePageProps): Promise<Metadata> {
  const zone = await getZoneDetails(params.zoneId);
  if (!zone) {
    return {
      title: 'Zone Not Found',
    };
  }
  const pageTitle = zone.id === 'ZonaMetropolitana' ? `Branches in ${zone.name}` : `Localities in ${zone.name}`;
  return {
    title: `${pageTitle} - TelDirectory`,
    description: `Browse items for the ${zone.name} zone. Data is read from XML files.`,
  };
}

export default async function ZonePage({ params }: ZonePageProps) {
  const { zoneId } = params;
  const zone = await getZoneDetails(zoneId);
  
  if (!zone) { 
    notFound();
  }
  
  const items = await getZoneItems(zoneId);
  const isZonaMetropolitana = zone.id === 'ZonaMetropolitana';
  const itemTypeName = isZonaMetropolitana ? 'Branch' : 'Locality';
  const itemTypeNamePlural = isZonaMetropolitana ? 'Branches' : 'Localities';


  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: zone.name }]} />
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">{itemTypeNamePlural} in {zone.name}</h1>
          <AddLocalityButton 
            zoneId={zoneId} 
            zoneName={zone.name} 
            itemType={isZonaMetropolitana ? 'branch' : 'locality'}
          />
        </div>
        {items.length > 0 ? (
          <div className="space-y-4">
            {items.map((item) => {
              const Icon = item.type === 'branch' ? GitBranch : Building;
              const href = item.type === 'branch' 
                ? `/${zoneId}/branches/${item.id}` 
                : `/${zoneId}/localities/${item.id}`;
              const description = item.type === 'branch' 
                ? `View localities in ${item.name} branch.`
                : `View extensions and details for ${item.name}.`;

              return (
                <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-grow">
                      <div className="flex items-center gap-3 mb-1">
                        <Icon className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">
                          <Link href={href} className="hover:underline hover:text-primary transition-colors">
                            {item.name}
                          </Link>
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground ml-8 sm:ml-0">
                        {description} (ID: {item.id})
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center space-x-1">
                      <EditLocalityButton 
                        zoneId={zoneId} 
                        item={item} 
                        itemType={item.type} 
                      />
                      <DeleteLocalityButton 
                        zoneId={zoneId} 
                        itemId={item.id} 
                        itemName={item.name} 
                        itemType={item.type} 
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No {itemTypeNamePlural.toLowerCase()} found in the XML file for this zone (<code>IVOXS/ZoneBranch/{zone.id}.xml</code>).
          </p>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management</h2>
        <p className="text-muted-foreground">
          {itemTypeNamePlural} for the <strong>{zone.name}</strong> zone are managed by editing the XML file at <code>IVOXS/ZoneBranch/{zone.id}.xml</code>.
          Ensure this file contains <code>&lt;MenuItem&gt;</code> tags representing each {itemTypeName.toLowerCase()}. Deleting an item here will remove it from this list and attempt to delete its corresponding {itemTypeHelpText(isZonaMetropolitana)}.
        </p>
      </div>
    </div>
  );
}

function itemTypeHelpText(isZonaMetropolitana: boolean) {
  if (isZonaMetropolitana) {
    return "branch XML file (in IVOXS/Branch/) and recursively its contents";
  }
  return "department XML file (in IVOXS/Department/)";
}
