
import { Suspense } from 'react';
import LoginForm from './LoginForm'; // New component that will contain the actual form logic
import { Loader2 } from 'lucide-react';

// This page component itself can remain simple, or be a Server Component by default
export default function LoginPageContainer() {
  return (
    <div className="flex min-h-[calc(100vh-theme(spacing.16))] flex-col items-center justify-center py-12">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading login page...</p>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
