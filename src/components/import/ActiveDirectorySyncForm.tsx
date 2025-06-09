
'use client';

import { useState, useTransition } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { AdSyncResult, AdSyncFormValues as AdSyncFormValuesType } from '@/types'; // Renamed to avoid conflict
import { useTranslation } from '@/hooks/useTranslation';

const adSyncSchema = z.object({
  ldapServerUrl: z.string().url({ message: 'Invalid LDAP URL (e.g., ldap://your-dc.example.com)' }).min(1, 'LDAP Server URL is required.'),
  bindDn: z.string().min(1, 'Bind DN is required.'),
  bindPassword: z.string().min(1, 'Bind Password is required.'),
  searchBase: z.string().min(1, 'Search Base is required.'),
  searchFilter: z.string().optional().default('(objectClass=user)'),
  displayNameAttribute: z.string().optional().default('displayName'),
  extensionAttribute: z.string().optional().default('ipPhone'),
  departmentAttribute: z.string().optional().default('department'),
  emailAttribute: z.string().optional().default('mail'),
  phoneAttribute: z.string().optional().default('telephoneNumber'),
  organizationAttribute: z.string().optional().default('company'), // New
  jobTitleAttribute: z.string().optional().default('title'),       // New
});

// Type for form values infered from schema
type AdSyncFormValues = z.infer<typeof adSyncSchema>;

interface ActiveDirectorySyncFormProps {
  syncAction: (params: AdSyncFormValuesType) => Promise<AdSyncResult>;
}

export function ActiveDirectorySyncForm({ syncAction }: ActiveDirectorySyncFormProps) {
  const { toast } = useTranslation(); // Using useTranslation for toast messages too for consistency
  const { t } = useTranslation();
  const [isSyncing, startSyncTransition] = useTransition();
  const [syncResult, setSyncResult] = useState<AdSyncResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AdSyncFormValues>({
    resolver: zodResolver(adSyncSchema),
    defaultValues: { 
        searchFilter: '(objectClass=user)',
        displayNameAttribute: 'displayName',
        extensionAttribute: 'ipPhone',
        departmentAttribute: 'department',
        emailAttribute: 'mail',
        phoneAttribute: 'telephoneNumber',
        organizationAttribute: 'company', // Default for AD 'company' attribute
        jobTitleAttribute: 'title',       // Default for AD 'title' attribute
    }
  });

  const onSubmit: SubmitHandler<AdSyncFormValues> = async (data) => {
    setSyncResult(null);
    startSyncTransition(async () => {
      try {
        const result = await syncAction(data);
        setSyncResult(result);

        if (result.success) {
          toast({ title: t('successTitle'), description: result.message, duration: 10000 });
        } else {
          toast({
            title: t('errorTitle'),
            description: result.message || t('adSyncFailedError'),
            variant: 'destructive',
            duration: 10000,
          });
        }
      } catch (error: any) {
        console.error("AD Sync Error caught in form:", error);
        const errorMessage = error.message || t('adSyncUnexpectedError');
        setSyncResult({
          success: false,
          message: errorMessage,
          details: { usersProcessed: 0, extensionsAdded: 0, dbRecordsAdded: 0, dbRecordsUpdated: 0, localitiesCreated: 0, localitiesUpdated: 0, zoneCreated: false, errorsEncountered: 1 },
          error: errorMessage,
        });
        toast({ title: t('errorTitle'), description: errorMessage, variant: 'destructive' });
      }
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-destructive">{t('adCredentialsWarning')}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <Label htmlFor="ldapServerUrl">{t('adLdapServerUrlLabel')}</Label>
                <Input id="ldapServerUrl" {...register('ldapServerUrl')} disabled={isSyncing} placeholder="ldap://your-dc.example.com"/>
                {errors.ldapServerUrl && <p className="text-sm text-destructive">{errors.ldapServerUrl.message}</p>}
            </div>
            <div>
                <Label htmlFor="bindDn">{t('adBindDnLabel')}</Label>
                <Input id="bindDn" {...register('bindDn')} disabled={isSyncing} placeholder="cn=service_user,ou=Users,dc=example,dc=com"/>
                {errors.bindDn && <p className="text-sm text-destructive">{errors.bindDn.message}</p>}
            </div>
            <div>
                <Label htmlFor="bindPassword">{t('adBindPasswordLabel')}</Label>
                <Input id="bindPassword" type="password" {...register('bindPassword')} disabled={isSyncing} />
                {errors.bindPassword && <p className="text-sm text-destructive">{errors.bindPassword.message}</p>}
            </div>
            <div>
                <Label htmlFor="searchBase">{t('adSearchBaseLabel')}</Label>
                <Input id="searchBase" {...register('searchBase')} disabled={isSyncing} placeholder="ou=Users,dc=example,dc=com"/>
                {errors.searchBase && <p className="text-sm text-destructive">{errors.searchBase.message}</p>}
            </div>
             <div>
                <Label htmlFor="searchFilter">{t('adSearchFilterLabel')}</Label>
                <Input id="searchFilter" {...register('searchFilter')} disabled={isSyncing} />
                {errors.searchFilter && <p className="text-sm text-destructive">{errors.searchFilter.message}</p>}
            </div>
        </div>
        
        <h4 className="text-md font-semibold pt-2 border-t mt-4">{t('adAttributeMappingTitle')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
                <Label htmlFor="displayNameAttribute">{t('adDisplayNameAttrLabel')}</Label>
                <Input id="displayNameAttribute" {...register('displayNameAttribute')} disabled={isSyncing} />
                {errors.displayNameAttribute && <p className="text-sm text-destructive">{errors.displayNameAttribute.message}</p>}
            </div>
            <div>
                <Label htmlFor="extensionAttribute">{t('adExtensionAttrLabel')}</Label>
                <Input id="extensionAttribute" {...register('extensionAttribute')} disabled={isSyncing} />
                {errors.extensionAttribute && <p className="text-sm text-destructive">{errors.extensionAttribute.message}</p>}
            </div>
            <div>
                <Label htmlFor="departmentAttribute">{t('adDepartmentAttrLabel')}</Label>
                <Input id="departmentAttribute" {...register('departmentAttribute')} disabled={isSyncing} />
                {errors.departmentAttribute && <p className="text-sm text-destructive">{errors.departmentAttribute.message}</p>}
            </div>
             <div>
                <Label htmlFor="emailAttribute">{t('adEmailAttrLabel')}</Label>
                <Input id="emailAttribute" {...register('emailAttribute')} disabled={isSyncing} />
                {errors.emailAttribute && <p className="text-sm text-destructive">{errors.emailAttribute.message}</p>}
            </div>
             <div>
                <Label htmlFor="phoneAttribute">{t('adPhoneAttrLabel')}</Label>
                <Input id="phoneAttribute" {...register('phoneAttribute')} disabled={isSyncing} />
                {errors.phoneAttribute && <p className="text-sm text-destructive">{errors.phoneAttribute.message}</p>}
            </div>
            <div>
                <Label htmlFor="organizationAttribute">{t('adOrganizationAttrLabel')}</Label>
                <Input id="organizationAttribute" {...register('organizationAttribute')} disabled={isSyncing} />
                {errors.organizationAttribute && <p className="text-sm text-destructive">{errors.organizationAttribute.message}</p>}
            </div>
            <div>
                <Label htmlFor="jobTitleAttribute">{t('adJobTitleAttrLabel')}</Label>
                <Input id="jobTitleAttribute" {...register('jobTitleAttribute')} disabled={isSyncing} />
                {errors.jobTitleAttribute && <p className="text-sm text-destructive">{errors.jobTitleAttribute.message}</p>}
            </div>
        </div>

        <Button type="submit" className="w-full sm:w-auto" disabled={isSyncing}>
          {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
          {t('syncFromAdButton')}
        </Button>
      </form>

      {syncResult && (
        <Alert variant={syncResult.success ? 'default' : 'destructive'} className="mt-6">
          {syncResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{syncResult.success ? t('adSyncSuccessTitle') : t('adSyncErrorTitle')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{syncResult.message}</p>
            {syncResult.details && (
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>{t('adUsersProcessedLabel', { count: syncResult.details.usersProcessed })}</li>
                <li>{t('adExtensionsAddedLabel', { count: syncResult.details.extensionsAdded })}</li>
                <li>{t('adDbRecordsAddedLabel', { count: syncResult.details.dbRecordsAdded })}</li>
                <li>{t('adDbRecordsUpdatedLabel', { count: syncResult.details.dbRecordsUpdated })}</li>
                <li>{t('adLocalitiesCreatedLabel', { count: syncResult.details.localitiesCreated })}</li>
                <li>{t('adLocalitiesUpdatedLabel', { count: syncResult.details.localitiesUpdated })}</li>
                {syncResult.details.zoneCreated && <li>{t('adZoneCreatedLabel')}</li>}
                {syncResult.details.errorsEncountered > 0 && (
                    <li className="text-destructive">{t('adErrorsEncounteredLabel', { count: syncResult.details.errorsEncountered })}</li>
                )}
              </ul>
            )}
            {syncResult.error && !syncResult.details && ( 
                 <p className="text-xs text-destructive mt-1">Error: {syncResult.error}</p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
