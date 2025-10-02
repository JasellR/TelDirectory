
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

  return (
    <Button variant="outline" asChild size="sm">
      <Link href={`/login?redirect_to=${encodeURIComponent(pathname)}`}>
        <LogIn className="mr-2 h-4 w-4" />
        {t('loginButton')}
      </Link>
    </Button>
  );
}
