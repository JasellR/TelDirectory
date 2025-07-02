
import Link from 'next/link';
import { Phone } from 'lucide-react';
import { LanguageToggleHeader } from '@/components/settings/LanguageToggleHeader';
import { getCurrentUser } from '@/lib/auth-actions';
import { AuthNav } from './AuthNav';
import { ThemeToggleHeader } from '@/components/settings/ThemeToggleHeader';


export async function AppHeader() {
  const user = await getCurrentUser();

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
          <AuthNav user={user} />
        </nav>
      </div>
    </header>
  );
}
