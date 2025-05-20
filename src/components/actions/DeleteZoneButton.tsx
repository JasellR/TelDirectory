
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deleteZoneAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
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

interface DeleteZoneButtonProps {
  zoneId: string;
  zoneName: string;
  isAuthenticated: boolean;
}

export function DeleteZoneButton({ zoneId, zoneName, isAuthenticated }: DeleteZoneButtonProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteZoneAction(zoneId);
      if (result.success) {
        toast({
          title: t('successTitle'),
          description: result.message,
        });
        router.refresh(); 
      } else {
        toast({
          title: t('errorTitle'),
          description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''),
          variant: 'destructive',
        });
      }
      setIsDialogOpen(false);
    });
  };

  return (
    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="icon"
          className="h-7 w-7 p-1.5" // Make it a bit smaller to fit better on cards
          aria-label={t('deleteZoneButtonAriaLabel', { zoneName })}
          onClick={(e) => {
            e.preventDefault(); // Prevent link navigation if card is wrapped in <a>
            e.stopPropagation(); // Stop event bubbling
            setIsDialogOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmDeleteZoneTitle', { zoneName })}</AlertDialogTitle>
          <AlertDialogDescription>
            <p>{t('confirmDeleteZoneDescription', { zoneName })}</p>
            <p className="mt-2 font-semibold text-destructive">{t('confirmDeleteZoneWarningCascade')}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={() => setIsDialogOpen(false)}>{t('cancelButton')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
            {isPending ? t('deletingButtonText') : t('deleteButtonConfirmTextDeep', { itemType: t('zoneWord') })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
