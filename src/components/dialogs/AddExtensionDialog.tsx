
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
import { addExtensionAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface AddExtensionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  localityId: string;
  localityName: string;
  zoneId: string; 
  branchId?: string; // For revalidation context if needed
}

export function AddExtensionDialog({ isOpen, onClose, localityId, localityName, zoneId, branchId }: AddExtensionDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const [extensionName, setExtensionName] = useState(''); 
  const [extensionTelephone, setExtensionTelephone] = useState(''); 

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!extensionName.trim()) {
      toast({
        title: t('errorTitle'),
        description: t('extensionNameRequired'),
        variant: 'destructive',
      });
      return;
    }
    if (!extensionTelephone.trim()) {
      toast({
        title: t('errorTitle'),
        description: t('extensionNumberRequired'),
        variant: 'destructive',
      });
      return;
    }
     if (!/^\d+$/.test(extensionTelephone.trim())) {
      toast({
        title: t('errorTitle'),
        description: t('extensionNumberInvalid'),
        variant: 'destructive',
      });
      return;
    }


    startTransition(async () => {
      try {
        const result = await addExtensionAction(localityId, extensionName.trim(), extensionTelephone.trim());
        
        if (result && result.success) { 
          toast({
            title: t('successTitle'),
            description: result.message,
          });
          router.refresh();
          onClose();
          setExtensionName('');
          setExtensionTelephone('');
        } else if (result) { 
          toast({
            title: t('errorTitle'),
            description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''),
            variant: 'destructive',
          });
        } else {
          // This case handles if result is unexpectedly undefined or null from the server action
          toast({
            title: t('errorTitle'),
            description: t('loginUnexpectedError'), // Using a generic error message, consider a more specific one
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error("Error in AddExtensionDialog calling addExtensionAction:", error);
        toast({
          title: t('errorTitle'),
          // Consider a more specific error message or logging the error for the user
          description: t('loginUnexpectedError'), // Using a generic error message
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
          <DialogTitle>{t('addExtensionDialogTitle', { localityName })}</DialogTitle>
          <DialogDescription>
            {t('addExtensionDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="extensionName" className="text-right">
                {t('extensionDialogNameLabel')}
              </Label>
              <Input
                id="extensionName"
                value={extensionName}
                onChange={(e) => setExtensionName(e.target.value)}
                className="col-span-3"
                disabled={isPending}
                required
                placeholder={t('extensionDialogNamePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="extensionTelephone" className="text-right">
                {t('extensionDialogNumberLabel')}
              </Label>
              <Input
                id="extensionTelephone"
                value={extensionTelephone}
                onChange={(e) => setExtensionTelephone(e.target.value)}
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
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('addExtensionButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
