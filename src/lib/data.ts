import 'server-only';
import type { Zone, Locality, Extension, ZoneItem, Branch, BranchItem } from '@/types';
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { 
    getZones as getZonesFromServer,
    getZoneDetails as getZoneDetailsFromServer,
    getZoneItems as getZoneItemsFromServer,
    getBranchDetails as getBranchDetailsFromServer,
    getBranchItems as getBranchItemsFromServer,
    getLocalityDetails as getLocalityDetailsFromServer,
    getLocalityWithExtensions as getLocalityWithExtensionsFromServer
} from './server-data';

// This file now serves as a pass-through to the server-only data fetching functions.
// This ensures that no server-side modules like 'fs' are ever imported into client components.

export async function getZones(): Promise<Omit<Zone, 'items'>[]> {
  return getZonesFromServer();
}

export async function getZoneDetails(zoneId: string): Promise<Omit<Zone, 'items'> | undefined> {
  return getZoneDetailsFromServer(zoneId);
}

export async function getZoneItems(zoneId: string): Promise<ZoneItem[]> {
  return getZoneItemsFromServer(zoneId);
}

export async function getBranchDetails(zoneId: string, branchId: string): Promise<Omit<Branch, 'items'> | undefined> {
    return getBranchDetailsFromServer(zoneId, branchId);
}

export async function getBranchItems(branchId: string): Promise<BranchItem[]> {
  return getBranchItemsFromServer(branchId);
}

export async function getLocalityDetails(
  localityId: string,
  context?: { zoneId?: string; branchId?: string }
): Promise<Omit<Locality, 'extensions'> | undefined> {
  return getLocalityDetailsFromServer(localityId, context);
}

export async function getLocalityWithExtensions(localityId: string): Promise<Locality | undefined> {
    return getLocalityWithExtensionsFromServer(localityId);
}
