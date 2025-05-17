
import Link from 'next/link';
import { Phone, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from '@/lib/translations-server';
// import { isAuthenticated, logoutAction } from '@/lib/auth-actions'; // Authentication removed
// import { cookies } from 'next/headers'; // Authentication removed

// Reverted: Auth check removed
// async function IsUserAuthenticated() {
//   const cookieStore = cookies();
//   const sessionCookie = cookieStore.get('teldirectory-auth-session');
//   return !!sessionCookie && sessionCookie.value === 'authenticated';
// }


export async function AppHeader() {
  const t = await getTranslations();
  // const userIsAuthenticated = await IsUserAuthenticated(); // Authentication removed

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-primary hover:no-underline">
          <Phone className="h-7 w-7" />
          <span>TelDirectory</span>
        </Link>

        <nav className="flex items-center gap-2">
          {/* Reverted: Always show Settings icon, remove Login/Logout buttons */}
          <Button variant="ghost" size="icon" asChild aria-label={t('settings')}>
            <Link href="/import-xml">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
