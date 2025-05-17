
import Link from 'next/link';
import { Phone, Settings, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from '@/lib/translations-server';
import { ThemeToggleHeader } from '@/components/settings/ThemeToggleHeader';
import { LanguageToggleHeader } from '@/components/settings/LanguageToggleHeader';
import { getCurrentUser } from '@/lib/auth-actions';
import { UserMenu } from './UserMenu';

export async function AppHeader() {
  const t = await getTranslations();
  console.log(`[AppHeader @ ${new Date().toISOString()}] Component rendering. Attempting to get current user...`);
  const user = await getCurrentUser();
  // The detailed log for user object is now inside getCurrentUser itself.
  console.log(`[AppHeader @ ${new Date().toISOString()}] User object received by AppHeader:`, user ? { userId: user.userId, username: user.username } : null);


  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-primary hover:no-underline">
          <Phone className="h-7 w-7" />
          <span>TelDirectory</span>
        </Link>

        <nav className="flex items-center gap-2">
          <LanguageToggleHeader />
          <ThemeToggleHeader />
          {user ? (
            <>
              <Button variant="ghost" size="icon" asChild aria-label={t('settings')}>
                <Link href="/import-xml">
                  <Settings className="h-5 w-5" />
                </Link>
              </Button>
              <UserMenu username={user.username} />
            </>
          ) : (
            <Button variant="outline" asChild size="sm">
              <Link href="/login">
                <LogIn className="mr-2 h-4 w-4" />
                {t('loginButton')}
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
