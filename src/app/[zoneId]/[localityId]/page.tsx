
import { getExtensionsByLocalityId, getLocalityById, getZoneById } from '@/lib/data';
import { ExtensionTable } from '@/components/directory/ExtensionTable';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';

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
  
  // getExtensionsByLocalityId is now indirectly called by getLocalityById
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
        <ExtensionTable extensions={extensions} localityName={locality.name} />
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management for {locality.name}</h2>
        <p className="text-muted-foreground">
          Extensions for the <strong>{locality.name}</strong> locality (within <strong>{zone.name}</strong> zone) are managed by editing the XML file at <code>IVOXS/Department/{locality.id}.xml</code>.
          Ensure this file has a <code>&lt;CiscoIPPhoneDirectory&gt;</code> root element, containing <code>&lt;DirectoryEntry&gt;</code> items.
        </p>
      </div>
    </div>
  );
}
