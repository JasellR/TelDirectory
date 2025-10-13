
'use server';
// This file is intended to expose server-side data fetching functions to the client
// in a safe way, without leaking server-only modules. It acts as a server action layer.

import { getZones, getZoneItems } from './server-data';
import type { Zone, ZoneItem } from '@/types';

export async function getZonesForClient(): Promise<Omit<Zone, 'items'>[]> {
  return getZones();
}

export async function getZoneItemsForClient(zoneId: string): Promise<ZoneItem[]> {
  return getZoneItems(zoneId);
}
