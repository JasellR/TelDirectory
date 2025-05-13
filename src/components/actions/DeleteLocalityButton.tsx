
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
import { deleteLocalityAction } from '@/lib/actions'; // Updated path
import { useRouter } from 'next/navigation';


interface DeleteLocalityButtonProps {
  zoneId: string;
  localityId: string;
  localityName: string;
}

export function DeleteLocalityButton({ zoneId, localityId, localityName }: DeleteLocalityButtonProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteLocalityAction(zoneId, localityId);
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
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label={`Delete locality ${localityName}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will delete the locality <strong>{localityName}</strong> (ID: {localityId}) from zone {zoneId}.
            This will also attempt to delete its corresponding department XML file. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            {isPending ? 'Deleting...' : 'Delete Locality'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
