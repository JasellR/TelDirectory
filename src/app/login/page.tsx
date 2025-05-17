
'use client';

import { useState, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // Keep useRouter for potential future use if needed
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { loginAction } from '@/lib/auth-actions';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, LogIn } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';

export default function LoginPage() {
  // useRouter is not strictly needed if loginAction handles all redirects, but good to have for other potential client nav
  const router = useRouter(); 
  const searchParams = useSearchParams(); // Keep for potential future use (e.g., error messages in URL)
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        // loginAction will either redirect on success or return an error object on failure.
        const result = await loginAction(formData); 
        
        // If loginAction returns, it means it failed (because successful login would have redirected).
        if (result && !result.success) {
          setError(result.message || t('loginFailedError'));
          toast({
            title: t('loginFailedTitle'),
            description: result.message || t('loginFailedError'),
            variant: 'destructive',
          });
        }
        // If loginAction was successful, it would have already redirected.
        // No client-side navigation (like router.push or window.location.href) is needed here.
      } catch (e: any) {
        // This catch block handles errors thrown by loginAction (like NEXT_REDIRECT)
        // or errors during the call to loginAction itself.
        if (e.digest?.startsWith('NEXT_REDIRECT')) {
          // This error is expected when redirect() is called in a server action.
          // Next.js handles this to perform the actual redirection.
          // We re-throw it so Next.js can continue its process.
          // console.log("Login page caught NEXT_REDIRECT, re-throwing for Next.js to handle.");
          throw e; 
        }
        
        // For any other unexpected errors during the action call.
        console.error("Login page encountered an unexpected error during login attempt:", e);
        const errorMessage = e.message || t('loginUnexpectedError'); // Or a more generic client-side error
        setError(errorMessage);
        toast({
          title: t('loginFailedTitle'),
          description: errorMessage,
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-theme(spacing.16))] flex-col items-center justify-center py-12">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3">
            <LogIn className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">{t('loginPageTitle')}</CardTitle>
          <CardDescription>{t('loginPageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">{t('usernameLabel')}</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder={t('usernamePlaceholder')}
                required
                disabled={isPending}
                className="text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                disabled={isPending}
                className="text-base"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p>{error}</p>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t('loggingInButton') : t('loginButton')}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="text-center text-sm">
            <p>
              <Link href="/" className="text-primary hover:underline">
                {t('backToHomeLink')}
              </Link>
            </p>
          </CardFooter>
      </Card>
    </div>
  );
}

