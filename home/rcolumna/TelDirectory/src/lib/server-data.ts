
'use server';

import { getZones, getZoneItems } from '@/lib/data';
import type { Zone, ZoneItem } from '@/types';

// This file contains server actions that can be safely called from client components.
// They wrap the file-system-accessing functions from `data.ts`.

export async function getZonesAction(): Promise<Omit<Zone, 'items'>[]> {
  return getZones();
}

export async function getZoneItemsAction(zoneId: string): Promise<ZoneItem[]> {
  return getZoneItems(zoneId);
}
