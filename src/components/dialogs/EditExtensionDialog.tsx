
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
import { editExtensionAction } from '@/lib/actions';
import type { Extension } from '@/types';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface EditExtensionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  localityId: string;
  extension: Extension;
  zoneId: string;
  branchId?: string;
}

export function EditExtensionDialog({
  isOpen,
  onClose,
  localityId,
  extension,
  zoneId,
  branchId,
}: EditExtensionDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const [newExtensionName, setNewExtensionName] = useState(extension.department);
  const [newExtensionNumber, setNewExtensionNumber] = useState(extension.number);

  useEffect(() => {
    if (isOpen) {
      setNewExtensionName(extension.department);
      setNewExtensionNumber(extension.number);
    }
  }, [isOpen, extension]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newExtensionName.trim()) {
      toast({
        title: t('errorTitle'),
        description: t('extensionNameRequired'),
        variant: 'destructive',
      });
      return;
    }
    if (!newExtensionNumber.trim()) {
      toast({
        title: t('errorTitle'),
        description: t('extensionNumberRequired'),
        variant: 'destructive',
      });
      return;
    }
    if (!/^\d+$/.test(newExtensionNumber.trim())) {
      toast({
        title: t('errorTitle'),
        description: t('extensionNumberInvalid'),
        variant: 'destructive',
      });
      return;
    }

    if (newExtensionName.trim() === extension.department && newExtensionNumber.trim() === extension.number) {
      toast({
        title: t('noChangesTitle'),
        description: t('extensionUpdateNoChange'),
      });
      onClose();
      return;
    }

    startTransition(async () => {
      const result = await editExtensionAction({
        localityId,
        oldExtensionName: extension.department,
        oldExtensionNumber: extension.number,
        newExtensionName: newExtensionName.trim(),
        newExtensionNumber: newExtensionNumber.trim(),
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
          <DialogTitle>{t('editExtensionDialogTitle', { extensionName: extension.department, extensionNumber: extension.number })}</DialogTitle>
          <DialogDescription>
            {t('editExtensionDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newExtensionName" className="text-right">
                {t('newExtensionNameLabel')}
              </Label>
              <Input
                id="newExtensionName"
                value={newExtensionName}
                onChange={(e) => setNewExtensionName(e.target.value)}
                className="col-span-3"
                disabled={isPending}
                required
                placeholder={t('extensionDialogNamePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newExtensionNumber" className="text-right">
                {t('newExtensionNumberLabel')}
              </Label>
              <Input
                id="newExtensionNumber"
                value={newExtensionNumber}
                onChange={(e) => setNewExtensionNumber(e.target.value)}
                className="col-span-3"
                disabled={isPending}
                required
                placeholder={t('extensionDialogNumberPlaceholder')}
                type="tel"
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
