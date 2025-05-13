
'use client';

import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Locality } from '@/types'; // Assuming Locality type is available

interface EditLocalityButtonProps {
  zoneId: string;
  locality: Locality;
}

export function EditLocalityButton({ zoneId, locality }: EditLocalityButtonProps) {
  const { toast } = useToast();

  const handleEdit = () => {
    toast({
      title: 'Feature Not Implemented',
      description: `Editing for locality "${locality.name}" (ID: ${locality.id}) in zone ${zoneId} is not yet available.`,
    });
    console.log(`Edit clicked for: Zone ID: ${zoneId}, Locality: ${locality.name} (ID: ${locality.id})`);
  };

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleEdit} 
      aria-label={`Edit locality ${locality.name}`}
      className="text-muted-foreground hover:text-primary"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
