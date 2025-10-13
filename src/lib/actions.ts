
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { GlobalSearchResult, MatchedExtension, Extension, CsvImportResult, CsvImportDetails, CsvImportError, SyncResult, ConflictedExtensionInfo, MissingExtensionInfo } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated, getCurrentUser } from '@/lib/auth-actions';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';


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
    headless: false,
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    xmldec: { version: '1.0', encoding: 'UTF-8', standalone: 'no' }
  });

  const xmlContentBuiltByBuilder = builder.buildObject(jsObject);
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  const contentWithoutBuilderDecl = xmlContentBuiltByBuilder.replace(/^<\?xml.+?\?>\s*/, '');
  const finalXmlString = xmlDeclaration + contentWithoutBuilderDecl.trim();


  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalXmlString, 'utf-8');
}


function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, '');
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'zone' | 'unknown' {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/branch/')) return 'branch';
  if (lowerUrl.includes('/department/')) return 'locality';
  // Handle the incorrect "locality" folder name for backward compatibility during correction
  if (lowerUrl.includes('/locality/')) return 'locality'; 
  if (lowerUrl.includes('/zonebranch/')) return 'zone';
  return 'unknown';
}

const itemTypeToDir: Record<'zone' | 'branch' | 'locality', string> = {
    zone: 'zonebranch',
    branch: 'branch',
    locality: 'department',
};


// Helper to get configured service URL components
async function getServiceUrlComponents(): Promise<{ protocol: string, host: string, port: string, rootDirName: string }> {
  // This is now simplified as the root directory is always 'ivoxsdir' inside 'public'
  const rootDirName = 'ivoxsdir';
  // These can be configured via environment variables in a real production setup
  let protocol = 'http';
  let host = '127.0.0.1';
  let port = '3000';
  
  return { protocol, host, port, rootDirName };
}

function constructServiceUrl(protocol: string, host: string, port: string, rootDirName: string, pathSegment: string): string {
  // URLs should be relative to the domain root, pointing into the public directory
  const fullPath = path.join(rootDirName, pathSegment).replace(/\\/g, '/');
  return `${protocol}://${host}:${port}/${fullPath}`;
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
  const { protocol, host, port, rootDirName } = await getServiceUrlComponents();
  const newZoneURL = constructServiceUrl(protocol, host, port, rootDirName, `zonebranch/${newZoneId}.xml`);

  try {
    // 1. Create the new zone branch file
    const newZoneBranchContent = {
      CiscoIPPhoneMenu: {
        Title: zoneName,
        Prompt: 'Select a Locality'
      }
    };
    await buildAndWriteXML(newZoneBranchFilePath, newZoneBranchContent);

    // 2. Add the new zone to MAINMENU.xml
    const mainMenu = await readAndParseXML(mainMenuPath) || { CiscoIPPhoneMenu: { MenuItem: [] } };
    mainMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
    mainMenu.CiscoIPPhoneMenu.MenuItem.push({
      Name: zoneName,
      URL: newZoneURL
    });
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
  if (!paths.MAINMENU_PATH) {
    return { success: false, message: "Main menu file (e.g., MainMenu.xml) not found. Cannot delete zone." };
  }
  const mainMenuPath = paths.MAINMENU_PATH;
  const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);

  try {
    // 1. Read the zone branch file to find all associated branch/department files
    const zoneBranchContent = await readAndParseXML(zoneBranchFilePath);
    if (zoneBranchContent?.CiscoIPPhoneMenu?.MenuItem) {
        const menuItems = ensureArray(zoneBranchContent.CiscoIPPhoneMenu.MenuItem);
        for (const item of menuItems) {
            const itemId = extractIdFromUrl(item.URL);
            const itemType = getItemTypeFromUrl(item.URL);
            let itemPathToDelete = '';

            if (itemType === 'branch') {
                const branchFilePath = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
                // Optionally, delete sub-localities of the branch as well
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

    // 2. Delete the zone branch file itself
    await fs.unlink(zoneBranchFilePath).catch(err => console.warn(`Could not delete zone branch file ${zoneBranchFilePath}: ${err.message}`));

    // 3. Remove the zone from MAINMENU.xml
    const mainMenu = await readAndParseXML(mainMenuPath);
    if (mainMenu?.CiscoIPPhoneMenu?.MenuItem) {
      const menuItems = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
      mainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.filter(item => extractIdFromUrl(item.URL) !== zoneId);
      await buildAndWriteXML(mainMenuPath, mainMenu);
    }

    revalidatePath('/');
    return { success: true, message: `Zone "${zoneId}" and its contents deleted successfully.` };
  } catch (e: any) {
    console.error(`[deleteZoneAction] Error:`, e);
    return { success: false, message: `Failed to delete zone "${zoneId}".`, error: e.message };
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
    const { protocol, host, port, rootDirName } = await getServiceUrlComponents();
    
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
    
    const newUrl = constructServiceUrl(protocol, host, port, rootDirName, newUrlPath);

    try {
        // 1. Create the new item's own XML file (empty but valid)
        const newItemContent = itemType === 'branch' 
            ? { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a Locality' } }
            : { CiscoIPPhoneDirectory: { Title: itemName, Prompt: 'Select an extension' } };
        await buildAndWriteXML(newItemPath, newItemContent);
        
        // 2. Add the new item to its parent menu file
        const parentMenu = await readAndParseXML(parentMenuPath);
        if (!parentMenu.CiscoIPPhoneMenu) parentMenu.CiscoIPPhoneMenu = {};
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem);
        parentMenu.CiscoIPPhoneMenu.MenuItem.push({ Name: itemName, URL: newUrl });
        await buildAndWriteXML(parentMenuPath, parentMenu);

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
    const { protocol, host, port, rootDirName } = await getServiceUrlComponents();
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

    const newUrl = constructServiceUrl(protocol, host, port, rootDirName, newUrlPath);

    try {
        // 1. Rename the item's XML file if ID changes
        if (oldItemId !== newItemId) {
            await fs.rename(oldItemPath, newItemPath);
        }

        // 2. Update the item's own title
        const itemContent = await readAndParseXML(newItemPath);
        if (itemType === 'branch' && itemContent?.CiscoIPPhoneMenu) {
            itemContent.CiscoIPPhoneMenu.Title = newItemName;
        } else if (itemType === 'locality' && itemContent?.CiscoIPPhoneDirectory) {
            itemContent.CiscoIPPhoneDirectory.Title = newItemName;
        }
        await buildAndWriteXML(newItemPath, itemContent);

        // 3. Update the item in its parent menu
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

export async function updateXmlUrlsAction(host: string, port: string): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const paths = await getPaths();
    const { protocol, rootDirName } = await getServiceUrlComponents();
    
    const updateUrlsInFile = async (filePath: string | null) => {
        if (!filePath) {
            console.warn("[updateXmlUrlsAction] Skipping update because file path is null.");
            return;
        }
        const fileContent = await readAndParseXML(filePath);
        if (!fileContent?.CiscoIPPhoneMenu?.MenuItem) return;

        fileContent.CiscoIPPhoneMenu.MenuItem = ensureArray(fileContent.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            const fileName = (item.URL || '').split('/').pop();
            const itemType = getItemTypeFromUrl(item.URL);

            if (fileName && itemType !== 'unknown') {
                const subDirectory = itemTypeToDir[itemType];
                const relativePath = `${subDirectory}/${fileName}`;
                // Use the rootDirName from getServiceUrlComponents, which is now hardcoded to 'ivoxsdir'
                item.URL = constructServiceUrl(protocol, host, port, rootDirName, relativePath);
            } else {
                 console.warn(`[updateXmlUrlsAction] Could not process URL: ${item.URL}. It might be malformed or pointing to an unknown type.`);
            }
            return item;
        });
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
    return { success: false, message: "Error reading local department directory.", error: e.message, updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
  }

  const missingExtensions: MissingExtensionInfo[] = [];
  for (const number in extensionsToUpdate) {
    if (!localExtensionsFound.has(number)) {
      missingExtensions.push({ number, name: extensionsToUpdate[number], sourceFeed: allFeedExtensions[number][0].sourceFeed });
    }
  }
  
  if (missingExtensions.length > 0) {
      const missingExtensionsZoneId = 'MissingExtensionsFromFeed';
      const missingExtensionsZoneName = 'Missing Extensions from Feed';
      const missingExtensionsLocalityPrompt = 'Extensions found in feeds but not locally';
      
      const missingDeptFilePath = path.join(paths.DEPARTMENT_DIR, `${missingExtensionsZoneId}.xml`);
      const { protocol, host, port, rootDirName } = await getServiceUrlComponents();
      const missingZoneURL = constructServiceUrl(protocol, host, port, rootDirName, `department/${missingExtensionsZoneId}.xml`);
      
      const missingDeptContent = {
          CiscoIPPhoneDirectory: {
              Title: missingExtensionsZoneName,
              Prompt: missingExtensionsLocalityPrompt,
              DirectoryEntry: missingExtensions.map(ext => ({ Name: ext.name, Telephone: ext.number }))
          }
      };
      await buildAndWriteXML(missingDeptFilePath, missingDeptContent);

      if (paths.MAINMENU_PATH) {
        const mainMenu = await readAndParseXML(paths.MAINMENU_PATH) || { CiscoIPPhoneMenu: { MenuItem: [] } };
        mainMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
        
        const existingMissingZone = mainMenu.CiscoIPPhoneMenu.MenuItem.find((item: any) => extractIdFromUrl(item.URL) === missingExtensionsZoneId);
        if (!existingMissingZone) {
            mainMenu.CiscoIPPhoneMenu.MenuItem.push({
                Name: missingExtensionsZoneName,
                URL: missingZoneURL
            });
        } // if it exists, the file is just overwritten, no need to change the menu
        await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
      }
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

// ===================
// Search Action
// ===================

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  if (query.trim().length < 2) {
    return [];
  }
  
  const { IVOXS_DIR, MAINMENU_PATH } = await getPaths();
  const lowerQuery = query.toLowerCase();
  
  const allLocalities = new Map<string, {name: string, zoneId: string, zoneName: string, branchId?: string, branchName?: string}>();

  const processMenu = async (filePath: string, context: {zoneId: string, zoneName: string, branchId?: string, branchName?: string}) => {
    const menuContent = await readFileContent(filePath);
    if (!menuContent) return;

    try {
        const parsedMenu = await parseStringPromise(menuContent, { explicitArray: false, trim: true });
        const menuItems = ensureArray(parsedMenu?.CiscoIPPhoneMenu?.MenuItem);

        for (const item of menuItems) {
            const itemId = extractIdFromUrl(item.URL);
            
            let urlPath;
            try {
              urlPath = new URL(item.URL).pathname;
            } catch {
              urlPath = item.URL;
            }
            
            // With files in /public, the URL path will be like /ivoxsdir/branch/file.xml
            const pathSegments = urlPath.split('/').filter(Boolean); // remove empty segments
            
            let itemType: 'branch' | 'locality' | 'unknown' = 'unknown';

            if (pathSegments.length > 1) {
                // The directory right before the filename determines the type
                const typeSegment = pathSegments[pathSegments.length - 2];
                if (typeSegment === 'branch') itemType = 'branch';
                else if (typeSegment === 'department') itemType = 'locality';
            }
            
            if (itemType === 'locality') {
                if (!allLocalities.has(itemId)) {
                  allLocalities.set(itemId, { name: item.Name, ...context });
                }
            } else if (itemType === 'branch') {
                const newContext = { ...context, branchId: itemId, branchName: item.Name };
                const nextFilePath = path.join(IVOXS_DIR, 'branch', `${itemId}.xml`);
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
          const zoneId = extractIdFromUrl(zoneMenuItem.URL);
          const zoneContext = { zoneId: zoneId, zoneName: zoneMenuItem.Name };
          
          const zoneFilePath = path.join(IVOXS_DIR, 'zonebranch', `${zoneId}.xml`);
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

    
