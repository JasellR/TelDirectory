
import type { Zone, Locality, Extension, ZoneItem, Branch, BranchItem } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { z } from 'zod';
import { getResolvedIvoxsRootPath } from '@/lib/config';

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

// Helper to generate URL-friendly IDs from names, also used for extension IDs from their names
const toUrlFriendlyId = (name: string): string => {
  if (!name) return `unnamed-${Date.now()}`;
  return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
};

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

// Dynamic path getters
async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_PATH: path.join(ivoxsRoot, 'MainMenu.xml'), // PascalCase
    ZONE_BRANCH_DIR: path.join(ivoxsRoot, 'zonebranch'), // lowercase
    BRANCH_DIR: path.join(ivoxsRoot, 'branch'),         // lowercase
    DEPARTMENT_DIR: path.join(ivoxsRoot, 'department'), // lowercase
  };
}


async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // console.warn(`File not found: ${filePath}`); // Reduced verbosity here
      return '';
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error; // Re-throw other errors
  }
}

function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, ''); // Case-insensitive .xml removal
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'unknown' {
  if (url.includes('/branch/')) return 'branch';
  if (url.includes('/department/')) return 'locality';
  return 'unknown';
}


export async function getZones(): Promise<Omit<Zone, 'items'>[]> {
  const paths = await getPaths();
  const xmlContent = await readFileContent(paths.MAINMENU_PATH);
  if (!xmlContent) return [];

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);

  if (!validated.success) {
    console.error("Failed to parse MainMenu.xml:", validated.error.issues);
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
  const paths = await getPaths();
  const zoneFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
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
        type: itemType as 'branch' | 'locality', // Assume it's one of these if not unknown
    };
  }).filter(item => item.type === 'branch' || item.type === 'locality'); // Ensure only valid types
}


export async function getBranchDetails(zoneId: string, branchId: string): Promise<Omit<Branch, 'items'> | undefined> {
    const zoneItems = await getZoneItems(zoneId);
    const branchInfo = zoneItems.find(item => item.id === branchId && item.type === 'branch');
    if (!branchInfo) return undefined;
    return { id: branchInfo.id, name: branchInfo.name, zoneId };
}

export async function getBranchItems(branchId: string): Promise<BranchItem[]> {
  const paths = await getPaths();
  const branchFilePath = path.join(paths.BRANCH_DIR, `${branchId}.xml`);
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
    type: 'locality', // Items under a branch are always localities leading to departments
  }));
}

export async function getLocalityDetails(
  localityId: string,
  context?: { zoneId?: string; branchId?: string }
): Promise<Omit<Locality, 'extensions'> | undefined> {
  const paths = await getPaths();
  let localityName = localityId; // Default to ID if name isn't found

  // Try to find a more descriptive name from parent menus first
  if (context?.branchId && context?.zoneId) {
    const branchItems = await getBranchItems(context.branchId);
    const itemInfo = branchItems.find(item => item.id === localityId);
    if (itemInfo) localityName = itemInfo.name;
  } else if (context?.zoneId) {
    const zoneItems = await getZoneItems(context.zoneId);
    const itemInfo = zoneItems.find(item => item.id === localityId && item.type === 'locality');
     if (itemInfo) localityName = itemInfo.name;
  }

  // Then, try to get the title from the department XML itself, which might be more authoritative
  const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
  const departmentXmlContent = await readFileContent(departmentFilePath);
  if (departmentXmlContent) {
      try {
        const parsedDeptXml = await parseStringPromise(departmentXmlContent, { explicitArray: false, trim: true });
        const validatedDept = CiscoIPPhoneDirectorySchema.safeParse(parsedDeptXml.CiscoIPPhoneDirectory);
        if (validatedDept.success && validatedDept.data.Title) {
            localityName = validatedDept.data.Title; // Prefer Title from the department file itself
        }
      } catch (e) {
        console.warn(`Could not parse title from ${departmentFilePath}`, e);
      }
  }

  return { id: localityId, name: localityName };
}


export async function getLocalityWithExtensions(localityId: string): Promise<Locality | undefined> {
  const paths = await getPaths();
  const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
  const xmlContent = await readFileContent(departmentFilePath);
  if (!xmlContent) return undefined;

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  const validated = CiscoIPPhoneDirectorySchema.safeParse(parsedXml.CiscoIPPhoneDirectory);

  if (!validated.success) {
    console.error(`Failed to parse Department XML for ${localityId}:`);
    console.error("Data passed to Zod:", JSON.stringify(parsedXml.CiscoIPPhoneDirectory, null, 2));
    console.error("Zod Errors:", JSON.stringify(validated.error.flatten(), null, 2));
    return undefined;
  }

  const title = validated.data.Title || localityId; // Fallback to localityId if Title is missing
  const directoryEntries = validated.data.DirectoryEntry || [];
  const extensions: Extension[] = directoryEntries.map(entry => ({
    id: toUrlFriendlyId(`${entry.Name}-${entry.Telephone}`), // Ensure unique ID for React keys
    department: entry.Name,
    number: entry.Telephone,
    name: entry.Name, // Often the same as department in this context
  }));

  return {
    id: localityId,
    name: title,
    extensions,
  };
}

