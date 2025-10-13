
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Move } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Extension } from '@/types';
import { MoveExtensionDialog } from '../dialogs/MoveExtensionDialog';


interface MoveExtensionButtonProps {
  extension: Extension;
}

export function MoveExtensionButton({ extension }: MoveExtensionButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsDialogOpen(true)}
      >
        <Move className="mr-2 h-4 w-4" />
        {t('moveExtensionButton')}
      </Button>
      <MoveExtensionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        extension={extension}
      />
    </>
  );
}
