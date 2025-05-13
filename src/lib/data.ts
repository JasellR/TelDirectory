
import type { Zone, Locality, Extension } from '@/types';
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
const DEPARTMENT_DIR = path.join(IVOXS_DIR, 'Department');

// Schemas for parsing XML (adapted from import-xml/actions.ts)
const MenuItemSchema = z.object({
  Name: z.string().min(1),
  URL: z.string(),
});

const CiscoIPPhoneMenuSchema = z.object({
  Title: z.string().optional(),
  Prompt: z.string().optional(),
  MenuItem: z.preprocess(ensureArray, z.array(MenuItemSchema).optional()),
});

const CiscoIPPhoneDirectoryEntrySchema = z.object({
  Name: z.string().min(1),
  Telephone: z.string().min(1),
});

const CiscoIPPhoneDirectorySchema = z.object({
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
      return ''; // Return empty string if file not found, so parsing can handle it
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error; // Re-throw other errors
  }
}

function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace('.xml', '');
}

export async function getZones(): Promise<Zone[]> {
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
    localities: [], // Localities will be fetched on demand by getZoneById
  }));
}

export async function getZoneById(zoneId: string): Promise<Zone | undefined> {
  const zones = await getZones(); // This gets names and IDs from MAINMENU.xml
  const zoneInfo = zones.find(z => z.id === zoneId);

  if (!zoneInfo) return undefined;

  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
  const xmlContent = await readFileContent(zoneFilePath);
  if (!xmlContent) return { ...zoneInfo, localities: [] }; // Return zone with empty localities if file is missing

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);

  if (!validated.success) {
    console.error(`Failed to parse ZoneBranch XML for ${zoneId}:`, validated.error.issues);
    return { ...zoneInfo, localities: [] };
  }
  
  const title = validated.data.Title || zoneInfo.name; // Prefer title from XML, fallback to name from MAINMENU

  const menuItems = validated.data.MenuItem || [];
  const localities: Locality[] = menuItems.map(item => ({
    id: extractIdFromUrl(item.URL),
    name: item.Name,
    extensions: [], // Extensions will be fetched on demand by getLocalityById
  }));

  return {
    id: zoneId,
    name: title,
    localities,
  };
}

export async function getLocalitiesByZoneId(zoneId: string): Promise<Locality[]> {
  const zone = await getZoneById(zoneId);
  return zone?.localities || [];
}

export async function getLocalityById(zoneId: string, localityId: string): Promise<Locality | undefined> {
  const zone = await getZoneById(zoneId); // This gets locality names and IDs from ZoneBranch/[zoneId].xml
  const localityInfo = zone?.localities.find(l => l.id === localityId);

  if (!localityInfo) return undefined;

  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  const xmlContent = await readFileContent(departmentFilePath);
  if (!xmlContent) return { ...localityInfo, extensions: [] };

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneDirectorySchema.safeParse(parsedXml.CiscoIPPhoneDirectory);

  if (!validated.success) {
    console.error(`Failed to parse Department XML for ${localityId}:`, validated.error.issues);
    return { ...localityInfo, extensions: [] };
  }
  
  const title = validated.data.Title || localityInfo.name; // Prefer title from XML

  const directoryEntries = validated.data.DirectoryEntry || [];
  const extensions: Extension[] = directoryEntries.map(entry => ({
    id: toUrlFriendlyId(`${entry.Name}-${entry.Telephone}`), // Generate an ID
    department: entry.Name,
    number: entry.Telephone,
    // name field (contact person) is not in this XML structure
  }));

  return {
    id: localityId,
    name: title,
    extensions,
  };
}

export async function getExtensionsByLocalityId(zoneId: string, localityId: string): Promise<Extension[]> {
  const locality = await getLocalityById(zoneId, localityId);
  return locality?.extensions || [];
}

// findLocalityByIdGlobally might be inefficient as it has to read multiple zone files
// For now, it relies on the API routes to serve specific department XMLs directly
export async function findLocalityByIdGlobally(localityId: string): Promise<Locality | undefined> {
  // This function would need to know which zone a localityId belongs to,
  // or iterate through all zone XMLs, then all department XMLs.
  // Given the new file structure, the department XML is directly accessible if localityId is known.
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  const xmlContent = await readFileContent(departmentFilePath);
  if (!xmlContent) return undefined;

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneDirectorySchema.safeParse(parsedXml.CiscoIPPhoneDirectory);

  if (!validated.success) {
    console.error(`Failed to parse Department XML for ${localityId} (globally):`, validated.error.issues);
    return undefined;
  }

  const title = validated.data.Title || localityId; // Fallback to ID if title missing
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
