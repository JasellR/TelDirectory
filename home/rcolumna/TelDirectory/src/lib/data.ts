
import type { Zone, Locality, Extension, ZoneItem, Branch, BranchItem } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { z } from 'zod';
import { getResolvedIvoxsRootPath } from '@/lib/config';

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T_1,>(item: T_1 | T_1[] | undefined | null): T_1[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

// Helper to generate URL-friendly IDs from names, also used for extension IDs from their names
const toUrlFriendlyId = (name: string): string => {
  if (!name) return `unnamed-${Date.now()}`;
  const cleanedId = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  return cleanedId || `unnamed-${Date.now()}`;
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


// Case-insensitive file finder
async function findFileCaseInsensitive(directory: string, filename: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseFilename = filename.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseFilename) {
                return file; // Return the actual filename with its original casing
            }
        }
        return null; // No match found
    } catch (error: any) {
        if (error.code === 'ENOENT') return null; // Directory doesn't exist is a valid case
        console.error(`[findFileCaseInsensitive] Error reading directory ${directory}:`, error);
        return null;
    }
}


// Dynamic path getters
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
    if (error.code === 'ENOENT') {
      return '';
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error; // Re-throw other errors
  }
}

function extractIdFromUrl(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, ''); // Case-insensitive .xml removal
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'zone' | 'unknown' | 'pagination' {
    if (!url) return 'unknown';
    const lowerUrl = url.toLowerCase();
    
    // Check for explicit directory paths first, which are used for Cisco phones
    if (lowerUrl.includes('/branch/')) return 'branch';
    if (lowerUrl.includes('/department/')) return 'locality';
    if (lowerUrl.includes('/zonebranch/')) return 'zone';

    // Then, check for the "clean" URL pattern used by the web app for pagination
    // e.g., /ZonaMetropolitana/ZonaMetropolitana2
    const urlParts = url.split('/').filter(p => p && !p.startsWith('http'));
    const isPaginationPath = urlParts.length >= 1 && urlParts[0].toLowerCase().startsWith('zonametropolitana');

    if (isPaginationPath) {
        return 'pagination';
    }

    return 'unknown';
}


export async function getZones(): Promise<Omit<Zone, 'items'>[]> {
  const paths = await getPaths();
  let zones: Omit<Zone, 'items'>[] = [];

  // 1. Get zones from MainMenu.xml
  if (paths.MAINMENU_PATH) {
      const xmlContent = await readFileContent(paths.MAINMENU_PATH);
      if (xmlContent) {
          const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
          if (parsedXml?.CiscoIPPhoneMenu) {
              const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);
              if (validated.success && validated.data.MenuItem) {
                  zones = validated.data.MenuItem.map(item => ({
                      id: extractIdFromUrl(item.URL),
                      name: item.Name,
                  }));
              } else if (!validated.success) {
                  console.error(`Failed to parse ${paths.MAINMENU_FILENAME}:`, validated.error.issues);
              }
          } else {
              console.error(`Main menu file ${paths.MAINMENU_FILENAME} is malformed. Missing CiscoIPPhoneMenu root element.`);
          }
      }
  } else {
      console.warn("[getZones] Main menu file (e.g., MainMenu.xml) not found in the root directory.");
  }

  // 2. Manually check for the "Missing Extensions" zone file
  const missingExtensionsZoneId = 'MissingExtensionsFromFeed';
  const missingExtensionsZoneFilePath = path.join(paths.ZONE_BRANCH_DIR, `${missingExtensionsZoneId}.xml`);

  try {
      await fs.access(missingExtensionsZoneFilePath);
      // If the file exists and the zone isn't already in the list, add it.
      if (!zones.some(z => z.id === missingExtensionsZoneId)) {
          zones.push({
              id: missingExtensionsZoneId,
              name: 'Missing Extensions from Feed',
          });
          // Sort zones alphabetically after adding
          zones.sort((a, b) => a.name.localeCompare(b.name));
      }
  } catch (e) {
      // File doesn't exist, which is a normal case, so we do nothing.
  }

  return zones;
}

export async function getZoneDetails(zoneId: string): Promise<Omit<Zone, 'items'> | undefined> {
  const zones = await getZones();
  return zones.find(z => z.id === zoneId);
}

export async function getZoneItems(zoneId: string): Promise<ZoneItem[]> {
  const { ZONE_BRANCH_DIR } = await getPaths();
  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
  
  const collectedItemsMap = new Map<string, ZoneItem>();
  const visitedFiles = new Set<string>();
  let fileToRead: string | null = zoneFilePath;
  const isPaginatedMenu = zoneId.toLowerCase().includes('zonametropolitana');

  while(fileToRead && !visitedFiles.has(fileToRead)) {
      visitedFiles.add(fileToRead);
      const xmlContent = await readFileContent(fileToRead);
      if (!xmlContent) break;

      let nextFileId: string | null = null;
      try {
          const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
          if (!parsedXml || !parsedXml.CiscoIPPhoneMenu) {
            console.error(`File ${path.basename(fileToRead)} is malformed. Missing CiscoIPPhoneMenu root element.`);
            break;
          }
          const validated = CiscoIPPhoneMenuSchema.safeParse(parsedXml.CiscoIPPhoneMenu);
          if (validated.success && validated.data.MenuItem) {
              const menuItems = ensureArray(validated.data.MenuItem);
              for (const item of menuItems) {
                // For web UI, we follow pagination but DON'T show the pagination buttons themselves.
                if (isPaginatedMenu && (item.Name === 'Siguiente >>' || item.Name === '<< Anterior')) {
                    if(item.Name === 'Siguiente >>') {
                        nextFileId = extractIdFromUrl(item.URL);
                    }
                    continue; // Skip adding pagination buttons to the web list
                }
                
                const itemType = getItemTypeFromUrl(item.URL);
                if (itemType === 'branch' || itemType === 'locality') {
                    const itemId = extractIdFromUrl(item.URL);
                    if (!collectedItemsMap.has(itemId)) { // Prevent duplicates across pages
                        collectedItemsMap.set(itemId, {
                            id: itemId,
                            name: item.Name,
                            type: itemType,
                        });
                    }
                }
              }
          } else if (!validated.success) {
              console.error(`Failed to parse XML for ${path.basename(fileToRead)}:`, validated.error.issues);
          }
      } catch(e) {
          console.error(`Error parsing ${fileToRead}:`, e);
          break; // Stop if a file is unparsable
      }
      
      fileToRead = (isPaginatedMenu && nextFileId) ? path.join(ZONE_BRANCH_DIR, `${nextFileId}.xml`) : null;
  }

  // Return a sorted list of unique items
  return Array.from(collectedItemsMap.values()).sort((a,b) => a.name.localeCompare(b.name));
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

  const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  if (!parsedXml || !parsedXml.CiscoIPPhoneMenu) {
    console.error(`Branch file ${branchId}.xml is malformed. Missing CiscoIPPhoneMenu root element.`);
    return [];
  }
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
        
        if (!parsedDeptXml || typeof parsedDeptXml !== 'object' || !parsedDeptXml.CiscoIPPhoneDirectory) {
            console.warn(`[DataLib] Invalid or empty XML structure for CiscoIPPhoneDirectory when fetching details for locality ID: ${localityId}. File: ${departmentFilePath}`);
        } else {
            const validatedDept = CiscoIPPhoneDirectorySchema.safeParse(parsedDeptXml.CiscoIPPhoneDirectory);
            if (validatedDept.success && validatedDept.data.Title) {
                localityName = validatedDept.data.Title; 
            } else if (!validatedDept.success) {
                console.warn(`[DataLib] Zod validation failed for CiscoIPPhoneDirectory title in locality ID: ${localityId}. File: ${departmentFilePath}`);
            }
        }
      } catch (e: any) {
        console.warn(`[DataLib] Could not parse title from ${departmentFilePath} for locality ${localityId}. Error: ${e.message}`);
      }
  }

  return { id: localityId, name: localityName };
}


export async function getLocalityWithExtensions(localityId: string): Promise<Locality | undefined> {
  const { DEPARTMENT_DIR } = await getPaths();
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  const xmlContent = await readFileContent(departmentFilePath);

  if (!xmlContent || xmlContent.trim() === '') {
    console.warn(`[DataLib] Department file for locality ID "${localityId}" is empty or not found at ${departmentFilePath}. Returning locality with no extensions.`);
    return {
        id: localityId,
        name: localityId, // Fallback name
        extensions: [],
    };
  }

  let parsedXml;
  try {
    parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch(parseError: any) {
    console.error(`[DataLib] Failed to parse XML content for locality ID ${localityId}. File: ${departmentFilePath}. Error: ${parseError.message}`);
    console.error("XML Content (first 200 chars):", xmlContent.substring(0,200));
     return { 
        id: localityId,
        name: `${localityId} (XML Parse Error)`,
        extensions: [],
    };
  }
  
  if (!parsedXml || typeof parsedXml !== 'object' || !parsedXml.CiscoIPPhoneDirectory) {
    console.warn(`[DataLib] Invalid or empty XML structure for CiscoIPPhoneDirectory in locality ID: ${localityId}. File: ${departmentFilePath}`);
    return { 
        id: localityId,
        name: `${localityId} (Invalid XML Structure)`,
        extensions: [],
    };
  }

  const validated = CiscoIPPhoneDirectorySchema.safeParse(parsedXml.CiscoIPPhoneDirectory);

  if (!validated.success) {
    console.error(`[DataLib] Failed to parse Department XML for ${localityId}. File: ${departmentFilePath}`);
    console.error("Data passed to Zod:", JSON.stringify(parsedXml.CiscoIPPhoneDirectory, null, 2).substring(0, 500) + "...");
    console.error("Zod Errors:", JSON.stringify(validated.error.flatten(), null, 2));
    return { 
        id: localityId,
        name: `${localityId} (Data Validation Error)`,
        extensions: [],
    };
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
