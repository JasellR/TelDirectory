import type { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <main className={`container mx-auto px-4 sm:px-6 lg:px-8 py-8 ${className || ''}`}>
      {children}
    </main>
  );
}
