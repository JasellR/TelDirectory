
import Link from 'next/link';
import { Phone, Settings, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from '@/lib/translations-server';
import { ThemeToggleHeader } from '@/components/settings/ThemeToggleHeader';
import { LanguageToggleHeader } from '@/components/settings/LanguageToggleHeader';
import { getCurrentUser } from '@/lib/auth-actions'; // Updated import
import { UserMenu } from './UserMenu'; // Assuming UserMenu component exists or will be created

export async function AppHeader() {
  const t = await getTranslations();
  const user = await getCurrentUser(); // Fetches user session

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
