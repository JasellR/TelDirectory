
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, Palette, Languages, Settings as SettingsIcon, FileCode, Info, FolderCog, CheckCircle, AlertCircleIcon, UserCog, Tv, FileCsv, FileUp } from 'lucide-react';
import { FileUploadForm } from '@/components/import/FileUploadForm';
import { CsvUploadForm } from '@/components/import/CsvUploadForm'; // New import
import { saveZoneBranchXmlAction, saveDepartmentXmlAction, updateDirectoryRootPathAction, updateXmlUrlsAction, syncNamesFromXmlFeedAction, importExtensionsFromCsvAction } from '@/lib/actions';
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
import type { UserSession, SyncResult } from '@/types';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isPathPending, startPathTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();
  const [isUrlUpdatePending, startUrlUpdateTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);


  const [directoryRootPath, setDirectoryRootPath] = useState('');
  const [currentConfigDisplayPath, setCurrentConfigDisplayPath] = useState<string | null>(null);
  const [isLoadingPath, setIsLoadingPath] = useState(true);
  const [pathStatus, setPathStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [serviceHost, setServiceHost] = useState('');
  const [servicePort, setServicePort] = useState('');
  const [xmlUrlStatus, setXmlUrlStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [feedUrls, setFeedUrls] = useState('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);


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

        // Fetch host/port config for XML URLs
        // This is a bit of a workaround, assuming .config.json is in ivoxsdir for host/port
        // A more robust solution might be a separate config file or server endpoint for this.
        const fetchNetworkConfig = async () => {
          const ivoxsRootForNetworkConfig = savedPath || 'ivoxsdir'; // Use saved or default
          // This part is conceptual as there's no direct server function to get only this config.
          // We'll rely on user input for now and what might be in their .config.json if they ran updateXmlUrlsAction
        };
        fetchNetworkConfig();

      }
    }).catch(() => {
      if (isMounted) {
        setDirectoryRootPath('');
        setCurrentConfigDisplayPath(null);
      }
    }).finally(() => {
      if (isMounted) setIsLoadingPath(false);
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

  const handleSyncNames = async () => {
    if (!feedUrls.trim()) {
      toast({ title: t('errorTitle'), description: t('feedUrlRequiredError'), variant: 'destructive' });
      return;
    }
    startSyncTransition(async () => {
      setSyncResult(null); // Clear previous results
      const result = await syncNamesFromXmlFeedAction(feedUrls);
      setSyncResult(result); // Store the full result object
      if (result.success) {
        toast({ title: t('syncResultTitle'), description: result.message, duration: 7000 });
      } else {
        toast({ title: t('errorTitle'), description: result.message, variant: 'destructive', duration: 7000 });
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
              {t('directoryConfigurationDescription', { dirPath: 'ivoxsdir' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="directoryRootPath">{t('directoryRootPathLabel', { dirPath: 'ivoxsdir' })}</Label>
              <Input
                id="directoryRootPath"
                value={directoryRootPath}
                onChange={(e) => setDirectoryRootPath(e.target.value)}
                placeholder={t('directoryRootPathPlaceholder', { dirPath: 'ivoxsdir' })}
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
                    {isPathPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                <CardDescription>{t('networkConfigurationDescription', { dirPath: currentConfigDisplayPath || 'ivoxsdir' })}</CardDescription>
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
                    <FileCode className="h-6 w-6 text-primary" /> {/* Using FileCode for XML consistency */}
                    <CardTitle className="text-2xl">{t('syncNamesFromXmlFeedTitle')}</CardTitle>
                </div>
                <CardDescription>{t('syncNamesFromXmlFeedDescription', { dirPath: currentConfigDisplayPath || 'ivoxsdir' })}</CardDescription>
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
                        disabled={isSyncPending}
                    />
                </div>
                <Button onClick={handleSyncNames} disabled={isSyncPending} className="w-full sm:w-auto">
                    {isSyncPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('syncNamesFromFeedButton')}
                </Button>
                {syncResult && (
                    <Alert variant={syncResult.success ? 'default' : 'destructive'} className="mt-4">
                        {syncResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircleIcon className="h-4 w-4" />}
                        <AlertTitle>{t('syncResultTitle')}</AlertTitle>
                        <AlertDescription className="space-y-2 text-sm">
                            <p>{syncResult.message}</p>
                            {syncResult.conflictedExtensions && syncResult.conflictedExtensions.length > 0 && (
                                <div className="mt-2">
                                    <p className="font-semibold">{t('syncConflictedExtensionsTitle')}:</p>
                                    <ul className="list-disc pl-5 text-xs max-h-32 overflow-y-auto">
                                        {syncResult.conflictedExtensions.map((conflict, idx) => (
                                            <li key={idx}>
                                                {t('extensionLabel')} {conflict.number}: {t('conflictsLabel')} {conflict.conflicts.map(c => `"${c.name}" (${new URL(c.sourceFeed).hostname})`).join(', ')}
                                            </li>
                                        ))}
                                    </ul>
                                     <p className="text-xs italic mt-1">{t('syncConflictedExtensionsDescription')}</p>
                                </div>
                            )}
                            {syncResult.missingExtensions && syncResult.missingExtensions.length > 0 && (
                                <div className="mt-2">
                                    <p className="font-semibold">{t('syncMissingExtensionsTitle')}:</p>
                                     <ul className="list-disc pl-5 text-xs max-h-32 overflow-y-auto">
                                        {syncResult.missingExtensions.map((missing, idx) => (
                                            <li key={idx}>
                                               {t('extensionLabel')} {missing.number} ({missing.name}) - {t('sourceFeedLabel')} {new URL(missing.sourceFeed).hostname}
                                            </li>
                                        ))}
                                    </ul>
                                     <p className="text-xs italic mt-1">{t('syncMissingExtensionsDescription')}</p>
                                </div>
                            )}
                             {(!syncResult.conflictedExtensions || syncResult.conflictedExtensions.length === 0) && (
                                <p className="text-xs italic mt-1">{t('syncNoConflicts')}</p>
                             )}
                             {(!syncResult.missingExtensions || syncResult.missingExtensions.length === 0) && (
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

