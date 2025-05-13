

'use client'; 

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, UploadCloud, Palette, Languages, Settings as SettingsIcon, RadioTower, Server, FileCode, Network } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


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
              <CardTitle className="text-2xl">{t('generalSettingsTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('generalSettingsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <Card className="shadow-none border">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Palette className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-xl">{t('appearanceSettings')}</CardTitle>
                    </div>
                    <CardDescription>{t('appearanceDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ThemeToggle />
                </CardContent>
            </Card>
             <Card className="shadow-none border">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Languages className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-xl">{t('languageSettings')}</CardTitle>
                    </div>
                    <CardDescription>{t('languageDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <LanguageToggle />
                </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Network className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('networkServiceConfigTitle')}</CardTitle>
            </div>
            <CardDescription>
             {t('networkServiceConfigDescription')}
            </CardDescription>
          </CardHeader>
          <TooltipProvider>
            <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-6">
              {/* Host Settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="hostInput" className="text-base font-semibold">
                    {t('configureServiceHostLabel')}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded-full p-0">
                        <InfoIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{t('serviceHostTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="hostInput"
                    type="text"
                    value={tempHost}
                    onChange={handleHostChange}
                    placeholder={t('hostInputPlaceholder')}
                    className="flex-grow"
                    disabled={isPending}
                  />
                  <Button onClick={handleApplyHostToXml} disabled={isPending} className="shrink-0">
                     {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('applyHostToXmlButton')}
                  </Button>
                </div>
                 <p className="text-xs text-muted-foreground">{t('hostSettingsNoteShort')}</p>
              </div>

              {/* Port Settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <Label htmlFor="portInput" className="text-base font-semibold">
                    {t('configureServicePortLabel')}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded-full p-0">
                        <InfoIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{t('servicePortTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="portInput"
                    type="text"
                    value={tempPort}
                    onChange={handlePortChange}
                    placeholder={t('portNumberPlaceholder')}
                    className="flex-grow"
                  />
                  <Button onClick={handlePortUpdate} className="shrink-0">{t('updatePortButton')}</Button>
                </div>
              </div>
            </CardContent>
          </TooltipProvider>
        </Card>
        
        <Separator />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <RadioTower className="h-6 w-6 text-primary" />
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
              <FileCode className="h-4 w-4" />
              <AlertTitle>{t('caution')}</AlertTitle>
              <AlertDescription>
                {t('importOverwriteWarning')}
              </AlertDescription>
            </Alert>
            
            <Card className="shadow-none border">
                <CardHeader>
                    <CardTitle className="text-xl">{t('importZoneBranchXml')}</CardTitle>
                    <CardDescription>{t('importZoneBranchXmlDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FileUploadForm
                      importAction={saveZoneBranchXmlAction}
                      requiresId={false} 
                      allowMultipleFiles={true}
                    />
                </CardContent>
            </Card>

            <Card className="shadow-none border">
                <CardHeader>
                    <CardTitle className="text-xl">{t('importDepartmentXml')}</CardTitle>
                    <CardDescription>{t('importDepartmentXmlDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FileUploadForm
                      importAction={saveDepartmentXmlAction}
                      allowMultipleFiles={true}
                      requiresId={false}
                    />
                </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


