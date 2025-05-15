
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import type { Extension } from '@/types';
import { EditExtensionDialog } from '@/components/dialogs/EditExtensionDialog'; // New import
import { useTranslation } from '@/hooks/useTranslation';

interface EditExtensionButtonProps {
  localityId: string;
  extension: Extension;
  zoneId: string;
  branchId?: string;
}

export function EditExtensionButton({ localityId, extension, zoneId, branchId }: EditExtensionButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsDialogOpen(true)}
        aria-label={t('editExtensionButtonAriaLabel', { extensionName: extension.department, extensionNumber: extension.number})}
        className="text-muted-foreground hover:text-primary"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <EditExtensionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        localityId={localityId}
        extension={extension}
        zoneId={zoneId}
        branchId={branchId}
      />
    </>
  );
}
