
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Setup Information - TelDirectory',
  description: 'Find setup information for your IP phone directory.',
};

export default function ImportXmlPage() {
  const appBaseUrlPlaceholder = 'http://YOUR_DEVICE_IP:9002'; 
  const mainmenuUrl = `${appBaseUrlPlaceholder}/ivoxsdir/mainmenu.xml`;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Setup Information' }]} />
      <div className="space-y-8">
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
                Refer to your IP phone documentation for instructions on how to configure external directory services. The XML files for the directory should be placed in the <code>IVOXS</code> folder in the project root.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
                <InfoIcon className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">Directory Data Management</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The phone directory data is now read directly from XML files located in the <code>IVOXS</code> directory in the root of this project.
            </p>
            <ul className="list-disc pl-5 mt-2 text-muted-foreground space-y-1">
              <li><code>IVOXS/MAINMENU.xml</code>: Defines the main zones.</li>
              <li><code>IVOXS/ZoneBranch/</code>: Contains an XML file for each zone (e.g., <code>este.xml</code>), listing its localities.</li>
              <li><code>IVOXS/Department/</code>: Contains an XML file for each locality (e.g., <code>Bavaro.xml</code>), listing its extensions.</li>
            </ul>
            <p className="mt-4 text-muted-foreground">
              To update the directory, modify these XML files directly and redeploy the application or ensure the server re-reads them (may require a server restart depending on caching).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
