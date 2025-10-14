
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
import { getZones, getZoneItems } from '@/lib/data';
import { moveExtensionsAction } from '@/lib/actions';
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
  const [localities, setLocalities] = useState<ZoneItem[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedLocalityId, setSelectedLocalityId] = useState('');
  const [newLocalityName, setNewLocalityName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchInitialData() {
      setIsLoading(true);
      try {
        const fetchedZones = await getZones();
        // Exclude the 'Missing Extensions' zone from the destination options
        setZones(fetchedZones.filter(z => z.id !== 'MissingExtensionsFromFeed'));
      } catch (error) {
        console.error("Failed to fetch zones:", error);
        toast({ title: t('errorTitle'), description: t('fetchZonesError'), variant: 'destructive' });
      }
      setIsLoading(false);
    }
    if (isOpen) {
      fetchInitialData();
    }
  }, [isOpen, t, toast]);

  useEffect(() => {
    async function fetchLocalities() {
      if (!selectedZoneId) {
        setLocalities([]);
        return;
      }
      setIsLoading(true);
      try {
        const items = await getZoneItems(selectedZoneId);
        // We only want localities/branches as potential destinations
        setLocalities(items.filter(item => item.type === 'locality' || item.type === 'branch'));
      } catch (error) {
        console.error(`Failed to fetch localities for zone ${selectedZoneId}:`, error);
        toast({ title: t('errorTitle'), description: t('fetchLocalitiesError'), variant: 'destructive' });
      }
      setIsLoading(false);
    }
    fetchLocalities();
  }, [selectedZoneId, t, toast]);

  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setSelectedLocalityId('');
    setNewLocalityName('');
  };
  
  const handleLocalityChange = (localityId: string) => {
      setSelectedLocalityId(localityId);
      if (localityId !== CREATE_NEW_LOCALITY_VALUE) {
          setNewLocalityName('');
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedZoneId) {
        toast({ title: t('errorTitle'), description: t('zoneSelectionRequired'), variant: 'destructive'});
        return;
    }
    if (!selectedLocalityId) {
        toast({ title: t('errorTitle'), description: t('localitySelectionRequired'), variant: 'destructive'});
        return;
    }
    if (selectedLocalityId === CREATE_NEW_LOCALITY_VALUE && !newLocalityName.trim()) {
        toast({ title: t('errorTitle'), description: t('newLocalityNameRequired'), variant: 'destructive'});
        return;
    }
    
    startTransition(async () => {
        const result = await moveExtensionsAction({
            extensionsToMove,
            sourceLocalityId,
            destinationZoneId: selectedZoneId,
            destinationLocalityId: selectedLocalityId === CREATE_NEW_LOCALITY_VALUE ? undefined : selectedLocalityId,
            newLocalityName: newLocalityName.trim() || undefined,
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
              <Label htmlFor="dest-locality">{t('destinationLocalityLabel')}</Label>
              <Select onValueChange={handleLocalityChange} value={selectedLocalityId} disabled={isPending || isLoading || !selectedZoneId}>
                <SelectTrigger id="dest-locality">
                  <SelectValue placeholder={t('selectLocalityPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CREATE_NEW_LOCALITY_VALUE}>{t('createNewLocalityOption')}</SelectItem>
                  <hr className="my-1" />
                  {localities.map(item => <SelectItem key={item.id} value={item.id}>{item.name} ({item.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedLocalityId === CREATE_NEW_LOCALITY_VALUE && (
            <div className="space-y-2 pl-2 border-l-2 border-primary">
              <Label htmlFor="new-locality-name">{t('newLocalityNameLabel')}</Label>
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
            <Button type="submit" disabled={isPending || !selectedZoneId || !selectedLocalityId}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('moveButtonLabel')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
