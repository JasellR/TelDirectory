
import { getZoneDetails, getZoneItems } from '@/lib/data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';
import { AddLocalityButton } from '@/components/actions/AddLocalityButton';
import { LocalityBranchSearch } from '@/components/search/LocalityBranchSearch';

interface ZonePageProps {
  params: {
    zoneId: string;
  };
}

export async function generateMetadata({ params }: ZonePageProps): Promise<Metadata> {
  const resolvedParams = await params; // Await params
  const zone = await getZoneDetails(resolvedParams.zoneId);
  if (!zone) {
    return {
      title: 'Zone Not Found',
    };
  }
  const pageTitle = zone.id === 'ZonaMetropolitana' ? `Branches in ${zone.name}` : `Localities in ${zone.name}`;
  return {
    title: `${pageTitle} - TelDirectory`,
    description: `Browse and search items for the ${zone.name} zone. Data is read from XML files.`,
  };
}

export default async function ZonePage({ params }: ZonePageProps) {
  const resolvedParams = await params; // Await params
  const { zoneId } = resolvedParams;
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-foreground">{itemTypeNamePlural} in {zone.name}</h1>
          <AddLocalityButton 
            zoneId={zoneId} 
            zoneName={zone.name} 
            itemType={isZonaMetropolitana ? 'branch' : 'locality'}
          />
        </div>
        
        <LocalityBranchSearch items={items} zoneId={zoneId} itemType={itemTypeName} itemTypePlural={itemTypeNamePlural} />
        
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
