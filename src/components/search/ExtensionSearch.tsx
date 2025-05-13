
'use client';

import type { SearchableExtension } from '@/lib/data';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Phone, MapPin, Building, GitBranch, Search as SearchIcon } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface ExtensionSearchProps {
  allExtensions: SearchableExtension[];
}

export function ExtensionSearch({ allExtensions }: ExtensionSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation();

  const filteredExtensions = useMemo(() => {
    if (!searchTerm.trim()) {
      return [];
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allExtensions.filter(
      (ext) =>
        ext.extensionName.toLowerCase().includes(lowerSearchTerm) ||
        ext.extensionNumber.toLowerCase().includes(lowerSearchTerm) ||
        ext.localityName.toLowerCase().includes(lowerSearchTerm) ||
        ext.zoneName.toLowerCase().includes(lowerSearchTerm) ||
        (ext.branchName && ext.branchName.toLowerCase().includes(lowerSearchTerm))
    );
  }, [searchTerm, allExtensions]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name, extension, locality, zone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border bg-background p-4 pl-10 text-lg shadow-sm focus:ring-2 focus:ring-primary"
        />
      </div>

      {searchTerm.trim() && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({filteredExtensions.length})</CardTitle>
            <CardDescription>
              Displaying extensions matching your search for "{searchTerm}".
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredExtensions.length > 0 ? (
              <ul className="space-y-4">
                {filteredExtensions.map((ext) => (
                  <li key={ext.id} className="rounded-lg border p-4 shadow-sm transition-all hover:shadow-md">
                    <Link href={ext.path} className="group block hover:no-underline">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-primary group-hover:underline">
                          {ext.extensionName}
                        </h3>
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {ext.extensionNumber}
                        </div>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>Locality: {ext.localityName}</span>
                        </div>
                        {ext.branchName && (
                          <div className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4" />
                            <span>Branch: {ext.branchName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                           <span>Zone: {ext.zoneName}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-muted-foreground">
                No extensions found matching your search criteria.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
