import { getLocalitiesByZoneId, getZoneById } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

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
    description: `Browse localities within the ${zone.name} zone.`,
  };
}

export default async function ZonePage({ params }: ZonePageProps) {
  const { zoneId } = params;
  const zone = await getZoneById(zoneId);
  const localities = await getLocalitiesByZoneId(zoneId);

  if (!zone || !localities) {
    notFound();
  }

  return (
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
        <p className="text-muted-foreground">No localities found in this zone.</p>
      )}
    </div>
  );
}
