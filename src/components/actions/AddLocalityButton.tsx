
'use client';

import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AddLocalityButtonProps {
  zoneId: string;
  zoneName: string;
}

export function AddLocalityButton({ zoneId, zoneName }: AddLocalityButtonProps) {
  const { toast } = useToast();

  const handleAddLocality = () => {
    toast({
      title: 'Feature Not Implemented',
      description: `Adding a new locality to zone "${zoneName}" (ID: ${zoneId}) is not yet available.`,
    });
    console.log(`Add Locality clicked for: Zone ID: ${zoneId}, Zone Name: ${zoneName}`);
  };

  return (
    <Button 
      onClick={handleAddLocality}
      // className="bg-green-600 hover:bg-green-700 text-white" // Using primary color for consistency, can be overridden
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      <PlusCircle className="mr-2 h-5 w-5" />
      Add Locality
    </Button>
  );
}
