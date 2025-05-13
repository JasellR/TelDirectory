
'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { deleteLocalityAction } from '@/app/import-xml/actions'; // Adjust path if actions are moved
import { Loader2, Trash2 } from 'lucide-react';

interface DeleteLocalityButtonProps {
  zoneId: string;
  localityId: string;
  localityName: string;
}

export function DeleteLocalityButton({ zoneId, localityId, localityName }: DeleteLocalityButtonProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteLocalityAction(zoneId, localityId);
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        setIsAlertDialogOpen(false); // Close dialog on success
      } else {
        toast({
          title: 'Deletion Failed',
          description: result.message + (result.error ? ` Details: ${result.error}` : ''),
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An unexpected error occurred during deletion.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="icon" aria-label={`Delete locality ${localityName}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete this locality?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will permanently delete the locality <strong>{localityName}</strong> (ID: {localityId}) from the zone <strong>{zoneId}</strong>. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Confirm Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

