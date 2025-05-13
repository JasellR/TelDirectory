
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import type { Locality } from '@/types';
import { EditLocalityDialog } from '@/components/dialogs/EditLocalityDialog'; // Import the new dialog

interface EditLocalityButtonProps {
  zoneId: string;
  locality: Locality;
}

export function EditLocalityButton({ zoneId, locality }: EditLocalityButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsDialogOpen(true)}
        aria-label={`Edit locality ${locality.name}`}
        className="text-muted-foreground hover:text-primary"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <EditLocalityDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        zoneId={zoneId}
        locality={locality}
      />
    </>
  );
}
