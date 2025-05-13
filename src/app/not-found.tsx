import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-4xl font-bold text-foreground mb-2">404 - Page Not Found</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Oops! The page you are looking for does not exist or may have been moved.
      </p>
      <Button asChild>
        <Link href="/">Go Back to Homepage</Link>
      </Button>
    </div>
  );
}
