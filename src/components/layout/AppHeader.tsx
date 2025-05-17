
import Link from 'next/link';
import { Phone, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslations } from '@/lib/translations-server';
import { ThemeToggleHeader } from '@/components/settings/ThemeToggleHeader';
import { LanguageToggleHeader } from '@/components/settings/LanguageToggleHeader';


export async function AppHeader() {
  const t = await getTranslations();

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
