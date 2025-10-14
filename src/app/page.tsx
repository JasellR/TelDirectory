
import { getZones } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { AddZoneButton } from '@/components/actions/AddZoneButton';
import { getTranslations } from '@/lib/translations-server';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { Separator } from '@/components/ui/separator';
import { isAuthenticated } from '@/lib/auth-actions';
import { DeleteZoneButton } from '@/components/actions/DeleteZoneButton'; 
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';


export default async function HomePage() {
  const allZones = await getZones();
  const t = await getTranslations();
  const userIsAuthenticated = await isAuthenticated();

  // Filter out the "Missing Extensions" zone if the user is not authenticated
  const zones = userIsAuthenticated 
    ? allZones 
    : allZones.filter(zone => zone.id !== 'MissingExtensionsFromFeed');

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
          {zones.map((zone) => {
            // Special navigation logic for the "Missing Extensions" zone
            const isMissingExtensionsZone = zone.id === 'MissingExtensionsFromFeed';
            const href = isMissingExtensionsZone
              ? '/MissingExtensionsFromFeed/localities/MissingExtensionsDepartment'
              : `/${zone.id}`;

            return (
              <div key={zone.id} className="relative group">
                <NavigationCard
                  title={zone.name}
                  href={href}
                  description={t('exploreZoneItems', { zoneName: zone.name })}
                  iconType={isMissingExtensionsZone ? 'missing' : 'zone'}
                />
                {userIsAuthenticated && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <DeleteZoneButton 
                      zoneId={zone.id} 
                      zoneName={zone.name} 
                      isAuthenticated={userIsAuthenticated} 
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
         <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Directory Not Found</AlertTitle>
            <AlertDescription>
              Could not load the directory zones. Please ensure that <strong>MainMenu.xml</strong> exists at the root of your configured directory path and is not empty or malformed.
            </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

