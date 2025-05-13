import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; // Corrected: Geist_Sans to Geist
import './globals.css';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Toaster } from "@/components/ui/toaster";
import { ThemeInitializer } from '@/components/settings/ThemeInitializer';
import { LanguageProvider } from '@/context/LanguageContext';


const geistSans = Geist({ // Corrected: Geist_Sans to Geist
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'TelDirectory - Corporate Phone Directory',
  description: 'Find extensions and contact information easily.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}>
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

