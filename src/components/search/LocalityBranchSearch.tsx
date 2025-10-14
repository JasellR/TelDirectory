
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ZoneItem } from '@/types';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { GitBranch, Building, Search as SearchIcon, Inbox, SearchX, ArrowLeft, ArrowRight } from 'lucide-react';
import { EditLocalityButton } from '@/components/actions/EditLocalityButton';
import { DeleteLocalityButton } from '@/components/actions/DeleteLocalityButton';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';

interface LocalityBranchSearchProps {
  items: ZoneItem[];
  zoneId: string;
  itemType: string; 
  itemTypePlural: string; 
  isAuthenticated: boolean;
}

export function LocalityBranchSearch({ items, zoneId, itemType, itemTypePlural, isAuthenticated }: LocalityBranchSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation();

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return items;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    // Pagination buttons should not be filterable
    return items.filter(item =>
      item.type !== 'pagination' && 
      (item.name.toLowerCase().includes(lowerSearchTerm) ||
      item.id.toLowerCase().includes(lowerSearchTerm))
    );
  }, [items, searchTerm]);

  // Separate pagination items from the list to render them differently.
  const paginationItems = useMemo(() => items.filter(item => item.type === 'pagination'), [items]);
  const regularItems = useMemo(() => filteredItems.filter(item => item.type !== 'pagination'), [filteredItems]);


  const searchPlaceholder = t('searchPlaceholder', { itemType: itemTypePlural.toLowerCase() });

  return (
    <div className="space-y-6">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border bg-background p-2 pl-10 shadow-sm focus:ring-2 focus:ring-primary"
          aria-label={searchPlaceholder}
        />
      </div>

      {regularItems.length > 0 ? (
        <div className="space-y-4">
          {regularItems.map((item) => {
            const Icon = item.type === 'branch' ? GitBranch : Building;
            const href = item.type === 'branch'
              ? `/${zoneId}/branches/${item.id}`
              : `/${zoneId}/localities/${item.id}`;
            const description = item.type === 'branch'
              ? t('viewLocalitiesInBranch', { branchName: item.name })
              : t('viewExtensionsAndDetails', { localityName: item.name });
            
            return (
              <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-1">
                      <Icon className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">
                        <Link href={href} className="hover:underline hover:text-primary transition-colors">
                          {item.name}
                        </Link>
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground ml-8 sm:ml-0">
                      {description} (ID: {item.id})
                    </p>
                  </div>
                  {isAuthenticated && (
                    <div className="flex-shrink-0 flex items-center space-x-1">
                      <EditLocalityButton
                        zoneId={zoneId}
                        item={item}
                        itemType={item.type as 'branch' | 'locality'}
                      />
                      <DeleteLocalityButton
                        zoneId={zoneId}
                        itemId={item.id}
                        itemName={item.name}
                        itemType={item.type as 'branch' | 'locality'}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10">
          {searchTerm.trim() ? (
            <>
              <SearchX className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-xl font-semibold text-foreground">{t('noItemsMatchSearchTitle') || 'No Results Found'}</p>
              <p className="text-muted-foreground">
                {t('noItemsMatchSearch', { itemType: itemTypePlural.toLowerCase(), searchTerm: searchTerm })}
              </p>
            </>
          ) : (
            <>
              <Inbox className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-xl font-semibold text-foreground">{t('emptyZoneTitle') || `This ${itemType} is Empty`}</p>
              <p className="text-muted-foreground">
                {t('noItemsFoundInZone', { itemType: itemTypePlural.toLowerCase() })}
              </p>
            </>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {paginationItems.length > 0 && (
          <div className="flex justify-between items-center pt-4 border-t">
              {paginationItems.find(p => p.name === '<< Anterior') ? (
                  <Button asChild variant="outline">
                      <Link href={paginationItems.find(p => p.name === '<< Anterior')?.url || '#'}>
                          <ArrowLeft className="mr-2 h-4 w-4" />
                          Anterior
                      </Link>
                  </Button>
              ) : <div/>}

              {paginationItems.find(p => p.name === 'Siguiente >>') ? (
                  <Button asChild variant="outline">
                      <Link href={paginationItems.find(p => p.name === 'Siguiente >>')?.url || '#'}>
                          Siguiente
                          <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                  </Button>
              ) : <div/>}
          </div>
      )}
    </div>
  );
}
