
import type { Metadata } from 'next';
import './globals.css';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Toaster } from "@/components/ui/toaster";
import { ThemeInitializer } from '@/components/settings/ThemeInitializer';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { getCurrentUser } from '@/lib/auth-actions';

export const metadata: Metadata = {
  title: 'TelDirectory - Corporate Phone Directory',
  description: 'Find extensions and contact information easily.',
};

const bodyClassNames = `antialiased flex flex-col min-h-screen`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={bodyClassNames}>
        <LanguageProvider>
          <AuthProvider initialUser={user}>
            <ThemeInitializer />
            <AppHeader />
            <PageWrapper>
              {children}
            </PageWrapper>
            <Toaster />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
