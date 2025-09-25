
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AppHeader } from '@/components/layout/AppHeader';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Toaster } from "@/components/ui/toaster";
import { ThemeInitializer } from '@/components/settings/ThemeInitializer';
import { LanguageProvider } from '@/context/LanguageContext';


const geistSans = localFont({
  src: '../fonts/GeistVF.woff',
  variable: '--font-geist-sans',
})
const geistMono = localFont({
  src: '../fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'TelDirectory - Corporate Phone Directory',
  description: 'Find extensions and contact information easily.',
};

const bodyClassNames = `${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`;


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
