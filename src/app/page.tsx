
import { getZones } from '@/lib/data';
import { NavigationCard } from '@/components/directory/NavigationCard';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Separator } from '@/components/ui/separator';

export default async function HomePage() {
  const zones = await getZones();

  return (
    <div>
      <Breadcrumbs items={[]} />
      <h1 className="text-3xl font-bold mb-8 text-foreground">Browse by Zone</h1>
      {zones.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {zones.map((zone) => (
            <NavigationCard
              key={zone.id}
              title={zone.name}
              href={`/${zone.id}`}
              description={`Explore items in ${zone.name}.`}
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

    
