
import { getZoneDetails, getBranchDetails, getLocalityWithExtensions, getLocalityDetails } from '@/lib/data';
import { ExtensionTable } from '@/components/directory/ExtensionTable';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';
import { AddExtensionButton } from '@/components/actions/AddExtensionButton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from '@/lib/translations-server';
import { isAuthenticated } from '@/lib/auth-actions';

interface BranchLocalityPageProps {
  params: {
    zoneId: string;
    branchId: string;
    localityId: string;
  };
}

export async function generateMetadata({ params: paramsPromise }: BranchLocalityPageProps): Promise<Metadata> {
  const params = await paramsPromise;
  const locality = await getLocalityDetails(params.localityId, { zoneId: params.zoneId, branchId: params.branchId });
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

export default async function BranchLocalityPage({ params: paramsPromise }: BranchLocalityPageProps) {
  const params = await paramsPromise;
  const { zoneId, branchId, localityId } = params;
  
  const zone = await getZoneDetails(zoneId);
  const branch = await getBranchDetails(zoneId, branchId);
  const locality = await getLocalityWithExtensions(localityId);
  const localityDisplayName = (await getLocalityDetails(localityId, { zoneId, branchId }))?.name || localityId;
  const userIsAuthenticated = await isAuthenticated();


  if (!zone || !branch || !locality) { 
    notFound();
  }
  
  const t = await getTranslations();

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs 
          items={[
            { label: zone.name, href: `/${zoneId}` },
            { label: branch.name, href: `/${zoneId}/branches/${branchId}` },
            { label: localityDisplayName }
          ]} 
        />
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${zoneId}/branches/${branchId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backButton') || 'Back'}
            </Link>
          </Button>
        </div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">Extensions in {localityDisplayName}</h1>
          {userIsAuthenticated && (
            <AddExtensionButton 
              localityId={localityId} 
              localityName={localityDisplayName} 
              zoneId={zoneId}
              branchId={branchId} 
            />
          )}
        </div>
        <ExtensionTable 
          extensions={locality.extensions || []} 
          localityName={localityDisplayName} 
          localityId={localityId}
          zoneId={zoneId}
          branchId={branchId}
          isAuthenticated={userIsAuthenticated}
        />
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Data Management for {localityDisplayName}</h2>
        <p className="text-muted-foreground">
          Extensions for the <strong>{localityDisplayName}</strong> locality (within branch <strong>{branch.name}</strong> of <strong>{zone.name}</strong> zone) are managed by editing the XML file at <code>ivoxsdir/department/{locality.id}.xml</code>.
          Ensure this file has a <code>&lt;CiscoIPPhoneDirectory&gt;</code> root element, containing <code>&lt;DirectoryEntry&gt;</code> items. Deleting an extension will remove its entry from this file.
        </p>
      </div>
    </div>
  );
}
