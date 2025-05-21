
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

    // Try to read host/port from .config.json
    const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json'); // Assuming .config.json is in ivoxsdir
    try {
        const configData = await fs.readFile(networkConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) currentHost = config.host;
        if (config.port) currentPort = config.port;
    } catch (e) {
      // Silently ignore if config not found or unreadable, use defaults
      console.warn(`[addZoneAction] Network config not found or unreadable at ${networkConfigPath}. Using defaults for new zone URL.`);
    }


  const newZoneUrl = `http://${currentHost}:${currentPort}/ivoxsdir/zonebranch/${newZoneId}.xml`;

  try {
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      // MainMenu.xml doesn't exist or is invalid, create a new one
      const newMainMenuContent: { CiscoIPPhoneMenu: CiscoIPPhoneMenu } = {
        CiscoIPPhoneMenu: {
          Title: "Farmacia Carol", // Or some default title
          Prompt: "Select a Zone Branch",
          MenuItem: [{ Name: zoneName, URL: newZoneUrl }]
        }
      };
      await buildAndWriteXML(mainMenuPath, newMainMenuContent);
    } else {
      // MainMenu.xml exists, add to it
      let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      if (menuItems.some(item => extractIdFromUrl(item.URL) === newZoneId || item.Name === zoneName)) {
        return { success: false, message: `A zone with name "${zoneName}" or ID "${newZoneId}" already exists in MainMenu.` };
      }
      menuItems.push({ Name: zoneName, URL: newZoneUrl });
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); // Keep sorted
      parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined; // Handle case where all items are removed
      await buildAndWriteXML(mainMenuPath, parsedMainMenu);
    }

    // Create the new zone branch XML file
    const newZoneBranchContent: { CiscoIPPhoneMenu: CiscoIPPhoneMenu } = {
      CiscoIPPhoneMenu: {
        Title: zoneName,
        Prompt: "Select an item"
        // MenuItem will be empty initially
      }
    };
    await buildAndWriteXML(newZoneBranchFilePath, newZoneBranchContent);

    revalidatePath('/'); // Revalidate homepage to show new zone
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
    // Attempt to read the zone file to get its contents for cascade delete
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
        if (unlinkError.code !== 'ENOENT') { // Only warn if not "file not found"
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
      if (menuItems.length < initialLength) { // Only write if something changed
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined; // Handle case where all items are removed
        await buildAndWriteXML(mainMenuPath, parsedMainMenu);
        console.log(`[DeleteZone] Updated ${paths.MAINMENU_FILENAME}`);
      } else {
        console.log(`[DeleteZone] Zone ${sanitizedZoneId} not found in ${paths.MAINMENU_FILENAME}, no update needed.`);
      }
    } else {
      console.warn(`[DeleteZone] ${paths.MAINMENU_FILENAME} not found or invalid, cannot remove zone entry.`);
    }

    revalidatePath('/'); // Revalidate homepage
    revalidatePath(`/${sanitizedZoneId}`, 'page'); // Revalidate the deleted zone's page (will become 404)
    console.log(`[DeleteZone] Zone "${sanitizedZoneId}" and its contents deleted successfully.`);
    return { success: true, message: `Zone "${sanitizedZoneId}" and its contents deleted successfully.` };

  } catch (error: any) {
    console.error(`[DeleteZone] Error deleting zone "${sanitizedZoneId}":`, error);
    return { success: false, message: `Failed to delete zone: ${error.message}`, error: error.message };
  }
}


interface AddItemArgs {
  zoneId: string;
  branchId?: string; // If adding locality to a branch
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
  const newItemId = generateIdFromName(itemName); // New item's ID derived from its name

  let currentHost = '127.0.0.1';
  let currentPort = '3000';

  // Try to read host/port from .config.json
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
    if (branchId) return { success: false, message: "Cannot add a branch under another branch using this action."}; // Branches are only under zones
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childDirPath = paths.BRANCH_DIR;
    newChildItemUrl = `http://${currentHost}:${currentPort}/ivoxsdir/branch/${newItemId}.xml`;
    itemTypeNameForMessage = "Branch";
  } else { // itemType === 'locality'
    if (branchId) {
      // Adding a locality to a specific branch (e.g., under ZonaMetropolitana > AdmCendis)
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (to branch)";
    } else {
      // Adding a locality directly to a zone (e.g., under ZonaEste)
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (to zone)";
    }
    childDirPath = paths.DEPARTMENT_DIR;
    newChildItemUrl = `http://${currentHost}:${currentPort}/ivoxsdir/department/${newItemId}.xml`;
  }
  const childFilePath = path.join(childDirPath, `${newItemId}.xml`); // Path for the new XML file itself

  try {
    // Read the parent XML file
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);

    // Check for existing item with same ID or Name in parent
    if (menuItems.some(item => extractIdFromUrl(item.URL) === newItemId || item.Name === itemName)) {
        return { success: false, message: `An item with name "${itemName}" or ID "${newItemId}" already exists in ${path.basename(parentFilePath)}.` };
    }

    menuItems.push({ Name: itemName, URL: newChildItemUrl });
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); // Keep sorted
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    // Create the new child XML file (empty structure)
    let newChildXmlContent;
    if (itemType === 'branch') {
      newChildXmlContent = { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a locality' } };
    } else { // itemType === 'locality'
      newChildXmlContent = { CiscoIPPhoneDirectory: { Title: itemName, Prompt: 'Select an extension' } };
    }
    await buildAndWriteXML(childFilePath, newChildXmlContent);

    // Revalidate paths
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
  branchId?: string; // If editing a locality within a branch
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
  const newItemId = generateIdFromName(newItemName); // New ID will be based on the new name

  let currentHost = '127.0.0.1';
  let currentPort = '3000';
  // Try to read host/port from .config.json
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
  } else { // itemType === 'locality'
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

    // Check if new name/ID would conflict with another existing item
    if (menuItems.some((item, index) => index !== itemIndex && (extractIdFromUrl(item.URL) === newItemId || item.Name === newItemName))) {
      return { success: false, message: `Another item with name "${newItemName}" or ID "${newItemId}" already exists in ${path.basename(parentFilePath)}.` };
    }

    menuItems[itemIndex].Name = newItemName;
    if (newItemId !== sanitizedOldItemId) { // If ID changed (due to name change), update URL and rename file
      menuItems[itemIndex].URL = newChildFullUrl;
    }
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); // Keep sorted
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    // Rename the child XML file if its ID changed
    if (newItemId !== sanitizedOldItemId) {
      try {
        await fs.rename(oldChildFilePath, newChildFilePath);
      } catch (renameError: any) {
        if (renameError.code === 'ENOENT') {
          // If old file doesn't exist, it might be an orphan link; create the new one.
          console.warn(`Old child file ${oldChildFilePath} not found during rename. Creating new file ${newChildFilePath}.`);
          const newChildXmlContent = itemType === 'branch'
            ? { CiscoIPPhoneMenu: { Title: newItemName, Prompt: 'Select a locality' } }
            : { CiscoIPPhoneDirectory: { Title: newItemName, Prompt: 'Select an extension' } };
          await buildAndWriteXML(newChildFilePath, newChildXmlContent);
        } else { throw renameError; } // Re-throw other rename errors
      }
    }

    // Update the Title inside the child XML file
    const childFileToUpdate = newItemId === sanitizedOldItemId ? oldChildFilePath : newChildFilePath;
    const parsedChildXml = await readAndParseXML(childFileToUpdate);
    if (parsedChildXml) { // Only update if child file exists and is readable
        if (itemType === 'branch' && parsedChildXml.CiscoIPPhoneMenu) {
            parsedChildXml.CiscoIPPhoneMenu.Title = newItemName;
        } else if (itemType === 'locality' && parsedChildXml.CiscoIPPhoneDirectory) {
            parsedChildXml.CiscoIPPhoneDirectory.Title = newItemName;
        }
        await buildAndWriteXML(childFileToUpdate, parsedChildXml);
    } else {
        // This case should be rare if rename/creation above worked, but good to log.
        console.warn(`Child file ${childFileToUpdate} not found after potential rename/creation for title update. Creating it now.`);
        const newChildXmlContent = itemType === 'branch'
            ? { CiscoIPPhoneMenu: { Title: newItemName, Prompt: 'Select a locality' } }
            : { CiscoIPPhoneDirectory: { Title: newItemName, Prompt: 'Select an extension' } };
        await buildAndWriteXML(childFileToUpdate, newChildXmlContent);
    }


    // Revalidate relevant paths
    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    // Revalidate specific item pages
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
  branchId?: string; // If deleting a locality within a branch
  itemId: string;
  itemName: string; // For user message, not strictly needed for logic if using ID
  itemType: 'branch' | 'locality';
}
export async function deleteLocalityOrBranchAction(args: DeleteItemArgs): Promise<{ success: boolean; message: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.' };
  }
  const paths = await getIvoxsPaths();
  const { zoneId, branchId, itemId, itemType } = args; // itemName can be used for the message
  if (!zoneId || !itemId) {
    return { success: false, message: 'Zone ID and Item ID are required.' };
  }
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedItemId = sanitizeFilenamePart(itemId);

  let parentFilePath: string;
  let childFilePath: string;
  let itemTypeNameForMessage: string = itemType === 'branch' ? 'Branch' : 'Locality';

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot delete a branch from within another branch context."}; // Should not happen via UI
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childFilePath = path.join(paths.BRANCH_DIR, `${sanitizedItemId}.xml`);
  } else { // itemType === 'locality'
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
    } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    }
    childFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedItemId}.xml`);
  }

  try {
    // Remove item from parent XML
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      // If parent doesn't exist, the link is already gone. Still try to delete child.
      console.warn(`Parent XML file ${path.basename(parentFilePath)} not found or invalid during delete operation. Proceeding to delete child file.`);
    } else {
      let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
      const initialLength = menuItems.length;
      menuItems = menuItems.filter(item => !(item && typeof item.URL === 'string' && extractIdFromUrl(item.URL) === sanitizedItemId));
      if (menuItems.length < initialLength) { // Only write if an item was actually removed
        parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
        await buildAndWriteXML(parentFilePath, parsedParentXml);
      }
    }

    // Delete the child XML file
    try {
      await fs.unlink(childFilePath);
    } catch (unlinkError: any) {
      if (unlinkError.code !== 'ENOENT') { // If error is not "file not found", log it as a warning.
        console.warn(`Could not delete child file ${childFilePath}: ${unlinkError.message}`);
        // Optionally, you might want to return a partial success or error here.
      }
    }

    // Revalidate paths
    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    // Specific page revalidation for the deleted item
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

    let charDetails = '';
    for (let i = 0; i < trimmedTelephone.length; i++) {
      charDetails += `char[${i}]: ${trimmedTelephone[i]} (code: ${trimmedTelephone.charCodeAt(i).toString(16)}) `;
    }
    console.log(`[Debug AddExtension] Validating telephone. Raw: "[${telephone}]", Trimmed: "[${trimmedTelephone}]", Length: ${trimmedTelephone.length}, CharDetails: ${charDetails.trim()}`);

    const isDigitsOnly = /^\d+$/.test(trimmedTelephone);
    console.log(`[Debug AddExtension] Result of /^\\d+$/.test(trimmedTelephone) for "[${trimmedTelephone}]" = ${isDigitsOnly}`);

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
          Title: sanitizedLocalityId, // Use sanitized ID for Title if new
          Prompt: 'Select an extension',
          DirectoryEntry: [{ Name: trimmedName, Telephone: trimmedTelephone }],
        }
      };
    } else {
      directoryObject = parsedDepartmentXml;
      let directoryEntries = ensureArray(directoryObject.CiscoIPPhoneDirectory.DirectoryEntry);
      // Check for exact match of name and telephone
      if (directoryEntries.some(entry => entry.Name === trimmedName && entry.Telephone === trimmedTelephone)) {
        return {
            success: false,
            message: `An extension with Name "${trimmedName}" and Telephone "${trimmedTelephone}" already exists.`,
            details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: `${name}-${telephone}`, error: 'Extension already exists'}]}
        };
      }
      directoryEntries.push({ Name: trimmedName, Telephone: trimmedTelephone });
      // Sort entries by Name, then by Telephone
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

    let charDetails = '';
    for (let i = 0; i < trimmedNewNumber.length; i++) {
      charDetails += `char[${i}]: ${trimmedNewNumber[i]} (code: ${trimmedNewNumber.charCodeAt(i).toString(16)}) `;
    }
    console.log(`[Debug EditExtension] Validating newExtensionNumber. Raw: "[${newExtensionNumber}]", Trimmed: "[${trimmedNewNumber}]", Length: ${trimmedNewNumber.length}, CharDetails: ${charDetails.trim()}`);
    const isNewNumDigitsOnly = /^\d+$/.test(trimmedNewNumber);
    console.log(`[Debug EditExtension] Result of /^\\d+$/.test(trimmedNewNumber) for "[${trimmedNewNumber}]" = ${isNewNumDigitsOnly}`);

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


async function processSingleXmlFileForHostUpdate(filePath: string, newHost: string, newPort: string): Promise<{ success: boolean; error?: string; filePath: string; changed: boolean }> {
  let fileChanged = false;
  try {
    console.log(`[processSingleXmlFileForHostUpdate] Processing: ${filePath}`);
    const parsedXml = await readAndParseXML(filePath);
    if (!parsedXml) {
      console.log(`[processSingleXmlFileForHostUpdate] File not found or empty, skipping: ${filePath}`);
      return { success: true, filePath: filePath, changed: fileChanged };
    }
    if (!parsedXml.CiscoIPPhoneMenu) {
        console.log(`[processSingleXmlFileForHostUpdate] Not a CiscoIPPhoneMenu file (no root CiscoIPPhoneMenu tag), skipping: ${filePath}`);
        return { success: true, filePath: filePath, changed: fileChanged };
    }

    const menuItems = ensureArray(parsedXml.CiscoIPPhoneMenu.MenuItem);
     if (!menuItems || menuItems.length === 0) {
        console.log(`[processSingleXmlFileForHostUpdate] No MenuItems found or MenuItem array is empty, skipping: ${filePath}`);
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
      console.log(`[processSingleXmlFileForHostUpdate] URLs updated. Writing changes to: ${filePath}`);
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


  for (const filePath of allFilesToProcess) {
    filesProcessed++;
    const result = await processSingleXmlFileForHostUpdate(filePath, newHost.trim(), newPort.trim());
    if (!result.success) {
      filesFailed++;
      failedFilePaths.push(result.filePath);
    }
    if (result.changed) {
        filesChangedCount++;
        // No API route revalidation needed as XML files are no longer served directly
    }
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
    message: `XML URL update process completed. ${filesProcessed} files checked, ${filesChangedCount} files updated.`,
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
}

async function updateParentMenuWithNewLocality(args: UpdateParentMenuArgs): Promise<{ success: boolean; error?: string; itemAddedOrParentCreated: boolean }> {
  const { paths, zoneId, localityId, localityName } = args;
  let parentFilePath: string;
  let parentFileCreated = false;
  let itemAdded = false;

  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedLocalityId = sanitizeFilenamePart(localityId);

  let currentHost = '127.0.0.1';
  let currentPort = '3000';
  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  try {
    const configData = await fs.readFile(networkConfigPath, 'utf-8');
    const config = JSON.parse(configData);
    if (config.host) currentHost = config.host;
    if (config.port) currentPort = config.port;
  } catch (e) {
    console.warn(`[UpdateParentMenu] Network config not found for URL generation. Using defaults.`);
  }
  const newLocalityUrl = `http://${currentHost}:${currentPort}/ivoxsdir/department/${sanitizedLocalityId}.xml`;

  // Determine parent file based on ZoneID
  if (sanitizedZoneId.toLowerCase() === 'zonametropolitana') {
      // For "ZonaMetropolitana", the localities are added to 'ivoxsdir/branch/ZonaMetropolitana.xml'
      parentFilePath = path.join(paths.BRANCH_DIR, 'ZonaMetropolitana.xml');
  } else {
      parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
  }
  console.log(`[UpdateParentMenu] Determined parent file path for ZoneID "${zoneId}": ${parentFilePath}`);


  try {
    let parsedParentXml = await readAndParseXML(parentFilePath);

    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      console.log(`[UpdateParentMenu] Parent menu file ${path.basename(parentFilePath)} not found or invalid. Creating new one.`);
      const parentTitle = sanitizedZoneId.toLowerCase() === 'zonametropolitana' ? 'Zona Metropolitana' : sanitizedZoneId;
      parsedParentXml = {
        CiscoIPPhoneMenu: {
          Title: parentTitle,
          Prompt: 'Select a locality',
          MenuItem: [],
        },
      };
      parentFileCreated = true;
    }

    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    const existingItemIndex = menuItems.findIndex(item => extractIdFromUrl(item.URL) === sanitizedLocalityId);

    if (existingItemIndex === -1) {
      menuItems.push({ Name: localityName, URL: newLocalityUrl });
      itemAdded = true; // CRITICAL FIX: Ensure this flag is set
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
      parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    } else if (menuItems[existingItemIndex].Name !== localityName) {
      menuItems[existingItemIndex].Name = localityName;
      itemAdded = true; // CRITICAL FIX: Ensure this flag is set for name updates too
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
    }
    
    if (itemAdded || parentFileCreated) {
      console.log(`[UpdateParentMenu] Saving changes to parent menu: ${parentFilePath}. ItemAdded: ${itemAdded}, ParentCreated: ${parentFileCreated}`);
      await buildAndWriteXML(parentFilePath, parsedParentXml);
    } else {
       console.log(`[UpdateParentMenu] No changes needed for parent menu: ${parentFilePath}.`);
    }

    return { success: true, itemAddedOrParentCreated: itemAdded || parentFileCreated };
  } catch (error: any) {
    console.error(`[UpdateParentMenu] Error updating parent menu ${path.basename(parentFilePath)}:`, error);
    return { success: false, error: error.message, itemAddedOrParentCreated: false };
  }
}

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const authenticated = await isAuthenticated(); // Assuming search should be an authenticated action or adjust as needed
  if (!authenticated) {
    // Decide if unauthenticated search is allowed or return empty/error
    console.warn('[GlobalSearch] Unauthenticated search attempt.');
    return [];
  }

  const paths = await getIvoxsPaths();
  const results: GlobalSearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.length < 2) { // Minimum search term length
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

          if (itemType === 'branch') { // e.g., For ZonaMetropolitana's branches
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
                // Process this locality (from a branch)
                await processLocalityForSearch({
                  paths, localityId, localityName, lowerQuery, results,
                  zoneId, zoneName, branchId: itemId, branchName: itemName
                });
              }
            } catch (branchError) {
              console.warn(`[GlobalSearch] Could not read/parse branch file ${branchFilePath}:`, branchError);
            }
          } else if (itemType === 'locality') { // For localities directly under a zone
            // Process this locality (from a zone)
            await processLocalityForSearch({
              paths, localityId: itemId, localityName: itemName, lowerQuery, results,
              zoneId, zoneName
            });
          }
        }
      } catch (zoneBranchError) {
        console.warn(`[GlobalSearch] Could not read/parse zone branch file ${zoneBranchFilePath}:`, zoneBranchError);
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
  let localityNameMatch = localityName.toLowerCase().includes(lowerQuery);
  const matchingExtensions: MatchedExtension[] = [];

  try {
    const deptContent = await fs.readFile(deptFilePath, 'utf-8');
    const parsedDept = await parseStringPromise(deptContent, { explicitArray: false, trim: true });
    
    if (!parsedDept || typeof parsedDept !== 'object' || !parsedDept.CiscoIPPhoneDirectory || typeof parsedDept.CiscoIPPhoneDirectory !== 'object') {
        console.warn(`[GlobalSearch] Invalid or empty XML structure for department file: ${deptFilePath}`);
        if (localityNameMatch) { // If the locality name itself matched, add it even if extensions can't be read
             results.push({
                localityId, localityName, zoneId, zoneName, branchId, branchName,
                fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
                localityNameMatch, matchingExtensions: []
            });
        }
        return;
    }

    const deptDirectory = CiscoIPPhoneDirectorySchema.safeParse(parsedDept.CiscoIPPhoneDirectory);

    if (!deptDirectory.success || !deptDirectory.data.DirectoryEntry) {
      // console.warn(`[GlobalSearch] Could not parse department file or no entries: ${deptFilePath}`);
      // If only localityName matched, we might still want to add it.
      if (localityNameMatch) {
        results.push({
          localityId, localityName: deptDirectory.data?.Title || localityName, zoneId, zoneName, branchId, branchName,
          fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
          localityNameMatch, matchingExtensions
        });
      }
      return;
    }

    const currentLocalityName = deptDirectory.data.Title || localityName; // Prefer title from XML if available
    if (!localityNameMatch) { // Re-check if title from XML matches
        localityNameMatch = currentLocalityName.toLowerCase().includes(lowerQuery);
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
      results.push({
        localityId,
        localityName: currentLocalityName,
        zoneId,
        zoneName,
        branchId,
        branchName,
        fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
        localityNameMatch,
        matchingExtensions
      });
    }
  } catch (error) {
    // console.warn(`[GlobalSearch] Error processing department file ${deptFilePath}:`, error);
    // If locality name matched initially, add it even if file processing fails
    if (localityNameMatch && !results.some(r => r.localityId === localityId && r.zoneId === zoneId && r.branchId === branchId)) {
         results.push({
            localityId, localityName, zoneId, zoneName, branchId, branchName,
            fullPath: branchId ? `/${zoneId}/branches/${branchId}/localities/${localityId}` : `/${zoneId}/localities/${localityId}`,
            localityNameMatch: true, matchingExtensions: []
        });
    } else {
      console.warn(`[GlobalSearch] Could not fetch locality data for ID: ${localityId} in zone ${zoneName} ${branchName ? `(branch ${branchName})` : ''}`);
    }
  }
}


export async function importExtensionsFromCsvAction(csvContent: string): Promise<CsvImportResult> {
  console.log('[CSV Import Action] Starting CSV import.');
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    const result: CsvImportResult = { success: false, message: 'Authentication required.', details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, parentMenusUpdated: 0, mainMenuUpdatedCount: 0, errors: [{row:0, data: '', error: 'User not authenticated'}]} };
    console.log('[CSV Import Action] Returning (auth error):', JSON.stringify(result));
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

  let currentHost = '127.0.0.1';
  let currentPort = '3000';
  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  try {
    const configData = await fs.readFile(networkConfigPath, 'utf-8');
    const config = JSON.parse(configData);
    if (config.host) currentHost = config.host;
    if (config.port) currentPort = config.port;
    console.log(`[CSV Import Action] Loaded network config: Host=${currentHost}, Port=${currentPort}`);
  } catch (e) {
    console.warn(`[CSV Import Action] Network config not found or unreadable. Using defaults for new URLs.`);
  }

  let headerRowSkipped = false;
  const expectedHeaderCols = ["name", "extension", "localityid", "zoneid"];

  if (lines[0]) {
    const potentialHeader = lines[0].trim();
    let headerCols = potentialHeader.split(',').map(col => col.trim().toLowerCase());

    if (headerCols.length < expectedHeaderCols.length && potentialHeader.includes('\t')) {
      headerCols = potentialHeader.split('\t').map(col => col.trim().toLowerCase());
    }
    if (headerCols.length < expectedHeaderCols.length && /\s+/.test(potentialHeader) && headerCols.length ===1) {
      // Fallback for space-delimited if comma/tab resulted in single column with multiple words
       headerCols = potentialHeader.split(/\s+/).map(col => col.trim().toLowerCase());
    }


    if (
      headerCols.length >= expectedHeaderCols.length &&
      expectedHeaderCols.every((expectedCol, index) => headerCols[index]?.includes(expectedCol))
    ) {
      headerRowSkipped = true;
      console.log('[CSV Import Action] Header row detected and skipped:', potentialHeader);
    } else {
      console.log('[CSV Import Action] No header row detected or header format mismatch. Expected:', expectedHeaderCols, 'Got:', headerCols);
    }
  }

  const uniqueLocalitiesToUpdateInParentMenu = new Map<string, { localityId: string, localityName: string, zoneId: string }>();
  const uniqueNewZonesToUpdateInMainMenu = new Set<string>();

  console.log(`[CSV Import Action] Parsed ${lines.length} lines from CSV. Header skipped: ${headerRowSkipped}`);

  try {
    for (let i = headerRowSkipped ? 1 : 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue; 

      results.processedRows++;
      console.log(`[CSV Import Action] Processing row ${i + 1}: ${line}`);

      let columns = line.split(',').map(col => col.trim());
      if (columns.length < expectedHeaderCols.length && line.includes('\t')) {
        console.log(`[CSV Import Action] Row ${i + 1} using tab delimiter.`);
        columns = line.split('\t').map(col => col.trim());
      }
      if (columns.length < expectedHeaderCols.length && columns.length === 1 && /\s+/.test(line) ) {
        console.log(`[CSV Import Action] Row ${i + 1} using space delimiter.`);
        columns = line.split(/\s+/).map(col => col.trim());
      }


      if (columns.length < 4) {
        console.log(`[CSV Import Action] Row ${i + 1} has insufficient columns. Got ${columns.length}, expected 4. Columns:`, columns);
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
          console.log(`[CSV Import Action] Department file for ${sanitizedLocalityId} (from CSV LocalityID: ${localityIdFromCsv}) not found or invalid. Creating new one.`);
          departmentXml = {
            CiscoIPPhoneDirectory: {
              Title: localityIdFromCsv, // Use original LocalityID from CSV for the Title
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
          console.log(`[CSV Import Action] Extension ${name} (${extensionNumber}) already exists in ${sanitizedLocalityId}. Skipping.`);
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

        const uniqueKey = `${sanitizedLocalityId}__${zoneIdFromCsv}`;
        if (!uniqueLocalitiesToUpdateInParentMenu.has(uniqueKey)) {
          uniqueLocalitiesToUpdateInParentMenu.set(uniqueKey, { localityId: sanitizedLocalityId, localityName: localityIdFromCsv, zoneId: zoneIdFromCsv });
        }
        
        // If a new department file was created, its corresponding zone also needs to be considered for MainMenu update
        // This logic only adds to MainMenu if the ZoneBranch file for this ZoneID *itself* would be new.
        // A zone is considered "new" for MainMenu if its ZoneBranch file doesn't exist.
        const sanitizedZoneIdForFile = generateIdFromName(zoneIdFromCsv);
        const zoneBranchFilePathForCheck = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneIdForFile}.xml`);
        try {
            await fs.access(zoneBranchFilePathForCheck);
        } catch (zoneFileAccessError) {
            if ((zoneFileAccessError as NodeJS.ErrnoException).code === 'ENOENT' && zoneIdFromCsv.toLowerCase() !== 'zonametropolitana') {
                 console.log(`[CSV Import Action] ZoneBranch file for ${zoneIdFromCsv} not found. Marking zone for MainMenu update.`);
                 uniqueNewZonesToUpdateInMainMenu.add(zoneIdFromCsv);
            }
        }


      } catch (fileError: any) {
        console.error(`[CSV Import Action] Error processing file for locality ${localityIdFromCsv}:`, fileError);
        results.errors.push({ row: i + 1, data: line, error: `File system error for ${localityIdFromCsv}: ${fileError.message}` });
      }
    }

    for (const [_, { localityId, localityName, zoneId }] of uniqueLocalitiesToUpdateInParentMenu) {
      console.log(`[CSV Import Action] Updating parent menu for LocalityID: ${localityId} (Original: ${localityName}), ZoneID: ${zoneId}`);
      const parentUpdateResult = await updateParentMenuWithNewLocality({
        paths,
        zoneId,
        localityId, 
        localityName, 
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
              console.warn(`[CSV Import Action] ${paths.MAINMENU_FILENAME} not found or invalid. Creating a new one for new zones.`);
              parsedMainMenu = { CiscoIPPhoneMenu: { Title: "Main Directory", Prompt: "Select an option", MenuItem: [] } };
              mainMenuChanged = true; // Mark as changed if creating new
          }
          let mainMenuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);

          for (const zoneId of uniqueNewZonesToUpdateInMainMenu) {
              const sanitizedZoneIdForFile = generateIdFromName(zoneId); 
              const zoneUrl = `http://${currentHost}:${currentPort}/ivoxsdir/zonebranch/${sanitizedZoneIdForFile}.xml`;
              
              if (!mainMenuItems.some(item => extractIdFromUrl(item.URL) === sanitizedZoneIdForFile)) {
                  mainMenuItems.push({ Name: zoneId, URL: zoneUrl }); 
                  mainMenuChanged = true;
                  results.mainMenuUpdatedCount++;
                  console.log(`[CSV Import Action] Added new zone "${zoneId}" to ${paths.MAINMENU_FILENAME}.`);

                  const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneIdForFile}.xml`);
                  try {
                      await fs.access(zoneBranchFilePath);
                  } catch (accessError) { 
                      console.log(`[CSV Import Action] ZoneBranch file for new zone ${zoneId} (${sanitizedZoneIdForFile}.xml) not found. Creating it.`);
                      const newZoneBranchContent = {
                          CiscoIPPhoneMenu: {
                              Title: zoneId, 
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
          console.error(`[CSV Import Action] Error updating ${paths.MAINMENU_FILENAME}:`, mainMenuError);
          results.errors.push({ row: 0, data: 'MainMenuUpdate', error: `Failed to update ${paths.MAINMENU_FILENAME}: ${mainMenuError.message}`});
      }
    }

    let message = `CSV import completed. Processed ${results.processedRows} data rows. Added ${results.extensionsAdded} extensions.`;
    if (results.newLocalitiesCreated > 0) message += ` Created ${results.newLocalitiesCreated} new locality files.`;
    if (results.parentMenusUpdated > 0) message += ` Updated ${results.parentMenusUpdated} zone/branch menu files.`;
    if (results.mainMenuUpdatedCount > 0) message += ` Updated MainMenu.xml with ${results.mainMenuUpdatedCount} new zone(s).`;
    if (results.errors.length > 0) message += ` Encountered ${results.errors.length} errors.`;

    const finalResult: CsvImportResult = {
      success: results.errors.length === 0,
      message: message,
      details: results,
    };
    console.log('[CSV Import Action] Returning (final result):', JSON.stringify(finalResult));
    return finalResult;

  } catch (overallError: any) {
    console.error("[CSV Import Action] Critical error in importExtensionsFromCsvAction:", overallError);
    const criticalErrorResult: CsvImportResult = {
      success: false,
      message: `Critical Server Error: ${overallError.message || 'Unknown error'}. Check server console for details.`,
      details: { // Ensure details object is always present and conforms to type
        processedRows: results.processedRows,
        extensionsAdded: results.extensionsAdded,
        newLocalitiesCreated: results.newLocalitiesCreated,
        parentMenusUpdated: results.parentMenusUpdated,
        mainMenuUpdatedCount: results.mainMenuUpdatedCount,
        errors: [...results.errors, { row: 0, data: 'CRITICAL', error: overallError.message || 'Unknown critical error' }]
      }
    };
    console.log('[CSV Import Action] Returning (critical error):', JSON.stringify(criticalErrorResult));
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
      console.log(`[Sync] Fetching feed: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[Sync] Failed to fetch feed ${url}: ${response.statusText}`);
        results.filesFailedToUpdate++; 
        continue;
      }
      const xmlText = await response.text();
      const parsedFeed = await parseStringPromise(xmlText, { explicitArray: false, trim: true });
      
      if (!parsedFeed || !parsedFeed.CiscoIPPhoneDirectory) {
          console.warn(`[Sync] Invalid XML structure (missing CiscoIPPhoneDirectory root) in feed ${url}`);
          results.filesFailedToUpdate++;
          continue;
      }
      const validatedFeed = CiscoIPPhoneDirectorySchema.safeParse(parsedFeed.CiscoIPPhoneDirectory);


      if (!validatedFeed.success) {
        console.warn(`[Sync] Invalid XML data structure in feed ${url}:`, validatedFeed.error.issues);
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
              // This is a conflict. Add to conflictedExtensions if not already fully captured.
              let conflictEntry = results.conflictedExtensions.find(c => c.number === entry.Telephone);
              if (!conflictEntry) {
                conflictEntry = { number: entry.Telephone, conflicts: [] };
                // Add the first instance of the conflict
                if (!conflictEntry.conflicts.some(c => c.name === existingEntry.name && c.sourceFeed === existingEntry.sourceFeeds[0])) {
                     conflictEntry.conflicts.push({ name: existingEntry.name, sourceFeed: existingEntry.sourceFeeds[0] });
                }
                results.conflictedExtensions.push(conflictEntry);
              }
              // Add the current conflicting entry
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
      console.warn(`[Sync] Error processing feed ${url}: ${error.message}`);
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
  console.log(`[Sync] Total unique extensions from feeds (after conflict removal): ${uniqueFeedExtensions.size}`);
  console.log(`[Sync] Total conflicted extension numbers: ${results.conflictedExtensions.length}`);

  let departmentFiles: string[];
  try {
    departmentFiles = await fs.readdir(paths.DEPARTMENT_DIR);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`[Sync] Department directory ${paths.DEPARTMENT_DIR} not found. Cannot sync names.`);
      return { ...results, success: false, message: `Department directory not found. No names synced.`, error: `Department directory ${paths.DEPARTMENT_DIR} not found.`};
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
        console.warn(`[Sync] Skipping invalid or empty department file: ${deptFilename}`);
        continue;
      }

      let localEntries = ensureArray(localXml.CiscoIPPhoneDirectory.DirectoryEntry);
      if (localEntries.length === 0) continue; 

      for (const localEntry of localEntries) {
        if (localEntry.Telephone) {
          localExtensionsFoundNumbers.add(localEntry.Telephone); 
          const feedData = uniqueFeedExtensions.get(localEntry.Telephone);
          if (feedData && feedData.name !== localEntry.Name) {
            console.log(`[Sync] Updating name for ${localEntry.Telephone} in ${deptFilename}: "${localEntry.Name}" -> "${feedData.name}" (Source: ${feedData.sourceFeed})`);
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
      console.error(`[Sync] Error processing local department file ${deptFilename}:`, error);
      results.filesFailedToUpdate++;
    }
  }

  console.log(`[Sync] Total unique local extensions found: ${localExtensionsFoundNumbers.size}`);
  for (const [number, data] of uniqueFeedExtensions.entries()) {
    if (!localExtensionsFoundNumbers.has(number)) {
      results.missingExtensions.push({ number, name: data.name, sourceFeed: data.sourceFeed });
    }
  }
  console.log(`[Sync] Total missing extensions (in feed, not local): ${results.missingExtensions.length}`);
  
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
      console.log(`[Sync] Created/Updated ${missingExtensionsFilePath}`);

      let currentHost = '127.0.0.1';
      let currentPort = '3000';
      const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
      try {
          const configData = await fs.readFile(networkConfigPath, 'utf-8');
          const config = JSON.parse(configData);
          if (config.host) currentHost = config.host;
          if (config.port) currentPort = config.port;
      } catch (e) { /* Use defaults */ }
      const missingExtensionsUrl = `http://${currentHost}:${currentPort}/ivoxsdir/department/MissingExtensionsFromFeed.xml`;
      
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
        console.log(`[Sync] Ensured "${missingExtensionsMenuItemName}" item in ${mainMenuPath}`);
      } else {
        console.warn(`[Sync] Could not update ${mainMenuPath} for missing extensions link.`);
      }

    } catch (error: any) {
        console.error(`[Sync] Error creating/updating missing extensions list: ${error.message}`);
    }
  } else {
    try {
      await fs.unlink(missingExtensionsFilePath);
      console.log(`[Sync] Removed ${missingExtensionsFilePath} as no missing extensions found.`);
      
      const parsedMainMenu = await readAndParseXML(mainMenuPath);
      if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
        let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
        const initialLength = menuItems.length;
        menuItems = menuItems.filter(item => item.Name !== missingExtensionsMenuItemName);
        if (menuItems.length < initialLength) {
            parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
            await buildAndWriteXML(mainMenuPath, parsedMainMenu);
            console.log(`[Sync] Removed "${missingExtensionsMenuItemName}" item from ${mainMenuPath}`);
        }
      }
    } catch (error: any) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { 
        console.warn(`[Sync] Error cleaning up missing extensions list/link: ${error.message}`);
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

