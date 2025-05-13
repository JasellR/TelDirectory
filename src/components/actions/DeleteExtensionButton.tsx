
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { deleteExtensionAction } from '@/lib/actions'; // Updated path
import type { Extension } from '@/types';
import { useRouter } from 'next/navigation';

interface DeleteExtensionButtonProps {
  localityId: string;
  // Pass zoneId if needed for more precise revalidation, though not used by deleteExtensionAction directly
  zoneId: string; 
  extension: Extension; 
}

export function DeleteExtensionButton({ localityId, zoneId, extension }: DeleteExtensionButtonProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = async () => {
    startTransition(async () => {
      // extension.department is the 'Name' field in XML, extension.number is 'Telephone'
      const result = await deleteExtensionAction(localityId, extension.department, extension.number);
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        router.refresh(); // Re-fetch data for the current page
      } else {
        toast({
          title: 'Error',
          description: result.message,
          variant: 'destructive',
        });
      }
      setIsOpen(false);
    });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label={`Delete extension ${extension.department}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will delete the extension <strong>{extension.department} ({extension.number})</strong> from locality {localityId}.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            {isPending ? 'Deleting...' : 'Delete Extension'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
