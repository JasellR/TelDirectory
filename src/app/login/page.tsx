
// This page is being reverted and its authentication logic removed.
// It can be reinstated if authentication is added back later.
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function LoginPageReverted() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-3xl font-bold text-foreground mb-2">Login Disabled</h1>
      <p className="text-md text-muted-foreground mb-6 max-w-md">
        The login functionality is currently disabled in this version of the application.
      </p>
       <Button asChild>
        <Link href="/">Go to Homepage</Link>
      </Button>
    </div>
  );
}
