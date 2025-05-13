import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronRight, Building2, MapPin } from 'lucide-react'; // Using Building2 for zones, MapPin for localities
import type { ReactNode } from 'react';

interface NavigationCardProps {
  title: string;
  description?: string;
  href: string;
  iconType: 'zone' | 'locality';
}

export function NavigationCard({ title, description, href, iconType }: NavigationCardProps) {
  const Icon = iconType === 'zone' ? Building2 : MapPin;
  
  return (
    <Link href={href} className="block group hover:no-underline">
      <Card className="hover:shadow-lg transition-shadow duration-200 hover:border-primary h-full flex flex-col">
        <CardHeader className="flex-grow">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Icon className="h-6 w-6 text-primary" />
                <CardTitle className="text-xl group-hover:text-primary transition-colors">{title}</CardTitle>
              </div>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
