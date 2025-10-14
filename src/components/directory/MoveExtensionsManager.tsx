
'use client';

import { useState, useMemo } from 'react';
import type { Extension } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ListX, Move } from 'lucide-react';
import { MoveExtensionsDialog } from '@/components/dialogs/MoveExtensionsDialog';


export function MoveExtensionsManager({ extensions, sourceLocalityId }: { extensions: Extension[], sourceLocalityId: string }) {
  const { t } = useTranslation();
  const [selectedExtensions, setSelectedExtensions] = useState<Extension[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isAllSelected = useMemo(() => extensions.length > 0 && selectedExtensions.length === extensions.length, [extensions, selectedExtensions]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedExtensions(extensions);
    } else {
      setSelectedExtensions([]);
    }
  };

  const handleSelectRow = (checked: boolean, extension: Extension) => {
    if (checked) {
      setSelectedExtensions(prev => [...prev, extension]);
    } else {
      setSelectedExtensions(prev => prev.filter(ext => ext.id !== extension.id));
    }
  };

  if (!extensions || extensions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
            <ListX className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-xl font-semibold text-foreground">{t('noMissingExtensionsTitle')}</p>
            <p className="text-muted-foreground">{t('noMissingExtensionsDescription')}</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <>
    <Card className="mb-6">
        <CardHeader>
            <CardTitle>{t('manageMissingExtensionsTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('manageMissingExtensionsDescription')}</p>
        </CardHeader>
        <CardContent>
             <div className="flex justify-between items-center w-full">
                <div className="text-sm text-muted-foreground">
                    {t('selectedItemsCount', { count: selectedExtensions.length, total: extensions.length })}
                </div>
                <Button disabled={selectedExtensions.length === 0} onClick={() => setIsDialogOpen(true)}>
                    <Move className="mr-2 h-4 w-4" />
                    {t('moveSelectedButtonLabel', { count: selectedExtensions.length })}
                </Button>
            </div>
        </CardContent>
    </Card>
    
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px] pl-4">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label={t('selectAllRowsAriaLabel')}
                />
              </TableHead>
              <TableHead>{t('departmentColumnHeader')}</TableHead>
              <TableHead>{t('extensionColumnHeader')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extensions.map((ext) => (
              <TableRow key={ext.id} data-state={selectedExtensions.some(e => e.id === ext.id) && "selected"}>
                <TableCell className="pl-4">
                  <Checkbox
                    checked={selectedExtensions.some(e => e.id === ext.id)}
                    onCheckedChange={(checked) => handleSelectRow(!!checked, ext)}
                    aria-label={t('selectRowAriaLabel', { itemName: ext.department })}
                  />
                </TableCell>
                <TableCell className="font-medium">{ext.department}</TableCell>
                <TableCell>{ext.number}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    {isDialogOpen && (
        <MoveExtensionsDialog 
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            extensionsToMove={selectedExtensions}
            sourceLocalityId={sourceLocalityId}
        />
    )}
    </>
  );
}
