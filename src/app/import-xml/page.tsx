
'use client'; 

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, UploadCloud, Palette, Languages, Settings as SettingsIcon, RadioTower } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { saveZoneBranchXmlAction, saveDepartmentXmlAction } from '@/lib/actions';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { LanguageToggle } from '@/components/settings/LanguageToggle'; 
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation'; 
import { useEffect, useState } from 'react'; 
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';


export default function SettingsPage() {
  const { t } = useTranslation();
  const [displayPort, setDisplayPort] = useState<string>('9002'); // Default port for display
  const [tempPort, setTempPort] = useState<string>(displayPort);

  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
    const storedPort = localStorage.getItem('displayPort');
    if (storedPort) {
      setDisplayPort(storedPort);
      setTempPort(storedPort);
    }
  }, [t]);

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempPort(e.target.value);
  };

  const handlePortUpdate = () => {
    const newPort = tempPort.trim();
    if (newPort && /^\d+$/.test(newPort)) {
        setDisplayPort(newPort);
        localStorage.setItem('displayPort', newPort);
    } else {
        alert(t('portNumberPlaceholder')); // Or use a toast
    }
  };

  const appBaseUrlPlaceholder = `http://YOUR_DEVICE_IP:${displayPort}`; 
  const mainmenuUrl = `${appBaseUrlPlaceholder}/ivoxsdir/mainmenu.xml`;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('settings') }]} />
      <div className="space-y-8">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SettingsIcon className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('settings')}</CardTitle>
            </div>
            <CardDescription>
              {t('settingsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Palette className="h-5 w-5 text-muted-foreground" />
                    {t('appearanceSettings')}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">{t('appearanceDescription')}</p>
                <ThemeToggle />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Languages className="h-5 w-5 text-muted-foreground" />
                    {t('languageSettings')}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">{t('languageDescription')}</p>
                <LanguageToggle />
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <RadioTower className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('servicePortSettings')}</CardTitle>
            </div>
            <CardDescription>
             {t('servicePortDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portInput">{t('configureServicePortLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="portInput"
                  type="text"
                  value={tempPort}
                  onChange={handlePortChange}
                  placeholder={t('portNumberPlaceholder')}
                  className="max-w-xs"
                />
                <Button onClick={handlePortUpdate}>{t('updatePortButton')}</Button>
              </div>
            </div>
             <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>{t('importantNotice')}</AlertTitle>
              <AlertDescription>
                {t('serviceUrlPlaceholderInfo')}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Separator />
        
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <InfoIcon className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('ipPhoneDirectoryAccess')}</CardTitle>
            </div>
            <CardDescription>
              {t('ipPhoneDirectoryAccessDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-md">
              <p className="text-sm text-muted-foreground">{t('serviceUrl')}</p>
              <code className="block text-lg font-mono text-foreground break-all p-2 bg-background rounded">
                {mainmenuUrl}
              </code>
            </div>
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>{t('importantNotice')}</AlertTitle>
              <AlertDescription>
                {t('ipAddressPlaceholderNotice')}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        
        <Separator />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
                <UploadCloud className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">{t('importXmlFiles')}</CardTitle>
            </div>
            <CardDescription>
                {t('importXmlFilesDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>{t('caution')}</AlertTitle>
              <AlertDescription>
                {t('importOverwriteWarning')}
              </AlertDescription>
            </Alert>

            <FileUploadForm
              formTitle={t('importZoneBranchXml')}
              formDescription={<>{t('importZoneBranchXmlDescription')}</>}
              importAction={saveZoneBranchXmlAction}
              requiresId={false} 
              allowMultipleFiles={true}
            />

            <FileUploadForm
              formTitle={t('importDepartmentXml')}
              formDescription={<>{t('importDepartmentXmlDescription')}</>}
              importAction={saveDepartmentXmlAction}
              allowMultipleFiles={true}
              requiresId={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

