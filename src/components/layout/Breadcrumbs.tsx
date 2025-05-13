import Link from 'next/link';
import { ChevronRight, HomeIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={`mb-6 ${className || ''}`}>
      <ol className="flex items-center space-x-1 text-sm text-muted-foreground">
        <li>
          <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <HomeIcon className="h-4 w-4" />
            Home
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={index} className="flex items-center space-x-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            {item.href ? (
              <Link href={item.href} className="hover:text-primary transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
