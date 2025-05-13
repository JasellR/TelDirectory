
'use client'; 

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, UploadCloud, Palette, Languages, Settings as SettingsIcon, RadioTower, Server } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { saveZoneBranchXmlAction, saveDepartmentXmlAction, updateXmlUrlsAction } from '@/lib/actions';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { LanguageToggle } from '@/components/settings/LanguageToggle'; 
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation'; 
import { useEffect, useState, useTransition } from 'react'; 
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [displayPort, setDisplayPort] = useState<string>('9002');
  const [tempPort, setTempPort] = useState<string>(displayPort);
  
  const [displayHost, setDisplayHost] = useState<string>('YOUR_DEVICE_IP');
  const [tempHost, setTempHost] = useState<string>(displayHost);


  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
    const storedPort = localStorage.getItem('displayPort');
    if (storedPort) {
      setDisplayPort(storedPort);
      setTempPort(storedPort);
    }
    const storedHost = localStorage.getItem('displayHost');
    if (storedHost) {
      setDisplayHost(storedHost);
      setTempHost(storedHost);
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
        toast({ title: t('successTitle'), description: t('portUpdatedSuccess') });
    } else {
        toast({ title: t('errorTitle'), description: t('portNumberPlaceholder'), variant: 'destructive' });
    }
  };

  const handleHostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempHost(e.target.value);
  };

  const handleApplyHostToXml = () => {
    const newHost = tempHost.trim();
    const currentPort = displayPort.trim();

    if (!newHost) {
      toast({ title: t('errorTitle'), description: t('hostCannotBeEmpty'), variant: 'destructive' });
      return;
    }
    if (!currentPort || !/^\d+$/.test(currentPort)) {
      toast({ title: t('errorTitle'), description: t('portNumberInvalidForHostUpdate'), variant: 'destructive' });
      return;
    }
    
    startTransition(async () => {
      const result = await updateXmlUrlsAction(newHost, currentPort);
      if (result.success) {
        localStorage.setItem('displayHost', newHost);
        setDisplayHost(newHost);
        toast({ 
          title: t('successTitle'), 
          description: `${result.message} ${t('filesProcessedLabel')}: ${result.filesProcessed || 0}. ${t('filesFailedLabel')}: ${result.filesFailed || 0}.`
        });
      } else {
        toast({ 
          title: t('errorTitle'), 
          description: `${result.message}${result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''} ${t('filesProcessedLabel')}: ${result.filesProcessed || 0}. ${t('filesFailedLabel')}: ${result.filesFailed || 0}.`, 
          variant: 'destructive' 
        });
      }
    });
  };


  const appBaseUrlPlaceholder = `http://${displayHost}:${displayPort}`; 
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
              <Server className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('serviceHostSettingsTitle')}</CardTitle>
            </div>
            <CardDescription>
             {t('serviceHostSettingsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hostInput">{t('configureServiceHostLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="hostInput"
                  type="text"
                  value={tempHost}
                  onChange={handleHostChange}
                  placeholder={t('hostInputPlaceholder')}
                  className="max-w-xs"
                  disabled={isPending}
                />
                <Button onClick={handleApplyHostToXml} disabled={isPending}>
                   {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('applyHostToXmlButton')}
                </Button>
              </div>
               <p className="text-xs text-muted-foreground">{t('hostSettingsNote')}</p>
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
                {t('ipAddressPlaceholderNotice', { currentHost: displayHost, currentPort: displayPort })}
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

