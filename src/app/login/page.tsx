
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation'; // useRouter can still be used for other purposes if needed.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { loginAction } from '@/lib/auth-actions';
import { Loader2, LogIn } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function LoginPage() {
  const router = useRouter(); // Keep for potential future use, but not for post-login redirect here
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      // loginAction will either redirect (on success) or return { success: false, ... }
      const result = await loginAction(password);

      // This code should only be reached if loginAction did NOT redirect, i.e., it failed.
      if (result && result.success === false) { 
        toast({
          title: t('loginFailedTitle'),
          description: result.message,
          variant: 'destructive',
        });
        setPassword('');
      }
      // If loginAction was successful, it would have already redirected the user.
      // A success toast here would likely not be seen or would be interrupted.
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-12">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <LogIn className="mx-auto h-10 w-10 text-primary mb-3" />
          <CardTitle className="text-2xl font-bold">{t('loginPageTitle')}</CardTitle>
          <CardDescription>{t('loginPageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isPending}
                placeholder={t('passwordPlaceholder')}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('loginButtonText')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
