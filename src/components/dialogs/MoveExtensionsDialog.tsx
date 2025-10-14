
'use client';

import { useState, useEffect, useTransition } from 'react';
import type { Extension, Zone, ZoneItem } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getZonesAction, getZoneItemsAction, moveExtensionsAction } from '@/lib/actions';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MoveExtensionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  extensionsToMove: Extension[];
  sourceLocalityId: string;
}

const CREATE_NEW_LOCALITY_VALUE = '__CREATE_NEW__';

export function MoveExtensionsDialog({ isOpen, onClose, extensionsToMove, sourceLocalityId }: MoveExtensionsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [zones, setZones] = useState<Omit<Zone, 'items'>[]>([]);
  const [zoneItems, setZoneItems] = useState<ZoneItem[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(''); // Can be locality or branch
  const [newLocalityName, setNewLocalityName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchInitialData() {
      if (!isOpen) return;
      setIsLoading(true);
      try {
        const fetchedZones = await getZonesAction();
        setZones(fetchedZones.filter(z => z.id !== 'MissingExtensionsFromFeed'));
      } catch (error) {
        console.error("Failed to fetch zones:", error);
        toast({ title: t('errorTitle'), description: t('fetchZonesError'), variant: 'destructive' });
      }
      setIsLoading(false);
    }
    fetchInitialData();
  }, [isOpen]);

  useEffect(() => {
    async function fetchZoneItems() {
      if (!selectedZoneId) {
        setZoneItems([]);
        return;
      }
      setIsLoading(true);
      try {
        const items = await getZoneItemsAction(selectedZoneId);
        setZoneItems(items.filter(item => item.type === 'locality' || item.type === 'branch'));
      } catch (error) {
        console.error(`Failed to fetch items for zone ${selectedZoneId}:`, error);
        toast({ title: t('errorTitle'), description: t('fetchLocalitiesError'), variant: 'destructive' });
      }
      setIsLoading(false);
    }
    fetchZoneItems();
  }, [selectedZoneId]);

  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setSelectedItemId('');
    setNewLocalityName('');
  };
  
  const handleItemChange = (itemId: string) => {
      setSelectedItemId(itemId);
      if (itemId !== CREATE_NEW_LOCALITY_VALUE) {
          setNewLocalityName('');
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedZoneId) {
        toast({ title: t('errorTitle'), description: t('zoneSelectionRequired'), variant: 'destructive'});
        return;
    }
    if (!selectedItemId) {
        toast({ title: t('errorTitle'), description: t('localitySelectionRequired'), variant: 'destructive'});
        return;
    }
    if (selectedItemId === CREATE_NEW_LOCALITY_VALUE && !newLocalityName.trim()) {
        toast({ title: t('errorTitle'), description: t('newLocalityNameRequired'), variant: 'destructive'});
        return;
    }
    
    startTransition(async () => {
        const selectedItem = zoneItems.find(item => item.id === selectedItemId);
        const isBranch = selectedItem?.type === 'branch';

        const result = await moveExtensionsAction({
            extensionsToMove,
            sourceLocalityId,
            destinationZoneId: selectedZoneId,
            destinationLocalityId: !isBranch && selectedItemId !== CREATE_NEW_LOCALITY_VALUE ? selectedItemId : undefined,
            newLocalityName: newLocalityName.trim() || undefined,
            destinationBranchId: isBranch ? selectedItemId : undefined,
        });

        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            router.refresh();
            onClose();
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}`: ''), variant: 'destructive' });
        }
    });
  };
  
  const isCreatingNewInBranch = zoneItems.find(item => item.id === selectedItemId)?.type === 'branch' && newLocalityName.trim() !== '';

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('moveExtensionsDialogTitle')}</DialogTitle>
          <DialogDescription>{t('moveExtensionsDialogDescription', { count: extensionsToMove.length })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="dest-zone">{t('destinationZoneLabel')}</Label>
            <Select onValueChange={handleZoneChange} value={selectedZoneId} disabled={isPending || isLoading}>
              <SelectTrigger id="dest-zone">
                <SelectValue placeholder={t('selectZonePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {zones.map(zone => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedZoneId && (
            <div className="space-y-2">
              <Label htmlFor="dest-item">{t('destinationLocalityLabel')}</Label>
              <Select onValueChange={handleItemChange} value={selectedItemId} disabled={isPending || isLoading || !selectedZoneId}>
                <SelectTrigger id="dest-item">
                  <SelectValue placeholder={t('selectLocalityPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CREATE_NEW_LOCALITY_VALUE}>{t('createNewLocalityOption')}</SelectItem>
                  <hr className="my-1" />
                  {zoneItems.map(item => <SelectItem key={item.id} value={item.id}>{item.name} ({item.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {(selectedItemId === CREATE_NEW_LOCALITY_VALUE || isCreatingNewInBranch) && (
            <div className="space-y-2 pl-2 border-l-2 border-primary animate-in fade-in-0">
              <Label htmlFor="new-locality-name">
                {isCreatingNewInBranch
                    ? `New Locality Name in Branch '${zoneItems.find(item => item.id === selectedItemId)?.name}'`
                    : t('newLocalityNameLabel')
                }
              </Label>
              <Input
                id="new-locality-name"
                placeholder={t('newLocalityNamePlaceholder')}
                value={newLocalityName}
                onChange={e => setNewLocalityName(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>{t('cancelButton')}</Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || !selectedZoneId || !selectedItemId || (selectedItemId === CREATE_NEW_LOCALITY_VALUE && !newLocalityName.trim())}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('moveButtonLabel')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
