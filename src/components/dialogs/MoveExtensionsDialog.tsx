
'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
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
import { Loader2, AlertTriangle } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';

type MoveMode = 'existing' | 'create';

interface MoveExtensionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  extensionsToMove: Extension[];
  sourceLocalityId: string;
  onMoveSuccess: () => void;
}

export function MoveExtensionsDialog({ isOpen, onClose, extensionsToMove, sourceLocalityId, onMoveSuccess }: MoveExtensionsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);

  const [zones, setZones] = useState<Omit<Zone, 'items'>[]>([]);
  const [zoneItems, setZoneItems] = useState<ZoneItem[]>([]);

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [moveMode, setMoveMode] = useState<MoveMode>('existing');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [newLocalityName, setNewLocalityName] = useState('');

  useEffect(() => {
    async function fetchInitialData() {
      if (!isOpen) return;
      setIsLoading(true);
      try {
        const fetchedZones = await getZonesAction();
        setZones(fetchedZones.filter(z => z.id !== 'MissingExtensionsFromFeed'));
      } catch (error) {
        console.error("Failed to fetch zones:", error);
        toast({ title: t('fetchZonesError'), description: String(error) || t('fetchZonesError'), variant: 'destructive' });
      }
      setIsLoading(false);
    }
    fetchInitialData();
  }, [isOpen, toast, t]);

  useEffect(() => {
    async function fetchZoneItems() {
      if (!selectedZoneId || !isOpen) {
        setZoneItems([]);
        return;
      }
      setIsLoading(true);
      try {
        const items = await getZoneItemsAction(selectedZoneId);
        setZoneItems(items.filter(item => item.type === 'locality' || item.type === 'branch'));
      } catch (error) {
        console.error(`Failed to fetch items for zone ${selectedZoneId}:`, error);
        toast({ title: t('fetchLocalitiesError'), description: String(error) || t('fetchLocalitiesError'), variant: 'destructive' });
      }
      setIsLoading(false);
    }
    fetchZoneItems();
  }, [selectedZoneId, isOpen, toast, t]);
  
  // Use useMemo for derived state to prevent re-renders from causing loops
  const nameError = useMemo(() => {
    if (moveMode === 'create' && newLocalityName.trim()) {
        const nameExists = zoneItems.some(item => item.name.toLowerCase() === newLocalityName.trim().toLowerCase());
        if (nameExists) {
          return t('localityExistsError', { localityName: newLocalityName.trim() });
        }
    }
    return null;
  }, [newLocalityName, moveMode, zoneItems, t]);


  const handleZoneChange = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setSelectedItemId('');
    setNewLocalityName('');
  };
  
  const handleModeChange = (mode: MoveMode) => {
      setMoveMode(mode);
      setSelectedItemId('');
      setNewLocalityName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedZoneId) {
        toast({ title: t('errorTitle'), description: t('zoneSelectionRequired'), variant: 'destructive'});
        return;
    }
    
    if (moveMode === 'existing' && !selectedItemId) {
      toast({ title: t('errorTitle'), description: t('existingLocalitySelectionRequired'), variant: 'destructive'});
      return;
    }
    
    if (moveMode === 'create' && (!newLocalityName.trim() || nameError)) {
        toast({ title: t('errorTitle'), description: nameError || t('newLocalityNameRequired'), variant: 'destructive'});
        return;
    }
    
    startTransition(async () => {
        const selectedItem = zoneItems.find(item => item.id === selectedItemId);
        const isBranch = selectedItem?.type === 'branch';
        
        let destinationLocalityId = (moveMode === 'existing' && !isBranch) ? selectedItemId : undefined;
        let destinationBranchId = (moveMode === 'existing' && isBranch) ? selectedItemId : undefined;
        
        if (moveMode === 'create' && selectedItemId && isBranch) {
            destinationBranchId = selectedItemId;
        }

        const result = await moveExtensionsAction({
            extensionsToMove,
            sourceLocalityId,
            destinationZoneId: selectedZoneId,
            destinationLocalityId: destinationLocalityId,
            newLocalityName: moveMode === 'create' ? newLocalityName.trim() : undefined,
            destinationBranchId: destinationBranchId,
        });

        if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
            onMoveSuccess(); // Call the success callback
            onClose();
            router.refresh();
        } else {
            toast({ title: t('errorTitle'), description: result.message + (result.error ? ` ${t('detailsLabel')}: ${result.error}`: ''), variant: 'destructive', duration: 8000 });
        }
    });
  };
  
  const isSubmitDisabled = 
    isPending ||
    isLoading || // Also disable while loading zone items
    !selectedZoneId ||
    (moveMode === 'existing' && !selectedItemId) ||
    (moveMode === 'create' && (!newLocalityName.trim() || !!nameError));

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('moveExtensionsDialogTitle')}</DialogTitle>
          <DialogDescription>{t('moveExtensionsDialogDescription', { count: extensionsToMove.length })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          
          <div className="space-y-2">
            <Label htmlFor="dest-zone">{t('destinationZoneLabel')}</Label>
            <Select onValueChange={handleZoneChange} value={selectedZoneId} disabled={isPending || isLoading}>
              <SelectTrigger id="dest-zone" className="w-full">
                <SelectValue placeholder={t('selectZonePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {zones.map(zone => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedZoneId && !isLoading && (
            <div className="space-y-4 animate-in fade-in-0 duration-300">
                <RadioGroup value={moveMode} onValueChange={(value) => handleModeChange(value as MoveMode)} className="grid grid-cols-2 gap-4">
                    <div>
                        <RadioGroupItem value="existing" id="mode-existing" className="peer sr-only" />
                        <Label htmlFor="mode-existing" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                            {t('moveToExistingLabel')}
                        </Label>
                    </div>
                     <div>
                        <RadioGroupItem value="create" id="mode-create" className="peer sr-only" />
                        <Label htmlFor="mode-create" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                            {t('createNewLocalityOption')}
                        </Label>
                    </div>
                </RadioGroup>

                {moveMode === 'existing' && (
                    <div className="space-y-2 animate-in fade-in-0">
                        <Label htmlFor="dest-item">{t('destinationLocalityLabel')}</Label>
                        <Select onValueChange={setSelectedItemId} value={selectedItemId} disabled={isPending || isLoading || !selectedZoneId}>
                            <SelectTrigger id="dest-item" className="w-full">
                            <SelectValue placeholder={t('selectLocalityPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                            {zoneItems.map(item => <SelectItem key={item.id} value={item.id}>{item.name} ({item.type})</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                
                {moveMode === 'create' && (
                  <div className="space-y-2 animate-in fade-in-0">
                    <Label htmlFor="new-locality-name">{t('newLocalityNameLabel')}</Label>
                    <Input
                      id="new-locality-name"
                      placeholder={t('newLocalityNamePlaceholder')}
                      value={newLocalityName}
                      onChange={e => setNewLocalityName(e.target.value)}
                      disabled={isPending}
                    />
                    {nameError && (
                      <Alert variant="destructive" className="p-2 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{nameError}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
            </div>
          )}

          {selectedZoneId && isLoading && (
              <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
          )}

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>{t('cancelButton')}</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('moveButtonLabel')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
