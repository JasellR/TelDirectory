
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, UploadCloud } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { saveZoneBranchXmlAction, saveDepartmentXmlAction } from '@/lib/actions';

export const metadata: Metadata = {
  title: 'Import & Setup - TelDirectory',
  description: 'Manage and import XML configuration files for your IP phone directory.',
};

export default function ImportXmlPage() {
  const appBaseUrlPlaceholder = 'http://YOUR_DEVICE_IP:9002'; 
  const mainmenuUrl = `${appBaseUrlPlaceholder}/ivoxsdir/mainmenu.xml`;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Import & Setup' }]} />
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
                The XML files for the directory should be placed in the <code>IVOXS</code> folder in the project root. The <code>MAINMENU.xml</code> file is managed by the application and should not typically be manually uploaded here.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
                <UploadCloud className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">Import XML Files</CardTitle>
            </div>
            <CardDescription>
                Upload XML files directly to their respective locations within the <code>IVOXS</code> directory. 
                Ensure files are correctly formatted Cisco IP Phone XML.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>Caution</AlertTitle>
              <AlertDescription>
                Importing files will overwrite existing files with the same name in the target directory. Please ensure you are uploading the correct files.
              </AlertDescription>
            </Alert>

            <FileUploadForm
              formTitle="Import Zone Branch XML"
              formDescription={<>Upload an XML file for a specific zone (e.g., <code>ZonaEste.xml</code>). The filename (without the <code>.xml</code> extension) will be used as its ID. It will be saved in <code>IVOXS/ZoneBranch/</code>.</>}
              importAction={saveZoneBranchXmlAction}
              requiresId={false} // ID will be derived from filename
            />

            <FileUploadForm
              formTitle="Import Department XML Files"
              formDescription={<>Upload one or more XML files for specific departments/localities. The filename (without the <code>.xml</code> extension) will be used as its ID. Files will be saved in <code>IVOXS/Department/</code>.</>}
              importAction={saveDepartmentXmlAction}
              allowMultipleFiles={true}
              requiresId={false} // ID is derived from filename for multiple uploads
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

