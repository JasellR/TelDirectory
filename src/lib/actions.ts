
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, CiscoIPPhoneDirectory, MenuItem as XmlMenuItem, DirectoryEntry as XmlDirectoryEntry, SyncResult, CsvImportResult, CsvImportDetails, GlobalSearchResult, MatchedExtension, SyncConflict, ConflictedExtensionInfo, MissingExtensionInfo, AdSyncFormValues, AdSyncResult, AdSyncDetails, Extension } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth-actions';
import { getDb } from '@/lib/db';
import ldap, { type SearchEntryObject, type SearchOptions, type Client, type SearchEntry } from 'ldapjs';


// Helper to get all dynamic paths based on the resolved IVOXS root
async function getIvoxsPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  return {
    IVOXS_DIR: ivoxsRoot,
    ZONE_BRANCH_DIR: path.join(ivoxsRoot, 'zonebranch'), // lowercase
    BRANCH_DIR: path.join(ivoxsRoot, 'branch'),         // lowercase
    DEPARTMENT_DIR: path.join(ivoxsRoot, 'department'), // lowercase
    MAINMENU_FILENAME: 'MainMenu.xml' // PascalCase
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
  const cleanedName = name.replace(/[^a-zA-Z0-9\\s_.-]/g, ''); // Allow specific characters, remove others
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
  if (url.includes('/branch/')) return 'branch';
  if (url.includes('/department/')) return 'locality';
  return 'unknown';
}

// Helper to get configured service URL components
async function getServiceUrlComponents(paths: Awaited<ReturnType<typeof getIvoxsPaths>>): Promise<{ protocol: string, host: string, port: string }> {
  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  let protocol = 'http';
  let host = '127.0.0.1';
  let port = '3000';
  try {
    const netConfigData = await fs.readFile(networkConfigPath, 'utf-8');
    const netConfig = JSON.parse(netConfigData);
    if (netConfig.protocol) protocol = netConfig.protocol;
    if (netConfig.host) host = netConfig.host;
    if (netConfig.port) port = netConfig.port;
  } catch (e) {
    // console.warn(`[getServiceUrlComponents] Network config for XML URLs at ${networkConfigPath} not found or unreadable. Using defaults.`);
  }
  return { protocol, host, port };
}

function constructServiceUrl(protocol: string, host: string, port: string, pathSegment: string): string {
  let baseUrl = `${protocol}://${host}`;
  if (port && !((protocol === 'http' && port === '80') || (protocol === 'https' && port === '443'))) {
    baseUrl += `:${port}`;
  }
  return `${baseUrl}${pathSegment}`;
}


export async function addZoneAction(zoneName: string): Promise<{ success: boolean; message: string; error?: string; zoneId?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  const newZoneId = generateIdFromName(zoneName);
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);

  const { protocol, host, port } = await getServiceUrlComponents(paths);
  const newZoneUrl = constructServiceUrl(protocol, host, port, `/ivoxsdir/zonebranch/${newZoneId}.xml`);

  try {
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      const newMainMenuContent: { CiscoIPPhoneMenu: CiscoIPPhoneMenu } = {
        CiscoIPPhoneMenu: {
          Title: "Farmacia Carol",
          Prompt: "Select a Zone Branch",
          MenuItem: [{ Name: zoneName, URL: newZoneUrl }]
        }
      };
      await buildAndWriteXML(mainMenuPath, newMainMenuContent);
    } else {
      let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      if (menuItems.some(item => extractIdFromUrl(item.URL) === newZoneId || item.Name === zoneName)) {
        return { success: false, message: `A zone with name "${zoneName}" or ID "${newZoneId}" already exists in MainMenu.` };
      }
      menuItems.push({ Name: zoneName, URL: newZoneUrl });
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
      parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
      await buildAndWriteXML(mainMenuPath, parsedMainMenu);
    }

    const newZoneBranchContent: { CiscoIPPhoneMenu: CiscoIPPhoneMenu } = {
      CiscoIPPhoneMenu: {
        Title: zoneName,
        Prompt: "Select an item"
      }
    };
    await buildAndWriteXML(newZoneBranchFilePath, newZoneBranchContent);

    revalidatePath('/');
    return { success: true, message: `Zone "${zoneName}" added successfully.`, zoneId: newZoneId };

  } catch (error: any) {
    console.error(`Error adding zone "${zoneName}":`, error);
    return { success: false, message: `Failed to add zone: ${error.message}`, error: error.message };
  }
}

export async function deleteZoneAction(zoneId: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  if (!zoneId) {
    return { success: false, message: 'Zone ID is required.' };
  }

  const paths = await getIvoxsPaths();
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const zoneFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  const filesToDelete: string[] = [];

  try {
    console.log(`[DeleteZone] Starting deletion for zone: ${sanitizedZoneId}`);
    const parsedZoneXml = await readAndParseXML(zoneFilePath);

    if (parsedZoneXml && parsedZoneXml.CiscoIPPhoneMenu) {
      const zoneMenuItems = ensureArray(parsedZoneXml.CiscoIPPhoneMenu.MenuItem);
      for (const zoneItem of zoneMenuItems) {
        const itemType = getItemTypeFromUrl(zoneItem.URL);
        const itemId = extractIdFromUrl(zoneItem.URL);

        if (itemType === 'branch') {
          const branchFilePath = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
          filesToDelete.push(branchFilePath);
          console.log(`[DeleteZone] Queued branch file for deletion: ${branchFilePath}`);
          const parsedBranchXml = await readAndParseXML(branchFilePath);
          if (parsedBranchXml && parsedBranchXml.CiscoIPPhoneMenu) {
            const branchMenuItems = ensureArray(parsedBranchXml.CiscoIPPhoneMenu.MenuItem);
            for (const branchItem of branchMenuItems) {
              const departmentId = extractIdFromUrl(branchItem.URL);
              const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${departmentId}.xml`);
              filesToDelete.push(departmentFilePath);
              console.log(`[DeleteZone] Queued department file (from branch ${itemId}) for deletion: ${departmentFilePath}`);
            }
          }
        } else if (itemType === 'locality') {
          const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${itemId}.xml`);
          filesToDelete.push(departmentFilePath);
          console.log(`[DeleteZone] Queued department file (from zone ${sanitizedZoneId}) for deletion: ${departmentFilePath}`);
        }
      }
    }
    filesToDelete.push(zoneFilePath); 
    console.log(`[DeleteZone] Queued zone file for deletion: ${zoneFilePath}`);

    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
        console.log(`[DeleteZone] Successfully deleted: ${filePath}`);
      } catch (unlinkError: any) {
        if (unlinkError.code !== 'ENOENT') { 
          console.warn(`[DeleteZone] Could not delete file ${filePath}: ${unlinkError.message}`);
        } else {
          console.log(`[DeleteZone] File not found, skipping deletion: ${filePath}`);
        }
      }
    }

    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
      let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      const initialLength = menuItems.length;
      menuItems = menuItems.filter(item => extractIdFromUrl(item.URL) !== sanitizedZoneId);
      if (menuItems.length < initialLength) { 
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined; 
        await buildAndWriteXML(mainMenuPath, parsedMainMenu);
        console.log(`[DeleteZone] Updated ${paths.MAINMENU_FILENAME}`);
      } else {
        console.log(`[DeleteZone] Zone ${sanitizedZoneId} not found in ${paths.MAINMENU_FILENAME}, no update needed.`);
      }
    } else {
      console.warn(`[DeleteZone] ${paths.MAINMENU_FILENAME} not found or invalid, cannot remove zone entry.`);
    }

    revalidatePath('/'); 
    revalidatePath(`/${sanitizedZoneId}`, 'page'); 
    console.log(`[DeleteZone] Zone "${sanitizedZoneId}" and its contents deleted successfully.`);
    return { success: true, message: `Zone "${sanitizedZoneId}" and its contents deleted successfully.` };

  } catch (error: any) {
    console.error(`[DeleteZone] Error deleting zone "${sanitizedZoneId}":`, error);
    return { success: false, message: `Failed to delete zone: ${error.message}`, error: error.message };
  }
}


interface AddItemArgs {
  zoneId: string;
  branchId?: string; 
  itemName: string;
  itemType: 'branch' | 'locality';
}
export async function addLocalityOrBranchAction(args: AddItemArgs): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  const { zoneId, branchId, itemName, itemType } = args;
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const newItemId = generateIdFromName(itemName); 

  const { protocol, host, port } = await getServiceUrlComponents(paths);
  
  let parentFilePath: string;
  let childDirPath: string;
  let newChildItemUrl: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot add a branch under another branch using this action."}; 
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childDirPath = paths.BRANCH_DIR;
    newChildItemUrl = constructServiceUrl(protocol, host, port, `/ivoxsdir/branch/${newItemId}.xml`);
    itemTypeNameForMessage = "Branch";
  } else { 
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (to branch)";
    } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (to zone)";
    }
    childDirPath = paths.DEPARTMENT_DIR;
    newChildItemUrl = constructServiceUrl(protocol, host, port, `/ivoxsdir/department/${newItemId}.xml`);
  }
  const childFilePath = path.join(childDirPath, `${newItemId}.xml`); 

  try {
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);

    if (menuItems.some(item => extractIdFromUrl(item.URL) === newItemId || item.Name === itemName)) {
        return { success: false, message: `An item with name "${itemName}" or ID "${newItemId}" already exists in ${path.basename(parentFilePath)}.` };
    }

    menuItems.push({ Name: itemName, URL: newChildItemUrl });
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); 
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    let newChildXmlContent;
    if (itemType === 'branch') {
      newChildXmlContent = { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a locality' } };
    } else { 
      newChildXmlContent = { CiscoIPPhoneDirectory: { Title: itemName, Prompt: 'Select an extension' } };
    }
    await buildAndWriteXML(childFilePath, newChildXmlContent);

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);

    return { success: true, message: `${itemTypeNameForMessage} "${itemName}" added successfully.` };
  } catch (error: any) {
    console.error(`Error adding ${itemType} "${itemName}":`, error);
    return { success: false, message: `Failed to add ${itemType}: ${error.message}`, error: error.message };
  }
}


interface EditItemArgs {
  zoneId: string;
  branchId?: string; 
  oldItemId: string;
  newItemName: string;
  itemType: 'branch' | 'locality';
}
export async function editLocalityOrBranchAction(args: EditItemArgs): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }
  const paths = await getIvoxsPaths();
  const { zoneId, branchId, oldItemId, newItemName, itemType } = args;
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedOldItemId = sanitizeFilenamePart(oldItemId);
  const newItemId = generateIdFromName(newItemName); 

  const { protocol, host, port } = await getServiceUrlComponents(paths);

  let parentFilePath: string;
  let oldChildFilePath: string;
  let newChildFilePath: string; 
  let newChildItemUrlSegment: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot edit a branch under another branch context using this action."};
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    oldChildFilePath = path.join(paths.BRANCH_DIR, `${sanitizedOldItemId}.xml`);
    newChildFilePath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
    newChildItemUrlSegment = `/ivoxsdir/branch/${newItemId}.xml`;
    itemTypeNameForMessage = "Branch";
  } else { 
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (in branch)";
    } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (in zone)";
    }
    oldChildFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedOldItemId}.xml`);
    newChildFilePath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
    newChildItemUrlSegment = `/ivoxsdir/department/${newItemId}.xml`;
  }
  const newChildFullUrl = constructServiceUrl(protocol, host, port, newChildItemUrlSegment);

  try {
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    const itemIndex = menuItems.findIndex(item => extractIdFromUrl(item.URL) === sanitizedOldItemId);
    if (itemIndex === -1) {
      return { success: false, message: `${itemTypeNameForMessage} with ID "${sanitizedOldItemId}" not found in ${path.basename(parentFilePath)}.` };
    }

    if (newItemName !== menuItems[itemIndex].Name || newItemId !== sanitizedOldItemId) {
      if (menuItems.some((item, index) => index !== itemIndex && (extractIdFromUrl(item.URL) === newItemId || item.Name === newItemName))) {
        return { success: false, message: `Another item with name "${newItemName}" or ID "${newItemId}" already exists in ${path.basename(parentFilePath)}.` };
      }
    }

    menuItems[itemIndex].Name = newItemName;
    if (newItemId !== sanitizedOldItemId) { 
      menuItems[itemIndex].URL = newChildFullUrl;
    }
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); 
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    if (newItemId !== sanitizedOldItemId) {
      try {
        await fs.rename(oldChildFilePath, newChildFilePath);
      } catch (renameError: any) {
        if (renameError.code === 'ENOENT') {
          console.warn(`Old child file ${oldChildFilePath} not found during rename. Creating new file ${newChildFilePath}.`);
          const newChildXmlContent = itemType === 'branch'
            ? { CiscoIPPhoneMenu: { Title: newItemName, Prompt: 'Select a locality' } }
            : { CiscoIPPhoneDirectory: { Title: newItemName, Prompt: 'Select an extension' } };
          await buildAndWriteXML(newChildFilePath, newChildXmlContent);
        } else { throw renameError; } 
      }
    }

    const childFileToUpdate = newItemId === sanitizedOldItemId ? oldChildFilePath : newChildFilePath;
    const parsedChildXml = await readAndParseXML(childFileToUpdate);
    if (parsedChildXml) { 
        if (itemType === 'branch' && parsedChildXml.CiscoIPPhoneMenu) {
            parsedChildXml.CiscoIPPhoneMenu.Title = newItemName;
        } else if (itemType === 'locality' && parsedChildXml.CiscoIPPhoneDirectory) {
            parsedChildXml.CiscoIPPhoneDirectory.Title = newItemName;
        }
        await buildAndWriteXML(childFileToUpdate, parsedChildXml);
    } else {
        console.warn(`Child file ${childFileToUpdate} not found after potential rename/creation for title update. Creating it now.`);
        const newChildXmlContent = itemType === 'branch'
            ? { CiscoIPPhoneMenu: { Title: newItemName, Prompt: 'Select a locality' } }
            : { CiscoIPPhoneDirectory: { Title: newItemName, Prompt: 'Select an extension' } };
        await buildAndWriteXML(childFileToUpdate, newChildXmlContent);
    }

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    if (itemType === 'locality' && branchId) {
        revalidatePath(`/${sanitizedZoneId}/branches/${branchId}/localities/${sanitizedOldItemId}`);
        if (newItemId !== sanitizedOldItemId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}/localities/${newItemId}`);
    } else if (itemType === 'locality') {
        revalidatePath(`/${sanitizedZoneId}/localities/${sanitizedOldItemId}`);
        if (newItemId !== sanitizedOldItemId) revalidatePath(`/${sanitizedZoneId}/localities/${newItemId}`);
    }


    return { success: true, message: `${itemTypeNameForMessage} "${sanitizedOldItemId}" updated to "${newItemName}".` };
  } catch (error: any) {
    console.error(`Error editing ${itemType} ${sanitizedOldItemId}:`, error);
    return { success: false, message: `Failed to edit ${itemType}: ${error.message}`, error: error.message };
  }
}


interface DeleteItemArgs {
  zoneId: string;
  branchId?: string; 
  itemId: string;
  itemName: string; 
  itemType: 'branch' | 'locality';
}
export async function deleteLocalityOrBranchAction(args: DeleteItemArgs): Promise<{ success: boolean; message: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.' };
  }
  const paths = await getIvoxsPaths();
  const { zoneId, branchId, itemId, itemType } = args; 
  if (!zoneId || !itemId) {
    return { success: false, message: 'Zone ID and Item ID are required.' };
  }
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedItemId = sanitizeFilenamePart(itemId);

  let parentFilePath: string;
  let childFilePath: string;
  let itemTypeNameForMessage: string = itemType === 'branch' ? 'Branch' : 'Locality';

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot delete a branch from within another branch context."}; 
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childFilePath = path.join(paths.BRANCH_DIR, `${sanitizedItemId}.xml`);
  } else { 
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
    } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    }
    childFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedItemId}.xml`);
  }

  try {
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      console.warn(`Parent XML file ${path.basename(parentFilePath)} not found or invalid during delete operation. Proceeding to delete child file.`);
    } else {
      let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
      const initialLength = menuItems.length;
      menuItems = menuItems.filter(item => !(item && typeof item.URL === 'string' && extractIdFromUrl(item.URL) === sanitizedItemId));
      if (menuItems.length < initialLength) { 
        parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
        await buildAndWriteXML(parentFilePath, parsedParentXml);
      }
    }

    try {
      await fs.unlink(childFilePath);
    } catch (unlinkError: any) {
      if (unlinkError.code !== 'ENOENT') { 
        console.warn(`Could not delete child file ${childFilePath}: ${unlinkError.message}`);
      }
    }

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    if (itemType === 'locality' && branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}/localities/${sanitizedItemId}`);
    else if (itemType === 'locality') revalidatePath(`/${sanitizedZoneId}/localities/${sanitizedItemId}`);


    return { success: true, message: `${itemTypeNameForMessage} "${args.itemName}" (ID: ${sanitizedItemId}) deleted.` };
  } catch (error: any) {
    console.error(`Error deleting ${itemType} ${sanitizedItemId}:`, error);
    return { success: false, message: `Failed to delete ${itemType}: ${error.message}` };
  }
}

export async function addExtensionAction(localityId: string, name: string, telephone: string): Promise<CsvImportResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return {
        success: false,
        message: 'Authentication required.',
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: '', error: 'User not authenticated'}]}
    };
  }

  const paths = await getIvoxsPaths();
  try {
    const sanitizedLocalityId = sanitizeFilenamePart(localityId);
    if (!sanitizedLocalityId) return {
        success: false,
        message: 'Invalid Locality ID.' ,
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: localityId, error: 'Invalid Locality ID'}]}
    };

    const trimmedName = name.trim();
    if (!trimmedName) return {
        success: false,
        message: 'Extension name cannot be empty.',
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: name, error: 'Extension name cannot be empty'}]}
    };

    const trimmedTelephone = telephone.trim();
    if (!trimmedTelephone) return {
        success: false,
        message: 'Extension telephone cannot be empty.',
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: telephone, error: 'Extension telephone cannot be empty'}]}
    };

    const isDigitsOnly = /^\d+$/.test(trimmedTelephone);
    if (!isDigitsOnly) {
      return {
          success: false,
          message: 'SERVER: Extension telephone must be a valid number.',
          details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: telephone, error: 'Extension telephone must be a valid number'}]}
      };
    }

    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);
    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    let directoryObject: { CiscoIPPhoneDirectory: CiscoIPPhoneDirectory };

    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      console.warn(`[AddExtensionAction] Department file ${departmentFilePath} not found or invalid. Creating new one.`);
      directoryObject = {
        CiscoIPPhoneDirectory: {
          Title: sanitizedLocalityId, 
          Prompt: 'Select an extension',
          DirectoryEntry: [{ Name: trimmedName, Telephone: trimmedTelephone }],
        }
      };
    } else {
      directoryObject = parsedDepartmentXml;
      let directoryEntries = ensureArray(directoryObject.CiscoIPPhoneDirectory.DirectoryEntry);
      if (directoryEntries.some(entry => entry.Name === trimmedName && entry.Telephone === trimmedTelephone)) {
        return {
            success: false,
            message: `An extension with Name "${trimmedName}" and Telephone "${trimmedTelephone}" already exists.`,
            details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: `${name}-${telephone}`, error: 'Extension already exists'}]}
        };
      }
      directoryEntries.push({ Name: trimmedName, Telephone: trimmedTelephone });
      directoryEntries.sort((a, b) => {
        const nameComparison = a.Name.localeCompare(b.Name);
        if (nameComparison !== 0) return nameComparison;
        return a.Telephone.localeCompare(b.Telephone);
      });
      directoryObject.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries.length > 0 ? directoryEntries : undefined;
    }

    await buildAndWriteXML(departmentFilePath, directoryObject);

    revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
    revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');

    return {
        success: true,
        message: `Extension "${trimmedName}" added to locality "${sanitizedLocalityId}".`,
        details: { processedRows: 1, extensionsAdded: 1, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: []}
    };
  } catch (overallError: any) {
    console.error(`[AddExtensionAction Error] Failed to add extension to ${localityId}:`, overallError);
    return {
        success: false,
        message: `An unexpected error occurred while adding the extension. ${overallError.message || 'Unknown error'}`,
        error: overallError.toString(),
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: `${name}-${telephone}`, error: overallError.message || 'Unknown server error'}]}
    };
  }
}

interface EditExtensionArgs {
  localityId: string;
  oldExtensionName: string;
  oldExtensionNumber: string;
  newExtensionName: string;
  newExtensionNumber: string;
}

export async function editExtensionAction(args: EditExtensionArgs): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  try {
    const paths = await getIvoxsPaths();
    const { localityId, oldExtensionName, oldExtensionNumber, newExtensionName, newExtensionNumber } = args;

    const sanitizedLocalityId = sanitizeFilenamePart(localityId);
    if (!sanitizedLocalityId) return { success: false, message: 'Invalid Locality ID.' };

    const trimmedNewName = newExtensionName.trim();
    if (!trimmedNewName) return { success: false, message: 'New extension name cannot be empty.' };

    const trimmedNewNumber = newExtensionNumber.trim();
    if (!trimmedNewNumber) return { success: false, message: 'New extension telephone cannot be empty.' };

    const isNewNumDigitsOnly = /^\d+$/.test(trimmedNewNumber);
    if (!isNewNumDigitsOnly) {
      return { success: false, message: 'SERVER: New extension telephone must be a valid number.' };
    }

    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);
    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      return { success: false, message: `Department file ${sanitizedLocalityId}.xml not found or invalid.` };
    }

    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    const entryIndex = directoryEntries.findIndex(
      (entry) => entry.Name === oldExtensionName && entry.Telephone === oldExtensionNumber
    );

    if (entryIndex === -1) {
      return { success: false, message: `Original extension "${oldExtensionName} - ${oldExtensionNumber}" not found.` };
    }

    if (trimmedNewName !== oldExtensionName || trimmedNewNumber !== oldExtensionNumber) {
      const conflictExists = directoryEntries.some(
        (entry, index) =>
          index !== entryIndex && 
          entry.Name === trimmedNewName &&
          entry.Telephone === trimmedNewNumber
      );
      if (conflictExists) {
        return { success: false, message: `Another extension with name "${trimmedNewName}" and number "${trimmedNewNumber}" already exists.` };
      }
    }

    directoryEntries[entryIndex].Name = trimmedNewName;
    directoryEntries[entryIndex].Telephone = trimmedNewNumber;

    directoryEntries.sort((a, b) => {
      const nameComparison = a.Name.localeCompare(b.Name);
      if (nameComparison !== 0) return nameComparison;
      return a.Telephone.localeCompare(b.Telephone);
    });

    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries.length > 0 ? directoryEntries : undefined;
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);

    revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
    revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');

    return { success: true, message: `Extension "${oldExtensionName}" updated to "${trimmedNewName}".` };
  } catch (error: any) {
    console.error(`[EditExtensionAction Error] Failed to edit extension in ${args.localityId}:`, error);
    return { success: false, message: `An unexpected error occurred while editing the extension. ${error.message || 'Unknown error'}`, error: error.toString() };
  }
}


export async function deleteExtensionAction(localityId: string, extensionDepartment: string, extensionNumber: string): Promise<{ success: boolean; message: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.' };
  }
  const paths = await getIvoxsPaths();
  if (!localityId || !extensionDepartment || !extensionNumber) {
    return { success: false, message: 'Locality ID, extension department, and number are required.' };
  }
  const sanitizedLocalityId = sanitizeFilenamePart(localityId);
  const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);
  try {
    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      return { success: false, message: `Department file ${sanitizedLocalityId}.xml not found or invalid.` };
    }
    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    directoryEntries = directoryEntries.filter(entry => !(entry.Name === extensionDepartment && entry.Telephone === extensionNumber));
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries.length > 0 ? directoryEntries : undefined; 
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);

    revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
    revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');

    return { success: true, message: `Extension ${extensionDepartment} (${extensionNumber}) deleted from ${sanitizedLocalityId}.` };
  } catch (error: any) {
    console.error(`Error deleting extension from ${sanitizedLocalityId}:`, error);
    return { success: false, message: `Failed to delete extension: ${error.message}` };
  }
}


export async function updateDirectoryRootPathAction(newPath: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  if (!newPath || !newPath.trim()) {
    return { success: false, message: "Directory path cannot be empty." };
  }

  const isAbsolutePath = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
  if (!isAbsolutePath(newPath.trim())) {
    return { success: false, message: "Directory path must be an absolute path." };
  }

  const trimmedPath = newPath.trim();

  try {
    const stats = await fs.stat(trimmedPath);
    if (!stats.isDirectory()) {
      return { success: false, message: `The provided path "${trimmedPath}" is not a directory.` };
    }
    const pathsInfo = await getIvoxsPaths(); 
    await fs.access(path.join(trimmedPath, pathsInfo.MAINMENU_FILENAME), fs.constants.F_OK);

    await saveDirConfig({ ivoxsRootPath: trimmedPath });
    revalidatePath('/import-xml', 'page'); 
    revalidatePath('/', 'layout'); 

    return { success: true, message: `ivoxsdir directory root path updated to: ${trimmedPath}` };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       const pathsInfo = await getIvoxsPaths(); 
       return { success: false, message: `The provided path "${trimmedPath}" does not exist or ${pathsInfo.MAINMENU_FILENAME} was not found within it.` , error: error.message };
    }
    console.error('Error updating directory root path:', error);
    return { success: false, message: `Failed to update directory path: ${error.message}`, error: error.message };
  }
}


async function processSingleXmlFileForHostUpdate(filePath: string, newProtocol: string, newHost: string, newPort: string): Promise<{ success: boolean; error?: string; filePath: string; changed: boolean }> {
  let fileChanged = false;
  try {
    const parsedXml = await readAndParseXML(filePath);
    if (!parsedXml || !parsedXml.CiscoIPPhoneMenu) {
      return { success: true, filePath: filePath, changed: fileChanged };
    }

    const menuItems = ensureArray(parsedXml.CiscoIPPhoneMenu.MenuItem);
    if (!menuItems || menuItems.length === 0) {
      return { success: true, filePath: filePath, changed: fileChanged };
    }

    for (const menuItem of menuItems) {
      if (menuItem && typeof menuItem.URL === 'string') {
        try {
          const urlObj = new URL(menuItem.URL);
          let urlWasUpdated = false;
          if (newProtocol && urlObj.protocol !== `${newProtocol}:`) {
            urlObj.protocol = newProtocol;
            urlWasUpdated = true;
          }
          if (newHost && urlObj.hostname !== newHost) {
            urlObj.hostname = newHost;
            urlWasUpdated = true;
          }
          
          let portToSet = newPort;
          if ((newProtocol === 'http' && newPort === '80') || (newProtocol === 'https' && newPort === '443')) {
            portToSet = ''; // Standard ports don't need to be specified
          }
          
          if (urlObj.port !== portToSet) {
            urlObj.port = portToSet;
            urlWasUpdated = true;
          }

          if (urlWasUpdated) {
            menuItem.URL = urlObj.toString();
            fileChanged = true;
          }
        } catch (urlError) {
           console.warn(`[processSingleXmlFileForHostUpdate] Skipped malformed URL "${menuItem.URL}" in ${filePath}: ${urlError}`);
        }
      }
    }

    if (fileChanged) {
      await buildAndWriteXML(filePath, parsedXml);
    }  
    return { success: true, filePath: filePath, changed: fileChanged };
  } catch (error: any) {
    console.error(`[processSingleXmlFileForHostUpdate] Error processing file ${filePath} for host update:`, error);
    return { success: false, error: error.message, filePath: filePath, changed: fileChanged };
  }
}

export async function updateXmlUrlsAction(hostInput: string, portInput: string): Promise<{ success: boolean; message: string; error?: string; filesProcessed?: number; filesFailed?: number, filesChangedCount?: number }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  const newHost = hostInput.trim();
  const newPort = portInput.trim();

  if (!newHost && !newPort) {
    return { success: false, message: "Host or Port must be provided to update XML URLs." };
  }
  if (newPort && !/^\d+$/.test(newPort) && newPort !== '') { // Allow empty port to remove it
    return { success: false, message: "Port must be a valid number or empty." };
  }

  const protocol = newPort === '443' ? 'https' : 'http';

  let filesProcessed = 0;
  let filesFailed = 0;
  let filesChangedCount = 0;
  const failedFilePaths: string[] = [];

  const allFilesToProcess: string[] = [];
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  try {
    await fs.access(mainMenuPath); 
    allFilesToProcess.push(mainMenuPath);
  } catch (e) {
    console.warn(`MainMenu.xml not found at ${mainMenuPath}, skipping URL update for it.`);
  }

  try {
    const zoneBranchFiles = await fs.readdir(paths.ZONE_BRANCH_DIR);
    zoneBranchFiles.filter(f => f.endsWith('.xml')).forEach(f => allFilesToProcess.push(path.join(paths.ZONE_BRANCH_DIR, f)));
  } catch (e: any) {
    if (e.code !== 'ENOENT') console.warn(`Could not read zonebranch directory: ${paths.ZONE_BRANCH_DIR}`, e);
  }

  try {
    const branchFiles = await fs.readdir(paths.BRANCH_DIR);
    branchFiles.filter(f => f.endsWith('.xml')).forEach(f => allFilesToProcess.push(path.join(paths.BRANCH_DIR, f)));
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
        console.warn(`Could not read branch directory: ${paths.BRANCH_DIR}`, e);
    }
  }


  for (const filePath of allFilesToProcess) {
    filesProcessed++;
    const result = await processSingleXmlFileForHostUpdate(filePath, protocol, newHost, newPort);
    if (!result.success) {
      filesFailed++;
      failedFilePaths.push(result.filePath);
    }
    if (result.changed) {
        filesChangedCount++;
    }
  }

  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  try {
    await fs.writeFile(networkConfigPath, JSON.stringify({ protocol, host: newHost, port: newPort }, null, 2));
    console.log(`[updateXmlUrlsAction] Network config saved to ${networkConfigPath}`);
  } catch (configError) {
    console.error(`[updateXmlUrlsAction] Failed to save network config: ${configError}`);
  }

  revalidatePath('/', 'layout'); 


  if (filesFailed > 0) {
    return {
      success: false,
      message: `Failed to update URLs in ${filesFailed} files. ${filesChangedCount} files changed. Please check server logs. Failed files: ${failedFilePaths.join(', ')}`,
      filesProcessed,
      filesFailed,
      filesChangedCount
    };
  }

  return {
    success: true,
    message: `XML URL update process completed. ${filesProcessed} files checked, ${filesChangedCount} files updated. Network settings saved.`,
    filesProcessed,
    filesFailed,
    filesChangedCount
  };
}

interface UpdateParentMenuArgs {
  paths: Awaited<ReturnType<typeof getIvoxsPaths>>;
  zoneId: string; 
  localityId: string; 
  localityName: string; 
  isBranchLocality?: boolean; 
}

async function updateParentMenuWithNewLocality(args: UpdateParentMenuArgs): Promise<{ success: boolean; error?: string; itemAddedOrParentCreated: boolean }> {
  const { paths, zoneId, localityId, localityName, isBranchLocality } = args;
  let parentFilePath: string;
  let parentFileCreated = false;
  let itemAdded = false;

  const sanitizedZoneId = sanitizeFilenamePart(zoneId); 
  const sanitizedLocalityId = sanitizeFilenamePart(localityId);

  const { protocol, host, port } = await getServiceUrlComponents(paths);
  const newLocalityUrl = constructServiceUrl(protocol, host, port, `/ivoxsdir/department/${sanitizedLocalityId}.xml`);

  if (isBranchLocality) {
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedZoneId}.xml`);
  } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
  }

  try {
    let parsedParentXml = await readAndParseXML(parentFilePath);

    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      const parentTitle = zoneId; 
      parsedParentXml = {
        CiscoIPPhoneMenu: {
          Title: parentTitle,
          Prompt: 'Select an item', 
          MenuItem: [],
        },
      };
      parentFileCreated = true;
    }

    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    const existingItemIndex = menuItems.findIndex(item => extractIdFromUrl(item.URL) === sanitizedLocalityId);

    if (existingItemIndex === -1) {
      menuItems.push({ Name: localityName, URL: newLocalityUrl });
      itemAdded = true; 
    } else if (menuItems[existingItemIndex].Name !== localityName) {
      menuItems[existingItemIndex].Name = localityName;
      itemAdded = true; 
    }
    
    if (itemAdded || parentFileCreated) {
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
      parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
      await buildAndWriteXML(parentFilePath, parsedParentXml);
    } 

    return { success: true, itemAddedOrParentCreated: itemAdded || parentFileCreated };
  } catch (error: any) {
    console.error(`[UpdateParentMenu] Error updating parent menu ${path.basename(parentFilePath)}:`, error);
    return { success: false, error: error.message, itemAddedOrParentCreated: false };
  }
}

export async function importExtensionsFromCsvAction(csvContent: string): Promise<CsvImportResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    const result: CsvImportResult = { success: false, message: 'Authentication required.', details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: '', error: 'User not authenticated'}]} };
    return result;
  }

  const paths = await getIvoxsPaths();
  const lines = csvContent.split(/\r?\n/);
  const results: CsvImportDetails = {
    processedRows: 0,
    extensionsAdded: 0,
    newLocalitiesCreated: 0,
    parentMenusUpdated: 0,
    mainMenuUpdatedCount: 0,
    errors: [],
  };

  const { protocol, host, port } = await getServiceUrlComponents(paths);

  let headerRowSkipped = false;
  const expectedHeaderCols = ["name", "extension", "localityid", "zoneid"];

  const getColumns = (line: string): string[] => {
    let cols = line.split(',').map(col => col.trim());
    if (cols.length < expectedHeaderCols.length && line.includes('\t')) {
      cols = line.split('\t').map(col => col.trim());
    }
    if (cols.length < expectedHeaderCols.length && !line.includes(',') && !line.includes('\t') && /\s{2,}/.test(line)) { 
      cols = line.split(/\s{2,}/).map(col => col.trim());
    }
    return cols;
  };


  if (lines[0]) {
    const potentialHeader = lines[0].trim();
    const headerCols = getColumns(potentialHeader).map(col => col.toLowerCase().replace(/\s+/g, '')); 

    if (
      headerCols.length >= expectedHeaderCols.length &&
      expectedHeaderCols.every(expectedCol => headerCols.includes(expectedCol))
    ) {
      headerRowSkipped = true;
    } 
  }

  const uniqueLocalitiesToUpdateInParentMenu = new Map<string, { localityId: string, localityName: string, zoneId: string, isBranchLocality: boolean, zoneDisplayName: string }>();
  const uniqueNewZonesToUpdateInMainMenu = new Map<string, string>(); 

  try {
    for (let i = headerRowSkipped ? 1 : 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue; 

      results.processedRows++;

      const columns = getColumns(line);

      if (columns.length < 4) {
        results.errors.push({ row: i + 1, data: line, error: 'Row does not have enough columns (expected Name, Extension, LocalityID, ZoneID).' });
        continue;
      }

      const [name, extensionNumber, localityIdFromCsv, zoneIdFromCsv] = columns;

      if (!name || !extensionNumber || !localityIdFromCsv || !zoneIdFromCsv) {
        results.errors.push({ row: i + 1, data: line, error: 'Missing required fields (Name, Extension, LocalityID, or ZoneID).' });
        continue;
      }
      if (!/^\d+$/.test(extensionNumber)) {
        results.errors.push({ row: i + 1, data: line, error: `Extension number "${extensionNumber}" is not valid.` });
        continue;
      }

      const sanitizedLocalityId = generateIdFromName(localityIdFromCsv); 
      const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);

      try {
        let departmentXml = await readAndParseXML(departmentFilePath);
        let newDepartmentFileCreated = false;

        if (!departmentXml || !departmentXml.CiscoIPPhoneDirectory) {
          departmentXml = {
            CiscoIPPhoneDirectory: {
              Title: localityIdFromCsv, 
              Prompt: 'Select an extension',
              DirectoryEntry: [],
            },
          };
          newDepartmentFileCreated = true;
        }

        let entries = ensureArray(departmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
        const existingExtensionIndex = entries.findIndex(
          (entry) => entry.Name === name && entry.Telephone === extensionNumber
        );

        if (existingExtensionIndex !== -1) {
          // Skip
        } else {
          entries.push({ Name: name, Telephone: extensionNumber });
          results.extensionsAdded++;
        }

        entries.sort((a, b) => {
          const nameComparison = a.Name.localeCompare(b.Name);
          if (nameComparison !== 0) return nameComparison;
          return a.Telephone.localeCompare(b.Telephone);
        });
        departmentXml.CiscoIPPhoneDirectory.DirectoryEntry = entries.length > 0 ? entries : undefined;

        await buildAndWriteXML(departmentFilePath, departmentXml);
        if (newDepartmentFileCreated) results.newLocalitiesCreated++;
        
        const isMetropolitanaSpecialBranch = zoneIdFromCsv.toLowerCase().startsWith("adm") && zoneIdFromCsv.length > 3; 
        const parentMenuFileId = generateIdFromName(zoneIdFromCsv); 
        
        const uniqueKey = `${sanitizedLocalityId}__${parentMenuFileId}`;
        if (!uniqueLocalitiesToUpdateInParentMenu.has(uniqueKey)) {
          uniqueLocalitiesToUpdateInParentMenu.set(uniqueKey, { 
            localityId: sanitizedLocalityId, 
            localityName: localityIdFromCsv, 
            zoneId: parentMenuFileId, 
            isBranchLocality: isMetropolitanaSpecialBranch, 
            zoneDisplayName: zoneIdFromCsv 
          });
        }
        
        if (!isMetropolitanaSpecialBranch) {
            const zoneFileId = parentMenuFileId; 
            const zoneBranchFilePathForCheck = path.join(paths.ZONE_BRANCH_DIR, `${zoneFileId}.xml`);
            try {
                await fs.access(zoneBranchFilePathForCheck);
            } catch (zoneFileAccessError) {
                if ((zoneFileAccessError as NodeJS.ErrnoException).code === 'ENOENT') {
                     uniqueNewZonesToUpdateInMainMenu.set(zoneFileId, zoneIdFromCsv); 
                }
            }
        }


      } catch (fileError: any) {
        console.error(`[CSV Import Action] Error processing file for locality ${localityIdFromCsv}:`, fileError);
        results.errors.push({ row: i + 1, data: line, error: `File system error for ${localityIdFromCsv}: ${fileError.message}` });
      }
    }

    for (const [_, { localityId, localityName, zoneId, isBranchLocality }] of uniqueLocalitiesToUpdateInParentMenu) {
      const parentUpdateResult = await updateParentMenuWithNewLocality({
        paths,
        zoneId: zoneId, 
        localityId: localityId, 
        localityName: localityName, 
        isBranchLocality: isBranchLocality
      });
      if (parentUpdateResult.success && parentUpdateResult.itemAddedOrParentCreated) {
        results.parentMenusUpdated++;
      } else if (!parentUpdateResult.success) {
        results.errors.push({ row: 0, data: `ParentMenuUpdate: ${localityId}|${zoneId}`, error: parentUpdateResult.error || 'Failed to update parent menu.' });
      }
    }
    
    if (uniqueNewZonesToUpdateInMainMenu.size > 0) {
      const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
      try {
          let parsedMainMenu = await readAndParseXML(mainMenuPath);
          let mainMenuChanged = false;
          if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
              parsedMainMenu = { CiscoIPPhoneMenu: { Title: "Main Directory", Prompt: "Select an option", MenuItem: [] } };
              mainMenuChanged = true; 
          }
          let mainMenuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);

          for (const [zoneFileId, zoneDisplayName] of uniqueNewZonesToUpdateInMainMenu) {
              const zoneUrl = constructServiceUrl(protocol, host, port, `/ivoxsdir/zonebranch/${zoneFileId}.xml`);
              
              if (!mainMenuItems.some(item => extractIdFromUrl(item.URL) === zoneFileId)) {
                  mainMenuItems.push({ Name: zoneDisplayName, URL: zoneUrl }); 
                  mainMenuChanged = true;
                  results.mainMenuUpdatedCount++;

                  const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneFileId}.xml`);
                  try {
                      await fs.access(zoneBranchFilePath); 
                  } catch (accessError) { 
                      const newZoneBranchContent = {
                          CiscoIPPhoneMenu: {
                              Title: zoneDisplayName, 
                              Prompt: 'Select an item'
                          }
                      };
                      await buildAndWriteXML(zoneBranchFilePath, newZoneBranchContent);
                  }
              }
          }
          if (mainMenuChanged) {
              mainMenuItems.sort((a, b) => a.Name.localeCompare(b.Name));
              parsedMainMenu.CiscoIPPhoneMenu.MenuItem = mainMenuItems.length > 0 ? mainMenuItems : undefined;
              await buildAndWriteXML(mainMenuPath, parsedMainMenu);
          }
      } catch (mainMenuError: any) {
          results.errors.push({ row: 0, data: 'MainMenuUpdate', error: `Failed to update ${paths.MAINMENU_FILENAME}: ${mainMenuError.message}`});
      }
    }

    let message = `CSV import completed. Processed ${results.processedRows} data rows. Added ${results.extensionsAdded} extensions.`;
    if (results.newLocalitiesCreated > 0) message += ` Created ${results.newLocalitiesCreated} new locality files.`;
    if (results.parentMenusUpdated > 0) message += ` Updated ${results.parentMenusUpdated} zone/branch menu files.`;
    if (results.mainMenuUpdatedCount > 0) message += ` Updated MainMenu.xml with ${results.mainMenuUpdatedCount} new zone(s).`;
    if (results.errors.length > 0) message += ` Encountered ${results.errors.length} errors. Check details.`;
    else message += " All rows processed successfully.";


    const finalResult: CsvImportResult = {
      success: results.errors.length === 0,
      message: message,
      details: results,
    };
    revalidatePath('/', 'layout'); 
    return finalResult;

  } catch (overallError: any) {
    console.error("[CSV Import Action] Critical error in importExtensionsFromCsvAction:", overallError);
    const criticalErrorResult: CsvImportResult = {
      success: false,
      message: `Critical Server Error: ${overallError.message || 'Unknown error'}. Check server console for details.`,
      details: { 
        processedRows: results.processedRows,
        extensionsAdded: results.extensionsAdded,
        newLocalitiesCreated: results.newLocalitiesCreated,
        parentMenusUpdated: results.parentMenusUpdated,
        mainMenuUpdatedCount: results.mainMenuUpdatedCount,
        errors: [...results.errors, { row: 0, data: 'CRITICAL', error: overallError.message || 'Unknown critical error' }]
      }
    };
    return criticalErrorResult;
  }
}

export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [], error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  const urls = feedUrlsString.split(/\r?\n/).map(url => url.trim()).filter(url => url);

  if (urls.length === 0) {
    return { success: false, message: 'No feed URLs provided.', updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
  }

  const results = {
    updatedCount: 0,
    filesModified: 0,
    filesFailedToUpdate: 0,
    conflictedExtensions: [] as ConflictedExtensionInfo[],
    missingExtensions: [] as MissingExtensionInfo[],
  };

  const allFeedExtensionsAggregated = new Map<string, { name: string, sourceFeeds: string[] }>(); 

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[SyncFeed] Failed to fetch ${url}: ${response.statusText}`);
        results.filesFailedToUpdate++; 
        continue;
      }
      const xmlText = await response.text();
      const parsedFeed = await parseStringPromise(xmlText, { explicitArray: false, trim: true });
      
      if (!parsedFeed || !parsedFeed.CiscoIPPhoneDirectory) {
          console.warn(`[SyncFeed] Invalid XML structure or not CiscoIPPhoneDirectory from ${url}`);
          results.filesFailedToUpdate++;
          continue;
      }
      const validatedFeed = CiscoIPPhoneDirectorySchema.safeParse(parsedFeed.CiscoIPPhoneDirectory);


      if (!validatedFeed.success) {
        console.warn(`[SyncFeed] Zod validation failed for feed from ${url}:`, validatedFeed.error.issues);
        results.filesFailedToUpdate++;
        continue;
      }

      const feedEntries = ensureArray(validatedFeed.data.DirectoryEntry);
      for (const entry of feedEntries) {
        if (entry.Name && entry.Telephone) {
          const existingEntry = allFeedExtensionsAggregated.get(entry.Telephone);
          if (existingEntry) {
            if (!existingEntry.sourceFeeds.includes(url)) { 
                existingEntry.sourceFeeds.push(url);
            }
            if (existingEntry.name !== entry.Name) {
              let conflictEntry = results.conflictedExtensions.find(c => c.number === entry.Telephone);
              if (!conflictEntry) {
                conflictEntry = { number: entry.Telephone, conflicts: [] };
                if (!conflictEntry.conflicts.some(c => c.name === existingEntry.name && c.sourceFeed === existingEntry.sourceFeeds[0])) {
                     conflictEntry.conflicts.push({ name: existingEntry.name, sourceFeed: existingEntry.sourceFeeds[0] });
                }
                results.conflictedExtensions.push(conflictEntry);
              }
              if (!conflictEntry.conflicts.some(c => c.name === entry.Name && c.sourceFeed === url)) {
                conflictEntry.conflicts.push({ name: entry.Name, sourceFeed: url });
              }
            }
          } else {
            allFeedExtensionsAggregated.set(entry.Telephone, { name: entry.Name, sourceFeeds: [url] });
          }
        }
      }
    } catch (error: any) {
      console.error(`[SyncFeed] Error processing feed ${url}:`, error);
      results.filesFailedToUpdate++;
    }
  }
  
  const uniqueFeedExtensions = new Map<string, { name: string, sourceFeed: string }>();
  for (const [number, data] of allFeedExtensionsAggregated.entries()) {
    const isConflicted = results.conflictedExtensions.some(c => c.number === number);
    if (!isConflicted) {
      uniqueFeedExtensions.set(number, { name: data.name, sourceFeed: data.sourceFeeds[0] }); 
    }
  }

  let departmentFiles: string[];
  try {
    departmentFiles = await fs.readdir(paths.DEPARTMENT_DIR);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { ...results, success: true, message: `Department directory not found. No names synced. (This might be expected if no departments exist yet).`, error: `Department directory ${paths.DEPARTMENT_DIR} not found.`};
    }
    throw error; 
  }

  const localExtensionsFoundNumbers = new Set<string>(); 

  for (const deptFilename of departmentFiles) {
    if (!deptFilename.endsWith('.xml')) continue;

    const deptFilePath = path.join(paths.DEPARTMENT_DIR, deptFilename);
    let fileModified = false;
    try {
      const localXml = await readAndParseXML(deptFilePath);
      if (!localXml || !localXml.CiscoIPPhoneDirectory) {
        continue;
      }

      let localEntries = ensureArray(localXml.CiscoIPPhoneDirectory.DirectoryEntry);
      if (localEntries.length === 0) continue; 

      for (const localEntry of localEntries) {
        if (localEntry.Telephone) {
          localExtensionsFoundNumbers.add(localEntry.Telephone); 
          const feedData = uniqueFeedExtensions.get(localEntry.Telephone);
          if (feedData && feedData.name !== localEntry.Name) {
            localEntry.Name = feedData.name;
            results.updatedCount++;
            fileModified = true;
          }
        }
      }

      if (fileModified) {
        localEntries.sort((a, b) => { 
            const nameComparison = a.Name.localeCompare(b.Name);
            if (nameComparison !== 0) return nameComparison;
            return a.Telephone.localeCompare(b.Telephone);
        });
        localXml.CiscoIPPhoneDirectory.DirectoryEntry = localEntries.length > 0 ? localEntries : undefined;
        await buildAndWriteXML(deptFilePath, localXml);
        results.filesModified++;
      }
    } catch (error: any) {
      console.error(`[SyncFeed] Error processing local department file ${deptFilePath}:`, error);
      results.filesFailedToUpdate++;
    }
  }

  for (const [number, data] of uniqueFeedExtensions.entries()) {
    if (!localExtensionsFoundNumbers.has(number)) {
      results.missingExtensions.push({ number, name: data.name, sourceFeed: data.sourceFeed });
    }
  }
  
  const missingExtensionsFilePath = path.join(paths.DEPARTMENT_DIR, 'MissingExtensionsFromFeed.xml');
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  const missingExtensionsMenuItemName = 'Missing Extensions from Feed'; 

  if (results.missingExtensions.length > 0) {
    const missingXmlContent: { CiscoIPPhoneDirectory: CiscoIPPhoneDirectory } = {
      CiscoIPPhoneDirectory: {
        Title: missingExtensionsMenuItemName,
        Prompt: 'Extensions found in feeds but not locally',
        DirectoryEntry: results.missingExtensions.map(me => ({
          Name: `${me.name} (Feed: ${new URL(me.sourceFeed).hostname})`, 
          Telephone: me.number
        })).sort((a,b) => a.Name.localeCompare(b.Name)) 
      }
    };
    try {
      await buildAndWriteXML(missingExtensionsFilePath, missingXmlContent);

      const { protocol, host, port } = await getServiceUrlComponents(paths);
      const missingExtensionsUrl = constructServiceUrl(protocol, host, port, `/ivoxsdir/department/MissingExtensionsFromFeed.xml`);
      
      const parsedMainMenu = await readAndParseXML(mainMenuPath);
      if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
        let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
        const existingItemIndex = menuItems.findIndex(item => item.Name === missingExtensionsMenuItemName);
        if (existingItemIndex === -1) {
          menuItems.push({ Name: missingExtensionsMenuItemName, URL: missingExtensionsUrl });
        } else {
          menuItems[existingItemIndex].URL = missingExtensionsUrl; 
        }
        menuItems.sort((a,b) => a.Name.localeCompare(b.Name));
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems;
        await buildAndWriteXML(mainMenuPath, parsedMainMenu);
      } 

    } catch (error: any) {
        console.error(`[SyncFeed] Error creating/updating missing extensions list: ${error.message}`);
    }
  } else {
    try {
      await fs.unlink(missingExtensionsFilePath);
      const parsedMainMenu = await readAndParseXML(mainMenuPath);
      if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
        let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
        const initialLength = menuItems.length;
        menuItems = menuItems.filter(item => item.Name !== missingExtensionsMenuItemName);
        if (menuItems.length < initialLength) {
            parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
            await buildAndWriteXML(mainMenuPath, parsedMainMenu);
        }
      }
    } catch (error: any) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { 
        console.warn(`[SyncFeed] Error cleaning up missing extensions list/link: ${error.message}`);
      }
    }
  }

  let message = `Sync complete. ${results.updatedCount} names updated in ${results.filesModified} files.`;
  if (results.conflictedExtensions.length > 0) message += ` Found ${results.conflictedExtensions.length} extension numbers with conflicting names across feeds (not updated).`;
  if (results.missingExtensions.length > 0) message += ` Found ${results.missingExtensions.length} extensions in feeds that are missing locally (see 'Missing Extensions from Feed' on homepage).`;
  if (results.filesFailedToUpdate > 0) message += ` Failed to process/update ${results.filesFailedToUpdate} feeds or local files due to errors (check server logs).`;
  
  revalidatePath('/', 'layout'); 

  return {
    success: results.filesFailedToUpdate === 0, 
    message,
    ...results
  };
}

export async function syncFromActiveDirectoryAction(params: AdSyncFormValues): Promise<AdSyncResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { 
      success: false, 
      message: 'Authentication required.', 
      details: { usersProcessed: 0, extensionsAdded: 0, dbRecordsAdded: 0, dbRecordsUpdated: 0, localitiesCreated: 0, localitiesUpdated: 0, zoneCreated: false, errorsEncountered: 1 },
      error: 'User not authenticated' 
    };
  }

  const paths = await getIvoxsPaths();
  const db = await getDb();
  const adSyncZoneName = "Active Directory Users"; 
  const adSyncZoneId = generateIdFromName(adSyncZoneName);

  const results: AdSyncDetails = {
    usersProcessed: 0,
    extensionsAdded: 0,
    dbRecordsAdded: 0,
    dbRecordsUpdated: 0,
    localitiesCreated: 0,
    localitiesUpdated: 0,
    zoneCreated: false,
    errorsEncountered: 0
  };

  let client: Client | null = null;

  try {
    client = ldap.createClient({ url: params.ldapServerUrl });

    const bindOperationResult = await new Promise<{ success: boolean; error?: Error }>((resolve) => {
      client!.bind(params.bindDn, params.bindPassword, (err) => {
        if (err) {
          console.error('[AD Sync] LDAP Bind Error:', err);
          resolve({ success: false, error: new Error(`LDAP Bind Error: ${err.message}`) }); // Resolve with error
          return;
        }
        resolve({ success: true });
      });
    });

    if (!bindOperationResult.success) {
      results.errorsEncountered++;
      // Throw the error so it's caught by the main try...catch block
      throw bindOperationResult.error || new Error("LDAP Bind failed due to an unknown reason."); 
    }


    const attributesToFetch = [
        params.displayNameAttribute, 
        params.extensionAttribute, 
        params.departmentAttribute,
        params.emailAttribute,
        params.phoneAttribute,
        params.organizationAttribute, 
        params.jobTitleAttribute     
      ].filter(Boolean); 

    const searchOptions: SearchOptions = {
      filter: params.searchFilter || '(objectClass=user)',
      scope: 'sub',
      attributes: attributesToFetch.length > 0 ? attributesToFetch : ['dn'] 
    };

    const searchOperationResult = await new Promise<{ success: boolean; data?: SearchEntryObject[]; error?: Error }>((resolve) => {
      const foundEntries: SearchEntryObject[] = [];
      client!.search(params.searchBase, searchOptions, (err, res) => {
        if (err) {
          resolve({ success: false, error: new Error(`LDAP Search Setup Error: ${err.message}`) });
          return;
        }
        res.on('searchEntry', (entry: SearchEntry) => {
          const plainEntry: {[key: string]: string | string[]} = {};
          if (entry.attributes && Array.isArray(entry.attributes)) {
            entry.attributes.forEach(attr => {
              plainEntry[attr.type] = attr.vals.length === 1 ? attr.vals[0] : attr.vals;
            });
          }
          foundEntries.push(plainEntry as SearchEntryObject);
        });
        res.on('error', (searchErr) => { // LDAP stream errors
          resolve({ success: false, error: new Error(`LDAP Search Stream Error: ${searchErr.message}`) });
          return;
        });
        res.on('end', (searchResult) => { // Search operation completion
          if (searchResult && searchResult.status !== 0) {
            let statusMessage = `LDAP Search End Error - Status: ${searchResult.status}`;
            if (searchResult.status === 4) statusMessage = "Size Limit Exceeded by LDAP server.";
            // Could add more specific messages for other statuses if needed
            resolve({ success: false, error: new Error(statusMessage) });
            return;
          }
          results.usersProcessed = foundEntries.length;
          resolve({ success: true, data: foundEntries });
        });
      });
    });
    
    if (!searchOperationResult.success) {
      results.errorsEncountered++;
      throw searchOperationResult.error || new Error("LDAP Search failed due to an unknown reason.");
    }
    const entriesFromAd: SearchEntryObject[] = searchOperationResult.data || [];


    if (entriesFromAd.length === 0) {
      return { success: true, message: 'No users found in Active Directory matching the criteria. No changes made.', details: results };
    }
    
    const extensionsByLocality: Map<string, XmlDirectoryEntry[]> = new Map(); 
    const detailsForDbByExtension: Map<string, Partial<Extension>> = new Map(); 

    for (const adUser of entriesFromAd) {
       if (!adUser || Object.keys(adUser).length === 0) { // Check if adUser is valid
        console.warn('[AD Sync] Encountered an undefined or empty user entry from AD search. Skipping.');
        results.errorsEncountered++;
        continue;
      }
      const getStringAttr = (attrName: string) => {
        const val = adUser[attrName as keyof SearchEntryObject];
        return Array.isArray(val) ? val[0] : (typeof val === 'string' ? val : undefined);
      };

      const userName = getStringAttr(params.displayNameAttribute);
      const extNum = getStringAttr(params.extensionAttribute);
      const adDepartment = getStringAttr(params.departmentAttribute) || "Uncategorized";
      const email = getStringAttr(params.emailAttribute);
      const mainPhone = getStringAttr(params.phoneAttribute);
      const organization = getStringAttr(params.organizationAttribute);
      const jobTitle = getStringAttr(params.jobTitleAttribute);

      if (extNum && userName) {
        const localityId = generateIdFromName(adDepartment);
        if (!extensionsByLocality.has(localityId)) {
          extensionsByLocality.set(localityId, []);
        }
        extensionsByLocality.get(localityId)!.push({ Name: userName, Telephone: extNum });
        
        const dbKey = `${extNum}_${localityId}`;
        detailsForDbByExtension.set(dbKey, {
            number: extNum,
            name: userName, 
            organization,
            adDepartment, 
            jobTitle,
            email,
            mainPhoneNumber: mainPhone
        });
      }
    }

    const existingZones = await readAndParseXML(path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME));
    let adZoneExistsInMenu = false;
    if (existingZones && existingZones.CiscoIPPhoneMenu && ensureArray(existingZones.CiscoIPPhoneMenu.MenuItem).some(item => item.Name === adSyncZoneName)) {
        adZoneExistsInMenu = true;
    }
    if (!adZoneExistsInMenu) {
        const addZoneResult = await addZoneAction(adSyncZoneName); 
        if (addZoneResult.success) {
            results.zoneCreated = true;
        } else {
            results.errorsEncountered++;
            return { success: false, message: `Failed to create AD Sync zone: ${addZoneResult.message}`, details: results, error: addZoneResult.error };
        }
    }
    
    const adZoneFilePath = path.join(paths.ZONE_BRANCH_DIR, `${adSyncZoneId}.xml`);
    let adZoneMenu = await readAndParseXML(adZoneFilePath);
    if (!adZoneMenu || !adZoneMenu.CiscoIPPhoneMenu) {
        console.warn(`[AD Sync] Zone file ${adZoneFilePath} missing or invalid. Creating.`);
        adZoneMenu = { CiscoIPPhoneMenu: { Title: adSyncZoneName, Prompt: "Select Department", MenuItem: [] } };
    }
    let adZoneMenuItems = ensureArray(adZoneMenu.CiscoIPPhoneMenu.MenuItem);
    let adZoneMenuChanged = false;

    const { protocol: serviceProtocol, host: serviceHost, port: servicePort } = await getServiceUrlComponents(paths);


    for (const [localityId, entries] of extensionsByLocality.entries()) {
        // Find the original department name from an AD user entry that mapped to this localityId
        const originalAdDepartmentName = entriesFromAd.find(u => u && generateIdFromName((getStringAttrForUser(u, params.departmentAttribute)) || "Uncategorized") === localityId);
        const departmentDisplayName = originalAdDepartmentName ? (getStringAttrForUser(originalAdDepartmentName, params.departmentAttribute) || localityId) : localityId;

        const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
        let departmentXml = await readAndParseXML(departmentFilePath);
        
        if (!departmentXml || !departmentXml.CiscoIPPhoneDirectory) {
            departmentXml = { CiscoIPPhoneDirectory: { Title: departmentDisplayName, Prompt: "Select Extension", DirectoryEntry: [] } };
            results.localitiesCreated++;
        } else {
            if (departmentXml.CiscoIPPhoneDirectory.Title !== departmentDisplayName) {
                departmentXml.CiscoIPPhoneDirectory.Title = departmentDisplayName;
            }
            results.localitiesUpdated++; 
        }
        
        entries.sort((a, b) => a.Name.localeCompare(b.Name) || a.Telephone.localeCompare(b.Telephone));
        departmentXml.CiscoIPPhoneDirectory.DirectoryEntry = entries.length > 0 ? entries : undefined;
        results.extensionsAdded += entries.length; 

        await buildAndWriteXML(departmentFilePath, departmentXml);

        for (const entry of entries) {
            const dbKey = `${entry.Telephone}_${localityId}`;
            const details = detailsForDbByExtension.get(dbKey);
            if (details) {
                const existingDbEntry = await db.get(
                    'SELECT id FROM extension_details WHERE extension_number = ? AND locality_id = ? AND source = ?',
                    entry.Telephone, localityId, 'ad'
                );
                if (existingDbEntry) {
                    await db.run(
                        `UPDATE extension_details SET user_name = ?, organization = ?, ad_department = ?, job_title = ?, email = ?, main_phone_number = ?, last_synced = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        details.name, details.organization, details.adDepartment, details.jobTitle, details.email, details.mainPhoneNumber,
                        existingDbEntry.id
                    );
                    results.dbRecordsUpdated++;
                } else {
                    await db.run(
                        `INSERT INTO extension_details (extension_number, locality_id, user_name, organization, ad_department, job_title, email, main_phone_number, source)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ad')`,
                        entry.Telephone, localityId, details.name, details.organization, details.adDepartment, details.jobTitle, details.email, details.mainPhoneNumber
                    );
                    results.dbRecordsAdded++;
                }
            }
        }

        const localityUrl = constructServiceUrl(serviceProtocol, serviceHost, servicePort, `/ivoxsdir/department/${localityId}.xml`);
        const existingItemIndex = adZoneMenuItems.findIndex(item => extractIdFromUrl(item.URL) === localityId);
        if (existingItemIndex === -1) {
            adZoneMenuItems.push({ Name: departmentDisplayName, URL: localityUrl });
            adZoneMenuChanged = true;
        } else if (adZoneMenuItems[existingItemIndex].Name !== departmentDisplayName) {
            adZoneMenuItems[existingItemIndex].Name = departmentDisplayName; 
            adZoneMenuChanged = true;
        }
    }

    if (adZoneMenuChanged) {
        adZoneMenuItems.sort((a,b) => a.Name.localeCompare(b.Name));
        adZoneMenu.CiscoIPPhoneMenu.MenuItem = adZoneMenuItems.length > 0 ? adZoneMenuItems : undefined;
        await buildAndWriteXML(adZoneFilePath, adZoneMenu);
    }
    
    revalidatePath('/', 'layout');
    revalidatePath('/import-xml', 'page');
    if (results.zoneCreated) revalidatePath(`/${adSyncZoneId}`, 'page');

    return { 
      success: true, 
      message: `Active Directory sync completed. Processed ${results.usersProcessed} users. Added/updated ${results.extensionsAdded} XML extensions across ${extensionsByLocality.size} localities. DB: ${results.dbRecordsAdded} added, ${results.dbRecordsUpdated} updated. ${results.errorsEncountered > 0 ? `${results.errorsEncountered} AD entries skipped.` : ''}`,
      details: results 
    };

  } catch (error: any) {
    console.error('[AD Sync] Sync Action Error:', error);
    if (!results.errorsEncountered && error instanceof Error) { 
        results.errorsEncountered++;
    }
    return { 
      success: false, 
      message: `AD Sync failed: ${error.message}`, 
      details: results,
      error: error.toString() 
    };
  } finally {
    if (client) {
      client.unbind(err => {
        if (err) console.error('[AD Sync] LDAP Unbind Error:', err);
      });
    }
  }
}
// Helper function to safely get string attribute from adUser (used inside syncFromActiveDirectoryAction)
function getStringAttrForUser(adUser: SearchEntryObject, attrName?: string): string | undefined {
    if (!attrName || !adUser) return undefined;
    const val = adUser[attrName as keyof SearchEntryObject];
    return Array.isArray(val) ? val[0] : (typeof val === 'string' ? val : undefined);
}


async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return ''; 
    }
    throw error; 
  }
}

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const authenticated = await isAuthenticated(); 
  if (!authenticated) {
    console.warn('[GlobalSearch] Unauthenticated search attempt.');
    return []; 
  }

  const paths = await getIvoxsPaths();
  const results: GlobalSearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.length < 2) { 
    return [];
  }

  try {
    const mainMenuContent = await fs.readFile(path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME), 'utf-8');
    const parsedMainMenu = await parseStringPromise(mainMenuContent, { explicitArray: false, trim: true });
    const mainMenu = CiscoIPPhoneMenuSchema.safeParse(parsedMainMenu.CiscoIPPhoneMenu);

    if (!mainMenu.success || !mainMenu.data.MenuItem) {
      console.error('[GlobalSearch] Could not parse MainMenu.xml for zones.');
      return [];
    }

    const zones = ensureArray(mainMenu.data.MenuItem);

    for (const zoneMenuItem of zones) {
      const zoneId = extractIdFromUrl(zoneMenuItem.URL);
      const zoneName = zoneMenuItem.Name;
      const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);

      try {
        const zoneBranchContent = await fs.readFile(zoneBranchFilePath, 'utf-8');
        const parsedZoneBranch = await parseStringPromise(zoneBranchContent, { explicitArray: false, trim: true });
        const zoneBranchMenu = CiscoIPPhoneMenuSchema.safeParse(parsedZoneBranch.CiscoIPPhoneMenu);

        if (!zoneBranchMenu.success || !zoneBranchMenu.data.MenuItem) continue;
        const zoneItems = ensureArray(zoneBranchMenu.data.MenuItem);

        for (const zoneItem of zoneItems) {
          const itemType = getItemTypeFromUrl(zoneItem.URL);
          const itemId = extractIdFromUrl(zoneItem.URL);
          const itemName = zoneItem.Name;

          if (itemType === 'branch') { 
            const branchFilePath = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
            try {
              const branchContent = await fs.readFile(branchFilePath, 'utf-8');
              const parsedBranch = await parseStringPromise(branchContent, { explicitArray: false, trim: true });
              const branchMenu = CiscoIPPhoneMenuSchema.safeParse(parsedBranch.CiscoIPPhoneMenu);

              if (!branchMenu.success || !branchMenu.data.MenuItem) continue;
              const localitiesInBranch = ensureArray(branchMenu.data.MenuItem);

              for (const localityMenuItem of localitiesInBranch) {
                const localityId = extractIdFromUrl(localityMenuItem.URL);
                const localityName = localityMenuItem.Name;
                await processLocalityForSearch({
                  paths, localityId, localityName, lowerQuery, results,
                  zoneId, zoneName, branchId: itemId, branchName: itemName
                });
              }
            } catch (branchError) {
              // console.warn(`[GlobalSearch] Could not read/parse branch file ${branchFilePath}:`, branchError);
            }
          } else if (itemType === 'locality') { 
            await processLocalityForSearch({
              paths, localityId: itemId, localityName: itemName, lowerQuery, results,
              zoneId, zoneName
            });
          }
        }
      } catch (zoneBranchError) {
        // console.warn(`[GlobalSearch] Could not read/parse zone branch file ${zoneBranchFilePath}:`, zoneBranchError);
      }
    }
  } catch (error) {
    console.error('[GlobalSearch] Error during search process:', error);
  }
  return results;
}

async function processLocalityForSearch(args: {
  paths: Awaited<ReturnType<typeof getIvoxsPaths>>,
  localityId: string,
  localityName: string, 
  lowerQuery: string,
  results: GlobalSearchResult[],
  zoneId: string,
  zoneName: string,
  branchId?: string,
  branchName?: string
}) {
  const { paths, localityId, localityName, lowerQuery, results, zoneId, zoneName, branchId, branchName } = args;
  const deptFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
  let currentLocalityDisplayName = localityName; 
  let localityNameMatch = currentLocalityDisplayName.toLowerCase().includes(lowerQuery);
  const matchingExtensions: MatchedExtension[] = [];

  try {
    const deptContent = await readFileContent(deptFilePath); 
    
    if (!deptContent || deptContent.trim() === "") {
        if (localityNameMatch && !results.some(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId)) {
             results.push({
                localityId, localityName: currentLocalityDisplayName, zoneId, zoneName, branchId, branchName,
                fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
                localityNameMatch, matchingExtensions: []
            });
        }
        return;
    }
    
    const parsedDept = await parseStringPromise(deptContent, { explicitArray: false, trim: true });
    
    if (!parsedDept || typeof parsedDept !== 'object' || !parsedDept.CiscoIPPhoneDirectory || typeof parsedDept.CiscoIPPhoneDirectory !== 'object') {
        console.warn(`[GlobalSearch - processLocality] Invalid or empty XML structure (pre-Zod) for department file: ${deptFilePath}. Parsed: ${JSON.stringify(parsedDept)?.substring(0,100)}...`);
        if (localityNameMatch && !results.some(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId)) {
             results.push({
                localityId, localityName: currentLocalityDisplayName, zoneId, zoneName, branchId, branchName,
                fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
                localityNameMatch, matchingExtensions: []
            });
        }
        return;
    }

    const deptDirectory = CiscoIPPhoneDirectorySchema.safeParse(parsedDept.CiscoIPPhoneDirectory);

    if (!deptDirectory.success) {
      console.warn(`[GlobalSearch - processLocality] Zod validation failed for CiscoIPPhoneDirectory in ${deptFilePath}. Data: ${JSON.stringify(parsedDept.CiscoIPPhoneDirectory)?.substring(0,100)}... Errors: ${JSON.stringify(deptDirectory.error.flatten())}`);
      if (localityNameMatch && !results.some(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId)) {
        results.push({
          localityId, localityName: currentLocalityDisplayName, zoneId, zoneName, branchId, branchName,
          fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
          localityNameMatch, matchingExtensions
        });
      }
      return;
    }

    if (deptDirectory.data.Title) {
      currentLocalityDisplayName = deptDirectory.data.Title;
      if (!localityNameMatch) {
          localityNameMatch = currentLocalityDisplayName.toLowerCase().includes(lowerQuery);
      }
    }


    const extensions = ensureArray(deptDirectory.data.DirectoryEntry);
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

    if (localityNameMatch || matchingExtensions.length > 0) {
       if (!results.some(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId)) {
          results.push({
            localityId,
            localityName: currentLocalityDisplayName,
            zoneId,
            zoneName,
            branchId,
            branchName,
            fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
            localityNameMatch,
            matchingExtensions
          });
       } else {
         const existingResult = results.find(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId);
         if (existingResult) {
           existingResult.localityName = currentLocalityDisplayName; 
           existingResult.matchingExtensions = matchingExtensions;
           existingResult.localityNameMatch = localityNameMatch || existingResult.localityNameMatch; 
         }
       }
    }
  } catch (error: any) {
    console.error(`[GlobalSearch - processLocality] Unexpected error processing ${deptFilePath}:`, error);
    if (localityNameMatch && !results.some(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId)) {
         results.push({
            localityId, localityName: currentLocalityDisplayName, zoneId, zoneName, branchId, branchName,
            fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
            localityNameMatch: true, matchingExtensions: [] 
        });
    }
  }
}

