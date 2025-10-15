
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserMenu } from './UserMenu';
import { LogIn, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';

export function AuthNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user } = useAuth();

  if (user) {
    return (
      <>
        <Button variant="ghost" size="icon" asChild aria-label={t('settings')}>
          <Link href="/import-xml">
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </Button>
        <UserMenu />
      </>
    );
  }

  const isAuthPage = pathname.startsWith('/login');
  if (isAuthPage) {
    return null;
  }
  
  // When the login button is part of the general header (not on a specific page trying to access protected content),
  // we can decide where it should lead. A sensible default is to try to go to settings after login.
  // However, if the user clicked the "Settings" icon, that link should have priority.
  // The logic in the component that renders the button should pass the correct redirect.
  // Here, we provide a sensible default if the user just clicks a generic "Login" button.
  const loginRedirectPath = pathname === '/' ? '/import-xml' : pathname;

  return (
    <Button variant="outline" asChild size="sm">
      <Link href={`/login?redirect_to=${encodeURIComponent(loginRedirectPath)}`}>
        <LogIn className="mr-2 h-4 w-4" />
        {t('loginButton')}
      </Link>
    </Button>
  );
}
