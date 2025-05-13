
import { ImportXmlForm } from '@/components/import/ImportXmlForm';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription }
from '@/components/ui/alert';
import { InfoIcon, UploadCloud } from 'lucide-react';
import { importZonesFromXml } from './actions'; // For global import

export const metadata: Metadata = {
  title: 'Import & Setup - TelDirectory',
  description: 'Import zone data and find setup information for your IP phone directory.',
};

export default function ImportXmlPage() {
  const appBaseUrlPlaceholder = 'http://YOUR_DEVICE_IP:9002'; // Consider making this configurable
  const mainmenuUrl = `${appBaseUrlPlaceholder}/ivoxsdir/mainmenu.xml`;

  const globalImportDescription = (
    <>
      Upload an XML file to import or update the entire directory structure. 
      The expected root tag is <code>&lt;directorydata&gt;</code>, containing <code>&lt;zone&gt;</code> elements.
    </>
  );

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Import & Setup' }]} />
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <UploadCloud className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Global Directory Import</h1>
          </div>
          <p className="mb-6 text-muted-foreground">
            Use this form to import or update the entire phone directory from a single XML file.
            This is typically used for initial setup or large-scale updates.
          </p>
          <ImportXmlForm
            formTitle="Import Full Directory Structure"
            formDescription={globalImportDescription}
            importAction={importZonesFromXml}
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <InfoIcon className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">IP Phone Directory Access</CardTitle>
            </div>
            <CardDescription>
              To allow your Cisco IP phones to access the directory, configure them to use the following URL for the main menu service:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-md">
              <p className="text-sm text-muted-foreground">Service URL:</p>
              <code className="block text-lg font-mono text-foreground break-all p-2 bg-background rounded">
                {mainmenuUrl}
              </code>
            </div>
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Replace <code>YOUR_DEVICE_IP</code> with the actual IP address or hostname of the server running this application. 
                This server must be accessible from your IP phones' network. The port (e.g., <code>9002</code> for development) must also match your application's running configuration.
                Refer to your IP phone documentation for instructions on how to configure external directory services.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
