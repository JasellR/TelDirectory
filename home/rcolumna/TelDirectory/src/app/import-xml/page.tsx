
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Palette, Languages, Settings as SettingsIcon, Info, FolderCog, CheckCircle, AlertCircleIcon, UserCog, Rss, RefreshCw, AlertTriangle, FileWarning, FileUp, Users, Network } from 'lucide-react';
import { syncNamesFromXmlFeedAction, updateXmlUrlsAction, importExtensionsFromCsvAction, syncFromActiveDirectoryAction } from '@/lib/actions';
import type { SyncResult, AdSyncResult, CsvImportResult, AdSyncFormValues, UserSession } from '@/types';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { LanguageToggle } from '@/components/settings/LanguageToggle';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { logoutAction, getCurrentUser } from '@/lib/auth-actions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CsvUploadForm } from '@/components/import/CsvUploadForm';
import { ActiveDirectorySyncForm } from '@/components/import/ActiveDirectorySyncForm';


export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPathPending, startPathTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();
  const [isUrlUpdatePending, startUrlUpdateTransition] = useTransition();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  const [directoryRootPath, setDirectoryRootPath] = useState('');
  const [currentConfigDisplayPath, setCurrentConfigDisplayPath] = useState<string | null>(null);
  const [isLoadingPath, setIsLoadingPath] = useState(true);
  const [pathStatus, setPathStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [xmlUrlStatus, setXmlUrlStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [xmlFeedUrls, setXmlFeedUrls] = useState('');
  const [syncResults, setSyncResults] = useState<SyncResult | null>(null);


  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    
    setIsLoadingPath(false);
    setCurrentConfigDisplayPath('public/ivoxsdir');
    setDirectoryRootPath('public/ivoxsdir');
    
    const fetchUser = async () => {
        try {
            const user = await getCurrentUser();
            if (isMounted) {
                setCurrentUser(user);
            }
        } catch(e) {
            if (isMounted) setCurrentUser(null);
        }
    };

    fetchUser();

    return () => { isMounted = false; };
  }, []);


  const handleSaveDirectoryPath = async () => {
    // This function is deprecated and the button is disabled, but we keep it for safety.
  };

  const handleUpdateXmlUrls = async () => {
    startUrlUpdateTransition(async () => {
        const result = await updateXmlUrlsAction();
        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            setXmlUrlStatus({type: 'success', message: result.message});
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''), variant: 'destructive' });
            setXmlUrlStatus({type: 'error', message: result.message + (result.error ? ` Details: ${result.error}` : '')});
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
      toast({ title: t('errorTitle'), description: t('feedUrlRequiredError'), variant: 'destructive' });
      setSyncResults(null);
      return;
    }
    
    setSyncResults(null); 
    startSyncTransition(async () => {
      const result = await syncNamesFromXmlFeedAction(xmlFeedUrls.trim());
      setSyncResults(result); 
      if (result.success) {
        toast({ title: t('successTitle'), description: result.message });
      } else {
        toast({
          title: t('errorTitle'),
          description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''),
          variant: 'destructive',
          duration: 10000,
        });
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
                  {isLogoutPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('logoutButton')}
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
              {t('directoryConfigurationDescription', { dirPath: 'public/ivoxsdir' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="directoryRootPath">{t('directoryRootPathLabel', { dirPath: 'ivoxsdir' })}</Label>
              <Input
                id="directoryRootPath"
                value={directoryRootPath}
                onChange={(e) => setDirectoryRootPath(e.target.value)}
                placeholder={t('directoryRootPathPlaceholder', { dirPath: 'public/ivoxsdir' })}
                disabled={true} // Path is no longer configurable
              />
               <p className="text-sm text-muted-foreground">
                {t('currentPathLabel')}:{' '}
                {isLoadingPath
                  ? t('loadingPathLabel')
                  : <strong>{currentConfigDisplayPath}</strong>
                }
              </p>
            </div>
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Path is now fixed to 'public/ivoxsdir' for static serving.
                </p>
                <Button onClick={handleSaveDirectoryPath} disabled={true}>
                    {t('saveDirectoryPathButton')}
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
                    <Network className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">{t('networkConfigurationTitle')}</CardTitle>
                </div>
                <CardDescription>This action regenerates all URLs in your menu files to ensure they point to the correct static paths. Use this if you suspect URLs are broken.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        This no longer requires host and port configuration.
                    </p>
                    <Button onClick={handleUpdateXmlUrls} disabled={isUrlUpdatePending}>
                        {isUrlUpdatePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4"/>}
                        {t('applyNetworkSettingsButton')}
                    </Button>
                </div>
                {xmlUrlStatus && (
                    <Alert variant={xmlUrlStatus.type === 'success' ? 'default' : 'destructive'} className="mt-2">
                        {xmlUrlStatus.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircleIcon className="h-4 w-4" />}
                        <AlertDescription>{xmlUrlStatus.message}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
        
        <Separator />

        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <FileUp className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">{t('importExtensionsFromCsvTitle')}</CardTitle>
                </div>
                <CardDescription>{t('importExtensionsFromCsvDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
                <CsvUploadForm importAction={importExtensionsFromCsvAction} />
            </CardContent>
        </Card>

        <Separator />
        
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">{t('syncFromAdTitle')}</CardTitle>
                </div>
                <CardDescription>{t('syncFromAdDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
                <ActiveDirectorySyncForm syncAction={syncFromActiveDirectoryAction} />
            </CardContent>
        </Card>

        <Separator />

        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Rss className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">{t('syncNamesFromXmlFeedTitle')}</CardTitle>
                </div>
                <CardDescription>{t('syncNamesFromXmlFeedDescription', { dirPath: 'public/ivoxsdir' })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="feedUrls">{t('xmlFeedUrlsLabel')}</Label>
                    <Textarea
                        id="feedUrls"
                        value={xmlFeedUrls}
                        onChange={(e) => setXmlFeedUrls(e.target.value)}
                        placeholder={t('xmlFeedUrlsPlaceholder')}
                        rows={3}
                        disabled={isSyncPending}
                    />
                </div>
                <Button onClick={handleSyncNames} disabled={isSyncPending} className="w-full sm:w-auto">
                    {isSyncPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {t('syncNamesFromFeedButton')}
                </Button>
                {syncResults && (
                    <Alert variant={syncResults.success ? 'default' : 'destructive'} className="mt-4">
                        {syncResults.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircleIcon className="h-4 w-4" />}
                        <AlertTitle>{t('syncResultTitle')}</AlertTitle>
                        <AlertDescription className="space-y-2 text-sm">
                            <p>{syncResults.message}</p>
                            {syncResults.conflictedExtensions && syncResults.conflictedExtensions.length > 0 && (
                                <Alert variant="warning" className="mt-4">
                                  <AlertTriangle className="h-4 w-4" />
                                  <AlertTitle>{t('syncConflictedExtensionsTitle')}</AlertTitle>
                                  <AlertDescription>{t('syncConflictedExtensionsDescription')}</AlertDescription>
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
                            {syncResults.missingExtensions && syncResults.missingExtensions.length > 0 && (
                                <Alert variant="info" className="mt-4">
                                  <FileWarning className="h-4 w-4" />
                                  <AlertTitle>{t('syncMissingExtensionsTitle')}</AlertTitle>
                                  <AlertDescription>{t('syncMissingExtensionsDescription')}</AlertDescription>
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
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
