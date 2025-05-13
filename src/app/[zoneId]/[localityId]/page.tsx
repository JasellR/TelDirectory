
import { getExtensionsByLocalityId, getLocalityById, getZoneById } from '@/lib/data';
import { ExtensionTable } from '@/components/directory/ExtensionTable';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';
import { AddExtensionButton } from '@/components/actions/AddExtensionButton'; // Added

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
    description: `Find department extensions for ${locality.name}. Data is read from XML files.`,
  };
}

export default async function LocalityPage({ params }: LocalityPageProps) {
  const { zoneId, localityId } = params;
  const zone = await getZoneById(zoneId);
  const locality = await getLocalityById(zoneId, localityId);
  
  const extensions = locality?.extensions || [];

  if (!zone || !locality) { 
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">Extensions in {locality.name}</h1>
          <AddExtensionButton 
            localityId={localityId} 
            localityName={locality.name} 
            zoneId={zoneId} 
          />
        </div>
        <ExtensionTable 
          extensions={extensions} 
          localityName={locality.name} 
          localityId={localityId}
          zoneId={zoneId}
        />
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management for {locality.name}</h2>
        <p className="text-muted-foreground">
          Extensions for the <strong>{locality.name}</strong> locality (within <strong>{zone.name}</strong> zone) are managed by editing the XML file at <code>IVOXS/Department/{locality.id}.xml</code>.
          Ensure this file has a <code>&lt;CiscoIPPhoneDirectory&gt;</code> root element, containing <code>&lt;DirectoryEntry&gt;</code> items. Deleting an extension will remove its entry from this file.
        </p>
      </div>
    </div>
  );
}
