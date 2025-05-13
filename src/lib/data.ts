
import type { Zone, Locality, Extension, ZoneItem, Branch, BranchItem } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { z } from 'zod';

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

// Helper to generate URL-friendly IDs from names, also used for extension IDs from their names
const toUrlFriendlyId = (name: string): string => {
  if (!name) return `unnamed-${Date.now()}`; // Handle cases where name might be undefined or empty
  return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
};

const IVOXS_DIR = path.join(process.cwd(), 'IVOXS');
const MAINMENU_PATH = path.join(IVOXS_DIR, 'MAINMENU.xml');
const ZONE_BRANCH_DIR = path.join(IVOXS_DIR, 'ZoneBranch');
const BRANCH_DIR = path.join(IVOXS_DIR, 'Branch'); 
const DEPARTMENT_DIR = path.join(IVOXS_DIR, 'Department');

// Schemas for parsing XML
const MenuItemSchema = z.object({
  Name: z.string().min(1),
  URL: z.string(),
});

export const CiscoIPPhoneMenuSchema = z.object({
  Title: z.string().optional(),
  Prompt: z.string().optional(),
  MenuItem: z.preprocess(ensureArray, z.array(MenuItemSchema).optional()),
});

const CiscoIPPhoneDirectoryEntrySchema = z.object({
  Name: z.string().min(1), 
  Telephone: z.string().min(1),
});

export const CiscoIPPhoneDirectorySchema = z.object({
  Title: z.string().optional(),
  Prompt: z.string().optional(),
  DirectoryEntry: z.preprocess(ensureArray, z.array(CiscoIPPhoneDirectoryEntrySchema).optional()),
});


async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`File not found: ${filePath}`);
      return ''; 
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace('.xml', '');
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'unknown' {
  if (url.includes('/branch/')) return 'branch';
  if (url.includes('/department/')) return 'locality';
  return 'unknown';
}


export async function getZones(): Promise<Omit<Zone, 'items'>[]> {
  const xmlContent = await readFileContent(MAINMENU_PATH);
  if (!xmlContent) return [];

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);

  if (!validated.success) {
    console.error("Failed to parse MAINMENU.xml:", validated.error.issues);
    return [];
  }

  const menuItems = validated.data.MenuItem || [];
  return menuItems.map(item => ({
    id: extractIdFromUrl(item.URL),
    name: item.Name,
  }));
}

export async function getZoneDetails(zoneId: string): Promise<Omit<Zone, 'items'> | undefined> {
  const zones = await getZones();
  return zones.find(z => z.id === zoneId);
}

export async function getZoneItems(zoneId: string): Promise<ZoneItem[]> {
  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
  const xmlContent = await readFileContent(zoneFilePath);
  if (!xmlContent) return [];

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);

  if (!validated.success) {
    console.error(`Failed to parse ZoneBranch XML for ${zoneId}:`, validated.error.issues);
    return [];
  }
  
  const menuItems = validated.data.MenuItem || [];
  return menuItems.map(item => {
    const itemType = getItemTypeFromUrl(item.URL);
    if (itemType === 'unknown') {
        console.warn(`Unknown URL type in ${zoneId}.xml for item ${item.Name}: ${item.URL}`);
    }
    return {
        id: extractIdFromUrl(item.URL),
        name: item.Name,
        type: itemType as 'branch' | 'locality', 
    };
  }).filter(item => item.type === 'branch' || item.type === 'locality'); 
}


export async function getBranchDetails(zoneId: string, branchId: string): Promise<Omit<Branch, 'items'> | undefined> {
    const zoneItems = await getZoneItems(zoneId);
    const branchInfo = zoneItems.find(item => item.id === branchId && item.type === 'branch');
    if (!branchInfo) return undefined;
    return { id: branchInfo.id, name: branchInfo.name, zoneId };
}

export async function getBranchItems(branchId: string): Promise<BranchItem[]> {
  const branchFilePath = path.join(BRANCH_DIR, `${branchId}.xml`);
  const xmlContent = await readFileContent(branchFilePath);
  if (!xmlContent) return [];

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);

  if (!validated.success) {
    console.error(`Failed to parse Branch XML for ${branchId}:`, validated.error.issues);
    return [];
  }

  const menuItems = validated.data.MenuItem || [];
  return menuItems.map(item => ({
    id: extractIdFromUrl(item.URL),
    name: item.Name,
    type: 'locality', 
  }));
}

export async function getLocalityDetails(
  localityId: string, 
  context?: { zoneId?: string; branchId?: string }
): Promise<Omit<Locality, 'extensions'> | undefined> {
  let localityName = localityId; 

  if (context?.branchId && context?.zoneId) { 
    const branchItems = await getBranchItems(context.branchId);
    const itemInfo = branchItems.find(item => item.id === localityId);
    if (itemInfo) localityName = itemInfo.name;
  } else if (context?.zoneId) { 
    const zoneItems = await getZoneItems(context.zoneId);
    const itemInfo = zoneItems.find(item => item.id === localityId && item.type === 'locality');
     if (itemInfo) localityName = itemInfo.name;
  }
  
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  const departmentXmlContent = await readFileContent(departmentFilePath);
  if (departmentXmlContent) {
      try {
        const parsedDeptXml = await parseStringPromise(departmentXmlContent, { explicitArray: false, trim: true });
        const validatedDept = CiscoIPPhoneDirectorySchema.safeParse(parsedDeptXml.CiscoIPPhoneDirectory);
        if (validatedDept.success && validatedDept.data.Title) {
            localityName = validatedDept.data.Title;
        }
      } catch (e) {
        console.warn(`Could not parse title from ${departmentFilePath}`, e);
      }
  }

  return { id: localityId, name: localityName };
}


export async function getLocalityWithExtensions(localityId: string): Promise<Locality | undefined> {
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  const xmlContent = await readFileContent(departmentFilePath);
  if (!xmlContent) return undefined;

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneDirectorySchema.safeParse(parsedXml.CiscoIPPhoneDirectory);

  if (!validated.success) {
    console.error(`Failed to parse Department XML for ${localityId}:`, validated.error.issues);
    return undefined;
  }
  
  const title = validated.data.Title || localityId; 
  const directoryEntries = validated.data.DirectoryEntry || [];
  const extensions: Extension[] = directoryEntries.map(entry => ({
    id: toUrlFriendlyId(`${entry.Name}-${entry.Telephone}`), 
    department: entry.Name,
    number: entry.Telephone,
  }));

  return {
    id: localityId,
    name: title,
    extensions,
  };
}

export interface SearchableLocality {
  id: string; // Unique ID for React key, e.g. zoneId-localityId or zoneId-branchId-localityId
  localityName: string;
  localityId: string;
  zoneName: string;
  zoneId: string;
  branchName?: string;
  branchId?: string;
  path: string; // URL path to the locality page
}

export async function getAllLocalitiesForSearch(): Promise<SearchableLocality[]> {
  const allSearchableLocalities: SearchableLocality[] = [];
  const zones = await getZones(); 

  for (const zone of zones) {
    const zoneItems = await getZoneItems(zone.id); 

    for (const zoneItem of zoneItems) {
      if (zoneItem.type === 'locality') {
        // Fetch full locality details to ensure we get the display name
        const localityDetails = await getLocalityDetails(zoneItem.id, { zoneId: zone.id });
        if (localityDetails) {
            allSearchableLocalities.push({
              id: `${zone.id}-${localityDetails.id}`,
              localityName: localityDetails.name,
              localityId: localityDetails.id,
              zoneName: zone.name,
              zoneId: zone.id,
              path: `/${zone.id}/localities/${localityDetails.id}`
            });
        }
      } else if (zoneItem.type === 'branch') {
        const branchItems = await getBranchItems(zoneItem.id); 
        for (const branchItem of branchItems) { 
          const localityDetails = await getLocalityDetails(branchItem.id, { zoneId: zone.id, branchId: zoneItem.id });
          if (localityDetails) {
            allSearchableLocalities.push({
              id: `${zone.id}-${zoneItem.id}-${localityDetails.id}`,
              localityName: localityDetails.name,
              localityId: localityDetails.id,
              zoneName: zone.name,
              zoneId: zone.id,
              branchName: zoneItem.name, 
              branchId: zoneItem.id,     
              path: `/${zone.id}/branches/${zoneItem.id}/localities/${localityDetails.id}`
            });
          }
        }
      }
    }
  }
  // Deduplicate based on the unique ID
  const uniqueLocalities = Array.from(new Map(allSearchableLocalities.map(item => [item.id, item])).values());
  return uniqueLocalities;
}

    