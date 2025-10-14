
'use client';

import { useState, useEffect, useTransition } from 'react';
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
import { moveExtensionsAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';
import { Loader2, FolderPlus, MapPin } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Extension, Zone, ZoneItem } from '@/types';
import { getZonesAction, getZoneItemsAction } from '@/lib/server-data';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface MoveExtensionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  extensionsToMove: Extension[];
  sourceLocalityId: string;
}

export function MoveExtensionsDialog({ isOpen, onClose, extensionsToMove, sourceLocalityId }: MoveExtensionsDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const [moveMode, setMoveMode] = useState<'existing' | 'new'>('existing');
  const [zones, setZones] = useState<Omit<Zone, 'items'>[]>([]);
  const [localities, setLocalities] = useState<ZoneItem[]>([]);
  
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedLocalityId, setSelectedLocalityId] = useState('');
  const [newLocalityName, setNewLocalityName] = useState('');

  useEffect(() => {
    async function fetchInitialData() {
      if (isOpen) {
        const allZones = await getZonesAction();
        // Filter out the 'Missing Extensions' zone itself as a destination
        setZones(allZones.filter(z => z.id !== 'MissingExtensionsFromFeed'));
      }
    }
    fetchInitialData();
  }, [isOpen]);

  useEffect(() => {
    async function fetchLocalities() {
      if (selectedZoneId) {
        const items = await getZoneItemsAction(selectedZoneId);
        // We can only move to localities, so we filter for them
        setLocalities(items.filter(item => item.type === 'locality'));
        setSelectedLocalityId(''); // Reset locality selection when zone changes
      } else {
        setLocalities([]);
      }
    }
    fetchLocalities();
  }, [selectedZoneId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (moveMode === 'existing' && (!selectedZoneId || !selectedLocalityId)) {
        toast({ title: t('errorTitle'), description: t('selectZoneAndLocalityError'), variant: 'destructive' });
        return;
    }
    if (moveMode === 'new' && (!selectedZoneId || !newLocalityName.trim())) {
        toast({ title: t('errorTitle'), description: t('selectZoneAndNameError'), variant: 'destructive' });
        return;
    }

    startTransition(async () => {
      const result = await moveExtensionsAction({
        extensions: extensionsToMove,
        sourceLocalityId,
        destination: moveMode === 'new' 
            ? { type: 'new', zoneId: selectedZoneId, newLocalityName: newLocalityName.trim() }
            : { type: 'existing', localityId: selectedLocalityId }
      });

      if (result.success) {
        toast({ title: t('successTitle'), description: result.message });
        router.refresh();
        onClose();
      } else {
        toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}` : ''), variant: 'destructive', duration: 8000 });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('moveExtensionsDialogTitle', { count: extensionsToMove.length })}</DialogTitle>
          <DialogDescription>
            {t('moveExtensionsDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <RadioGroup value={moveMode} onValueChange={(value) => setMoveMode(value as 'existing' | 'new')} className="flex gap-4">
                <Label htmlFor="mode-existing" className="flex items-center gap-2 p-3 border rounded-md has-[:checked]:bg-accent has-[:checked]:border-primary cursor-pointer flex-1">
                    <RadioGroupItem value="existing" id="mode-existing" />
                    <MapPin className="h-4 w-4" />
                    {t('moveToExistingLocality')}
                </Label>
                <Label htmlFor="mode-new" className="flex items-center gap-2 p-3 border rounded-md has-[:checked]:bg-accent has-[:checked]:border-primary cursor-pointer flex-1">
                    <RadioGroupItem value="new" id="mode-new" />
                    <FolderPlus className="h-4 w-4" />
                    {t('moveToNewLocality')}
                </Label>
            </RadioGroup>

            <div className="space-y-2">
                <Label htmlFor="zone">{t('destinationZoneLabel')}</Label>
                <Select value={selectedZoneId} onValueChange={setSelectedZoneId} disabled={isPending}>
                    <SelectTrigger id="zone">
                        <SelectValue placeholder={t('selectZonePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {zones.map(zone => (
                            <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {moveMode === 'existing' && (
                <div className="space-y-2">
                    <Label htmlFor="locality">{t('destinationLocalityLabel')}</Label>
                    <Select value={selectedLocalityId} onValueChange={setSelectedLocalityId} disabled={isPending || !selectedZoneId || localities.length === 0}>
                        <SelectTrigger id="locality">
                            <SelectValue placeholder={t('selectLocalityPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {localities.map(loc => (
                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            
            {moveMode === 'new' && (
                <div className="space-y-2">
                    <Label htmlFor="newLocalityName">{t('newLocalityNameLabel')}</Label>
                    <Input id="newLocalityName" value={newLocalityName} onChange={(e) => setNewLocalityName(e.target.value)} disabled={isPending || !selectedZoneId} placeholder={t('enterNewLocalityNamePlaceholder')} />
                </div>
            )}

          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancelButton')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || !selectedZoneId}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('moveButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
