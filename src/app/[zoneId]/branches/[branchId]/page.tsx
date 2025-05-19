
import { getZoneDetails, getBranchDetails, getBranchItems } from '@/lib/data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, PlusCircle, Building, Inbox, ArrowLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DeleteLocalityButton } from '@/components/actions/DeleteLocalityButton';
import { EditLocalityButton } from '@/components/actions/EditLocalityButton';
import { AddLocalityButton } from '@/components/actions/AddLocalityButton';
import { getTranslations } from '@/lib/translations-server';
import { Button } from '@/components/ui/button';
import { isAuthenticated } from '@/lib/auth-actions';

interface BranchPageProps {
  params: {
    zoneId: string;
    branchId: string;
  };
}

export async function generateMetadata({ params: paramsPromise }: BranchPageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const branch = await getBranchDetails(params.zoneId, params.branchId);
  if (!branch) {
    return {
      title: 'Branch Not Found',
    };
  }
  return {
    title: `Localities in ${branch.name} - TelDirectory`,
    description: `Browse localities for the ${branch.name} branch. Data is read from XML files.`,
  };
}

export default async function BranchPage({ params: paramsPromise }: BranchPageProps) {
  const params = await paramsPromise;
  const { zoneId, branchId } = params;
  const zone = await getZoneDetails(zoneId);
  const branch = await getBranchDetails(zoneId, branchId);
  const userIsAuthenticated = await isAuthenticated();
  
  if (!zone || !branch) { 
    notFound();
  }
  
  const localities = await getBranchItems(branchId);
  const t = await getTranslations(); 

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs 
          items={[
            { label: zone.name, href: `/${zoneId}` },
            { label: branch.name }
          ]} 
        />
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${zoneId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backButton') || 'Back'}
            </Link>
          </Button>
        </div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('localitiesInBranchTitle', { branchName: branch.name }) || `Localities in ${branch.name}`}</h1>
          {userIsAuthenticated && (
            <AddLocalityButton 
              zoneId={zoneId} 
              zoneName={zone.name} 
              branchId={branchId}
              branchName={branch.name}
              itemType='locality' 
            />
          )}
        </div>
        {localities.length > 0 ? (
          <div className="space-y-4">
            {localities.map((locality) => (
              <Card key={locality.id} className="shadow-sm hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-1">
                      <Building className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">
                        <Link 
                            href={`/${zoneId}/branches/${branchId}/localities/${locality.id}`} 
                            className="hover:underline hover:text-primary transition-colors"
                        >
                          {locality.name}
                        </Link>
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground ml-8 sm:ml-0">
                      {t('viewExtensionsAndDetails', { localityName: locality.name })} (ID: {locality.id})
                    </p>
                  </div>
                  {userIsAuthenticated && (
                    <div className="flex-shrink-0 flex items-center space-x-1">
                      <EditLocalityButton 
                          zoneId={zoneId} 
                          branchId={branchId} 
                          item={{id: locality.id, name: locality.name, type: 'locality'}}
                          itemType='locality'
                      />
                      <DeleteLocalityButton 
                          zoneId={zoneId} 
                          branchId={branchId}
                          itemId={locality.id} 
                          itemName={locality.name} 
                          itemType='locality'
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 border-2 border-dashed border-muted-foreground/30 rounded-lg">
            <Inbox className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-xl font-semibold text-foreground">{t('emptyBranchTitle') || 'This Branch is Empty'}</p>
            <p className="text-muted-foreground">
              {t('noLocalitiesInBranch', { branchName: branch.name, branchId: branch.id })}
            </p>
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t('dataManagementForBranchTitle', { branchName: branch.name}) || `Data Management for ${branch.name}`}</h2>
        <p className="text-muted-foreground">
          {t('dataManagementForBranchDescription', { branchName: branch.name, zoneName: zone.name, branchId: branch.id })}
        </p>
      </div>
    </div>
  );
}
