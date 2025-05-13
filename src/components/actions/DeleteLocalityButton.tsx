
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
import { deleteLocalityOrBranchAction } from '@/lib/actions'; // Updated action name
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';


interface DeleteLocalityButtonProps {
  zoneId: string;
  branchId?: string; // If deleting a locality within a branch
  itemId: string;
  itemName: string;
  itemType: 'branch' | 'locality';
}

export function DeleteLocalityButton({ zoneId, branchId, itemId, itemName, itemType }: DeleteLocalityButtonProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const itemTypeDisplay = itemType === 'branch' ? t('branchWord') : t('localityWord');
  const ariaLabel = t('deleteButtonAriaLabel', { itemType: itemTypeDisplay, itemName: itemName });
  const dialogTitle = t('confirmDeleteTitle');
  const dialogDescription = t('confirmDeleteDescription', { itemType: itemTypeDisplay.toLowerCase(), itemName, itemId });
  const confirmButtonText = t('deleteButtonConfirmText', { itemType: itemTypeDisplay });

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteLocalityOrBranchAction({
          zoneId, 
          branchId, // undefined if deleting a branch or locality directly under zone
          itemId, 
          itemType
        });
      if (result.success) {
        toast({
          title: t('successTitle'),
          description: result.message,
        });
        router.refresh(); 
      } else {
        toast({
          title: t('errorTitle'),
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
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label={ariaLabel}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {dialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t('cancelButton')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            {isPending ? t('deletingButtonText') : confirmButtonText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
