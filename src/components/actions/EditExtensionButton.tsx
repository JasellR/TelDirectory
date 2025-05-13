
'use client';

import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Extension } from '@/types';

interface EditExtensionButtonProps {
  localityId: string;
  extension: Extension;
}

export function EditExtensionButton({ localityId, extension }: EditExtensionButtonProps) {
  const { toast } = useToast();

  const handleEdit = () => {
    toast({
      title: 'Feature Not Implemented',
      description: `Editing for extension "${extension.department} - ${extension.number}" in ${localityId} is not yet available.`,
    });
    console.log(`Edit clicked for: Locality ID: ${localityId}, Extension: ${extension.department} - ${extension.number}`);
  };

  return (
    <Button variant="ghost" size="icon" onClick={handleEdit} aria-label={`Edit extension ${extension.department}`} className="text-muted-foreground hover:text-primary">
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
