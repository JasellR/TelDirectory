'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { loginAction } from '@/lib/auth-actions';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, LogIn } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function LoginForm() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect_to');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    
    startTransition(async () => {
      const result = await loginAction(formData);

      if ('error' in result && result.error) {
        setError(result.error);
        toast({
          title: t('loginFailedTitle'),
          description: result.error,
          variant: 'destructive',
        });
      } else if ('user' in result && result.user) {
          // 1. Update the client-side state
          setUser(result.user);
          
          toast({
              title: t('loginSucceededTitle'),
              description: t('loginSucceededDescription'),
          });

          // 2. IMPORTANT: Instead of a full-page reload, we use router.refresh().
          // This tells Next.js to re-run server components and the middleware.
          // The middleware will then handle the redirect correctly.
          router.refresh();

          // As a fallback for the refresh, we can also push to the destination.
          // The middleware should catch the user and redirect if they are on /login.
          router.push(redirectTo || '/import-xml');
      }
    });
  };

  return (
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
  );
}
