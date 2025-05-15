
'use client'; 

import { useState, useEffect, useTransition } from 'react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, Palette, Languages, Settings as SettingsIcon, FileCode, Network, Info, FolderCog, CheckCircle, AlertCircleIcon } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { saveZoneBranchXmlAction, saveDepartmentXmlAction, updateXmlUrlsAction, updateDirectoryRootPathAction } from '@/lib/actions';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { LanguageToggle } from '@/components/settings/LanguageToggle'; 
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation'; 
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { getDirectoryConfig } from '@/lib/config'; // To fetch current config for display
import type { DirectoryConfig } from '@/lib/config';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isPathPending, startPathTransition] = useTransition();

  const [serviceHost, setServiceHost] = useState('');
  const [servicePort, setServicePort] = useState('3128');
  const [directoryRootPath, setDirectoryRootPath] = useState('');
  const [currentDirectoryRootPath, setCurrentDirectoryRootPath] = useState<string | null>(null);
  const [pathStatus, setPathStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);


  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
    // Fetch current IVOXS root path for display
    async function fetchCurrentPath() {
      try {
        const config: DirectoryConfig = await getDirectoryConfig(); // This now needs to be called in an async context or via server action
        setCurrentDirectoryRootPath(config.ivoxsRootPath || t('defaultPathLabel', { path: 'IVOXS (project root)' }));
        setDirectoryRootPath(config.ivoxsRootPath || '');
      } catch (e) {
        setCurrentDirectoryRootPath(t('errorFetchingPathLabel'));
         setDirectoryRootPath('');
      }
    }
    fetchCurrentPath();
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

  const handleSaveDirectoryPath = async () => {
    if (!directoryRootPath.trim()) {
        toast({ title: t('errorTitle'), description: t('directoryPathCannotBeEmpty'), variant: 'destructive' });
        setPathStatus({type: 'error', message: t('directoryPathCannotBeEmpty')});
        return;
    }
    if (!path.isAbsolute(directoryRootPath.trim())) { // Basic client-side check
        toast({ title: t('errorTitle'), description: t('directoryPathMustBeAbsolute'), variant: 'destructive' });
        setPathStatus({type: 'error', message: t('directoryPathMustBeAbsolute')});
        return;
    }
    startPathTransition(async () => {
        const result = await updateDirectoryRootPathAction(directoryRootPath.trim());
        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            setCurrentDirectoryRootPath(directoryRootPath.trim());
            setPathStatus({type: 'success', message: result.message});
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''), variant: 'destructive' });
            setPathStatus({type: 'error', message: result.message + (result.error ? ` Details: ${result.error}` : '')});
        }
    });
  };


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
              <FolderCog className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('directoryConfigurationTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('directoryConfigurationDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="directoryRootPath">{t('directoryRootPathLabel')}</Label>
              <Input
                id="directoryRootPath"
                value={directoryRootPath}
                onChange={(e) => setDirectoryRootPath(e.target.value)}
                placeholder={t('directoryRootPathPlaceholder')}
                disabled={isPathPending}
              />
               <p className="text-sm text-muted-foreground">
                {t('currentPathLabel')}: {currentDirectoryRootPath || t('loadingPathLabel')}
              </p>
            </div>
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {t('directoryPathInfo')}
                </p>
                <Button onClick={handleSaveDirectoryPath} disabled={isPathPending}>
                    {isPathPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('saveDirectoryPathButton')}
                </Button>
            </div>
            {pathStatus && (
                <Alert variant={pathStatus.type === 'success' ? 'default' : 'destructive'} className="mt-2">
                    {pathStatus.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircleIcon className="h-4 w-4" />}
                    <AlertDescription>{pathStatus.message}</AlertDescription>
                </Alert>
            )}
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

// Helper to check if path is absolute (simple client-side check)
// Node's path.isAbsolute is not available client-side without specific shims.
const path = {
  isAbsolute: (p: string) => {
    if (!p) return false;
    // Basic check for common absolute path prefixes
    return p.startsWith('/') || /^[a-zA-Z]:\\/.test(p) || /^[a-zA-Z]:\//.test(p);
  }
};
