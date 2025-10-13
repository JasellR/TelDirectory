
'use client';

import { useState, useMemo } from 'react';
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
import { UserCircle, PhoneOutgoing, ListX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteExtensionButton } from '@/components/actions/DeleteExtensionButton';
import { EditExtensionButton } from '@/components/actions/EditExtensionButton';
import { useTranslation } from '@/hooks/useTranslation';
import { MoveExtensionButton } from '../actions/MoveExtensionButton';
import { Checkbox } from '@/components/ui/checkbox';


interface ExtensionTableProps {
  extensions: Extension[];
  localityName: string;
  localityId: string; 
  zoneId: string; 
  branchId?: string; 
  isAuthenticated: boolean;
}

export function ExtensionTable({ extensions, localityName, localityId, zoneId, branchId, isAuthenticated }: ExtensionTableProps) {
  const { t } = useTranslation();
  const [selectedExtensions, setSelectedExtensions] = useState<Extension[]>([]);
  const isMissingExtensionsPage = localityId === 'MissingExtensionsFromFeed';

  const handleSelectAll = (checked: boolean) => {
    setSelectedExtensions(checked ? extensions : []);
  };

  const handleSelectRow = (extension: Extension, checked: boolean) => {
    setSelectedExtensions(prev => 
      checked ? [...prev, extension] : prev.filter(e => e.id !== extension.id)
    );
  };
  
  const isAllSelected = useMemo(() => {
    return extensions.length > 0 && selectedExtensions.length === extensions.length;
  }, [extensions, selectedExtensions]);

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
        {isMissingExtensionsPage && isAuthenticated && (
            <div className="mb-4 flex items-center gap-4 p-2 bg-secondary/50 rounded-lg">
                <p className="text-sm font-medium text-secondary-foreground flex-grow">
                    {t('selectedExtensionsCount', { count: selectedExtensions.length })}
                </p>
                <MoveExtensionButton 
                    extensions={selectedExtensions} 
                    onMoveComplete={() => setSelectedExtensions([])}
                />
            </div>
        )}
        <Table>
            <TableCaption>
            {isMissingExtensionsPage 
                ? t('missingExtensionsTableCaption') 
                : t('extensionListCaption', { localityName: localityName })}
            </TableCaption>
            <TableHeader>
            <TableRow>
                {isMissingExtensionsPage && isAuthenticated && (
                    <TableHead className="w-[50px]">
                        <Checkbox
                            checked={isAllSelected}
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
            {extensions.map((ext) => {
                const isSelected = selectedExtensions.some(e => e.id === ext.id);
                return (
                    <TableRow key={ext.id} data-state={isSelected ? "selected" : ""}>
                        {isMissingExtensionsPage && isAuthenticated && (
                            <TableCell>
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleSelectRow(ext, !!checked)}
                                    aria-label={t('selectRowAriaLabel', { rowName: ext.name })}
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
                );
            })}
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
