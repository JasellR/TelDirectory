import Link from 'next/link';
import { Phone, UploadCloud } from 'lucide-react'; // Changed Upload to UploadCloud for consistency
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
          <Button variant="outline" asChild>
            <Link href="/import-xml" className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4" />
              Import &amp; Setup
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
