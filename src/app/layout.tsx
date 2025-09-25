
import type { Metadata } from 'next';
import './globals.css';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Toaster } from "@/components/ui/toaster";
import { ThemeInitializer } from '@/components/settings/ThemeInitializer';
import { LanguageProvider } from '@/context/LanguageContext';

export const metadata: Metadata = {
  title: 'TelDirectory - Corporate Phone Directory',
  description: 'Find extensions and contact information easily.',
};

const bodyClassNames = `antialiased flex flex-col min-h-screen`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={bodyClassNames}>
        <LanguageProvider>
          <ThemeInitializer />
          <AppHeader />
          <PageWrapper>
            {children}
          </PageWrapper>
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
