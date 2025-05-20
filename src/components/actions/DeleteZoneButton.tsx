
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
import { deleteZoneAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';

interface DeleteZoneButtonProps {
  zoneId: string;
  zoneName: string;
}

export function DeleteZoneButton({ zoneId, zoneName }: DeleteZoneButtonProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteZoneAction(zoneId);
      if (result.success) {
        toast({
          title: t('successTitle'),
          description: result.message,
        });
        router.refresh(); // Refresh the current route to update the list of zones
      } else {
        toast({
          title: t('errorTitle'),
          description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''),
          variant: 'destructive',
        });
      }
      setIsOpen(false);
    });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="icon"
          aria-label={t('deleteZoneButtonAriaLabel', { zoneName })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDeleteZoneTitle', { zoneName })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirmDeleteZoneDescription', { zoneName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t('cancelButton')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            {isPending ? t('deletingButtonText') : t('deleteButtonConfirmText', { itemType: t('zoneWord') })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
