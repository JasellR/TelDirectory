
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
import { editLocalityAction } from '@/lib/actions';
import type { Locality } from '@/types';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface EditLocalityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string;
  locality: Locality;
}

export function EditLocalityDialog({ isOpen, onClose, zoneId, locality }: EditLocalityDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLocalityName, setNewLocalityName] = useState(locality.name);

  useEffect(() => {
    if (isOpen) {
      setNewLocalityName(locality.name);
    }
  }, [isOpen, locality.name]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newLocalityName.trim()) {
      toast({
        title: 'Error',
        description: 'Locality name cannot be empty.',
        variant: 'destructive',
      });
      return;
    }

    if (newLocalityName.trim() === locality.name) {
      toast({
        title: 'No Changes',
        description: 'The locality name is the same.',
      });
      onClose();
      return;
    }

    startTransition(async () => {
      const result = await editLocalityAction(zoneId, locality.id, newLocalityName.trim());
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        router.refresh();
        onClose();
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
          <DialogTitle>Edit Locality: {locality.name}</DialogTitle>
          <DialogDescription>
            Change the name of this locality. This will update the zone file and rename the corresponding department XML file if the ID changes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newLocalityName" className="text-right">
                New Name
              </Label>
              <Input
                id="newLocalityName"
                value={newLocalityName}
                onChange={(e) => setNewLocalityName(e.target.value)}
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
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
