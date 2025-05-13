
'use client';

import type { SearchableLocality } from '@/lib/data'; // Updated type
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { MapPin, Building, GitBranch, Search as SearchIcon, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface LocalitySearchProps { // Renamed interface and prop for clarity
  allLocalities: SearchableLocality[];
}

export function ExtensionSearch({ allLocalities }: LocalitySearchProps) { // Component name kept for now, props updated
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation();

  const filteredLocalities = useMemo(() => {
    if (!searchTerm.trim()) {
      return [];
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allLocalities.filter(
      (loc) =>
        loc.localityName.toLowerCase().includes(lowerSearchTerm) ||
        loc.zoneName.toLowerCase().includes(lowerSearchTerm) ||
        (loc.branchName && loc.branchName.toLowerCase().includes(lowerSearchTerm))
    );
  }, [searchTerm, allLocalities]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by locality, department, zone..." // Updated placeholder
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border bg-background p-4 pl-10 text-lg shadow-sm focus:ring-2 focus:ring-primary"
        />
      </div>

      {searchTerm.trim() && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({filteredLocalities.length})</CardTitle>
            <CardDescription>
              Displaying localities/departments matching your search for "{searchTerm}".
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredLocalities.length > 0 ? (
              <ul className="space-y-4">
                {filteredLocalities.map((loc) => (
                  <li key={loc.id} className="rounded-lg border p-4 shadow-sm transition-all hover:shadow-md">
                    <Link href={loc.path} className="group block hover:no-underline">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            <h3 className="text-lg font-semibold text-primary group-hover:underline">
                            {loc.localityName}
                            </h3>
                        </div>
                        <ExternalLink className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {loc.branchName && (
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4" />
                            <span>Branch: {loc.branchName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                           <span>Zone: {loc.zoneName}</span>
                        </div>
                         <p className="text-xs text-muted-foreground mt-1">
                            Click to view all extensions in {loc.localityName}.
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-muted-foreground">
                No localities/departments found matching your search criteria.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

    