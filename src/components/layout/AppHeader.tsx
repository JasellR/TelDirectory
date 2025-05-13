import Link from 'next/link';
import { Phone, Settings } from 'lucide-react'; // Changed UploadCloud to Settings
import { Button } from '@/components/ui/button';

export function AppHeader() {
  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-primary hover:no-underline">
          <Phone className="h-7 w-7" />
          <span>TelDirectory</span>
        </Link>
        
        <nav>
          <Button variant="ghost" size="icon" asChild aria-label="Settings">
            <Link href="/import-xml">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
