
'use client';

import type { Extension } from '@/types';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { UserCircle, PhoneOutgoing, ListX, Move } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteExtensionButton } from '@/components/actions/DeleteExtensionButton';
import { EditExtensionButton } from '@/components/actions/EditExtensionButton';
import { useTranslation } from '@/hooks/useTranslation';
import { Checkbox } from '@/components/ui/checkbox';
import { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { MoveExtensionsButton } from '../actions/MoveExtensionsButton';

interface ExtensionTableProps {
  extensions: Extension[];
  localityName: string;
  localityId: string; 
  zoneId: string; 
  branchId?: string; 
  isAuthenticated: boolean;
  isMissingExtensionsPage?: boolean;
}

export function ExtensionTable({ 
  extensions, 
  localityName, 
  localityId, 
  zoneId, 
  branchId, 
  isAuthenticated,
  isMissingExtensionsPage = false 
}: ExtensionTableProps) {
  const { t } = useTranslation();
  const [selectedExtensions, setSelectedExtensions] = useState<Extension[]>([]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedExtensions(extensions);
    } else {
      setSelectedExtensions([]);
    }
  };

  const handleSelectRow = (extension: Extension, checked: boolean) => {
    if (checked) {
      setSelectedExtensions(prev => [...prev, extension]);
    } else {
      setSelectedExtensions(prev => prev.filter(ext => ext.id !== extension.id));
    }
  };

  const allRowsSelected = useMemo(() => {
    if (extensions.length === 0) return false;
    return selectedExtensions.length === extensions.length;
  }, [selectedExtensions, extensions]);

  const renderTableContent = () => {
    if (!extensions || extensions.length === 0) {
      return (
        <div className="text-center py-10">
          <ListX className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-xl font-semibold text-foreground">{t('emptyLocalityTitle') || 'No Extensions Here'}</p>
          <p className="text-muted-foreground">
            {t('noExtensionsAvailable', { localityName: localityName })}
          </p>
        </div>
      );
    }

    return (
      <>
        {isMissingExtensionsPage && selectedExtensions.length > 0 && (
          <div className="mb-4 p-4 bg-secondary rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium text-secondary-foreground">
              {t('extensionsSelected', { count: selectedExtensions.length })}
            </span>
            <MoveExtensionsButton selectedExtensions={selectedExtensions} sourceLocalityId={localityId} />
          </div>
        )}
        <Table>
          <TableCaption>
            {t('extensionListCaption', { localityName: localityName })}
          </TableCaption>
          <TableHeader>
            <TableRow>
              {isMissingExtensionsPage && (
                <TableHead className="w-12">
                  <Checkbox 
                    checked={allRowsSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label={t('selectAllRowsAriaLabel')}
                  />
                </TableHead>
              )}
              <TableHead className="w-[35%]">{t('departmentColumnHeader')}</TableHead>
              <TableHead className="w-[20%]">{t('extensionColumnHeader')}</TableHead>
              <TableHead className="w-[30%]">{t('contactNameColumnHeader')}</TableHead>
              {isAuthenticated && !isMissingExtensionsPage && (
                <TableHead className="w-[15%] text-right">{t('actionsColumnHeader')}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {extensions.map((ext) => (
              <TableRow key={ext.id} data-state={selectedExtensions.some(e => e.id === ext.id) ? 'selected' : ''}>
                {isMissingExtensionsPage && (
                  <TableCell>
                    <Checkbox
                      checked={selectedExtensions.some(e => e.id === ext.id)}
                      onCheckedChange={(checked) => handleSelectRow(ext, !!checked)}
                      aria-label={t('selectRowAriaLabel', { rowName: ext.department })}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">{ext.department}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <PhoneOutgoing className="h-4 w-4 text-primary" />
                    {ext.number}
                  </div>
                </TableCell>
                <TableCell>
                  {ext.name ? (
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                      {ext.name}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">{t('notApplicable')}</span>
                  )}
                </TableCell>
                {isAuthenticated && !isMissingExtensionsPage && (
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-1">
                      <EditExtensionButton 
                        localityId={localityId} 
                        extension={ext} 
                        zoneId={zoneId}
                        branchId={branchId}
                      />
                      <DeleteExtensionButton 
                          localityId={localityId} 
                          zoneId={zoneId} 
                          branchId={branchId} 
                          extension={ext} 
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('extensionsForLocality', { localityName: localityName })}</CardTitle>
      </CardHeader>
      <CardContent>
        {renderTableContent()}
      </CardContent>
    </Card>
  );
}

