
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
import { UserCircle, PhoneOutgoing, ListX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteExtensionButton } from '@/components/actions/DeleteExtensionButton';
import { EditExtensionButton } from '@/components/actions/EditExtensionButton';
import { useTranslation } from '@/hooks/useTranslation';

interface ExtensionTableProps {
  extensions: Extension[];
  localityName: string;
  localityId: string; 
  zoneId: string; 
  branchId?: string; 
  // isAuthenticated: boolean; // Reverted: prop removed
}

export function ExtensionTable({ extensions, localityName, localityId, zoneId, branchId }: ExtensionTableProps) {
  const { t } = useTranslation();

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
      <Table>
        <TableCaption>
          {t('extensionListCaption', { localityName: localityName })}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">{t('departmentColumnHeader')}</TableHead>
            <TableHead className="w-[20%]">{t('extensionColumnHeader')}</TableHead>
            <TableHead className="w-[30%]">{t('contactNameColumnHeader')}</TableHead>
            {/* Reverted: Always show Actions column */}
            <TableHead className="w-[15%] text-right">{t('actionsColumnHeader')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {extensions.map((ext) => (
            <TableRow key={ext.id}>
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
              {/* Reverted: Always show Edit/Delete buttons */}
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
