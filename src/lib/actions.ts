
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, CiscoIPPhoneDirectory, MenuItem as XmlMenuItem, DirectoryEntry as XmlDirectoryEntry, SyncResult, CsvImportResult, CsvImportDetails, GlobalSearchResult, MatchedExtension, SyncConflict, ConflictedExtensionInfo, MissingExtensionInfo } from '@/types/xml';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth-actions';


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
    .replace(/\.\.+/g, '')
    .replace(/[/\\]+/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_');
  return cleaned || `invalid_name_${Date.now()}`;
};


function generateIdFromName(name: string): string {
  const cleanedName = name.replace(/[^a-zA-Z0-9\\s_.-]/g, '');
  if (!cleanedName.trim()) return `UnnamedItem${Date.now()}`;
  return cleanedName
    .replace(/\s+/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/-{2,}/g, '-');
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
    headless: false, // We want the root tag
    renderOpts: { pretty: true, indent: '  ', newline: '\n' }, // Ensure newline is '\n'
    xmldec: { version: '1.0', encoding: 'UTF-8', standalone: false }
  });

  // Ensure jsObject is the root object for the builder, e.g., { CiscoIPPhoneMenu: { ... } }
  const xmlContentBuiltByBuilder = builder.buildObject(jsObject);
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  const finalXmlString = xmlDeclaration + xmlContentBuiltByBuilder.trim();

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

export async function addZoneAction(zoneName: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  const newZoneId = generateIdFromName(zoneName);
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);

  let currentHost = '127.0.0.1';
  let currentPort = '3000';

    const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
    try {
        const configData = await fs.readFile(networkConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) currentHost = config.host;
        if (config.port) currentPort = config.port;
    } catch (e) {
      console.warn(`[addZoneAction] Network config not found or unreadable at ${networkConfigPath}. Using defaults for new zone URL.`);
    }


  const newZoneUrl = `http://${currentHost}:${currentPort}/ivoxsdir/zonebranch/${newZoneId}.xml`;

  try {
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      const newMainMenuContent: { CiscoIPPhoneMenu: CiscoIPPhoneMenu } = {
        CiscoIPPhoneMenu: {
          Title: "Farmacia Carol", // Or some default title
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
    return { success: true, message: `Zone "${zoneName}" added successfully.` };

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
    filesToDelete.push(zoneFilePath); // Add the zone file itself to the deletion queue
    console.log(`[DeleteZone] Queued zone file for deletion: ${zoneFilePath}`);

    // Delete all queued files
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

    // Update MainMenu.xml
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
      let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      const initialLength = menuItems.length;
      menuItems = menuItems.filter(item => extractIdFromUrl(item.URL) !== sanitizedZoneId);
      if (menuItems.length < initialLength) {
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined; // Handle case where all items are removed
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

  let currentHost = '127.0.0.1';
  let currentPort = '3000';

  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  try {
      const configData = await fs.readFile(networkConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      if (config.host) currentHost = config.host;
      if (config.port) currentPort = config.port;
  } catch (e) {
    console.warn(`[addLocalityOrBranchAction] Network config not found or unreadable at ${networkConfigPath}. Using defaults for new item URL.`);
  }


  let parentFilePath: string;
  let childDirPath: string;
  let newChildItemUrl: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot add a branch under another branch using this action."};
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childDirPath = paths.BRANCH_DIR;
    newChildItemUrl = `http://${currentHost}:${currentPort}/ivoxsdir/branch/${newItemId}.xml`;
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
    newChildItemUrl = `http://${currentHost}:${currentPort}/ivoxsdir/department/${newItemId}.xml`;
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

  let currentHost = '127.0.0.1';
  let currentPort = '3000';
  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  try {
      const configData = await fs.readFile(networkConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      if (config.host) currentHost = config.host;
      if (config.port) currentPort = config.port;
  } catch(e) {
    console.warn(`[editLocalityOrBranchAction] Network config not found or unreadable at ${networkConfigPath}. Using defaults for updated item URL.`);
  }


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
    newChildItemUrlSegment = `/branch/${newItemId}.xml`;
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
    newChildItemUrlSegment = `/department/${newItemId}.xml`;
  }
  const newChildFullUrl = `http://${currentHost}:${currentPort}/ivoxsdir${newChildItemUrlSegment}`;

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
    if (menuItems.some((item, index) => index !== itemIndex && (extractIdFromUrl(item.URL) === newItemId || item.Name === newItemName))) {
      return { success: false, message: `Another item with name "${newItemName}" or ID "${newItemId}" already exists in ${path.basename(parentFilePath)}.` };
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
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot delete a branch from within another branch context."};
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childFilePath = path.join(paths.BRANCH_DIR, `${sanitizedItemId}.xml`);
    itemTypeNameForMessage = "Branch";
  } else {
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (from branch)";
    } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (from zone)";
    }
    childFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedItemId}.xml`);
  }

  try {
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    menuItems = menuItems.filter(item => !(item && typeof item.URL === 'string' && extractIdFromUrl(item.URL) === sanitizedItemId));
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

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


    return { success: true, message: `${itemTypeNameForMessage} ${sanitizedItemId} deleted.` };
  } catch (error: any) {
    console.error(`Error deleting ${itemType} ${sanitizedItemId}:`, error);
    return { success: false, message: `Failed to delete ${itemType}: ${error.message}` };
  }
}

export async function addExtensionAction(localityId: string, name: string, telephone: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
    }
    const paths = await getIvoxsPaths();
    const sanitizedLocalityId = sanitizeFilenamePart(localityId);
    if (!sanitizedLocalityId) return { success: false, message: 'Invalid Locality ID.' };

    const trimmedName = name.trim();
    if (!trimmedName) return { success: false, message: 'Extension name cannot be empty.' };

    const trimmedTelephone = telephone.trim();
    if (!trimmedTelephone) return { success: false, message: 'Extension telephone cannot be empty.' };
    
    let charDetails = '';
    for (let i = 0; i < trimmedTelephone.length; i++) {
      charDetails += `char[${i}]: ${trimmedTelephone[i]} (code: ${trimmedTelephone.charCodeAt(i).toString(16)}) `;
    }
    console.log(`[Debug AddExtension] Validating telephone. Raw: "[${telephone}]", Trimmed: "[${trimmedTelephone}]", Length: ${trimmedTelephone.length}, CharDetails: ${charDetails.trim()}`);


    const isDigitsOnly = /^\d+$/.test(trimmedTelephone);
    console.log(`[Debug AddExtension] Result of /^\\d+$/.test(trimmedTelephone) for "[${trimmedTelephone}]" = ${isDigitsOnly}`);

    if (!isDigitsOnly) {
      return { success: false, message: 'SERVER: Extension telephone must be a valid number.' };
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
        return { success: false, message: `An extension with Name "${trimmedName}" and Telephone "${trimmedTelephone}" already exists.` };
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

    return { success: true, message: `Extension "${trimmedName}" added to locality "${sanitizedLocalityId}".` };
  } catch (error: any) {
    console.error(`[AddExtensionAction Error] Failed to add extension to ${localityId}:`, error);
    return { success: false, message: `An unexpected error occurred while adding the extension. ${error.message || 'Unknown error'}`, error: error.toString() };
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
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
    }
    const paths = await getIvoxsPaths();
    const { localityId, oldExtensionName, oldExtensionNumber, newExtensionName, newExtensionNumber } = args;

    const sanitizedLocalityId = sanitizeFilenamePart(localityId);
    if (!sanitizedLocalityId) return { success: false, message: 'Invalid Locality ID.' };

    const trimmedNewName = newExtensionName.trim();
    if (!trimmedNewName) return { success: false, message: 'New extension name cannot be empty.' };

    const trimmedNewNumber = newExtensionNumber.trim();
    if (!trimmedNewNumber) return { success: false, message: 'New extension telephone cannot be empty.' };

    if (!/^\d+$/.test(trimmedNewNumber)) {
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
    console.error(`[EditExtensionAction Error] Failed to edit extension in ${localityId}:`, error);
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
    const pathsInfo = { MAINMENU_FILENAME: 'MainMenu.xml' };
    await fs.access(path.join(trimmedPath, pathsInfo.MAINMENU_FILENAME), fs.constants.F_OK);

    await saveDirConfig({ ivoxsRootPath: trimmedPath });
    revalidatePath('/import-xml', 'page');
    revalidatePath('/', 'layout');

    return { success: true, message: `ivoxsdir directory root path updated to: ${trimmedPath}` };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       const pathsInfo = { MAINMENU_FILENAME: 'MainMenu.xml' };
       return { success: false, message: `The provided path "${trimmedPath}" does not exist or ${pathsInfo.MAINMENU_FILENAME} was not found within it.` , error: error.message };
    }
    console.error('Error updating directory root path:', error);
    return { success: false, message: `Failed to update directory path: ${error.message}`, error: error.message };
  }
}


async function processSingleXmlFileForHostUpdate(filePath: string, newHost: string, newPort: string): Promise<{ success: boolean; error?: string; filePath: string; changed: boolean }> {
  let fileChanged = false;
  try {
    const parsedXml = await readAndParseXML(filePath);
    if (!parsedXml) {
      console.log(`[processSingleXmlFileForHostUpdate] File not found or empty, skipping: ${filePath}`);
      return { success: true, filePath: filePath, changed: fileChanged };
    }
    if (!parsedXml.CiscoIPPhoneMenu) {
        console.log(`[processSingleXmlFileForHostUpdate] Not a CiscoIPPhoneMenu file, skipping: ${filePath}`);
        return { success: true, filePath: filePath, changed: fileChanged };
    }

    const menuItems = ensureArray(parsedXml.CiscoIPPhoneMenu.MenuItem);
     if (!menuItems || menuItems.length === 0) {
        console.log(`[processSingleXmlFileForHostUpdate] No MenuItems found, skipping: ${filePath}`);
        return { success: true, filePath: filePath, changed: fileChanged };
    }

    for (const menuItem of menuItems) {
      if (menuItem && typeof menuItem.URL === 'string') {
        try {
          const urlObj = new URL(menuItem.URL);
          let urlWasUpdated = false;
          if (newHost && urlObj.hostname !== newHost) {
            urlObj.hostname = newHost;
            urlWasUpdated = true;
          }
          if (newPort && urlObj.port !== newPort) {
            urlObj.port = newPort;
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
      console.log(`[processSingleXmlFileForHostUpdate] Updating URLs in: ${filePath}`);
      await buildAndWriteXML(filePath, parsedXml);
    }  else {
      console.log(`[processSingleXmlFileForHostUpdate] No URL changes needed for: ${filePath}`);
    }
    return { success: true, filePath: filePath, changed: fileChanged };
  } catch (error: any) {
    console.error(`[processSingleXmlFileForHostUpdate] Error processing file ${filePath} for host update:`, error);
    return { success: false, error: error.message, filePath: filePath, changed: fileChanged };
  }
}

export async function updateXmlUrlsAction(newHost: string, newPort: string): Promise<{ success: boolean; message: string; error?: string; filesProcessed?: number; filesFailed?: number, filesChangedCount?: number }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  if (!newHost.trim() && !newPort.trim()) {
    return { success: false, message: "Host or Port must be provided to update XML URLs." };
  }
  if (newPort.trim() && !/^\d+$/.test(newPort.trim())) {
    return { success: false, message: "Port must be a valid number." };
  }

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
     if (e.code !== 'ENOENT') console.warn(`Could not read branch directory: ${paths.BRANCH_DIR}`, e);
  }

  console.log(`[updateXmlUrlsAction] Found ${allFilesToProcess.length} XML files to process for URL updates.`);
  for (const filePath of allFilesToProcess) {
    filesProcessed++;
    const result = await processSingleXmlFileForHostUpdate(filePath, newHost.trim(), newPort.trim());
    if (!result.success) {
      filesFailed++;
      if (result.filePath) failedFilePaths.push(result.filePath);
      console.error(`Failed to process ${filePath}: ${result.error}`);
    }
    if (result.changed) {
        filesChangedCount++;
    }
  }

  if (filesChangedCount > 0) {
    revalidatePath('/', 'layout');
  }

  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  try {
    const currentConfig = { host: newHost.trim(), port: newPort.trim() };
    await fs.mkdir(paths.IVOXS_DIR, { recursive: true });
    await fs.writeFile(networkConfigPath, JSON.stringify(currentConfig, null, 2));
    console.log(`[updateXmlUrlsAction] Network configuration saved to ${networkConfigPath}`);
  } catch (e) {
      console.error(`[updateXmlUrlsAction] Could not save network configuration to ${networkConfigPath}:`, e);
  }


  if (filesFailed > 0) {
    return {
        success: false,
        message: `Processed ${filesProcessed} files. ${filesChangedCount} files updated. ${filesFailed} files failed to update: ${failedFilePaths.join(', ')}. Check server logs for details.`,
        error: `Failed files: ${failedFilePaths.join(', ')}`,
        filesProcessed,
        filesFailed,
        filesChangedCount
    };
  }
  return {
    success: true,
    message: `Successfully processed ${filesProcessed} files. ${filesChangedCount} files had their URLs updated. Network configuration saved.`,
    filesProcessed,
    filesFailed,
    filesChangedCount
  };
}

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const authenticated = await isAuthenticated(); // Not strictly necessary for search, but good for consistency

  if (!query || query.trim().length < 2) {
    return [];
  }

  // Dynamically import data functions to avoid circular dependencies if actions.ts is imported by data.ts
  const { getZones, getZoneItems, getBranchItems, getLocalityWithExtensions } = await import('@/lib/data');

  const results: GlobalSearchResult[] = [];
  const processedLocalityIds = new Set<string>();
  const lowerQuery = query.toLowerCase();

  try {
    const zones = await getZones();

    for (const zone of zones) {
      const zoneItems = await getZoneItems(zone.id);
      for (const item of zoneItems) {
        if (processedLocalityIds.has(item.id)) continue;

        if (item.type === 'locality') {
          const localityData = await getLocalityWithExtensions(item.id);
          if (!localityData) {
            console.warn(`[GlobalSearch] Could not fetch locality data for ID: ${item.id} in zone ${zone.name}`);
            continue;
          }
          const localityDisplayName = localityData.name || item.name;
          const localityNameMatch = localityDisplayName.toLowerCase().includes(lowerQuery);
          const matchingExtensions: MatchedExtension[] = [];

          if (localityData.extensions) {
            for (const ext of localityData.extensions) {
              let matchedOn: MatchedExtension['matchedOn'] | null = null;
              if (ext.department.toLowerCase().includes(lowerQuery)) {
                matchedOn = 'extensionName';
              } else if (ext.number.toLowerCase().includes(lowerQuery)) {
                matchedOn = 'extensionNumber';
              }
              if (matchedOn) {
                matchingExtensions.push({ name: ext.department, number: ext.number, matchedOn });
              }
            }
          }
          if (localityNameMatch || matchingExtensions.length > 0) {
            results.push({
              localityId: localityData.id,
              localityName: localityDisplayName,
              zoneId: zone.id,
              zoneName: zone.name,
              fullPath: `/${zone.id}/localities/${localityData.id}`,
              localityNameMatch,
              matchingExtensions,
            });
            processedLocalityIds.add(localityData.id);
          }

        } else if (item.type === 'branch') {
          const branchContext = { id: item.id, name: item.name };
          const branchLocalities = await getBranchItems(item.id);
          for (const loc of branchLocalities) {
            if (processedLocalityIds.has(loc.id)) continue;

            const localityData = await getLocalityWithExtensions(loc.id);
            if (!localityData) {
                console.warn(`[GlobalSearch] Could not fetch locality data for ID: ${loc.id} in branch ${branchContext.name}`);
                continue;
            }
            const localityDisplayName = localityData.name || loc.name;
            const localityNameMatch = localityDisplayName.toLowerCase().includes(lowerQuery);
            const matchingExtensions: MatchedExtension[] = [];

            if (localityData.extensions) {
                for (const ext of localityData.extensions) {
                let matchedOn: MatchedExtension['matchedOn'] | null = null;
                if (ext.department.toLowerCase().includes(lowerQuery)) {
                    matchedOn = 'extensionName';
                } else if (ext.number.toLowerCase().includes(lowerQuery)) {
                    matchedOn = 'extensionNumber';
                }
                if (matchedOn) {
                    matchingExtensions.push({ name: ext.department, number: ext.number, matchedOn });
                }
                }
            }
            if (localityNameMatch || matchingExtensions.length > 0) {
                results.push({
                localityId: localityData.id,
                localityName: localityDisplayName,
                zoneId: zone.id,
                zoneName: zone.name,
                branchId: branchContext.id,
                branchName: branchContext.name,
                fullPath: `/${zone.id}/branches/${branchContext.id}/localities/${localityData.id}`,
                localityNameMatch,
                matchingExtensions,
                });
                processedLocalityIds.add(localityData.id);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[GlobalSearchAction] Error during search:", error);
  }

  results.sort((a, b) => {
    if (a.localityNameMatch && !b.localityNameMatch) return -1;
    if (!a.localityNameMatch && b.localityNameMatch) return 1;
    if (a.matchingExtensions.length > b.matchingExtensions.length) return -1;
    if (a.matchingExtensions.length < b.matchingExtensions.length) return 1;
    return a.localityName.localeCompare(b.localityName);
  });

  return results.slice(0, 20);
}


async function updateParentMenuWithNewLocality(
  parentMenuFilePath: string,
  localityNameInMenu: string,
  departmentXmlFilenamePart: string,
  urlConfig: { host: string; port: string; }
): Promise<{ success: boolean; error?: string, fileCreated: boolean }> {
  let fileCreated = false;
  try {
    let parsedParentXml = await readAndParseXML(parentMenuFilePath);

    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      console.warn(`[CSV Import] Parent menu file ${parentMenuFilePath} not found or invalid. Attempting to create it.`);
      const parentDir = path.dirname(parentMenuFilePath);
      const parentBaseName = path.basename(parentMenuFilePath, '.xml');
      const parentTitle = parentBaseName.replace(/([A-Z])/g, ' $1').trim(); 

      parsedParentXml = {
        CiscoIPPhoneMenu: {
          Title: parentTitle || path.basename(parentMenuFilePath), 
          Prompt: "Select an item", 
          MenuItem: [],
        }
      };
      await fs.mkdir(parentDir, { recursive: true }); 
      fileCreated = true;
    }


    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    const newLocalityUrl = `http://${urlConfig.host}:${urlConfig.port}/ivoxsdir/department/${departmentXmlFilenamePart}.xml`;

    
    const existingItemIndex = menuItems.findIndex(item =>
        (item.URL && item.URL.endsWith(`/department/${departmentXmlFilenamePart}.xml`)) ||
        item.Name === localityNameInMenu
    );

    if (existingItemIndex === -1) { 
      menuItems.push({ Name: localityNameInMenu, URL: newLocalityUrl });
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); 
      parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
      await buildAndWriteXML(parentMenuFilePath, parsedParentXml);
      console.log(`[CSV Import] Added link for "${localityNameInMenu}" to parent menu ${path.basename(parentMenuFilePath)}.`);
      return { success: true, fileCreated };
    } else {
      
      console.log(`[CSV Import] Link for locality "${localityNameInMenu}" or to department file "${departmentXmlFilenamePart}.xml" already exists in ${path.basename(parentMenuFilePath)}. Skipping add to parent menu.`);
      return { success: true, fileCreated }; 
    }
  } catch (e: any) {
    console.error(`[CSV Import] Error updating parent menu ${parentMenuFilePath}:`, e);
    return { success: false, error: `Error updating parent menu ${path.basename(parentMenuFilePath)}: ${e.message}`, fileCreated };
  }
}


export async function importExtensionsFromCsvAction(csvContent: string): Promise<CsvImportResult> {
  console.log('[CSV Import Action] Received request.');
  try { 
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      const authErrorResult = {
        success: false,
        message: 'Authentication required.',
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{ row: 0, data: '', error: 'User not authenticated' }] }
      };
      console.log('[CSV Import Action] Returning (auth error):', JSON.stringify(authErrorResult));
      return authErrorResult;
    }
    console.log('[CSV Import Action] User authenticated.');

    const paths = await getIvoxsPaths();
    const lines = csvContent.split(/\r?\n/).map(line => line.trim()).filter(line => line);
    console.log(`[CSV Import Action] Parsed ${lines.length} lines from CSV.`);

    if (lines.length === 0) {
      const emptyCsvResult = { 
        success: false, 
        message: 'CSV file is empty or contains no valid data rows.', 
        details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [] } 
      };
      console.log('[CSV Import Action] Returning (empty CSV):', JSON.stringify(emptyCsvResult));
      return emptyCsvResult;
    }

    let processedRows = 0;
    let extensionsAdded = 0;
    let newLocalitiesCreated = 0;
    let parentMenusUpdated = 0;
    let mainMenuUpdatedCount = 0;
    const importErrors: Array<{ row: number; data: string; error: string }> = [];
    const newZonesAddedToMainMenu = new Set<string>(); // To track ZoneIDs for which MainMenu.xml needs update

    let headerSkipped = false;
    const expectedHeaders = ["name", "extension", "localityid", "zoneid"];

    let serviceHost = '127.0.0.1';
    let servicePort = '3000';
    const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
    try {
        const networkConfigData = await fs.readFile(networkConfigPath, 'utf-8');
        const networkConfig = JSON.parse(networkConfigData);
        if (networkConfig.host) serviceHost = networkConfig.host;
        if (networkConfig.port) servicePort = networkConfig.port;
        console.log(`[CSV Import Action] Loaded network config: Host=${serviceHost}, Port=${servicePort}`);
    } catch (e) {
        console.warn(`[CSV Import Action] Network config file not found at ${networkConfigPath} or unreadable. Using default host/port for new locality URLs.`);
    }
    const urlConfig = { host: serviceHost, port: servicePort };


    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const columns = line.split(',').map(col => col.trim());

      if (!headerSkipped && i === 0) {
        const firstRowLower = columns.map(col => col.toLowerCase());
        if (expectedHeaders.every((header, index) => firstRowLower[index] && firstRowLower[index].includes(header))) {
          headerSkipped = true;
          console.log('[CSV Import Action] Header row detected and skipped.');
          continue;
        }
      }

      processedRows++;
      const rowNumberForError = headerSkipped ? i : i + 1; 
      console.log(`[CSV Import Action] Processing row ${rowNumberForError}: ${line}`);

      if (columns.length < 4) {
        importErrors.push({ row: rowNumberForError, data: line, error: 'Row does not have enough columns (expected Name, Extension, LocalityID, ZoneID).' });
        console.warn(`[CSV Import Action] Row ${rowNumberForError} has insufficient columns.`);
        continue;
      }

      const [name, extensionNumber, localityIdFromCsv, originalZoneIdFromCsv] = columns;

      if (!name || !extensionNumber || !localityIdFromCsv || !originalZoneIdFromCsv) {
        importErrors.push({ row: rowNumberForError, data: line, error: 'One or more fields (Name, Extension, LocalityID, ZoneID) are empty.' });
        console.warn(`[CSV Import Action] Row ${rowNumberForError} has empty required fields.`);
        continue;
      }

      if (!/^\d+$/.test(extensionNumber)) {
        importErrors.push({ row: rowNumberForError, data: line, error: `Invalid extension number: "${extensionNumber}". Must be numeric.` });
        console.warn(`[CSV Import Action] Row ${rowNumberForError} has invalid extension number: ${extensionNumber}.`);
        continue;
      }

      const sanitizedLocalityIdForFile = generateIdFromName(localityIdFromCsv);
      const sanitizedZoneIdForFile = generateIdFromName(originalZoneIdFromCsv);

      if (!sanitizedLocalityIdForFile) {
          importErrors.push({ row: rowNumberForError, data: line, error: `Invalid LocalityID "${localityIdFromCsv}" (results in empty filename part).` });
          console.warn(`[CSV Import Action] Row ${rowNumberForError} has invalid LocalityID: ${localityIdFromCsv}.`);
          continue;
      }
      if (!sanitizedZoneIdForFile) {
          importErrors.push({ row: rowNumberForError, data: line, error: `Invalid ZoneID "${originalZoneIdFromCsv}" (results in empty filename part).` });
          console.warn(`[CSV Import Action] Row ${rowNumberForError} has invalid ZoneID: ${originalZoneIdFromCsv}.`);
          continue;
      }

      const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityIdForFile}.xml`);
      console.log(`[CSV Import Action] Department file path for row ${rowNumberForError}: ${departmentFilePath}`);

      try {
        let departmentData = await readAndParseXML(departmentFilePath);
        let departmentFileExisted = true;
        let newLocalityWasCreatedThisRow = false;

        if (!departmentData || !departmentData.CiscoIPPhoneDirectory) {
          departmentData = {
            CiscoIPPhoneDirectory: {
              Title: localityIdFromCsv, 
              Prompt: 'Select an extension',
              DirectoryEntry: [],
            },
          };
          departmentFileExisted = false;
          newLocalityWasCreatedThisRow = true;
          console.log(`[CSV Import Action] Department file for LocalityID "${localityIdFromCsv}" (filename: ${sanitizedLocalityIdForFile}.xml) not found or invalid. Creating new one.`);
        }

        let entries = ensureArray(departmentData.CiscoIPPhoneDirectory.DirectoryEntry);

        const existingEntryIndex = entries.findIndex(
          (entry: XmlDirectoryEntry) => entry.Name === name && entry.Telephone === extensionNumber
        );

        if (existingEntryIndex !== -1) {
          console.log(`[CSV Import Action] Extension "${name}" / "${extensionNumber}" already exists in "${sanitizedLocalityIdForFile}.xml". Skipping addition.`);
        } else {
          entries.push({ Name: name, Telephone: extensionNumber });
          entries.sort((a, b) => {
            const nameComp = a.Name.localeCompare(b.Name);
            return nameComp !== 0 ? nameComp : a.Telephone.localeCompare(b.Telephone);
          });
          departmentData.CiscoIPPhoneDirectory.DirectoryEntry = entries.length > 0 ? entries : undefined;
          await buildAndWriteXML(departmentFilePath, departmentData);
          extensionsAdded++;
          if (!departmentFileExisted) {
            newLocalitiesCreated++;
          }
          console.log(`[CSV Import Action] Added/Updated extension "${name}" / "${extensionNumber}" in "${sanitizedLocalityIdForFile}.xml".`);
        }

        if (newLocalityWasCreatedThisRow) {
          console.log(`[CSV Import Action] New locality "${localityIdFromCsv}" created. Attempting to update parent menu for ZoneID "${originalZoneIdFromCsv}".`);
          let parentMenuFilePath: string;
          let isZoneBranchFile = false;
          
          if (originalZoneIdFromCsv.toLowerCase() === 'zonametropolitana') { 
              parentMenuFilePath = path.join(paths.BRANCH_DIR, `ZonaMetropolitana.xml`);
              console.log(`[CSV Import Action] Parent menu for new locality in ZonaMetropolitana: ${parentMenuFilePath}`);
          } else {
              parentMenuFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneIdForFile}.xml`);
              isZoneBranchFile = true;
              console.log(`[CSV Import Action] Parent menu for new locality in Zone "${originalZoneIdFromCsv}": ${parentMenuFilePath}`);
          }

          const parentUpdateResult = await updateParentMenuWithNewLocality(
            parentMenuFilePath,
            localityIdFromCsv, 
            sanitizedLocalityIdForFile, 
            urlConfig
          );

          if (parentUpdateResult.success) {
            parentMenusUpdated++;
            if (isZoneBranchFile && parentUpdateResult.fileCreated) {
              newZonesAddedToMainMenu.add(originalZoneIdFromCsv); // Add original ZoneID for MainMenu update
            }
            console.log(`[CSV Import Action] Successfully updated parent menu for new locality "${localityIdFromCsv}".`);
          } else {
            importErrors.push({ row: rowNumberForError, data: line, error: parentUpdateResult.error || `Failed to update parent menu for new locality ${localityIdFromCsv}.` });
            console.warn(`[CSV Import Action] Failed to update parent menu for new locality "${localityIdFromCsv}": ${parentUpdateResult.error}`);
          }
        }
        
        revalidatePath(`/app/[zoneId]/localities/${sanitizedLocalityIdForFile}`, 'page');
        revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${sanitizedLocalityIdForFile}`, 'page');
        if(newLocalityWasCreatedThisRow) {
          if (originalZoneIdFromCsv.toLowerCase() === 'zonametropolitana') {
              revalidatePath(`/app/${sanitizedZoneIdForFile}/branches/ZonaMetropolitana`, 'page'); 
          } else {
              revalidatePath(`/app/${sanitizedZoneIdForFile}`, 'page');
          }
        }

      } catch (e: any) {
        console.error(`[CSV Import Action] Error processing row ${rowNumberForError} for LocalityID "${localityIdFromCsv}":`, e);
        importErrors.push({ row: rowNumberForError, data: line, error: `Server error: ${e.message}` });
      }
    }

    // After processing all CSV rows, update MainMenu.xml for any newly created zones
    if (newZonesAddedToMainMenu.size > 0) {
      const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
      let parsedMainMenu = await readAndParseXML(mainMenuPath);

      if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
        parsedMainMenu = { CiscoIPPhoneMenu: { Title: "Main Directory", Prompt: "Select an option", MenuItem: [] } };
      }
      let mainMenuEntries = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      let mainMenyFileActuallyChanged = false;

      for (const originalZoneId of newZonesAddedToMainMenu) {
        const sanitizedZoneId = generateIdFromName(originalZoneId);
        const zoneUrl = `http://${urlConfig.host}:${urlConfig.port}/ivoxsdir/zonebranch/${sanitizedZoneId}.xml`;
        const existingZoneIndex = mainMenuEntries.findIndex(item => item.URL === zoneUrl || item.Name === originalZoneId);
        if (existingZoneIndex === -1) {
          mainMenuEntries.push({ Name: originalZoneId, URL: zoneUrl });
          mainMenuUpdatedCount++;
          mainMenyFileActuallyChanged = true;
        }
      }
      
      if (mainMenyFileActuallyChanged) {
        mainMenuEntries.sort((a, b) => a.Name.localeCompare(b.Name));
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = mainMenuEntries.length > 0 ? mainMenuEntries : undefined;
        try {
          await buildAndWriteXML(mainMenuPath, parsedMainMenu);
          revalidatePath('/');
          console.log(`[CSV Import Action] MainMenu.xml updated with ${mainMenuUpdatedCount} new zone(s).`);
        } catch (e: any) {
           console.error(`[CSV Import Action] Failed to write updated MainMenu.xml:`, e);
           importErrors.push({ row: 0, data: 'MainMenu Update', error: `Failed to update MainMenu.xml: ${e.message}` });
        }
      }
    }

    
    const success = importErrors.length === 0;
    let message = success
      ? `CSV import successful. Processed ${processedRows} data rows. Added ${extensionsAdded} extensions.`
      : `CSV import completed with some errors. Processed ${processedRows} data rows. Added ${extensionsAdded} extensions.`;

    if (newLocalitiesCreated > 0) {
      message += ` Created ${newLocalitiesCreated} new locality XML files.`;
    }
    if (parentMenusUpdated > 0) {
      message += ` Updated ${parentMenusUpdated} zone/branch menu(s) with new locality links.`;
    }
    if (mainMenuUpdatedCount > 0) {
        message += ` Updated MainMenu.xml with ${mainMenuUpdatedCount} new zone(s).`;
    }
    if (importErrors.length > 0) {
      message += ` Encountered ${importErrors.length} errors.`;
    }
    
    const finalResult: CsvImportResult = {
      success,
      message,
      details: {
        processedRows,
        extensionsAdded,
        newLocalitiesCreated,
        parentMenusUpdated,
        mainMenuUpdatedCount,
        errors: importErrors,
      },
    };
    console.log('[CSV Import Action] Returning (final result):', JSON.stringify(finalResult));
    return finalResult;

  } catch (overallError: any) {
    console.error("[CSV Import Action] Critical error in importExtensionsFromCsvAction:", overallError);
    const criticalErrorResultForDebug: CsvImportResult = {
      success: false,
      message: `Critical Server Error: ${overallError.message || 'Unknown error'}. Check server console for details.`,
      // No 'details' field to keep the object as simple as possible for serialization
    };
    console.log('[CSV Import Action] Returning (critical error - simplified for debug):', JSON.stringify(criticalErrorResultForDebug));
    return criticalErrorResultForDebug;
  }
}

export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return {
      success: false,
      message: 'Authentication required.',
      updatedCount: 0,
      filesModified: 0,
      filesFailedToUpdate: 0,
      conflictedExtensions: [],
      missingExtensions: [],
      error: 'User not authenticated',
    };
  }

  const paths = await getIvoxsPaths();
  const departmentDir = paths.DEPARTMENT_DIR;
  const urls = feedUrlsString.split(/\r?\n/).map(url => url.trim()).filter(url => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });

  if (urls.length === 0) {
    return {
      success: false,
      message: 'No valid XML feed URLs provided.',
      updatedCount: 0,
      filesModified: 0,
      filesFailedToUpdate: 0,
      conflictedExtensions: [],
      missingExtensions: [],
    };
  }

  // Step 1: Aggregate all extensions from all feeds.
  // Map<extensionNumber, Array<{ name: string, sourceFeed: string }>>
  const aggregatedFeedExtensions = new Map<string, Array<{ name: string; sourceFeed: string }>>();
  for (const feedUrl of urls) {
    try {
      console.log(`[Sync] Fetching feed: ${feedUrl}`);
      const response = await fetch(feedUrl, { cache: 'no-store' });
      if (!response.ok) {
        console.warn(`[Sync] Failed to fetch ${feedUrl}: ${response.statusText}`);
        continue;
      }
      const xmlText = await response.text();
      const parsedFeed = await parseStringPromise(xmlText, { explicitArray: false, trim: true });

      const feedDirectory = parsedFeed.CiscoIPPhoneDirectory;
      if (feedDirectory && feedDirectory.DirectoryEntry) {
        const entries = ensureArray(feedDirectory.DirectoryEntry);
        console.log(`[Sync] Found ${entries.length} entries in feed ${feedUrl}`);
        for (const entry of entries) {
          if (entry.Telephone && entry.Name) {
             const trimmedTel = String(entry.Telephone).trim();
             const trimmedName = String(entry.Name).trim();
            if (trimmedTel && trimmedName) {
                const existingEntries = aggregatedFeedExtensions.get(trimmedTel) || [];
                existingEntries.push({ name: trimmedName, sourceFeed: feedUrl });
                aggregatedFeedExtensions.set(trimmedTel, existingEntries);
            }
          }
        }
      } else {
        console.warn(`[Sync] No DirectoryEntry found or invalid structure in feed ${feedUrl}`);
      }
    } catch (error: any) {
      console.error(`[Sync] Error processing feed ${feedUrl}:`, error);
    }
  }

  // Step 2: Identify conflicts and create a map of unique, non-conflicted extensions.
  // Map<extensionNumber, { name: string, sourceFeed: string }>
  const uniqueFeedExtensions = new Map<string, { name: string; sourceFeed: string }>();
  const conflictedExtensions: ConflictedExtensionInfo[] = [];

  for (const [number, entries] of aggregatedFeedExtensions.entries()) {
    const uniqueNamesFromSources = new Set(entries.map(e => e.name));
    if (uniqueNamesFromSources.size > 1) {
        // Conflict: Same number, different names from different (or same) feeds
        const conflicts: SyncConflict[] = entries.map(e => ({ name: e.name, sourceFeed: e.sourceFeed }));
        conflictedExtensions.push({ number, conflicts });
    } else if (entries.length > 0) {
      // No conflict, or all names are the same for this number
      uniqueFeedExtensions.set(number, entries[0]); // Take the first one (name is the same anyway)
    }
  }
  console.log(`[Sync] Total unique (non-conflicted) extensions from feeds: ${uniqueFeedExtensions.size}`);
  console.log(`[Sync] Total conflicted extensions from feeds: ${conflictedExtensions.length}`);


  // Step 3: Process local files - update names and collect all local extension numbers
  let updatedCount = 0;
  let filesModified = 0;
  let filesFailedToUpdate = 0;
  const localExtensionsFoundNumbers = new Set<string>();
  const failedFileUpdatePaths: string[] = [];


  try {
    const localDeptFiles = await fs.readdir(departmentDir);
    console.log(`[Sync] Found ${localDeptFiles.filter(name => name.endsWith('.xml') && name !== 'MissingExtensionsFromFeed.xml').length} local department files to process for name updates.`);

    for (const localDeptFilename of localDeptFiles) {
      if (!localDeptFilename.endsWith('.xml') || localDeptFilename === 'MissingExtensionsFromFeed.xml') {
        continue;
      }

      const localDeptFilePath = path.join(departmentDir, localDeptFilename);
      let localDataModified = false;
      try {
        const parsedLocalDept = await readAndParseXML(localDeptFilePath);
        if (!parsedLocalDept || !parsedLocalDept.CiscoIPPhoneDirectory) {
          console.warn(`[Sync] Skipping invalid local department file: ${localDeptFilename}`);
          continue;
        }

        let localEntries = ensureArray(parsedLocalDept.CiscoIPPhoneDirectory.DirectoryEntry);
        if (!localEntries) localEntries = []; // Ensure it's an array

        for (const localEntry of localEntries) {
          if (localEntry.Telephone) {
            const trimmedLocalTel = String(localEntry.Telephone).trim(); // Ensure string for Set
            localExtensionsFoundNumbers.add(trimmedLocalTel); // Add all local numbers to this set

            const feedEntry = uniqueFeedExtensions.get(trimmedLocalTel); // Check against non-conflicted feed extensions

            if (feedEntry) { // If this local extension exists in the non-conflicted feed data
              const trimmedLocalName = String(localEntry.Name).trim(); // Ensure string
              if (trimmedLocalName !== feedEntry.name) {
                localEntry.Name = feedEntry.name;
                localDataModified = true;
                updatedCount++;
              }
            }
          }
        }

        if (localDataModified) {
          await buildAndWriteXML(localDeptFilePath, parsedLocalDept);
          filesModified++;
        }
      } catch (error: any) {
        console.error(`[Sync] Error processing local department file ${localDeptFilename}:`, error);
        filesFailedToUpdate++;
        failedFileUpdatePaths.push(localDeptFilename);
      }
    }
  } catch (error: any) {
    console.error(`[Sync] Error reading department directory ${departmentDir}:`, error);
    return {
      success: false,
      message: `Error reading department directory: ${error.message}`,
      updatedCount,
      filesModified,
      filesFailedToUpdate,
      conflictedExtensions,
      missingExtensions: [],
      error: error.message,
    };
  }
  console.log(`[Sync] Total unique extension numbers found locally: ${localExtensionsFoundNumbers.size}.`);
  console.log(`[Sync] Unique feed extension numbers (non-conflicted): ${uniqueFeedExtensions.size}.`);


  // Step 4: Identify missing extensions (from non-conflicted feed data)
  const missingExtensions: MissingExtensionInfo[] = [];
  for (const [number, data] of uniqueFeedExtensions.entries()) {
    if (!localExtensionsFoundNumbers.has(number)) {
      missingExtensions.push({ number, name: data.name, sourceFeed: data.sourceFeed });
    }
  }
  console.log(`[Sync] Found ${missingExtensions.length} extensions in feeds that appear to be missing locally.`);


  // Step 5: Create/Update "MissingExtensionsFromFeed.xml" and link in MainMenu
  const missingExtensionsFilename = "MissingExtensionsFromFeed.xml";
  const missingExtensionsMenuItemName = "Missing Extensions from Feed";
  
  if (missingExtensions.length > 0) {
    const missingExtensionsXmlContent: CiscoIPPhoneDirectory = {
      Title: missingExtensionsMenuItemName,
      Prompt: "Extensions found in feeds but not locally",
      DirectoryEntry: missingExtensions.map(ext => ({
        Name: `${ext.name} (Source: ${new URL(ext.sourceFeed).hostname})`,
        Telephone: ext.number,
      })),
    };
    const missingExtensionsFilePath = path.join(paths.DEPARTMENT_DIR, missingExtensionsFilename);
    try {
        await buildAndWriteXML(missingExtensionsFilePath, { CiscoIPPhoneDirectory: missingExtensionsXmlContent });
        if(!failedFileUpdatePaths.includes(missingExtensionsFilename)) filesModified++; 
    } catch (e: any) {
        console.error(`[Sync] Failed to write ${missingExtensionsFilePath}:`, e);
        filesFailedToUpdate++;
        failedFileUpdatePaths.push(missingExtensionsFilename);
    }

    // Link to MainMenu.xml
    let serviceHostForMissing = '127.0.0.1';
    let servicePortForMissing = '3000';
    const networkConfigPathForMissing = path.join(paths.IVOXS_DIR, '.config.json');
    try {
        const configData = await fs.readFile(networkConfigPathForMissing, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) serviceHostForMissing = config.host;
        if (config.port) servicePortForMissing = config.port;
    } catch (e) { /* Use defaults */ }
    const missingExtensionsUrl = `http://${serviceHostForMissing}:${servicePortForMissing}/ivoxsdir/department/${missingExtensionsFilename}`;

    const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
    let parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      console.warn("[Sync] MainMenu.xml not found or invalid. Creating a new one to add 'Missing Extensions' link.");
      parsedMainMenu = { CiscoIPPhoneMenu: { Title: "Main Directory", Prompt: "Select an option", MenuItem: [] }};
    }
    let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
    const existingMissingItemIndex = menuItems.findIndex(item => item.Name === missingExtensionsMenuItemName);

    if (existingMissingItemIndex === -1) {
      menuItems.push({ Name: missingExtensionsMenuItemName, URL: missingExtensionsUrl });
    } else {
      menuItems[existingMissingItemIndex].URL = missingExtensionsUrl; // Update URL in case host/port changed
    }
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
    parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    try {
        await buildAndWriteXML(mainMenuPath, parsedMainMenu);
        revalidatePath('/');
    } catch(e: any) {
        console.error(`[Sync] Failed to write ${mainMenuPath}:`, e);
        filesFailedToUpdate++;
        failedFileUpdatePaths.push(paths.MAINMENU_FILENAME);
    }
  } else { // No missing extensions, try to clean up
    const missingExtensionsFilePath = path.join(paths.DEPARTMENT_DIR, missingExtensionsFilename);
    try {
      await fs.unlink(missingExtensionsFilePath);
      console.log(`[Sync] Removed ${missingExtensionsFilePath} as there are no missing extensions.`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') { // Only warn if it's not a "file not found" error
          console.warn(`[Sync] Could not remove ${missingExtensionsFilePath}: ${e.message}`);
      }
    }

    const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
    let parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
      let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      const initialLength = menuItems.length;
      menuItems = menuItems.filter(item => item.Name !== missingExtensionsMenuItemName);
      if (menuItems.length < initialLength) { // Only write if something changed
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
        try {
            await buildAndWriteXML(mainMenuPath, parsedMainMenu);
            revalidatePath('/');
        } catch(e: any) {
            console.error(`[Sync] Failed to write ${mainMenuPath} after removing Missing Extensions link:`, e);
            filesFailedToUpdate++;
            failedFileUpdatePaths.push(paths.MAINMENU_FILENAME);
        }
      }
    }
  }


  // Step 6: Prepare summary message
  let message = `Sync complete. ${updatedCount} names updated in ${filesModified - (failedFileUpdatePaths.includes(paths.MAINMENU_FILENAME) ? 1 : 0) - (failedFileUpdatePaths.includes(path.join(paths.DEPARTMENT_DIR, missingExtensionsFilename)) ? 1 : 0) } department files. `;
  if (conflictedExtensions.length > 0) {
    message += `Found ${conflictedExtensions.length} conflicted extension numbers (not updated, see details). `;
  }
  if (missingExtensions.length > 0) {
    message += `Created/Updated a list of ${missingExtensions.length} extensions found in feeds but missing locally. Check the '${missingExtensionsMenuItemName}' item on the homepage. `;
  } else {
    message += `No extensions from feeds were found to be missing locally. `;
  }


  if (filesFailedToUpdate > 0) {
    const uniqueFailedFiles = [...new Set(failedFileUpdatePaths)];
    message += `Failed to update ${filesFailedToUpdate} files (including ${uniqueFailedFiles.length} unique paths).`;
     if (uniqueFailedFiles.length > 0) {
        message += ` Failed files: ${uniqueFailedFiles.join(', ')}. Check server logs for details.`;
    } else {
        message += ` Check server logs for details.`;
    }
  }


  return {
    success: filesFailedToUpdate === 0,
    message,
    updatedCount,
    filesModified,
    filesFailedToUpdate,
    conflictedExtensions,
    missingExtensions,
  };
}

      
