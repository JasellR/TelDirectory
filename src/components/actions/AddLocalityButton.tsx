
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddLocalityDialog } from '@/components/dialogs/AddLocalityDialog';
import { useTranslation } from '@/hooks/useTranslation';

interface AddLocalityButtonProps {
  zoneId: string;
  zoneName: string;
  branchId?: string; 
  branchName?: string; 
  itemType: 'branch' | 'locality'; 
}

export function AddLocalityButton({ zoneId, zoneName, branchId, branchName, itemType }: AddLocalityButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  const buttonLabel = itemType === 'branch' ? t('addBranchButtonLabel') : t('addLocalityButtonLabel');


  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        <PlusCircle className="mr-2 h-5 w-5" />
        {buttonLabel}
      </Button>
      <AddLocalityDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        zoneId={zoneId}
        zoneName={zoneName}
        branchId={branchId}
        branchName={branchName}
        itemType={itemType}
      />
    </>
  );
}
