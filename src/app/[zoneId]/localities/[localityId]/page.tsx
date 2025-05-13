
import { getZoneDetails, getLocalityWithExtensions, getLocalityDetails } from '@/lib/data';
import { ExtensionTable } from '@/components/directory/ExtensionTable';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';
import { AddExtensionButton } from '@/components/actions/AddExtensionButton';

interface LocalityPageProps {
  params: {
    zoneId: string;
    localityId: string;
  };
}

export async function generateMetadata({ params }: LocalityPageProps): Promise<Metadata> {
  const locality = await getLocalityDetails(params.localityId, { zoneId: params.zoneId });
  if (!locality) {
    return {
      title: 'Locality Not Found',
    };
  }
  return {
    title: `Extensions in ${locality.name} - TelDirectory`,
    description: `Find department extensions for ${locality.name}. Data is read from XML files.`,
  };
}

export default async function LocalityPage({ params }: LocalityPageProps) {
  const { zoneId, localityId } = params;
  const zone = await getZoneDetails(zoneId);
  const locality = await getLocalityWithExtensions(localityId);
  
  const localityDisplayName = (await getLocalityDetails(localityId, { zoneId }))?.name || localityId;

  if (!zone || !locality) { 
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs 
          items={[
            { label: zone.name, href: `/${zoneId}` },
            { label: localityDisplayName }
          ]} 
        />
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">Extensions in {localityDisplayName}</h1>
          <AddExtensionButton 
            localityId={localityId} 
            localityName={localityDisplayName} 
            zoneId={zoneId} 
          />
        </div>
        <ExtensionTable 
          extensions={locality.extensions || []} 
          localityName={localityDisplayName} 
          localityId={localityId}
          zoneId={zoneId}
        />
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management for {localityDisplayName}</h2>
        <p className="text-muted-foreground">
          Extensions for the <strong>{localityDisplayName}</strong> locality (within <strong>{zone.name}</strong> zone) are managed by editing the XML file at <code>IVOXS/Department/{locality.id}.xml</code>.
          Ensure this file has a <code>&lt;CiscoIPPhoneDirectory&gt;</code> root element, containing <code>&lt;DirectoryEntry&gt;</code> items. Deleting an extension will remove its entry from this file.
        </p>
      </div>
    </div>
  );
}
