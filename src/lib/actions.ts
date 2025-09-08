
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { GlobalSearchResult, MatchedExtension, Extension, CsvImportResult, CsvImportDetails, CsvImportError, SyncResult, ConflictedExtensionInfo, MissingExtensionInfo, AdSyncResult, AdSyncDetails, AdSyncFormValues } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated, getCurrentUser } from '@/lib/auth-actions';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import ldap from 'ldapjs';


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

// Helper to get all dynamic paths based on the resolved IVOXS root
async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  const mainMenuFilename = await findFileCaseInsensitive(ivoxsRoot, 'mainmenu.xml');

  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_FILENAME: mainMenuFilename, // This will be the actual filename, or null
    MAINMENU_PATH: mainMenuFilename ? path.join(ivoxsRoot, mainMenuFilename) : null,
    ZONE_BRANCH_DIR: path.join(ivoxsRoot, 'ZoneBranch'),
    BRANCH_DIR: path.join(ivoxsRoot, 'Branch'),
    DEPARTMENT_DIR: path.join(ivoxsRoot, 'Department'),
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
  const cleanedName = name.replace(/[^a-zA-Z0-9\s_.-]/g, ''); // Allow specific characters, remove others
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
    xmldec: { version: '1.0', encoding: 'UTF-8', standalone: false }
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

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'unknown' {
  const lowerUrl = url.toLowerCase();
  // Check for the sub-directory name in the path to determine type.
  // This is more flexible than a fixed structure.
  if (/\/branch\//i.test(url)) return 'branch';
  if (/\/department\//i.test(url)) return 'locality';
  return 'unknown';
}

// Helper to get configured service URL components
async function getServiceUrlComponents(): Promise<{ protocol: string, host: string, port: string }> {
  let protocol = 'http';
  let host = '127.0.0.1';
  let port = '3000';
  
  return { protocol, host, port };
}

function constructServiceUrl(protocol: string, host: string, port: string, pathSegment: string): string {
  return `${protocol}://${host}:${port}/directory/${pathSegment}`;
}

async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
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
  const { protocol, host, port } = await getServiceUrlComponents();
  const newZoneURL = constructServiceUrl(protocol, host, port, `ZoneBranch/${newZoneId}.xml`);

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
                itemPathToDelete = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
                // Optionally, delete sub-localities of the branch as well
                const branchContent = await readAndParseXML(itemPathToDelete);
                if(branchContent?.CiscoIPPhoneMenu?.MenuItem) {
                    const branchItems = ensureArray(branchContent.CiscoIPPhoneMenu.MenuItem);
                    for (const subItem of branchItems) {
                        const subItemId = extractIdFromUrl(subItem.URL);
                        const subItemPath = path.join(paths.DEPARTMENT_DIR, `${subItemId}.xml`);
                        await fs.unlink(subItemPath).catch(err => console.warn(`Could not delete department file ${subItemPath}: ${err.message}`));
                    }
                }

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
    const { protocol, host, port } = await getServiceUrlComponents();
    
    let parentMenuPath, newItemPath, newUrlPath, revalidationPath;

    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        newItemPath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
        newUrlPath = `Branch/${newItemId}.xml`;
        revalidationPath = `/${zoneId}`;
    } else { // It's a locality
        parentMenuPath = branchId 
            ? path.join(paths.BRANCH_DIR, `${branchId}.xml`)
            : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        newItemPath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
        newUrlPath = `Department/${newItemId}.xml`;
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }
    
    const newUrl = constructServiceUrl(protocol, host, port, newUrlPath);

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
    const { protocol, host, port } = await getServiceUrlComponents();

    let parentMenuPath, oldItemPath, newItemPath, newUrlPath, revalidationPath;

    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        oldItemPath = path.join(paths.BRANCH_DIR, `${oldItemId}.xml`);
        newItemPath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
        newUrlPath = `Branch/${newItemId}.xml`;
        revalidationPath = `/${zoneId}`;
    } else { // It's a locality
        parentMenuPath = branchId
            ? path.join(paths.BRANCH_DIR, `${branchId}.xml`)
            : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        oldItemPath = path.join(paths.DEPARTMENT_DIR, `${oldItemId}.xml`);
        newItemPath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
        newUrlPath = `Department/${newItemId}.xml`;
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }

    const newUrl = constructServiceUrl(protocol, host, port, newUrlPath);

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
        // 1. Delete the item's own XML file
        await fs.unlink(itemPathToDelete);

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

    if (!path.isAbsolute(newPath)) {
        return { success: false, message: "Path must be absolute." };
    }

    try {
        const stats = await fs.stat(newPath);
        if (!stats.isDirectory()) {
            return { success: false, message: "The specified path is not a directory." };
        }
        await saveDirConfig({ ivoxsRootPath: newPath });
        revalidatePath('/', 'layout');
        return { success: true, message: "Directory root path updated successfully." };
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return { success: false, message: "The specified path does not exist." };
        }
        return { success: false, message: "Failed to update directory path.", error: e.message };
    }
}

export async function updateXmlUrlsAction(host: string, port: string): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const paths = await getPaths();
    const { protocol } = await getServiceUrlComponents();
    
    const updateUrlsInFile = async (filePath: string | null) => {
        if (!filePath) {
            console.warn("[updateXmlUrlsAction] Skipping update because file path is null.");
            return;
        }
        const fileContent = await readAndParseXML(filePath);
        if (!fileContent?.CiscoIPPhoneMenu?.MenuItem) return;

        fileContent.CiscoIPPhoneMenu.MenuItem = ensureArray(fileContent.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            try {
                let url;
                try {
                    // This handles potentially malformed URLs by trying to parse them first
                    url = new URL(item.URL);
                } catch (e) {
                    // If the URL is invalid, log it and return the item without changing it.
                    console.warn(`[updateXmlUrlsAction] Skipping invalid URL "${item.URL}" in file ${filePath}. Error: ${(e as Error).message}`);
                    return item; 
                }

                const pathParts = url.pathname.split('/').filter(p => p); 
                
                // Ensure there's a path to work with. e.g., /directory/Department/Bavaro.xml -> ['directory', 'Department', 'Bavaro.xml']
                if (pathParts.length >= 2) {
                    const relativePath = pathParts.slice(-2).join('/'); 
                    item.URL = constructServiceUrl(protocol, host, port, relativePath);
                } else {
                     console.warn(`[updateXmlUrlsAction] Could not process URL, not enough path segments: ${item.URL}`);
                }
            } catch (e) {
                // Catch any other unexpected errors during processing
                console.error(`[updateXmlUrlsAction] Unexpected error processing URL "${item.URL}" in file ${filePath}. Error: ${(e as Error).message}`);
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
        
        const branchFiles = await fs.readdir(paths.BRANCH_DIR);
         for(const file of branchFiles) {
            if(file.endsWith('.xml')) {
                await updateUrlsInFile(path.join(paths.BRANCH_DIR, file));
            }
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

export async function syncFromActiveDirectoryAction(params: AdSyncFormValues): Promise<AdSyncResult> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }
    return { success: false, message: "This feature is not yet implemented."};
}

// ===================
// Search Action
// ===================

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  if (query.trim().length < 2) {
    return [];
  }
  
  const { IVOXS_DIR, MAINMENU_PATH, MAINMENU_FILENAME } = await getPaths();
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
            const itemType = getItemTypeFromUrl(item.URL);
            
            if (itemType === 'locality') {
                if (!allLocalities.has(itemId)) {
                  allLocalities.set(itemId, { name: item.Name, ...context });
                }
            } else if (itemType === 'branch') {
                const newContext = { ...context, branchId: itemId, branchName: item.Name };
                // Instead of assuming the sub-directory, parse it from the URL
                const url = new URL(item.URL);
                const branchFilePath = path.join(IVOXS_DIR, ...url.pathname.split('/').slice(2)); // Reconstruct path from URL
                
                try {
                  await fs.access(branchFilePath);
                  await processMenu(branchFilePath, newContext);
                } catch {
                  console.warn(`[Search] Branch file not found, skipping: ${branchFilePath}`);
                }
            }
        }
    } catch(e) {
      console.warn(`[Search] Could not process menu file ${filePath}:`, e);
    }
  };


  if (!MAINMENU_PATH) {
    console.error(`[Search] Fatal: Main menu file (e.g., mainmenu.xml) not found at ${IVOXS_DIR}. Search cannot proceed.`);
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
          const url = new URL(zoneMenuItem.URL);
          const zoneFilePath = path.join(IVOXS_DIR, ...url.pathname.split('/').slice(2));
          
          try {
            await fs.access(zoneFilePath);
            await processMenu(zoneFilePath, zoneContext);
          } catch {
            console.warn(`[Search] Zone file not found, skipping: ${zoneFilePath}`);
          }
      }
    } catch(e) {
      console.error(`[Search] Fatal: Could not process ${MAINMENU_FILENAME}:`, e);
      return [];
    }
  }

  const resultsMap = new Map<string, GlobalSearchResult>();

  for (const [localityId, localityInfo] of allLocalities.entries()) {
      const localityNameMatch = localityInfo.name.toLowerCase().includes(lowerQuery);
      let matchingExtensions: MatchedExtension[] = [];

      // We don't know the subdirectory for department, so we have to search for it.
      // This is inefficient. A better approach would be to get the full path from the locality's URL.
      // For now, we assume it is in a "Department" subfolder. This is a remaining assumption.
      const departmentFilePath = path.join(IVOXS_DIR, 'Department', `${localityId}.xml`);
      
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
