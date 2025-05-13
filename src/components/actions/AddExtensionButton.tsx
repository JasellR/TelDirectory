
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddExtensionDialog } from '@/components/dialogs/AddExtensionDialog';
import { useTranslation } from '@/hooks/useTranslation';


interface AddExtensionButtonProps {
  localityId: string;
  localityName: string;
  zoneId: string;
  branchId?: string; // Optional: if the locality is under a branch
}

export function AddExtensionButton({ localityId, localityName, zoneId, branchId }: AddExtensionButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        <PlusCircle className="mr-2 h-5 w-5" />
        {t('addExtensionButton')}
      </Button>
      <AddExtensionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        localityId={localityId}
        localityName={localityName}
        zoneId={zoneId}
        branchId={branchId}
      />
    </>
  );
}
