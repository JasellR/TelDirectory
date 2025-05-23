
'use client';

import { useState, useTransition } from 'react';
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
import { addLocalityOrBranchAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface AddLocalityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string;
  zoneName: string;
  branchId?: string;
  branchName?: string;
  itemType: 'branch' | 'locality';
}

export function AddLocalityDialog({ 
    isOpen, 
    onClose, 
    zoneId, 
    zoneName, 
    branchId, 
    branchName, 
    itemType 
}: AddLocalityDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();
  const [itemName, setItemName] = useState('');

  const dialogTitle = itemType === 'branch' 
    ? t('addBranchDialogTitle', { parentName: zoneName }) // Changed for consistency
    : t('addLocalityToParentDialogTitle', { parentName: branchName || zoneName });

  const dialogDescription = itemType === 'branch'
    ? t('addBranchDialogDescription')
    : t('addLocalityDialogDescription');
  
  const nameLabel = itemType === 'branch' ? t('branchNameLabel') : t('localityNameLabel');
  const namePlaceholder = itemType === 'branch' ? t('branchNamePlaceholder') : t('localityNamePlaceholder');
  const buttonActionLabel = itemType === 'branch' ? t('addBranchButtonAction') : t('addLocalityButtonAction');


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!itemName.trim()) {
      toast({
        title: t('errorTitle'),
        description: t('itemNameCannotBeEmpty', { itemName: nameLabel }),
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      const result = await addLocalityOrBranchAction({
        zoneId,
        branchId, 
        itemName: itemName.trim(),
        itemType,
      });

      if (result.success) {
        toast({
          title: t('successTitle'),
          description: result.message,
        });
        router.refresh();
        onClose();
        setItemName('');
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
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="itemName" className="text-right">
                {nameLabel}
              </Label>
              <Input
                id="itemName"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="col-span-3"
                disabled={isPending}
                required
                placeholder={namePlaceholder}
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
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : buttonActionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
