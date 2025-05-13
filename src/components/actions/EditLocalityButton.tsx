
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import type { ZoneItem } from '@/types'; // Use ZoneItem as it's more generic for this context
import { EditLocalityDialog } from '@/components/dialogs/EditLocalityDialog';
import { useTranslation } from '@/hooks/useTranslation';

interface EditLocalityButtonProps {
  zoneId: string;
  branchId?: string; // If editing a locality within a branch
  item: ZoneItem; // The item being edited (could be a branch or a locality)
  itemType: 'branch' | 'locality';
}

export function EditLocalityButton({ zoneId, branchId, item, itemType }: EditLocalityButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  const ariaLabel = itemType === 'branch' 
    ? t('editBranchButtonAriaLabel', { branchName: item.name }) 
    : t('editLocalityButtonAriaLabel', { localityName: item.name });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsDialogOpen(true)}
        aria-label={ariaLabel}
        className="text-muted-foreground hover:text-primary"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <EditLocalityDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        zoneId={zoneId}
        branchId={branchId}
        item={item}
        itemType={itemType}
      />
    </>
  );
}
