
import { getZoneDetails, getZoneItems, getLocalityWithExtensions } from '@/lib/data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';
import { AddLocalityButton } from '@/components/actions/AddLocalityButton';
import { LocalityBranchSearch } from '@/components/search/LocalityBranchSearch';
import { Button } from '@/components/ui/button'; 
import Link from 'next/link'; 
import { ArrowLeft } from 'lucide-react'; 
import { getTranslations } from '@/lib/translations-server'; 
import { isAuthenticated } from '@/lib/auth-actions';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ExtensionTable } from '@/components/directory/ExtensionTable';

interface ZonePageProps {
  params: {
    zoneId: string;
  };
}

export async function generateMetadata({ params }: ZonePageProps): Promise<Metadata> {
  const resolvedParams = await params; 
  const zone = await getZoneDetails(resolvedParams.zoneId);
  if (!zone) {
    return {
      title: 'Zone Not Found',
    };
  }
  
  let pageTitle = `Items in ${zone.name}`;
  if (zone.id === 'MissingExtensionsFromFeed') {
    pageTitle = `Missing Extensions from Feed`;
  } else {
    const items = await getZoneItems(zone.id);
    const isZonaMetropolitana = items.some(item => item.type === 'branch');
    pageTitle = isZonaMetropolitana ? `Branches in ${zone.name}` : `Localities in ${zone.name}`;
  }
  
  return {
    title: `${pageTitle} - TelDirectory`,
    description: `Browse and search items for the ${zone.name} zone. Data is read from XML files.`,
  };
}

export default async function ZonePage({ params }: ZonePageProps) {
  const resolvedParams = await params; 
  const { zoneId } = resolvedParams;
  const zone = await getZoneDetails(zoneId);
  const t = await getTranslations(); 
  const userIsAuthenticated = await isAuthenticated();
  
  if (!zone) {
    notFound();
  }

  // Handle the special case for "Missing Extensions from Feed"
  if (zoneId === 'MissingExtensionsFromFeed') {
    const locality = await getLocalityWithExtensions("MissingExtensionsDepartment");
    if (!locality) notFound();

    return (
      <div className="space-y-8">
        <div>
          <Breadcrumbs items={[{ label: zone.name }]} />
           <div className="mb-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('backButton') || 'Back'}
              </Link>
            </Button>
          </div>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-foreground">{zone.name}</h1>
          </div>
           <ExtensionTable 
              extensions={locality.extensions || []} 
              localityName={locality.name} 
              localityId={locality.id}
              zoneId={zoneId}
              isAuthenticated={userIsAuthenticated}
            />
        </div>
      </div>
    );
  }

  // Regular Zone Logic
  const items = await getZoneItems(zoneId);
  const isZonaMetropolitana = items.some(item => item.type === 'branch');
  const itemTypeName = isZonaMetropolitana ? 'Branch' : 'Locality';
  const itemTypeNamePlural = isZonaMetropolitana ? 'Branches' : 'Localities';


  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: zone.name }]} />
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backButton') || 'Back'} 
            </Link>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-foreground">{itemTypeNamePlural} in {zone.name}</h1>
          {userIsAuthenticated && (
            <AddLocalityButton 
              zoneId={zoneId} 
              zoneName={zone.name} 
              itemType={isZonaMetropolitana ? 'branch' : 'locality'}
            />
          )}
        </div>
        
        {items.length > 0 ? (
           <LocalityBranchSearch 
              items={items} 
              zoneId={zoneId} 
              itemType={itemTypeName} 
              itemTypePlural={itemTypeNamePlural} 
              isAuthenticated={userIsAuthenticated} 
            />
        ) : (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Items Found</AlertTitle>
                <AlertDescription>
                    No localities or branches could be found for this zone. This may be because the corresponding zonebranch XML file (<code>{zoneId}.xml</code>) is empty, missing, or malformed.
                </AlertDescription>
            </Alert>
        )}
        
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management</h2>
        <p className="text-muted-foreground">
          {itemTypeNamePlural} for the <strong>{zone.name}</strong> zone are managed by editing the XML file at <code>.../zonebranch/{zone.id}.xml</code> (path relative to your configured directory).
          Ensure this file contains <code>&lt;MenuItem&gt;</code> tags representing each {itemTypeName.toLowerCase()}. Deleting an item here will remove it from this list and attempt to delete its corresponding {itemTypeHelpText(isZonaMetropolitana)}.
        </p>
      </div>
    </div>
  );
}

function itemTypeHelpText(isZonaMetropolitana: boolean) {
  if (isZonaMetropolitana) {
    return "branch XML file (in a .../branch/ directory) and recursively its contents";
  }
  return "department XML file (in a .../department/ directory)";
}

    