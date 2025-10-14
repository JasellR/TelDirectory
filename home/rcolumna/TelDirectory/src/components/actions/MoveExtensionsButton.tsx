
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Move } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Extension } from '@/types';
import { MoveExtensionsDialog } from '../dialogs/MoveExtensionsDialog';

interface MoveExtensionsButtonProps {
  selectedExtensions: Extension[];
  sourceLocalityId: string;
}

export function MoveExtensionsButton({ selectedExtensions, sourceLocalityId }: MoveExtensionsButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        disabled={selectedExtensions.length === 0}
      >
        <Move className="mr-2 h-4 w-4" />
        {t('moveSelectedButton', { count: selectedExtensions.length })}
      </Button>
      <MoveExtensionsDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        extensionsToMove={selectedExtensions}
        sourceLocalityId={sourceLocalityId}
      />
    </>
  );
}
