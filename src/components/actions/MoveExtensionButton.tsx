
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Move } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Extension } from '@/types';
import { MoveExtensionDialog } from '../dialogs/MoveExtensionDialog';


interface MoveExtensionButtonProps {
  extensions: Extension[];
  onMoveComplete: () => void; // Callback to reset selection in the parent
}

export function MoveExtensionButton({ extensions, onMoveComplete }: MoveExtensionButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  const handleDialogClose = () => {
    setIsDialogOpen(false);
  };
  
  const handleDialogSuccess = () => {
    setIsDialogOpen(false);
    onMoveComplete();
  };

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        disabled={extensions.length === 0}
      >
        <Move className="mr-2 h-4 w-4" />
        {t('moveSelectedButton', { count: extensions.length })}
      </Button>
      <MoveExtensionDialog
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
        extensions={extensions}
      />
    </>
  );
}

