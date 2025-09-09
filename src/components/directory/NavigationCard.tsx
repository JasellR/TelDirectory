
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChevronRight, Building2, MapPin, AlertTriangle } from 'lucide-react'; // Using Building2 for zones, MapPin for localities
import type { ReactNode } from 'react';

interface NavigationCardProps {
  title: string;
  description?: string;
  href: string;
  iconType: 'zone' | 'locality' | 'missing';
}

const iconMap = {
  zone: Building2,
  locality: MapPin,
  missing: AlertTriangle,
};


export function NavigationCard({ title, description, href, iconType }: NavigationCardProps) {
  const Icon = iconMap[iconType] || Building2;
  const iconColor = iconType === 'missing' ? 'text-destructive' : 'text-primary';
  
  return (
    <Link href={href} className="block group hover:no-underline">
      <Card className="hover:shadow-lg transition-shadow duration-200 hover:border-primary h-full flex flex-col">
        <CardHeader className="flex-grow">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Icon className={`h-6 w-6 ${iconColor}`} />
                <CardTitle className="text-xl group-hover:text-primary transition-colors">{title}</CardTitle>
              </div>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            <div className="pr-2 self-center"> {/* Added pr-2 and self-center for spacing and alignment */}
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
