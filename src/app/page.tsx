
import { getZones, getAllExtensionsForSearch } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ExtensionSearch } from '@/components/search/ExtensionSearch';
import { Separator } from '@/components/ui/separator';

export default async function HomePage() {
  const zones = await getZones();
  const allExtensions = await getAllExtensionsForSearch();

  return (
    <div>
      <Breadcrumbs items={[]} />
      <h1 className="text-3xl font-bold mb-6 text-foreground">Search Extensions</h1>
      <ExtensionSearch allExtensions={allExtensions} />
      
      <Separator className="my-12" />

      <h2 className="text-3xl font-bold mb-8 text-foreground">Or Browse by Zone</h2>
      {zones.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zones.map((zone) => (
            <NavigationCard
              key={zone.id}
              title={zone.name}
              href={`/${zone.id}`}
              description={`Explore localities in ${zone.name}.`}
              iconType="zone"
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No zones available at the moment.</p>
      )}
    </div>
  );
}

