
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
import { moveExtensionAction } from '@/lib/actions';
import { getZonesForClient, getZoneItemsForClient } from '@/lib/client-data';
import type { Extension, Zone, ZoneItem } from '@/types';
import { useRouter } from 'next/navigation';
import { Loader2, PlusCircle, ChevronsRight, Move } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface MoveExtensionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  extension: Extension;
}

type MoveMode = 'existing' | 'new';

export function MoveExtensionDialog({ isOpen, onClose, extension }: MoveExtensionDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const [zones, setZones] = useState<Zone[]>([]);
  const [localities, setLocalities] = useState<ZoneItem[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [selectedLocality, setSelectedLocality] = useState<string>('');
  const [newLocalityName, setNewLocalityName] = useState('');
  const [moveMode, setMoveMode] = useState<MoveMode>('existing');

  useEffect(() => {
    if (isOpen) {
      const fetchInitialData = async () => {
        const fetchedZones = await getZonesForClient();
        // Filter out the 'Missing Extensions' zone as a destination
        setZones(fetchedZones.filter(z => z.id !== 'MissingExtensionsFromFeed'));
      };
      fetchInitialData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedZone) {
      const fetchLocalities = async () => {
        setLocalities([]);
        setSelectedLocality('');
        const items = await getZoneItemsForClient(selectedZone);
        // We only want to move to localities, not branches, in this simplified flow.
        setLocalities(items.filter(item => item.type === 'locality'));
      };
      fetchLocalities();
    }
  }, [selectedZone]);

  const resetForm = () => {
    setSelectedZone('');
    setSelectedLocality('');
    setNewLocalityName('');
    setLocalities([]);
    setMoveMode('existing');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    let destination: { mode: MoveMode; zoneId: string; localityId?: string; newLocalityName?: string; };

    if (moveMode === 'existing') {
        if (!selectedZone || !selectedLocality) {
            toast({ title: t('errorTitle'), description: t('zoneAndLocalityRequiredError'), variant: 'destructive'});
            return;
        }
        destination = { mode: 'existing', zoneId: selectedZone, localityId: selectedLocality };
    } else { // 'new' mode
        if (!selectedZone || !newLocalityName.trim()) {
            toast({ title: t('errorTitle'), description: t('zoneAndNewLocalityNameRequiredError'), variant: 'destructive' });
            return;
        }
        destination = { mode: 'new', zoneId: selectedZone, newLocalityName: newLocalityName.trim() };
    }
    
    startTransition(async () => {
        const result = await moveExtensionAction(extension, destination);
        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            router.refresh();
            handleClose();
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}`: ''), variant: 'destructive'});
        }
    });
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('moveExtensionDialogTitle', { extensionName: extension.name, extensionNumber: extension.number })}</DialogTitle>
          <DialogDescription>
            {t('moveExtensionDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
             <div className="space-y-2">
                <Label>{t('destinationZoneLabel')}</Label>
                <Select value={selectedZone} onValueChange={setSelectedZone} required>
                    <SelectTrigger>
                        <SelectValue placeholder={t('selectZonePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {zones.map((zone) => (
                            <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <RadioGroup value={moveMode} onValueChange={(value) => setMoveMode(value as MoveMode)} className="flex space-x-4">
                 <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="r-existing" />
                    <Label htmlFor="r-existing" className="font-normal">{t('moveToExistingLocality')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="new" id="r-new" />
                    <Label htmlFor="r-new" className="font-normal">{t('createNewLocality')}</Label>
                </div>
            </RadioGroup>

            {moveMode === 'existing' ? (
                <div className="space-y-2 pl-2 border-l-2 ml-3">
                    <Label htmlFor="locality">{t('destinationLocalityLabel')}</Label>
                    <Select value={selectedLocality} onValueChange={setSelectedLocality} required disabled={!selectedZone || localities.length === 0}>
                        <SelectTrigger id="locality">
                            <SelectValue placeholder={t('selectLocalityPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {localities.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <div className="space-y-2 pl-2 border-l-2 ml-3">
                    <Label htmlFor="newLocalityName">{t('newLocalityNameLabel')}</Label>
                    <Input 
                        id="newLocalityName"
                        value={newLocalityName}
                        onChange={(e) => setNewLocalityName(e.target.value)}
                        placeholder={t('localityNamePlaceholder')}
                        disabled={!selectedZone}
                        required
                    />
                </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t('cancelButton')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || !selectedZone}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Move className="mr-2 h-4 w-4" />}
              {t('moveExtensionButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
