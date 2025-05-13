
'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { editLocalityOrBranchAction } from '@/lib/actions'; // Updated action name
import type { ZoneItem } from '@/types';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface EditLocalityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string;
  branchId?: string; // If editing a locality within a branch
  item: ZoneItem; // The item being edited (branch or locality)
  itemType: 'branch' | 'locality';
}

export function EditLocalityDialog({ 
    isOpen, 
    onClose, 
    zoneId, 
    branchId, 
    item, 
    itemType 
}: EditLocalityDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [newItemName, setNewItemName] = useState(item.name);

  useEffect(() => {
    if (isOpen) {
      setNewItemName(item.name);
    }
  }, [isOpen, item.name]);

  const dialogTitle = itemType === 'branch' 
    ? t('editBranchDialogTitle', { branchName: item.name })
    : t('editLocalityDialogTitle', { localityName: item.name });
  
  const nameLabel = itemType === 'branch' ? t('newBranchNameLabel') : t('newLocalityNameLabel');


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      toast({
        title: t('errorTitle'),
        description: `${nameLabel} ${t('cannotBeEmpty')}`,
        variant: 'destructive',
      });
      return;
    }

    if (newItemName.trim() === item.name) {
      toast({
        title: t('noChangesTitle'),
        description: t('itemNameSameMessage', { itemName: nameLabel.toLowerCase() }),
      });
      onClose();
      return;
    }

    startTransition(async () => {
      const result = await editLocalityOrBranchAction({
        zoneId,
        branchId, // undefined if editing a branch or a locality directly under a zone
        oldItemId: item.id,
        newItemName: newItemName.trim(),
        itemType,
      });

      if (result.success) {
        toast({
          title: t('successTitle'),
          description: result.message,
        });
        router.refresh();
        onClose();
      } else {
        toast({
          title: t('errorTitle'),
          description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''),
          variant: 'destructive',
        });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {t('editDialogGeneralDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newItemName" className="text-right">
                {nameLabel}
              </Label>
              <Input
                id="newItemName"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="col-span-3"
                disabled={isPending}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancelButton')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('saveChangesButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
