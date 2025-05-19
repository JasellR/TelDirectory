
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, Palette, Languages, Settings as SettingsIcon, FileCode, Info, FolderCog, CheckCircle, AlertCircleIcon, UserCog, Rss, RefreshCw, ListChecks, AlertTriangle, FileWarning } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { saveZoneBranchXmlAction, saveDepartmentXmlAction, updateDirectoryRootPathAction, syncNamesFromXmlFeedAction } from '@/lib/actions';
import type { SyncResult } from '@/lib/actions'; // Assuming SyncResult will be exported and typed
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { LanguageToggle } from '@/components/settings/LanguageToggle';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // New import
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { getDirectoryConfig } from '@/lib/config';
import { logoutAction, getCurrentUser } from '@/lib/auth-actions';
import type { UserSession } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area'; // New import

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPathPending, startPathTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);


  const [directoryRootPath, setDirectoryRootPath] = useState('');
  const [currentConfigDisplayPath, setCurrentConfigDisplayPath] = useState<string | null>(null);
  const [isLoadingPath, setIsLoadingPath] = useState(true);
  const [pathStatus, setPathStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [xmlFeedUrls, setXmlFeedUrls] = useState(''); // Changed from xmlFeedUrl to xmlFeedUrls
  const [syncResults, setSyncResults] = useState<SyncResult | null>(null);


  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingPath(true);

    getDirectoryConfig().then(config => {
      if (isMounted) {
        const savedPath = config.ivoxsRootPath || '';
        setDirectoryRootPath(savedPath);
        setCurrentConfigDisplayPath(savedPath);
        setIsLoadingPath(false);
      }
    }).catch(() => {
      if (isMounted) {
        setDirectoryRootPath('');
        setCurrentConfigDisplayPath(null);
        setIsLoadingPath(false);
      }
    });
    
    getCurrentUser().then(user => {
      if (isMounted) {
        setCurrentUser(user);
      }
    });

    return () => { isMounted = false; };
  }, []);


  const handleSaveDirectoryPath = async () => {
    if (!directoryRootPath.trim()) {
        toast({ title: t('errorTitle'), description: t('directoryPathCannotBeEmpty'), variant: 'destructive' });
        setPathStatus({type: 'error', message: t('directoryPathCannotBeEmpty')});
        return;
    }
    const isAbsolutePath = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);

    if (!isAbsolutePath(directoryRootPath.trim())) {
        toast({ title: t('errorTitle'), description: t('directoryPathMustBeAbsolute'), variant: 'destructive' });
        setPathStatus({type: 'error', message: t('directoryPathMustBeAbsolute')});
        return;
    }
    startPathTransition(async () => {
        const result = await updateDirectoryRootPathAction(directoryRootPath.trim());
        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            setCurrentConfigDisplayPath(directoryRootPath.trim());
            setPathStatus({type: 'success', message: result.message});
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''), variant: 'destructive' });
            setPathStatus({type: 'error', message: result.message + (result.error ? ` Details: ${result.error}` : '')});
        }
    });
  };

  const handleLogout = async () => {
    startLogoutTransition(async () => {
        await logoutAction(); 
    });
  };

  const handleSyncNames = async () => {
    if (!xmlFeedUrls.trim()) {
      toast({ title: t('errorTitle'), description: t('xmlFeedUrlsCannotBeEmpty'), variant: 'destructive' }); // Updated key
      setSyncResults(null);
      return;
    }
    
    setSyncResults(null); // Clear previous results
    startSyncTransition(async () => {
      const result = await syncNamesFromXmlFeedAction(xmlFeedUrls.trim());
      setSyncResults(result); // Store full result object
      if (result.success) {
        toast({ title: t('successTitle'), description: result.message });
      } else {
        toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''), variant: 'destructive' });
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
            <Card className="shadow-none border">
              <CardHeader>
                  <div className="flex items-center gap-3">
                      <UserCog className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-xl">{t('accountSettingsTitle')}</CardTitle>
                  </div>
                  <CardDescription>{t('accountSettingsDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentUser && (
                  <p className="text-sm text-muted-foreground">
                    {t('loggedInAsLabel')} <strong>{currentUser.username}</strong>
                  </p>
                )}
                <Button onClick={handleLogout} disabled={isLogoutPending} variant="outline" className="w-full sm:w-auto">
                  {isLogoutPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('logoutButton')}
                </Button>
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
              {t('directoryConfigurationDescription', { dirPath: 'ivoxsdir' })}
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
                disabled={isPathPending || isLoadingPath}
              />
               <p className="text-sm text-muted-foreground">
                {t('currentPathLabel')}:{' '}
                {isLoadingPath
                  ? t('loadingPathLabel')
                  : currentConfigDisplayPath === null
                    ? t('errorFetchingPathLabel')
                    : currentConfigDisplayPath
                      ? currentConfigDisplayPath
                      : t('defaultPathLabel', { path: 'ivoxsdir (project root)' })}
              </p>
            </div>
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {t('directoryPathInfo')}
                </p>
                <Button onClick={handleSaveDirectoryPath} disabled={isPathPending || isLoadingPath}>
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
                {t('importXmlFilesDescription', { dirPath: currentConfigDisplayPath || 'ivoxsdir' })}
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
                    <CardDescription>{t('importZoneBranchXmlDescription', { dirPath: currentConfigDisplayPath || 'ivoxsdir' })}</CardDescription>
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
                    <CardDescription>{t('importDepartmentXmlDescription', { dirPath: currentConfigDisplayPath || 'ivoxsdir' })}</CardDescription>
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

        <Separator />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Rss className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">{t('syncNamesFromFeedTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('syncNamesFromFeedDescriptionMulti', { departmentDir: `department`})}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="xmlFeedUrls">{t('xmlFeedUrlsLabel')}</Label>
              <Textarea
                id="xmlFeedUrls"
                value={xmlFeedUrls}
                onChange={(e) => setXmlFeedUrls(e.target.value)}
                placeholder={t('xmlFeedUrlsPlaceholder')}
                disabled={isSyncPending}
                rows={3}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  {t('xmlFeedUrlsInfo')}
              </p>
            </div>
            <Button onClick={handleSyncNames} disabled={isSyncPending} className="w-full sm:w-auto">
              {isSyncPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t('syncNamesButton')}
            </Button>
            {syncResults && syncResults.message && (
              <Alert variant={syncResults.success ? 'default' : 'destructive'} className="mt-2">
                {syncResults.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircleIcon className="h-4 w-4" />}
                <AlertTitle>{syncResults.success ? t('syncSuccessTitle') : t('syncErrorTitle')}</AlertTitle>
                <AlertDescription>{syncResults.message}</AlertDescription>
              </Alert>
            )}
            {syncResults?.conflictedExtensions && syncResults.conflictedExtensions.length > 0 && (
              <Alert variant="warning" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{t('conflictedExtensionsTitle')}</AlertTitle>
                <AlertDescription>{t('conflictedExtensionsDescription')}</AlertDescription>
                <ScrollArea className="mt-2 h-40 rounded-md border p-2">
                  <ul className="space-y-1 text-sm">
                    {syncResults.conflictedExtensions.map(conflict => (
                      <li key={conflict.number}>
                        <strong>{t('extensionLabel')}: {conflict.number}</strong>
                        <ul className="pl-4 list-disc">
                          {conflict.conflicts.map((item, index) => (
                            <li key={index}>{t('nameLabel')}: &quot;{item.name}&quot; ({t('sourceFeedLabel')}: {item.sourceFeed})</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </Alert>
            )}
            {syncResults?.missingExtensions && syncResults.missingExtensions.length > 0 && (
              <Alert variant="info" className="mt-4">
                <FileWarning className="h-4 w-4" />
                <AlertTitle>{t('missingExtensionsTitle')}</AlertTitle>
                <AlertDescription>{t('missingExtensionsDescription')}</AlertDescription>
                 <ScrollArea className="mt-2 h-40 rounded-md border p-2">
                  <ul className="space-y-1 text-sm">
                    {syncResults.missingExtensions.map(missing => (
                      <li key={missing.number}>
                        {t('extensionLabel')}: {missing.number}, {t('nameLabel')}: &quot;{missing.name}&quot; ({t('sourceFeedLabel')}: {missing.sourceFeed})
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </Alert>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
