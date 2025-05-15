'use client'; 

import { useState, useEffect, useTransition } from 'react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, Palette, Languages, Settings as SettingsIcon, FileCode, Network, Info } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { saveZoneBranchXmlAction, saveDepartmentXmlAction, updateXmlUrlsAction } from '@/lib/actions';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { LanguageToggle } from '@/components/settings/LanguageToggle'; 
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation'; 
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"


export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [serviceHost, setServiceHost] = useState('');
  const [servicePort, setServicePort] = useState('3128'); // Default port

  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
    // Placeholder: In a real app, you might fetch current host/port config if stored
    // For now, we'll rely on user input or defaults.
  }, [t]);

  const handleApplyNetworkSettings = async () => {
    if (!serviceHost.trim()) {
      toast({ title: t('errorTitle'), description: t('hostCannotBeEmpty'), variant: 'destructive' });
      return;
    }
    if (!servicePort.trim() || !/^\d+$/.test(servicePort.trim())) {
      toast({ title: t('errorTitle'), description: t('portInvalid'), variant: 'destructive' });
      return;
    }
    startTransition(async () => {
      const result = await updateXmlUrlsAction(serviceHost.trim(), servicePort.trim());
      if (result.success) {
        toast({
          title: t('successTitle'),
          description: result.message,
        });
      } else {
        toast({
          title: t('errorTitle'),
          description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''),
          variant: 'destructive',
        });
      }
    });
  };


  return (
    <TooltipProvider>
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
              <CardTitle className="text-2xl">{t('networkServiceUrlConfigTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('networkServiceUrlConfigDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div className="space-y-2">
                <Label htmlFor="serviceHost">{t('serviceHostLabel')}</Label>
                <Input
                    id="serviceHost"
                    value={serviceHost}
                    onChange={(e) => setServiceHost(e.target.value)}
                    placeholder={t('serviceHostPlaceholder')}
                    disabled={isPending}
                />
                </div>
                <div className="space-y-2">
                <Label htmlFor="servicePort">{t('servicePortLabel')}</Label>
                <Input
                    id="servicePort"
                    value={servicePort}
                    onChange={(e) => setServicePort(e.target.value)}
                    placeholder="e.g., 3128"
                    type="number"
                    disabled={isPending}
                />
                </div>
            </div>
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Info className="h-4 w-4" />
                    {t('networkSettingsInfo')}
                </p>
                <Button onClick={handleApplyNetworkSettings} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('applyNetworkSettingsButton')}
                </Button>
            </div>
            <Alert variant="default" className="mt-4">
              <Info className="h-4 w-4" />
              <AlertTitle>{t('exampleServiceUrlTitle')}</AlertTitle>
              <AlertDescription>
                <code className="text-sm bg-muted p-1 rounded">
                  http://{serviceHost || t('yourIpPlaceholder')}:{servicePort || 'PORT'}/ivoxsdir/mainmenu.xml
                </code>
                 <p className="text-xs mt-1">{t('exampleServiceUrlNote')}</p>
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
    </TooltipProvider>
  );
}

