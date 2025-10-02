
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Palette, Languages, Settings as SettingsIcon, FileCode, Info, FolderCog, CheckCircle, AlertCircleIcon, UserCog, Tv, FileUp, Users } from 'lucide-react';
import { CsvUploadForm } from '@/components/import/CsvUploadForm';
import { ActiveDirectorySyncForm } from '@/components/import/ActiveDirectorySyncForm'; // New import
import { updateDirectoryRootPathAction, updateXmlUrlsAction, syncNamesFromXmlFeedAction, importExtensionsFromCsvAction, syncFromActiveDirectoryAction } from '@/lib/actions';
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
import { getDirectoryConfig } from '@/lib/config';
import { logoutAction, getCurrentUser } from '@/lib/auth-actions';
import type { UserSession, SyncResult, AdSyncResult } from '@/types';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPathPending, startPathTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();
  const [isUrlUpdatePending, startUrlUpdateTransition] = useTransition();
  const [isFeedSyncPending, startFeedSyncTransition] = useTransition();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);


  const [directoryRootPath, setDirectoryRootPath] = useState('');
  const [currentConfigDisplayPath, setCurrentConfigDisplayPath] = useState<string | null>(null);
  const [isLoadingPath, setIsLoadingPath] = useState(true);
  const [pathStatus, setPathStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [serviceHost, setServiceHost] = useState('');
  const [servicePort, setServicePort] = useState('');
  const [xmlUrlStatus, setXmlUrlStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [feedUrls, setFeedUrls] = useState('');
  const [feedSyncResult, setFeedSyncResult] = useState<SyncResult | null>(null);


  useEffect(() => {
    document.title = `${t('settings')} - TelDirectory`;
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    
    // The path is now fixed, so we don't need to fetch it.
    // We can just display the static path for user information.
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
    // This functionality is now deprecated, but we keep the handler to inform the user.
    startPathTransition(async () => {
        const result = await updateDirectoryRootPathAction(directoryRootPath.trim());
        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            setPathStatus({type: 'success', message: result.message});
        } else {
            toast({ title: t('errorTitle'), description: result.message, variant: 'destructive' });
            setPathStatus({type: 'error', message: result.message});
        }
    });
  };

  const handleUpdateXmlUrls = async () => {
    if (!serviceHost.trim() && !servicePort.trim()) {
        toast({ title: t('errorTitle'), description: t('hostOrPortRequiredError'), variant: 'destructive' });
        setXmlUrlStatus({type: 'error', message: t('hostOrPortRequiredError')});
        return;
    }
    if (servicePort.trim() && !/^\d+$/.test(servicePort.trim())) {
        toast({ title: t('errorTitle'), description: t('portMustBeNumericError'), variant: 'destructive' });
        setXmlUrlStatus({type: 'error', message: t('portMustBeNumericError')});
        return;
    }
    startUrlUpdateTransition(async () => {
        const result = await updateXmlUrlsAction(serviceHost.trim(), servicePort.trim());
        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            setXmlUrlStatus({type: 'success', message: result.message});
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''), variant: 'destructive' });
            setXmlUrlStatus({type: 'error', message: result.message + (result.error ? ` Details: ${result.error}` : '')});
        }
    });
  };

  const handleFeedSync = async () => {
    if (!feedUrls.trim()) {
      toast({ title: t('errorTitle'), description: t('feedUrlRequiredError'), variant: 'destructive' });
      return;
    }
    startFeedSyncTransition(async () => {
      setFeedSyncResult(null);
      const result = await syncNamesFromXmlFeedAction(feedUrls);
      setFeedSyncResult(result);
      if (result.success) {
        toast({ title: t('syncResultTitle'), description: result.message, duration: 10000 });
      } else {
        toast({ title: t('errorTitle'), description: result.message + (result.error ? ` Error details: ${result.error}` : ''), variant: 'destructive', duration: 10000 });
      }
    });
  };


  const handleLogout = async () => {
    startLogoutTransition(async () => {
        await logoutAction();
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
                    {t('loggedInAsLabel')}: <strong>{currentUser.username}</strong>
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
                    <Tv className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">{t('networkConfigurationTitle')}</CardTitle>
                </div>
                <CardDescription>{t('networkConfigurationDescription', { dirPath: 'public/ivoxsdir' })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div className="space-y-2">
                        <Label htmlFor="serviceHost">{t('serviceHostLabel')}</Label>
                        <Input
                            id="serviceHost"
                            value={serviceHost}
                            onChange={(e) => setServiceHost(e.target.value)}
                            placeholder={t('serviceHostPlaceholder')}
                            disabled={isUrlUpdatePending}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="servicePort">{t('servicePortLabel')}</Label>
                        <Input
                            id="servicePort"
                            type="number"
                            value={servicePort}
                            onChange={(e) => setServicePort(e.target.value)}
                            placeholder={t('servicePortPlaceholder')}
                            disabled={isUrlUpdatePending}
                        />
                    </div>
                </div>
                 <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        {t('serviceHostInfo')}
                    </p>
                    <Button onClick={handleUpdateXmlUrls} disabled={isUrlUpdatePending}>
                        {isUrlUpdatePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                    <FileCode className="h-6 w-6 text-primary" />
                    <CardTitle className="text-2xl">{t('syncNamesFromXmlFeedTitle')}</CardTitle>
                </div>
                <CardDescription>{t('syncNamesFromXmlFeedDescription', { dirPath: 'public/ivoxsdir' })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="feedUrls">{t('xmlFeedUrlsLabel')}</Label>
                    <Textarea
                        id="feedUrls"
                        value={feedUrls}
                        onChange={(e) => setFeedUrls(e.target.value)}
                        placeholder={t('xmlFeedUrlsPlaceholder')}
                        rows={3}
                        disabled={isFeedSyncPending}
                    />
                </div>
                <Button onClick={handleFeedSync} disabled={isFeedSyncPending} className="w-full sm:w-auto">
                    {isFeedSyncPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('syncNamesFromFeedButton')}
                </Button>
                {feedSyncResult && (
                    <Alert variant={feedSyncResult.success ? 'default' : 'destructive'} className="mt-4">
                        {feedSyncResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircleIcon className="h-4 w-4" />}
                        <AlertTitle>{t('syncResultTitle')}</AlertTitle>
                        <AlertDescription className="space-y-2 text-sm">
                            <p>{feedSyncResult.message}</p>
                            {feedSyncResult.conflictedExtensions && feedSyncResult.conflictedExtensions.length > 0 && (
                                <div className="mt-2">
                                    <p className="font-semibold">{t('syncConflictedExtensionsTitle')}:</p>
                                    <ul className="list-disc pl-5 text-xs max-h-32 overflow-y-auto">
                                        {feedSyncResult.conflictedExtensions.map((conflict, idx) => (
                                            <li key={idx}>
                                                {t('extensionLabel')} {conflict.number}: {t('conflictsLabel')} {conflict.conflicts.map(c => `"${c.name}" (${new URL(c.sourceFeed).hostname})`).join(', ')}
                                            </li>
                                        ))}
                                    </ul>
                                     <p className="text-xs italic mt-1">{t('syncConflictedExtensionsDescription')}</p>
                                </div>
                            )}
                            {feedSyncResult.missingExtensions && feedSyncResult.missingExtensions.length > 0 && (
                                <div className="mt-2">
                                    <p className="font-semibold">{t('syncMissingExtensionsTitle')}:</p>
                                     <ul className="list-disc pl-5 text-xs max-h-32 overflow-y-auto">
                                        {feedSyncResult.missingExtensions.map((missing, idx) => (
                                            <li key={idx}>
                                               {t('extensionLabel')} {missing.number} ({missing.name}) - {t('sourceFeedLabel')} {new URL(missing.sourceFeed).hostname}
                                            </li>
                                        ))}
                                    </ul>
                                     <p className="text-xs italic mt-1">{t('syncMissingExtensionsDescription')}</p>
                                </div>
                            )}
                             {(!feedSyncResult.conflictedExtensions || feedSyncResult.conflictedExtensions.length === 0) && feedSyncResult.success && (
                                <p className="text-xs italic mt-1">{t('syncNoConflicts')}</p>
                             )}
                             {(!feedSyncResult.missingExtensions || feedSyncResult.missingExtensions.length === 0) && feedSyncResult.success && (
                                <p className="text-xs italic mt-1">{t('syncNoMissing')}</p>
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
