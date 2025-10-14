
'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { searchAllDepartmentsAndExtensionsAction } from '@/lib/actions';
import type { GlobalSearchResult, MatchedExtension } from '@/types';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, SearchIcon, Frown, Building, Phone, ListFilter } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Badge } from '@/components/ui/badge';

const DEBOUNCE_DELAY = 300; // milliseconds

export function GlobalSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const { t } = useTranslation();

  const performSearch = useCallback((query: string) => {
    if (query.trim().length < 2) { // Minimum characters to trigger search
      setResults([]);
      return;
    }
    startSearchTransition(async () => {
      const searchResults = await searchAllDepartmentsAndExtensionsAction(query);
      setResults(searchResults);
    });
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      performSearch(searchTerm);
    }, DEBOUNCE_DELAY);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, performSearch]);

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={index} className="bg-primary/20 text-primary font-semibold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="my-6 space-y-4">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('globalSearchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border bg-background p-2 pl-10 shadow-sm focus:ring-2 focus:ring-primary text-base"
          aria-label={t('globalSearchPlaceholder')}
        />
      </div>

      {isSearching && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>{t('searchingText')}...</span>
        </div>
      )}

      {!isSearching && searchTerm.trim().length >= 2 && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Frown className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-xl font-semibold text-foreground">{t('noItemsMatchSearchTitle')}</p>
          <p className="text-muted-foreground">{t('noItemsMatchSearch', { itemTypePlural: 'items', searchTerm: searchTerm })}</p>
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
          <p className="text-sm text-muted-foreground px-1">
            {t('searchResultsCount', { count: results.length })}
          </p>
          {results.map((item) => (
            <Link href={item.fullPath} key={`${item.zoneId}-${item.branchId || ''}-${item.localityId}`} className="block">
              <Card className="hover:shadow-md hover:border-primary/50 transition-all duration-200">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary shrink-0" />
                    <span>{item.localityNameMatch ? highlightMatch(item.localityName, searchTerm) : item.localityName}</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {item.branchName ? `${item.zoneName} > ${item.branchName}` : item.zoneName}
                  </CardDescription>
                </CardHeader>
                {item.matchingExtensions.length > 0 && (
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="mt-1 space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <ListFilter className="h-3 w-3"/>
                        {t('matchingExtensionsLabel')}
                      </p>
                      {item.matchingExtensions.slice(0, 3).map((ext, idx) => ( // Show max 3 matching extensions initially
                        <div key={idx} className="ml-2 text-sm p-1.5 bg-secondary/50 rounded-md">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                            <span className="font-medium">
                              {ext.matchedOn === 'extensionName' ? highlightMatch(ext.name, searchTerm) : ext.name}
                            </span>
                            <Badge variant="outline" className="text-xs px-1.5 py-0 leading-tight">
                              {ext.matchedOn === 'extensionNumber' ? highlightMatch(ext.number, searchTerm) : ext.number}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {item.matchingExtensions.length > 3 && (
                        <p className="text-xs text-muted-foreground ml-2 italic">
                          {t('andMoreExtensions', { count: item.matchingExtensions.length - 3 })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
