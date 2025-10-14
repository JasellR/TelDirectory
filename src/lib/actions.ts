
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { GlobalSearchResult, MatchedExtension, Extension, CsvImportResult, CsvImportDetails, CsvImportError, SyncResult, ConflictedExtensionInfo, MissingExtensionInfo, AdSyncResult, AdSyncDetails, AdSyncFormValues, Zone, ZoneItem, DirectoryConfig } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema, getZones, getZoneItems } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig, getDirectoryConfig } from '@/lib/config';
import { isAuthenticated, getCurrentUser } from '@/lib/auth-actions';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import ldap from 'ldapjs';


// Case-insensitive file finder
async function findFileCaseInsensitive(directory: string, filename: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseName = filename.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseName) {
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

// Helper to get all dynamic paths based on the resolved IVOXS root
async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  const mainMenuFilename = await findFileCaseInsensitive(ivoxsRoot, 'mainmenu.xml');

  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_FILENAME: mainMenuFilename, // This will be the actual filename, or null
    MAINMENU_PATH: mainMenuFilename ? path.join(ivoxsRoot, mainMenuFilename) : null,
    ZONE_BRANCH_DIR: path.join(ivoxsRoot, 'zonebranch'),
    BRANCH_DIR: path.join(ivoxsRoot, 'branch'),
    DEPARTMENT_DIR: path.join(ivoxsRoot, 'department'),
  };
}

const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

const sanitizeFilenamePart = (filenamePart: string): string => {
  const cleaned = filenamePart
    .replace(/\.\.+/g, '') // Remove sequences of dots
    .replace(/[/\\]+/g, '') // Remove slashes and backslashes
    .replace(/[^a-zA-Z0-9_.-]+/g, '_'); // Replace other invalid chars with underscore
  return cleaned || `invalid_name_${Date.now()}`; // Fallback for empty or fully invalid names
};


function generateIdFromName(name: string): string {
  const cleanedName = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Transliterate accented characters
    .replace(/[^a-zA-Z0-9\s_.-]/g, ''); // Allow specific characters, remove others
  if (!cleanedName.trim()) return `UnnamedItem${Date.now()}`; // Fallback for empty/invalid names
  return cleanedName
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/-{2,}/g, '-'); // Collapse multiple hyphens
}


async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    return parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Error reading or parsing XML file ${filePath}:`, error);
    throw error;
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
   const builder = new Builder({
    headless: true, // No XML declaration by default
    renderOpts: { pretty: false, indent: '', newline: '' },
  });
  
  const xmlString = builder.buildObject(jsObject);
  // Manually add the declaration to ensure it's on the first line and there's no newline after it.
  const finalXmlString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' + xmlString;


  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalXmlString, 'utf-8');
}


function extractIdFromUrl(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, '');
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'zone' | 'unknown' | 'pagination' {
    if (!url) return 'unknown';
    const lowerUrl = url.toLowerCase();
    
    if (lowerUrl.includes('/branch/')) return 'branch';
    if (lowerUrl.includes('/department/')) return 'locality';
    if (lowerUrl.includes('/zonebranch/')) return 'zone';

    // Fallback for older URL formats if any exist
    if (lowerUrl.includes('branch/')) return 'branch';
    if (lowerUrl.includes('department/')) return 'locality';
    if (lowerUrl.includes('zonebranch/')) return 'zone';

    const urlParts = url.split('/').filter(p => p && !p.startsWith('http'));
    const isPaginationPath = urlParts.length >= 1 && urlParts[0].toLowerCase().startsWith('zonametropolitana');

    if (isPaginationPath) {
        return 'pagination';
    }

    return 'unknown';
}

const itemTypeToDir: Record<'zone' | 'branch' | 'locality', string> = {
    zone: 'zonebranch',
    branch: 'branch',
    locality: 'department',
};


async function constructServiceUrl(pathSegment: string): Promise<string> {
    const config = await getDirectoryConfig();
    const host = config.host;
    const port = config.port;

    if (!host) {
        // This should not happen if called from updateXmlUrlsAction, which validates first.
        throw new Error("Host is not configured. Cannot generate full URL for IP phones.");
    }
    
    let baseUrl = `http://${host}`;
    if (port && port !== '80') {
        baseUrl += `:${port}`;
    }

    const rootDirName = 'ivoxsdir';
    if (pathSegment.startsWith('/')) {
        pathSegment = pathSegment.substring(1);
    }
    
    // Ensure the path always starts with the public directory name.
    return `${baseUrl}/${rootDirName}/${pathSegment.replace(/\\/g, '/')}`;
}


async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any)
{
    if (error.code === 'ENOENT') {
      return '';
    }
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

// ===================
// Pagination Logic
// ===================
const PAGINATION_LIMIT = 50;

async function repaginateMenuItems(parentFilePath: string, menuName: string) {
    const allItemsMap = new Map<string, any>();
    const filesToDelete: string[] = [];
    let currentPage = 1;
    let fileToRead: string | null = parentFilePath;
    const baseDir = path.dirname(parentFilePath);
    const visitedFiles = new Set<string>();

    // 1. Consolidate all items from all pages, avoiding duplicates
    while (fileToRead && !visitedFiles.has(fileToRead)) {
        visitedFiles.add(fileToRead);
        if (currentPage > 1) filesToDelete.push(fileToRead);

        const content = await readAndParseXML(fileToRead);
        let nextFileId: string | null = null;
        if (content?.CiscoIPPhoneMenu?.MenuItem) {
            const items = ensureArray(content.CiscoIPPhoneMenu.MenuItem);
            for (const item of items) {
                if (item.Name === 'Siguiente >>') {
                    nextFileId = extractIdFromUrl(item.URL);
                } else if (item.Name !== '<< Anterior') {
                    const itemId = extractIdFromUrl(item.URL);
                    if (!allItemsMap.has(itemId)) { // Prevent duplicates
                        allItemsMap.set(itemId, item);
                    }
                }
            }
        }
        fileToRead = nextFileId ? path.join(baseDir, `${nextFileId}.xml`) : null;
        currentPage++;
    }
    
    // 2. Delete old pagination files
    for (const file of filesToDelete) {
        await fs.unlink(file).catch(e => console.warn(`Could not delete old pagination file ${file}: ${e.message}`));
    }
    
    // Sort all collected items alphabetically before repaginating
    const allItems = Array.from(allItemsMap.values()).sort((a, b) => a.Name.localeCompare(b.Name));

    // 3. Repaginate if necessary
    if (allItems.length > PAGINATION_LIMIT) {
        const totalPages = Math.ceil(allItems.length / PAGINATION_LIMIT);
        for (let i = 0; i < totalPages; i++) {
            const pageItems = allItems.slice(i * PAGINATION_LIMIT, (i + 1) * PAGINATION_LIMIT);
            const pageNum = i + 1;
            const pageName = `${menuName}${pageNum > 1 ? pageNum : ''}`;
            const pagePath = path.join(baseDir, `${pageName}.xml`);

            if (i > 0) { // Add "<< Anterior" button
                const prevPageName = `${menuName}${pageNum - 1 > 1 ? pageNum - 1 : ''}`;
                const prevUrl = await constructServiceUrl(`zonebranch/${prevPageName}.xml`);
                pageItems.unshift({ Name: '<< Anterior', URL: prevUrl });
            }
            if (i < totalPages - 1) { // Add "Siguiente >>" button
                const nextPageName = `${menuName}${pageNum + 1}`;
                const nextUrl = await constructServiceUrl(`zonebranch/${nextPageName}.xml`);
                pageItems.push({ Name: 'Siguiente >>', URL: nextUrl });
            }

            const pageContent = {
                CiscoIPPhoneMenu: {
                    Title: menuName,
                    Prompt: 'Select a Locality',
                    MenuItem: pageItems
                }
            };
            await buildAndWriteXML(pagePath, pageContent);
        }
    } else { // No pagination needed, create a single file
        const content = {
            CiscoIPPhoneMenu: {
                Title: menuName,
                Prompt: 'Select a Locality',
                MenuItem: allItems.length > 0 ? allItems : undefined
            }
        };
        await buildAndWriteXML(parentFilePath, content);
    }
}


// ===================
// CRUD Actions
// ===================

export async function addZoneAction(zoneName: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
      return { success: false, message: "Authentication required." };
  }
  
  const newZoneId = generateIdFromName(zoneName);
  const paths = await getPaths();
  if (!paths.MAINMENU_PATH) {
    return { success: false, message: "Main menu file (e.g., MainMenu.xml) not found in the directory root." };
  }
  const mainMenuPath = paths.MAINMENU_PATH;
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);
  const newZoneURL = await constructServiceUrl(`zonebranch/${newZoneId}.xml`);

  try {
    // 1. Create the new zone branch file
    const newZoneBranchContent = {
      CiscoIPPhoneMenu: {
        Title: zoneName,
        Prompt: 'Select a Locality'
      }
    };
    await buildAndWriteXML(newZoneBranchFilePath, newZoneBranchContent);

    // 2. Add the new zone to MAINMENU.xml and sort
    const mainMenu = await readAndParseXML(mainMenuPath) || { CiscoIPPhoneMenu: { MenuItem: [] } };
    mainMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
    mainMenu.CiscoIPPhoneMenu.MenuItem.push({
      Name: zoneName,
      URL: newZoneURL
    });
    // Sort alphabetically by Name
    mainMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
    await buildAndWriteXML(mainMenuPath, mainMenu);

    revalidatePath('/');
    return { success: true, message: `Zone "${zoneName}" added successfully.` };
  } catch (e: any) {
    console.error(`[addZoneAction] Error:`, e);
    return { success: false, message: `Failed to add zone "${zoneName}".`, error: e.message };
  }
}


export async function deleteZoneAction(zoneId: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
      return { success: false, message: "Authentication required." };
  }

  const paths = await getPaths();
  
  // Special handling for "MissingExtensionsFromFeed"
  if (zoneId === 'MissingExtensionsFromFeed') {
      const zoneBranchFileToDelete = path.join(paths.ZONE_BRANCH_DIR, `MissingExtensionsFromFeed.xml`);
      const departmentFileToDelete = path.join(paths.DEPARTMENT_DIR, `MissingExtensionsDepartment.xml`);
      try {
          // Attempt to delete both files, but don't fail if they don't exist
          await fs.unlink(zoneBranchFileToDelete).catch(err => { if(err.code !== 'ENOENT') throw err; });
          await fs.unlink(departmentFileToDelete).catch(err => { if(err.code !== 'ENOENT') throw err; });
          
          if (paths.MAINMENU_PATH) {
            const mainMenu = await readAndParseXML(paths.MAINMENU_PATH);
            if (mainMenu?.CiscoIPPhoneMenu?.MenuItem) {
              const menuItems = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
              mainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.filter(item => extractIdFromUrl(item.URL) !== zoneId);
              await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
            }
          }

          revalidatePath('/');
          return { success: true, message: `Cleaned up files for zone "${zoneId}".` };
      } catch(err: any) {
          console.error(`Could not delete special zone files:`, err);
          return { success: false, message: `Failed to delete files for zone "${zoneId}".`, error: err.message };
      }
  }

  // Regular zone deletion logic
  if (!paths.MAINMENU_PATH) {
    return { success: false, message: "Main menu file (e.g., MainMenu.xml) not found. Cannot delete zone." };
  }
  const mainMenuPath = paths.MAINMENU_PATH;
  const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
  try {
      const zoneBranchContent = await readAndParseXML(zoneBranchFilePath);
      if (zoneBranchContent?.CiscoIPPhoneMenu?.MenuItem) {
          const menuItems = ensureArray(zoneBranchContent.CiscoIPPhoneMenu.MenuItem);
          for (const item of menuItems) {
              const itemId = extractIdFromUrl(item.URL);
              const itemType = getItemTypeFromUrl(item.URL);
              let itemPathToDelete = '';

              if (itemType === 'branch') {
                  const branchFilePath = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
                  const branchContent = await readAndParseXML(branchFilePath);
                  if(branchContent?.CiscoIPPhoneMenu?.MenuItem) {
                      const branchItems = ensureArray(branchContent.CiscoIPPhoneMenu.MenuItem);
                      for (const subItem of branchItems) {
                          const subItemId = extractIdFromUrl(subItem.URL);
                          const subItemPath = path.join(paths.DEPARTMENT_DIR, `${subItemId}.xml`);
                          await fs.unlink(subItemPath).catch(err => console.warn(`Could not delete department file ${subItemPath}: ${err.message}`));
                      }
                  }
                  itemPathToDelete = branchFilePath;
              } else if (itemType === 'locality') {
                  itemPathToDelete = path.join(paths.DEPARTMENT_DIR, `${itemId}.xml`);
              }

              if(itemPathToDelete) {
                  await fs.unlink(itemPathToDelete).catch(err => console.warn(`Could not delete file ${itemPathToDelete}: ${err.message}`));
              }
          }
      }
      await fs.unlink(zoneBranchFilePath);
  } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`Could not delete zone branch file ${zoneBranchFilePath}:`, err);
        return { success: false, message: `Failed to delete zone "${zoneId}".`, error: err.message };
      }
  }

  // Common logic: Remove the zone from MAINMENU.xml for all cases
  try {
    const mainMenu = await readAndParseXML(mainMenuPath);
    if (mainMenu?.CiscoIPPhoneMenu?.MenuItem) {
      const menuItems = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
      mainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.filter(item => extractIdFromUrl(item.URL) !== zoneId);
      await buildAndWriteXML(mainMenuPath, mainMenu);
    }
    revalidatePath('/');
    return { success: true, message: `Zone "${zoneId}" and its contents deleted successfully.` };
  } catch(e: any) {
     console.error(`[deleteZoneAction] Error removing from MainMenu:`, e);
     return { success: false, message: `Failed to remove zone "${zoneId}" from Main Menu.`, error: e.message };
  }
}


export async function addLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemName: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { zoneId, branchId, itemName, itemType } = params;
    const newItemId = generateIdFromName(itemName);
    const paths = await getPaths();
    
    let parentMenuPath, newItemPath, newUrlPath, revalidationPath;
    const subDir = itemTypeToDir[itemType];

    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        newItemPath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
        newUrlPath = `branch/${newItemId}.xml`;
        revalidationPath = `/${zoneId}`;
    } else { // It's a locality
        parentMenuPath = branchId 
            ? path.join(paths.BRANCH_DIR, `${branchId}.xml`)
            : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        newItemPath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
        newUrlPath = `department/${newItemId}.xml`;
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }
    
    const newUrl = await constructServiceUrl(newUrlPath);

    try {
        // --- START VALIDATION ---
        const parentMenuForValidation = await readAndParseXML(parentMenuPath);
        if (parentMenuForValidation?.CiscoIPPhoneMenu) {
            const existingItems = ensureArray(parentMenuForValidation.CiscoIPPhoneMenu.MenuItem);
            const nameExists = existingItems.some(item => item.Name.toLowerCase() === itemName.trim().toLowerCase());
            if (nameExists) {
                return { success: false, message: `An item named "${itemName}" already exists in this location.` };
            }
        }
        // --- END VALIDATION ---

        // 1. Create the new item's own XML file (empty but valid)
        const newItemContent = itemType === 'branch' 
            ? { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a Locality' } }
            : { CiscoIPPhoneDirectory: {} }; // No Title or Prompt for department files
        await buildAndWriteXML(newItemPath, newItemContent);
        
        // 2. Add the new item to its parent menu file and sort
        const parentMenu = await readAndParseXML(parentMenuPath);
        if (!parentMenu.CiscoIPPhoneMenu) parentMenu.CiscoIPPhoneMenu = {};
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem);
        parentMenu.CiscoIPPhoneMenu.MenuItem.push({ Name: itemName, URL: newUrl });
        // Sort alphabetically by Name
        parentMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
        await buildAndWriteXML(parentMenuPath, parentMenu);

        // 3. Repaginate if the parent is ZonaMetropolitana
        if(zoneId.toLowerCase() === 'zonametropolitana' && !branchId) {
            await repaginateMenuItems(path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`), "ZonaMetropolitana");
        }

        revalidatePath(revalidationPath);
        return { success: true, message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemName}" added successfully.` };
    } catch(e: any) {
        console.error(`[addLocalityOrBranchAction] Error:`, e);
        return { success: false, message: `Failed to add ${itemType} "${itemName}".`, error: e.message };
    }
}


export async function editLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  oldItemId: string;
  newItemName: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { zoneId, branchId, oldItemId, newItemName, itemType } = params;
    const newItemId = generateIdFromName(newItemName);
    const paths = await getPaths();
    const subDir = itemTypeToDir[itemType];

    let parentMenuPath, oldItemPath, newItemPath, newUrlPath, revalidationPath;

    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        oldItemPath = path.join(paths.BRANCH_DIR, `${oldItemId}.xml`);
        newItemPath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
        newUrlPath = `branch/${newItemId}.xml`;
        revalidationPath = `/${zoneId}`;
    } else { // It's a locality
        parentMenuPath = branchId
            ? path.join(paths.BRANCH_DIR, `${branchId}.xml`)
            : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        oldItemPath = path.join(paths.DEPARTMENT_DIR, `${oldItemId}.xml`);
        newItemPath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
        newUrlPath = `department/${newItemId}.xml`;
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }

    const newUrl = await constructServiceUrl(newUrlPath);

    try {
        // 1. Rename the item's XML file if ID changes
        if (oldItemId !== newItemId) {
            await fs.rename(oldItemPath, newItemPath);
        }

        // 2. Update the item's own title (if it's not a department file)
        const itemContent = await readAndParseXML(newItemPath);
        if (itemType === 'branch' && itemContent?.CiscoIPPhoneMenu) {
            itemContent.CiscoIPPhoneMenu.Title = newItemName;
        } 
        // Department files don't have a title, so no 'else if' needed
        await buildAndWriteXML(newItemPath, itemContent);

        // 3. Update the item in its parent menu and sort
        const parentMenu = await readAndParseXML(parentMenuPath);
        let itemUpdated = false;
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            if (extractIdFromUrl(item.URL) === oldItemId) {
                item.Name = newItemName;
                item.URL = newUrl;
                itemUpdated = true;
            }
            return item;
        });
        if (itemUpdated) {
            parentMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
            await buildAndWriteXML(parentMenuPath, parentMenu);
        }

        revalidatePath(revalidationPath);
        revalidatePath(newItemPath); // Also revalidate the item's own page
        return { success: true, message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} updated to "${newItemName}" successfully.` };
    } catch(e: any) {
        console.error(`[editLocalityOrBranchAction] Error:`, e);
        return { success: false, message: `Failed to update ${itemType}.`, error: e.message };
    }
}


export async function deleteLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemId: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { zoneId, branchId, itemId, itemType } = params;
    const paths = await getPaths();
    
    let parentMenuPath, itemPathToDelete, revalidationPath;

    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        itemPathToDelete = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
        revalidationPath = `/${zoneId}`;
    } else { // locality
        parentMenuPath = branchId 
            ? path.join(paths.BRANCH_DIR, `${branchId}.xml`)
            : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        itemPathToDelete = path.join(paths.DEPARTMENT_DIR, `${itemId}.xml`);
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }

    try {
        // 1. Attempt to delete the item's own XML file, but don't fail if it doesn't exist.
        await fs.unlink(itemPathToDelete).catch(error => {
            if (error.code !== 'ENOENT') {
                // If it's an error other than "Not Found", re-throw it.
                throw error;
            }
            // If the file doesn't exist, we just log it and continue.
            console.warn(`[deleteLocalityOrBranchAction] File not found, skipping delete: ${itemPathToDelete}`);
        });

        // 2. Remove the item from its parent menu
        const parentMenu = await readAndParseXML(parentMenuPath);
        let itemRemoved = false;
        const originalLength = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).length;
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).filter((item: any) => {
            return extractIdFromUrl(item.URL) !== itemId;
        });
        
        if (ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).length < originalLength) {
            itemRemoved = true;
        }

        if(itemRemoved) {
            await buildAndWriteXML(parentMenuPath, parentMenu);
        }

        // 3. Repaginate if the parent is ZonaMetropolitana
        if (zoneId.toLowerCase() === 'zonametropolitana' && !branchId) {
            await repaginateMenuItems(path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`), 'ZonaMetropolitana');
        }

        revalidatePath(revalidationPath);
        return { success: true, message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemId}" deleted successfully.` };
    } catch (e: any) {
        console.error(`[deleteLocalityOrBranchAction] Error:`, e);
        return { success: false, message: `Failed to delete ${itemType} "${itemId}".`, error: e.message };
    }
}


export async function addExtensionAction(localityId: string, newName: string, newTelephone: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    if (!/^\d+$/.test(newTelephone)) {
        return { success: false, message: "Extension must be a valid number." };
    }
    
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath) || { CiscoIPPhoneDirectory: { DirectoryEntry: [] } };
        if (!department.CiscoIPPhoneDirectory) department.CiscoIPPhoneDirectory = {};
        
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry);
        
        department.CiscoIPPhoneDirectory.DirectoryEntry.push({
            Name: newName,
            Telephone: newTelephone
        });
        
        // Sort numerically by Telephone
        department.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => {
            const numA = parseInt(a.Telephone, 10);
            const numB = parseInt(b.Telephone, 10);
            return numA - numB;
        });

        await buildAndWriteXML(departmentFilePath, department);
        
        revalidatePath(`/`); // Revalidate all paths as extension could be in any zone/branch
        return { success: true, message: `Extension "${newName}" added to ${localityId}.` };
    } catch(e: any) {
        console.error(`[addExtensionAction] Error:`, e);
        return { success: false, message: `Failed to add extension to ${localityId}.`, error: e.message };
    }
}


export async function editExtensionAction(params: {
    localityId: string;
    oldExtensionName: string;
    oldExtensionNumber: string;
    newExtensionName: string;
    newExtensionNumber: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { localityId, oldExtensionName, oldExtensionNumber, newExtensionName, newExtensionNumber } = params;
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath);
        let extensionFoundAndUpdated = false;

        const updatedEntries = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).map((entry: any) => {
            if (entry.Name === oldExtensionName && entry.Telephone === oldExtensionNumber) {
                entry.Name = newExtensionName;
                entry.Telephone = newExtensionNumber;
                extensionFoundAndUpdated = true;
            }
            return entry;
        });

        if (extensionFoundAndUpdated) {
            department.CiscoIPPhoneDirectory.DirectoryEntry = updatedEntries;
             // Sort numerically by Telephone after updating
            department.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => {
                const numA = parseInt(a.Telephone, 10);
                const numB = parseInt(b.Telephone, 10);
                return numA - numB;
            });
            await buildAndWriteXML(departmentFilePath, department);
            revalidatePath(`/`);
            return { success: true, message: `Extension updated to "${newExtensionName}".` };
        } else {
            return { success: false, message: `Original extension not found.` };
        }
    } catch (e: any) {
        console.error(`[editExtensionAction] Error:`, e);
        return { success: false, message: `Failed to edit extension.`, error: e.message };
    }
}


export async function deleteExtensionAction(localityId: string, extensionName: string, extensionNumber: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath);
        let extensionFoundAndRemoved = false;
        const originalLength = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).length;

        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).filter((entry: any) => {
            return !(entry.Name === extensionName && entry.Telephone === extensionNumber);
        });
        
        if (ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).length < originalLength) {
            extensionFoundAndRemoved = true;
        }

        if(extensionFoundAndRemoved) {
            await buildAndWriteXML(departmentFilePath, department);
            revalidatePath(`/`);
            return { success: true, message: `Extension "${extensionName}" deleted from ${localityId}.` };
        } else {
            return { success: false, message: "Extension not found in file."};
        }
    } catch (e: any) {
        console.error(`[deleteExtensionAction] Error:`, e);
        return { success: false, message: `Failed to delete extension.`, error: e.message };
    }
}


// ===================
// Settings and Import Actions
// ===================

export async function updateDirectoryRootPathAction(newPath: string): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    
    // This action is now deprecated as the path is fixed to `public/ivoxsdir`
    return { success: false, message: "This functionality is deprecated. The directory path is fixed to 'public/ivoxsdir' for stability."}
}

export async function updateXmlUrlsAction(networkConfig: { host: string, port: string }): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { host, port } = networkConfig;

    if (!host) {
        return { success: false, message: "Host/IP cannot be empty." };
    }
    
    await saveDirConfig({ host, port });

    const paths = await getPaths();
    
    const updateUrlsInFile = async (filePath: string | null) => {
        if (!filePath) {
            console.warn("[updateXmlUrlsAction] Skipping update because file path is null.");
            return;
        }
        const fileContent = await readAndParseXML(filePath);
        if (!fileContent?.CiscoIPPhoneMenu?.MenuItem) return;

        fileContent.CiscoIPPhoneMenu.MenuItem = await Promise.all(ensureArray(fileContent.CiscoIPPhoneMenu.MenuItem).map(async (item: any) => {
            const urlString = item.URL || '';
            const itemType = getItemTypeFromUrl(urlString);
            const itemId = extractIdFromUrl(urlString);

            if (itemType === 'zone' || itemType === 'branch' || itemType === 'locality' || itemType === 'pagination') {
                const subDirectory = (itemType === 'locality') ? 'department' : (itemType === 'branch' ? 'branch' : 'zonebranch');
                let relativePath = `${subDirectory}/${itemId}.xml`;
                item.URL = await constructServiceUrl(relativePath);
            }
            return item;
        }));
        await buildAndWriteXML(filePath, fileContent);
    };
    
    try {
        await updateUrlsInFile(paths.MAINMENU_PATH);

        const zoneFiles = await fs.readdir(paths.ZONE_BRANCH_DIR);
        for(const file of zoneFiles) {
            if(file.endsWith('.xml')) {
                await updateUrlsInFile(path.join(paths.ZONE_BRANCH_DIR, file));
            }
        }
        
        try {
            const branchFiles = await fs.readdir(paths.BRANCH_DIR);
            for(const file of branchFiles) {
                if(file.endsWith('.xml')) {
                    await updateUrlsInFile(path.join(paths.BRANCH_DIR, file));
                }
            }
        } catch (branchError: any) {
            if (branchError.code !== 'ENOENT') {
                throw branchError;
            }
             console.log("[updateXmlUrlsAction] 'branch' directory not found, skipping.");
        }


        revalidatePath('/', 'layout');
        return { success: true, message: "All XML menu URLs have been updated." };
    } catch (e: any) {
        return { success: false, message: "An error occurred while updating XML URLs.", error: e.message };
    }
}

export async function importExtensionsFromCsvAction(csvContent: string): Promise<CsvImportResult> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }
    return { success: false, message: "This feature is not yet implemented."};
}

export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      success: false,
      message: "Authentication required.",
      updatedCount: 0,
      filesModified: 0,
      filesFailedToUpdate: 0,
      conflictedExtensions: [],
      missingExtensions: [],
    };
  }

  const urls = feedUrlsString.split('\n').map(url => url.trim()).filter(Boolean);
  if (urls.length === 0) {
    return { success: false, message: "No feed URLs provided.", updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
  }

  const paths = await getPaths();
  const allFeedExtensions: Record<string, { name: string, sourceFeed: string }[]> = {};

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[SyncFeed] Failed to fetch ${url}: ${response.statusText}`);
        continue;
      }
      const xmlContent = await response.text();
      const parsed = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
      const validated = CiscoIPPhoneDirectorySchema.safeParse(parsed.CiscoIPPhoneDirectory);

      if (validated.success) {
        const entries = ensureArray(validated.data.DirectoryEntry);
        for (const entry of entries) {
          if (!allFeedExtensions[entry.Telephone]) {
            allFeedExtensions[entry.Telephone] = [];
          }
          allFeedExtensions[entry.Telephone].push({ name: entry.Name, sourceFeed: url });
        }
      }
    } catch (e: any) {
      console.warn(`[SyncFeed] Error processing feed ${url}:`, e.message);
    }
  }

  const extensionsToUpdate: Record<string, string> = {};
  const conflictedExtensions: ConflictedExtensionInfo[] = [];
  
  for (const number in allFeedExtensions) {
    const sources = allFeedExtensions[number];
    const uniqueNames = new Set(sources.map(s => s.name));
    if (uniqueNames.size > 1) {
      conflictedExtensions.push({ number, conflicts: sources.map(s => ({ name: s.name, sourceFeed: s.sourceFeed })) });
    } else {
      extensionsToUpdate[number] = sources[0].name;
    }
  }

  let updatedCount = 0;
  let filesModified = 0;
  let filesFailedToUpdate = 0;
  const localExtensionsFound = new Set<string>();

  try {
    const departmentFiles = await fs.readdir(paths.DEPARTMENT_DIR);
    for (const file of departmentFiles) {
      if (file.endsWith('.xml')) {
        const filePath = path.join(paths.DEPARTMENT_DIR, file);
        try {
          const content = await readAndParseXML(filePath);
          if (!content?.CiscoIPPhoneDirectory) continue;

          let fileWasModified = false;
          const entries = ensureArray(content.CiscoIPPhoneDirectory.DirectoryEntry);
          const updatedEntries = entries.map(entry => {
            localExtensionsFound.add(entry.Telephone);
            const newName = extensionsToUpdate[entry.Telephone];
            if (newName && newName !== entry.Name) {
              entry.Name = newName;
              updatedCount++;
              fileWasModified = true;
            }
            return entry;
          });

          if (fileWasModified) {
            content.CiscoIPPhoneDirectory.DirectoryEntry = updatedEntries;
            await buildAndWriteXML(filePath, content);
            filesModified++;
          }
        } catch (e) {
          filesFailedToUpdate++;
          console.warn(`[SyncFeed] Could not process or update local file ${file}:`, e);
        }
      }
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      return { success: false, message: "Error reading local department directory.", error: e.message, updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
    }
    // If department dir doesn't exist, it's not a fatal error, just means no local extensions to update
    console.log('[SyncFeed] Department directory not found, skipping local extension update.');
  }

  const missingExtensions: MissingExtensionInfo[] = [];
  for (const number in extensionsToUpdate) {
    if (!localExtensionsFound.has(number)) {
      missingExtensions.push({ number, name: extensionsToUpdate[number], sourceFeed: allFeedExtensions[number][0].sourceFeed });
    }
  }
  
  if (missingExtensions.length > 0) {
      const zoneId = 'MissingExtensionsFromFeed';
      const zoneName = 'Missing Extensions from Feed';
      const departmentId = 'MissingExtensionsDepartment';
      const departmentName = 'Missing Extensions';
      
      const deptFilePath = path.join(paths.DEPARTMENT_DIR, `${departmentId}.xml`);
      const deptContent = {
          CiscoIPPhoneDirectory: {
              DirectoryEntry: missingExtensions.map(ext => ({ Name: ext.name, Telephone: ext.number }))
          }
      };
      await buildAndWriteXML(deptFilePath, deptContent);

      const zoneFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
      const zoneUrl = await constructServiceUrl(`department/${departmentId}.xml`);
      const zoneContent = {
          CiscoIPPhoneMenu: {
              Title: zoneName,
              Prompt: `Select a department`,
              MenuItem: [{
                  Name: departmentName,
                  URL: zoneUrl
              }]
          }
      };
      await buildAndWriteXML(zoneFilePath, zoneContent);
  }


  revalidatePath('/', 'layout');

  return {
    success: true,
    message: `Sync complete. ${updatedCount} extensions updated across ${filesModified} files.`,
    updatedCount,
    filesModified,
    filesFailedToUpdate,
    conflictedExtensions,
    missingExtensions,
  };
}

export async function moveExtensionsAction(params: {
    extensionsToMove: Extension[];
    sourceLocalityId: string;
    destinationZoneId: string;
    destinationLocalityId?: string;
    newLocalityName?: string;
    destinationBranchId?: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { extensionsToMove, sourceLocalityId, destinationZoneId, destinationLocalityId, newLocalityName, destinationBranchId } = params;

    if (!extensionsToMove || extensionsToMove.length === 0) {
        return { success: false, message: "No extensions were selected to move." };
    }

    const paths = await getPaths();
    let finalDestinationLocalityId = destinationLocalityId;

    try {
        // Step 1: Handle creation of a new locality if requested
        if (newLocalityName) {
            const addResult = await addLocalityOrBranchAction({
                zoneId: destinationZoneId,
                branchId: destinationBranchId,
                itemName: newLocalityName,
                itemType: 'locality',
            });
            if (!addResult.success) {
                // Pass the specific error message from the sub-action
                return { success: false, message: addResult.message, error: addResult.error };
            }
            finalDestinationLocalityId = generateIdFromName(newLocalityName);
        }

        if (!finalDestinationLocalityId) {
            throw new Error("Destination locality is not specified.");
        }

        // Step 2: Add extensions to the destination file
        const destDeptPath = path.join(paths.DEPARTMENT_DIR, `${finalDestinationLocalityId}.xml`);
        const destDept = await readAndParseXML(destDeptPath) || { CiscoIPPhoneDirectory: { DirectoryEntry: [] } };
        if (!destDept.CiscoIPPhoneDirectory) destDept.CiscoIPPhoneDirectory = {};
        destDept.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(destDept.CiscoIPPhoneDirectory.DirectoryEntry);
        
        const extensionsToAdd = extensionsToMove.map(ext => ({ Name: ext.department, Telephone: ext.number }));
        destDept.CiscoIPPhoneDirectory.DirectoryEntry.push(...extensionsToAdd);
        destDept.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => parseInt(a.Telephone, 10) - parseInt(b.Telephone, 10));
        await buildAndWriteXML(destDeptPath, destDept);

        // Step 3: Remove extensions from the source file
        const sourceDeptPath = path.join(paths.DEPARTMENT_DIR, `${sourceLocalityId}.xml`);
        const sourceDept = await readAndParseXML(sourceDeptPath);
        if (sourceDept && sourceDept.CiscoIPPhoneDirectory) {
            const numbersToMove = new Set(extensionsToMove.map(ext => ext.number));
            sourceDept.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(sourceDept.CiscoIPPhoneDirectory.DirectoryEntry).filter(
                (entry: any) => !numbersToMove.has(entry.Telephone)
            );
            await buildAndWriteXML(sourceDeptPath, sourceDept);
        }
        
        revalidatePath('/', 'layout');
        return { success: true, message: `${extensionsToMove.length} extensions moved successfully.` };

    } catch (e: any) {
        console.error(`[moveExtensionsAction] Error:`, e);
        return { success: false, message: 'An error occurred while moving extensions.', error: e.message };
    }
}


export async function syncFromActiveDirectoryAction(params: AdSyncFormValues): Promise<AdSyncResult> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }
    return { success: false, message: "This feature is not yet implemented."};
}

// ===================
// Actions for Client Components
// ===================

export async function getZonesAction(): Promise<Omit<Zone, 'items'>[]> {
    return getZones();
}

export async function getZoneItemsAction(zoneId: string): Promise<ZoneItem[]> {
    return getZoneItems(zoneId);
}


// ===================
// Search Action
// ===================

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  if (query.trim().length < 2) {
    return [];
  }
  
  const { IVOXS_DIR, MAINMENU_PATH, ZONE_BRANCH_DIR, BRANCH_DIR } = await getPaths();
  const lowerQuery = query.toLowerCase();
  
  const allLocalities = new Map<string, {name: string, zoneId: string, zoneName: string, branchId?: string, branchName?: string}>();
  const visitedMenus = new Set<string>(); // To prevent infinite loops in paginated menus

  const processMenu = async (filePath: string, context: {zoneId: string, zoneName: string, branchId?: string, branchName?: string}) => {
    if (visitedMenus.has(filePath)) return;
    visitedMenus.add(filePath);
    
    const menuContent = await readFileContent(filePath);
    if (!menuContent) return;

    try {
        const parsedMenu = await parseStringPromise(menuContent, { explicitArray: false, trim: true });
        const menuItems = ensureArray(parsedMenu?.CiscoIPPhoneMenu?.MenuItem);

        for (const item of menuItems) {
            if (!item || !item.URL) continue;

            const itemId = extractIdFromUrl(item.URL);
            const itemType = getItemTypeFromUrl(item.URL);
            
            if (item.Name === 'Siguiente >>') {
                const nextFileId = extractIdFromUrl(item.URL);
                if (nextFileId) {
                  // CORRECTED: The next file is in the same directory as the current one.
                  const nextFilePath = path.join(path.dirname(filePath), `${nextFileId}.xml`);
                  await processMenu(nextFilePath, context);
                }
                continue; 
            }
            if (item.Name === '<< Anterior') {
                continue; // Skip "Anterior" button
            }

            if (itemType === 'locality') {
                if (!allLocalities.has(itemId)) {
                  allLocalities.set(itemId, { name: item.Name, ...context });
                }
            } else if (itemType === 'branch') {
                const newContext = { ...context, branchId: itemId, branchName: item.Name };
                // CORRECTED: Branch files are in the BRANCH_DIR
                const nextFilePath = path.join(BRANCH_DIR, `${itemId}.xml`);
                try {
                  await fs.access(nextFilePath);
                  await processMenu(nextFilePath, newContext);
                } catch {
                  console.warn(`[Search] Branch file not found, skipping: ${nextFilePath}`);
                }
            }
        }
    } catch(e) {
      console.warn(`[Search] Could not process menu file ${filePath}:`, e);
    }
  };


  if (!MAINMENU_PATH) {
    console.error(`[Search] Fatal: Main menu file (e.g., MainMenu.xml) not found at ${IVOXS_DIR}. Search cannot proceed.`);
    return [];
  }
  
  const mainMenuContent = await readFileContent(MAINMENU_PATH);
  if (mainMenuContent) {
    try {
      const parsedMainMenu = await parseStringPromise(mainMenuContent, { explicitArray: false, trim: true });
      const zones = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);

      for (const zoneMenuItem of zones) {
          if (!zoneMenuItem || !zoneMenuItem.URL) continue;
          const zoneId = extractIdFromUrl(zoneMenuItem.URL);
          const zoneContext = { zoneId: zoneId, zoneName: zoneMenuItem.Name };
          
          const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
          try {
            await fs.access(zoneFilePath);
            await processMenu(zoneFilePath, zoneContext);
          } catch {
            console.warn(`[Search] Zone file not found, skipping: ${zoneFilePath}`);
          }
      }
    } catch(e) {
      console.error(`[Search] Fatal: Could not process main menu file:`, e);
      return [];
    }
  }

  const resultsMap = new Map<string, GlobalSearchResult>();

  for (const [localityId, localityInfo] of allLocalities.entries()) {
      const localityNameMatch = localityInfo.name.toLowerCase().includes(lowerQuery);
      let matchingExtensions: MatchedExtension[] = [];

      const { DEPARTMENT_DIR } = await getPaths();
      const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
      
      try {
        await fs.access(departmentFilePath);
        const departmentContent = await readFileContent(departmentFilePath);
        if (departmentContent) {
            const parsedDept = await readAndParseXML(departmentFilePath);
            const extensions = ensureArray(parsedDept?.CiscoIPPhoneDirectory?.DirectoryEntry);

            for (const ext of extensions) {
                if (!ext || !ext.Name || !ext.Telephone) continue;
                let matchedOn: MatchedExtension['matchedOn'] | null = null;
                if (ext.Name.toLowerCase().includes(lowerQuery)) {
                    matchedOn = 'extensionName';
                } else if (ext.Telephone.toLowerCase().includes(lowerQuery)) {
                    matchedOn = 'extensionNumber';
                }
                if (matchedOn) {
                    matchingExtensions.push({ name: ext.Name, number: ext.Telephone, matchedOn });
                }
            }
        }
      } catch {
        // File not found is a normal condition here, just means no extensions to search
      }


      if (localityNameMatch || matchingExtensions.length > 0) {
          if (!resultsMap.has(localityId)) {
               resultsMap.set(localityId, {
                  localityId: localityId,
                  localityName: localityInfo.name,
                  zoneId: localityInfo.zoneId,
                  zoneName: localityInfo.zoneName,
                  branchId: localityInfo.branchId,
                  branchName: localityInfo.branchName,
                  fullPath: localityInfo.branchId
                      ? `/${localityInfo.zoneId}/branches/${localityInfo.branchId}/localities/${localityId}`
                      : `/${localityInfo.zoneId}/localities/${localityId}`,
                  localityNameMatch,
                  matchingExtensions,
              });
          } else {
              const existing = resultsMap.get(localityId)!;
              existing.matchingExtensions.push(...matchingExtensions);
              if (localityNameMatch) {
                  existing.localityNameMatch = true;
              }
          }
      }
  }
  
  return Array.from(resultsMap.values());
}

    