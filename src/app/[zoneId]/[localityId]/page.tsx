import { getExtensionsByLocalityId, getLocalityById, getZoneById } from '@/lib/data';
import { ExtensionTable } from '@/components/directory/ExtensionTable';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

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

export default async function LocalityPage({ params }: LocalityPageProps) {
  const { zoneId, localityId } = params;
  const zone = await getZoneById(zoneId);
  const locality = await getLocalityById(zoneId, localityId);
  const extensions = await getExtensionsByLocalityId(zoneId, localityId);

  if (!zone || !locality || !extensions) {
    notFound();
  }

  return (
    <div>
      <Breadcrumbs 
        items={[
          { label: zone.name, href: `/${zoneId}` },
          { label: locality.name }
        ]} 
      />
      {/* The ExtensionTable component already includes a title with localityName */}
      <ExtensionTable extensions={extensions} localityName={locality.name} />
    </div>
  );
}
