
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
import { addLocalityAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface AddLocalityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string;
  zoneName: string;
}

export function AddLocalityDialog({ isOpen, onClose, zoneId, zoneName }: AddLocalityDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localityName, setLocalityName] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!localityName.trim()) {
      toast({
        title: 'Error',
        description: 'Locality name cannot be empty.',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      const result = await addLocalityAction(zoneId, localityName.trim());
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        router.refresh();
        onClose();
        setLocalityName('');
      } else {
        toast({
          title: 'Error',
          description: result.message + (result.error ? ` Details: ${result.error}` : ''),
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
          <DialogTitle>Add New Locality to {zoneName}</DialogTitle>
          <DialogDescription>
            Enter the name for the new locality. This will create a new XML file in the Department directory and update the zone file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="localityName" className="text-right">
                Name
              </Label>
              <Input
                id="localityName"
                value={localityName}
                onChange={(e) => setLocalityName(e.target.value)}
                className="col-span-3"
                disabled={isPending}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Add Locality'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
