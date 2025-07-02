
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useSearchParams, useRouter }  from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { loginAction } from '@/lib/auth-actions';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, LogIn } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import Link from 'next/link';

export default function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const redirectTo = searchParams.get('redirect_to');

    if (redirectTo) {
      formData.append('redirectTo', redirectTo);
    }

    startTransition(async () => {
      try {
        const result = await loginAction(formData);

        if (result && result.success && result.redirectTo) {
          router.push(result.redirectTo);
        } else if (result && !result.success) {
          setError(result.message || t('loginFailedError'));
          toast({
            title: t('loginFailedTitle'),
            description: result.message || t('loginFailedError'),
            variant: 'destructive',
          });
        } else {
            throw new Error("Invalid response from login action.");
        }
      } catch (e: any) {
        console.error("Login page encountered an unexpected error during login attempt:", e);
        const errorMessage = e.message || t('loginUnexpectedError');
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
