
import type { Zone, Locality, Extension, ZoneItem, Branch, BranchItem } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { z } from 'zod';
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth-actions';


const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

const toUrlFriendlyId = (name: string): string => {
  if (!name) return `unnamed-${Date.now()}`;
  return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
};

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

async function findFileCaseInsensitive(directory: string, filename: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseFilename = filename.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseFilename) {
                return file;
            }
        }
        return null;
    } catch (error: any) {
        return null;
    }
}

async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  const mainMenuFilename = await findFileCaseInsensitive(ivoxsRoot, 'mainmenu.xml');
  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_FILENAME: mainMenuFilename,
    MAINMENU_PATH: mainMenuFilename ? path.join(ivoxsRoot, mainMenuFilename) : null,
    ZONE_BRANCH_DIR: path.join(ivoxsRoot, 'zonebranch'),
    BRANCH_DIR: path.join(ivoxsRoot, 'branch'),
    DEPARTMENT_DIR: path.join(ivoxsRoot, 'department'),
  };
}

async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, '');
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'zone' | 'unknown' | 'pagination' {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('/ivoxsdir/branch/')) return 'branch';
    if (lowerUrl.includes('/ivoxsdir/department/')) return 'locality';
    if (lowerUrl.includes('/ivoxsdir/zonebranch/')) return 'zone';

    const urlParts = url.split('/').filter(p => p && !p.startsWith('http'));
    if(urlParts.length === 2 && urlParts[1].startsWith(urlParts[0]) && urlParts[1] !== urlParts[0]) {
        return 'pagination';
    }
    return 'unknown';
}

export async function getZones(): Promise<Omit<Zone, 'items'>[]> {
  const paths = await getPaths();
  let zones: Omit<Zone, 'items'>[] = [];

  if (paths.MAINMENU_PATH) {
      const xmlContent = await readFileContent(paths.MAINMENU_PATH);
      if (xmlContent) {
          try {
              const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
              if (parsedXml && parsedXml.CiscoIPPhoneMenu) {
                  const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);
                  if (validated.success) {
                      const menuItems = validated.data.MenuItem || [];
                      zones = menuItems.map(item => ({
                          id: extractIdFromUrl(item.URL),
                          name: item.Name,
                      }));
                  }
              }
          } catch(e) {}
      }
  }
  
  const userIsAuthenticated = await isAuthenticated();
  if (userIsAuthenticated) {
      const missingExtensionsZoneFile = path.join(paths.ZONE_BRANCH_DIR, 'MissingExtensionsFromFeed.xml');
      try {
          await fs.access(missingExtensionsZoneFile);
          if (!zones.some(z => z.id === 'MissingExtensionsFromFeed')) {
              zones.push({ id: 'MissingExtensionsFromFeed', name: 'Missing Extensions from Feed' });
          }
      } catch (error) {}
  }

  return zones;
}

export async function getZoneDetails(zoneId: string): Promise<Omit<Zone, 'items'> | undefined> {
  const zones = await getZones();
  return zones.find(z => z.id === zoneId);
}

export async function getZoneItems(zoneId: string): Promise<ZoneItem[]> {
  const { ZONE_BRANCH_DIR } = await getPaths();
  let allItems: ZoneItem[] = [];
  let currentFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
  const visitedFiles = new Set<string>();

  while (currentFilePath && !visitedFiles.has(currentFilePath)) {
    visitedFiles.add(currentFilePath);
    const xmlContent = await readFileContent(currentFilePath);
    if (!xmlContent) break;

    try {
      const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
      if (!parsedXml || !parsedXml.CiscoIPPhoneMenu) break;
      const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);
      if (!validated.success) break;

      const menuItems = validated.data.MenuItem || [];
      let nextFileUrl: string | null = null;
      
      for (const item of menuItems) {
        if (item.Name === 'Siguiente >>') { nextFileUrl = item.URL; continue; }
        if (item.Name === '<< Anterior') continue;
        const itemType = getItemTypeFromUrl(item.URL);
        if (itemType === 'branch' || itemType === 'locality') {
           allItems.push({ id: extractIdFromUrl(item.URL), name: item.Name, type: itemType });
        }
      }
      currentFilePath = nextFileUrl ? path.join(ZONE_BRANCH_DIR, `${extractIdFromUrl(nextFileUrl)}.xml`) : '';
    } catch (e) { currentFilePath = ''; }
  }
  allItems.sort((a, b) => a.name.localeCompare(b.name));
  return allItems;
}

export async function getBranchDetails(zoneId: string, branchId: string): Promise<Omit<Branch, 'items'> | undefined> {
    const zoneItems = await getZoneItems(zoneId);
    const branchInfo = zoneItems.find(item => item.id === branchId && item.type === 'branch');
    if (!branchInfo) return undefined;
    return { id: branchInfo.id, name: branchInfo.name, zoneId };
}

export async function getBranchItems(branchId: string): Promise<BranchItem[]> {
  const { BRANCH_DIR } = await getPaths();
  const branchFilePath = path.join(BRANCH_DIR, `${branchId}.xml`);
  const xmlContent = await readFileContent(branchFilePath);
  if (!xmlContent) return [];

  try {
      const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
      if (!parsedXml || !parsedXml.CiscoIPPhoneMenu) return [];
      const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);
      if (!validated.success) return [];
      const menuItems = validated.data.MenuItem || [];
      return menuItems.map(item => ({ id: extractIdFromUrl(item.URL), name: item.Name, type: 'locality' }));
  } catch (e) { return []; }
}

export async function getLocalityDetails(localityId: string, context?: { zoneId?: string; branchId?: string }): Promise<Omit<Locality, 'extensions'> | undefined> {
  const { DEPARTMENT_DIR } = await getPaths();
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
  if (departmentXmlContent && departmentXmlContent.trim() !== '') {
      try {
        const parsedDeptXml = await parseStringPromise(departmentXmlContent, { explicitArray: false, trim: true });
        const validatedDept = CiscoIPPhoneDirectorySchema.safeParse(parsedDeptXml.CiscoIPPhoneDirectory);
        if (validatedDept.success && validatedDept.data.Title) localityName = validatedDept.data.Title; 
      } catch (e: any) {}
  }
  return { id: localityId, name: localityName };
}

export async function getLocalityWithExtensions(localityId: string): Promise<Locality | undefined> {
  const { DEPARTMENT_DIR } = await getPaths();
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  const xmlContent = await readFileContent(departmentFilePath);

  if (!xmlContent || xmlContent.trim() === '') {
    return { id: localityId, name: localityId, extensions: [] };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    if (!parsedXml || !parsedXml.CiscoIPPhoneDirectory) return { id: localityId, name: localityId, extensions: [] };
    const validated = CiscoIPPhoneDirectorySchema.safeParse(parsedXml.CiscoIPPhoneDirectory);
    if (!validated.success) return { id: localityId, name: `${localityId} (Error)`, extensions: [] };
    const title = validated.data.Title || localityId;
    const directoryEntries = validated.data.DirectoryEntry || [];
    const extensions: Extension[] = directoryEntries.map(entry => ({
      id: toUrlFriendlyId(`${entry.Name}-${entry.Telephone}`),
      department: entry.Name,
      number: entry.Telephone,
      name: entry.Name,
    }));
    return { id: localityId, name: title, extensions };
  } catch(parseError: any) {
     return { id: localityId, name: `${localityId} (Error XML)`, extensions: [] };
  }
}
