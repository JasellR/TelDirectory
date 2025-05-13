
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { AddLocalityDialog } from '@/components/dialogs/AddLocalityDialog'; // Import the new dialog

interface AddLocalityButtonProps {
  zoneId: string;
  zoneName: string;
}

export function AddLocalityButton({ zoneId, zoneName }: AddLocalityButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        <PlusCircle className="mr-2 h-5 w-5" />
        Add Locality
      </Button>
      <AddLocalityDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        zoneId={zoneId}
        zoneName={zoneName}
      />
    </>
  );
}
