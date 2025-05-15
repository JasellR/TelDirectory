
import { getZones } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Separator } from '@/components/ui/separator';
import { AddZoneButton } from '@/components/actions/AddZoneButton'; // New import
import { getTranslations } from '@/lib/translations-server';

export default async function HomePage() {
  const zones = await getZones();
  const t = await getTranslations();

  return (
    <div>
      <Breadcrumbs items={[]} />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-foreground">{t('browseByZoneTitle')}</h1>
        <AddZoneButton /> 
      </div>
      {zones.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zones.map((zone) => (
            <NavigationCard
              key={zone.id}
              title={zone.name}
              href={`/${zone.id}`}
              description={t('exploreZoneItems', { zoneName: zone.name })}
              iconType="zone"
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('noZonesAvailable')}</p>
      )}
    </div>
  );
}
