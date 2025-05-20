
import { getZones } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { AddZoneButton } from '@/components/actions/AddZoneButton';
import { getTranslations } from '@/lib/translations-server';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { Separator } from '@/components/ui/separator';
import { isAuthenticated } from '@/lib/auth-actions';
import { DeleteZoneButton } from '@/components/actions/DeleteZoneButton'; // New import

export default async function HomePage() {
  const zones = await getZones();
  const t = await getTranslations();
  const userIsAuthenticated = await isAuthenticated();

  return (
    <div>
      <Breadcrumbs items={[]} />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t('appSubtitle')}</h1>
        <p className="text-muted-foreground">{t('homePageDescription')}</p>
        <GlobalSearch />
      </div>

      <Separator className="my-8" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <h2 className="text-2xl font-bold text-foreground">{t('browseByZoneTitle')}</h2>
        {userIsAuthenticated && <AddZoneButton />}
      </div>
      {zones.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zones.map((zone) => (
            <div key={zone.id} className="relative group">
              <NavigationCard
                title={zone.name}
                href={`/${zone.id}`}
                description={t('exploreZoneItems', { zoneName: zone.name })}
                iconType="zone"
              />
              {userIsAuthenticated && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DeleteZoneButton zoneId={zone.id} zoneName={zone.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('noZonesAvailable')}</p>
      )}
    </div>
  );
}
