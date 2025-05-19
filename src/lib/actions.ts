
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, CiscoIPPhoneDirectory, MenuItem as XmlMenuItem } from '@/types/xml';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth-actions';
import type { SyncResult } from '@/types';

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
  const sanitized = filenamePart.replace(/[^a-zA-Z0-9_.-]/g, '');
  return sanitized || `invalid_name_${Date.now()}`;
};


function generateIdFromName(name: string): string {
  const cleanedName = name.replace(/[^a-zA-Z0-9\\s_.-]/g, '');
  if (!cleanedName.trim()) return `UnnamedItem${Date.now()}`;
  return cleanedName
    .replace(/\\s+/g, '') // Remove all whitespace
    .replace(/_{2,}/g, '_') // Replace multiple underscores with one
    .replace(/-{2,}/g, '-'); // Replace multiple hyphens with one
}


async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    return parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
  const builder = new Builder({
    headless: false, // Set to false to include the root tag
    renderOpts: { pretty: true, indent: '  ', newline: '\n' }, // Use \n for newline
    xmldec: { version: '1.0', encoding: 'UTF-8', standalone: false }
  });

  let xmlContentBuiltByBuilder;
  // Ensure jsObject is structured correctly for the builder, e.g. { CiscoIPPhoneMenu: { ... } }
  if (jsObject.CiscoIPPhoneMenu || jsObject.CiscoIPPhoneDirectory) {
    xmlContentBuiltByBuilder = builder.buildObject(jsObject);
  } else {
    // This case might happen if the object is already the root content,
    // but typically we want to pass the object with its root key.
    // For safety, log if this less common path is taken.
    console.warn("[buildAndWriteXML] jsObject does not seem to have a top-level CiscoIPPhoneMenu or CiscoIPPhoneDirectory key. Building as-is. FilePath:", filePath);
    xmlContentBuiltByBuilder = builder.buildObject(jsObject);
  }
  
  // The builder with xmldec includes the XML declaration.
  const finalXmlString = xmlContentBuiltByBuilder;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalXmlString, 'utf-8');
}


function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace('.xml', '');
}

export async function addZoneAction(zoneName: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required. Please log in to add a zone.', error: 'User not authenticated' };
  }

  const paths = await getIvoxsPaths();
  const newZoneId = generateIdFromName(zoneName);
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);

  let currentHost = '127.0.0.1';
  let currentPort = '3000';

  try {
    const ivoxsDir = paths.IVOXS_DIR;
    const hostConfigPath = path.join(ivoxsDir, '.config.json');
    try {
        const configData = await fs.readFile(hostConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) currentHost = config.host;
        if (config.port) currentPort = config.port;
    } catch (e) {
        // console.warn("Could not read .config.json for host/port from ivoxsdir, using default host/port for new zone URL.");
    }
  } catch (e) { /* ignore error */ }


  const newZoneUrl = `http://${currentHost}:${currentPort}/ivoxsdir/zonebranch/${newZoneId}.xml`;

  try {
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      const newMainMenuContent = {
        CiscoIPPhoneMenu: {
          Title: "Farmacia Carol", // Or a configurable title
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
      parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems;
      await buildAndWriteXML(mainMenuPath, parsedMainMenu);
    }

    const newZoneBranchContent = {
      CiscoIPPhoneMenu: {
        Title: zoneName,
        Prompt: "Select an item"
        // MenuItem can be empty initially
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

  try {
    const ivoxsDir = paths.IVOXS_DIR;
    const hostConfigPath = path.join(ivoxsDir, '.config.json');
    try {
        const configData = await fs.readFile(hostConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) currentHost = config.host;
        if (config.port) currentPort = config.port;
    } catch (e) {
        // console.warn("Could not read .config.json for host/port, using default host/port for new item URL.")
    }
  } catch (e) { /* ignore */ }


  let parentFilePath: string;
  let childDirPath: string;
  let newChildItemUrl: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    // This is for adding a Branch item under a Zone (e.g., for ZonaMetropolitana)
    if (branchId) return { success: false, message: "Cannot add a branch under another branch using this action."};
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childDirPath = paths.BRANCH_DIR;
    newChildItemUrl = `http://${currentHost}:${currentPort}/ivoxsdir/branch/${newItemId}.xml`;
    itemTypeNameForMessage = "Branch";
  } else { // itemType === 'locality'
    // This is for adding a Locality item either under a Zone or under a Branch
    if (branchId) {
      // Locality under a Branch
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(paths.BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (to branch)";
    } else {
      // Locality directly under a Zone
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
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    // Create the new child XML file (either branch or department)
    let newChildXmlContent;
    if (itemType === 'branch') {
      newChildXmlContent = { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a locality' } };
    } else { // 'locality'
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
  const newItemId = generateIdFromName(newItemName); // Generate new ID based on new name

  let currentHost = '127.0.0.1';
  let currentPort = '3000';
  try {
    const ivoxsDir = paths.IVOXS_DIR;
    const hostConfigPath = path.join(ivoxsDir, '.config.json');
     try {
        const configData = await fs.readFile(hostConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) currentHost = config.host;
        if (config.port) currentPort = config.port;
    } catch (e) {
        // console.warn("Could not read .config.json for host/port, using default host/port for edited item URL.")
    }
  } catch(e) { /* ignore */ }


  let parentFilePath: string;
  let oldChildFilePath: string;
  let newChildFilePath: string;
  let newChildItemUrlSegment: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot edit a branch under another branch context using this action."}; // Branches are direct children of zones
    parentFilePath = path.join(paths.ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    oldChildFilePath = path.join(paths.BRANCH_DIR, `${sanitizedOldItemId}.xml`);
    newChildFilePath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
    newChildItemUrlSegment = `/branch/${newItemId}.xml`;
    itemTypeNameForMessage = "Branch";
  } else { // 'locality'
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
    // Update parent XML
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    const itemIndex = menuItems.findIndex(item => extractIdFromUrl(item.URL) === sanitizedOldItemId);
    if (itemIndex === -1) {
      return { success: false, message: `${itemTypeNameForMessage} with ID "${sanitizedOldItemId}" not found in ${path.basename(parentFilePath)}.` };
    }
    // Check for conflicts with the new name/ID
    if (menuItems.some((item, index) => index !== itemIndex && (extractIdFromUrl(item.URL) === newItemId || item.Name === newItemName))) {
      return { success: false, message: `Another item with name "${newItemName}" or ID "${newItemId}" already exists in ${path.basename(parentFilePath)}.` };
    }
    menuItems[itemIndex].Name = newItemName;
    if (newItemId !== sanitizedOldItemId) { // Only update URL if ID changes
      menuItems[itemIndex].URL = newChildFullUrl;
    }
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    // Rename child XML file if ID changed
    if (newItemId !== sanitizedOldItemId) {
      try {
        await fs.rename(oldChildFilePath, newChildFilePath);
      } catch (renameError: any) {
        if (renameError.code === 'ENOENT') {
          // If old file doesn't exist, it's problematic. Log and perhaps create the new one.
          console.warn(`Old child file ${oldChildFilePath} not found during rename. Creating new file ${newChildFilePath}.`);
          const newChildXmlContent = itemType === 'branch'
            ? { CiscoIPPhoneMenu: { Title: newItemName, Prompt: 'Select a locality' } }
            : { CiscoIPPhoneDirectory: { Title: newItemName, Prompt: 'Select an extension' } };
          await buildAndWriteXML(newChildFilePath, newChildXmlContent);
        } else { throw renameError; } // Re-throw other rename errors
      }
    }

    // Update Title in child XML file
    const childFileToUpdate = newItemId === sanitizedOldItemId ? oldChildFilePath : newChildFilePath;
    const parsedChildXml = await readAndParseXML(childFileToUpdate);
    if (parsedChildXml) { // If file exists (it should after rename or if ID didn't change)
        if (itemType === 'branch' && parsedChildXml.CiscoIPPhoneMenu) {
            parsedChildXml.CiscoIPPhoneMenu.Title = newItemName;
        } else if (itemType === 'locality' && parsedChildXml.CiscoIPPhoneDirectory) {
            parsedChildXml.CiscoIPPhoneDirectory.Title = newItemName;
        }
        await buildAndWriteXML(childFileToUpdate, parsedChildXml);
    } else {
        // This case should ideally not happen if rename logic is correct or if file existed.
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
  branchId?: string; // If deleting a locality within a branch
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
  } else { // 'locality'
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
    // Update parent XML
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    menuItems = menuItems.filter(item => !(item && typeof item.URL === 'string' && extractIdFromUrl(item.URL) === sanitizedItemId));
    // If menuItems is empty after filter, assign undefined to remove the MenuItem tag
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    // Delete child XML file
    try {
      await fs.unlink(childFilePath);
    } catch (unlinkError: any) {
      if (unlinkError.code !== 'ENOENT') { // Ignore if file already doesn't exist
        console.warn(`Could not delete child file ${childFilePath}: ${unlinkError.message}`);
        // Potentially return a partial success or specific error here if critical
      }
    }

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    // Revalidate the specific locality page if applicable
    if (itemType === 'locality' && branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}/localities/${sanitizedItemId}`);
    else if (itemType === 'locality') revalidatePath(`/${sanitizedZoneId}/localities/${sanitizedItemId}`);


    return { success: true, message: `${itemTypeNameForMessage} ${sanitizedItemId} deleted.` };
  } catch (error: any) {
    console.error(`Error deleting ${itemType} ${sanitizedItemId}:`, error);
    return { success: false, message: `Failed to delete ${itemType}: ${error.message}` };
  }
}

export async function addExtensionAction(localityId: string, name: string, telephone: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  try {
    const paths = await getIvoxsPaths();
    const sanitizedLocalityId = sanitizeFilenamePart(localityId);
    if (!sanitizedLocalityId) return { success: false, message: 'Invalid Locality ID.' };
    if (!name.trim()) return { success: false, message: 'Extension name cannot be empty.' };
    
    const trimmedTelephone = telephone.trim();
    if (!trimmedTelephone) return { success: false, message: 'Extension telephone cannot be empty.' };

    let charDetails = '';
    for (let i = 0; i < trimmedTelephone.length; i++) {
      charDetails += `char[${i}]: ${trimmedTelephone[i]} (code: ${trimmedTelephone.charCodeAt(i).toString(16)}) `;
    }
    const isDigitsOnly = /^\d+$/.test(trimmedTelephone);
    console.log(`[Debug AddExtension] Validating telephone. Raw: "[${telephone}]", Trimmed: "[${trimmedTelephone}]", Length: ${trimmedTelephone.length}, CharDetails: ${charDetails.trim()}`);
    console.log(`[Debug AddExtension] Result of /^\\d+$/.test(trimmedTelephone) for "[${trimmedTelephone}]" = ${isDigitsOnly}`);


    if (!isDigitsOnly) {
      // Use a slightly different message to confirm it's from server
      return { success: false, message: 'SERVER: Extension telephone must be a valid number.' };
    }

    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);

    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      // Department file doesn't exist or is invalid, create a new one
      const newDirectory: CiscoIPPhoneDirectory = {
        Title: sanitizedLocalityId, // Or a more descriptive title if available
        Prompt: 'Select an extension',
        DirectoryEntry: [{ Name: name.trim(), Telephone: trimmedTelephone }],
      };
      await buildAndWriteXML(departmentFilePath, { CiscoIPPhoneDirectory: newDirectory });
      
      // Revalidate relevant paths. Be specific to avoid over-revalidation.
      revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
      revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');
      return { success: true, message: `Extension "${name}" added to new locality "${sanitizedLocalityId}".` };
    }

    // Department file exists, add new entry
    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    // Check for duplicates
    if (directoryEntries.some(entry => entry.Name === name.trim() && entry.Telephone === trimmedTelephone)) {
      return { success: false, message: `An extension with Name "${name}" and Telephone "${trimmedTelephone}" already exists.` };
    }
    directoryEntries.push({ Name: name.trim(), Telephone: trimmedTelephone });
    // Sort entries for consistency
    directoryEntries.sort((a, b) => {
      const nameComparison = a.Name.localeCompare(b.Name);
      if (nameComparison !== 0) return nameComparison;
      return a.Telephone.localeCompare(b.Telephone); // Fallback to sort by telephone if names are same
    });
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries;
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);

    revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
    revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');

    return { success: true, message: `Extension "${name}" added to locality "${sanitizedLocalityId}".` };
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
 const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }
  try {
    const paths = await getIvoxsPaths();
    const { localityId, oldExtensionName, oldExtensionNumber, newExtensionName, newExtensionNumber } = args;

    const sanitizedLocalityId = sanitizeFilenamePart(localityId);
    if (!sanitizedLocalityId) return { success: false, message: 'Invalid Locality ID.' };
    if (!newExtensionName.trim()) return { success: false, message: 'New extension name cannot be empty.' };
    
    const trimmedNewNumber = newExtensionNumber.trim();
    if (!trimmedNewNumber) return { success: false, message: 'New extension telephone cannot be empty.' };

    let charDetails = '';
    for (let i = 0; i < trimmedNewNumber.length; i++) {
      charDetails += `char[${i}]: ${trimmedNewNumber[i]} (code: ${trimmedNewNumber.charCodeAt(i).toString(16)}) `;
    }
    const isDigitsOnly = /^\d+$/.test(trimmedNewNumber);
    console.log(`[Debug EditExtension] Validating newExtensionNumber. Raw: "[${newExtensionNumber}]", Trimmed: "[${trimmedNewNumber}]", Length: ${trimmedNewNumber.length}, CharDetails: ${charDetails.trim()}`);
    console.log(`[Debug EditExtension] Result of /^\\d+$/.test(trimmedNewNumber) for "[${trimmedNewNumber}]" = ${isDigitsOnly}`);

    if (!isDigitsOnly) {
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

    // Check if the new name/number combination already exists (excluding the current entry being edited)
    if (newExtensionName.trim() !== oldExtensionName || trimmedNewNumber !== oldExtensionNumber) {
      const conflictExists = directoryEntries.some(
        (entry, index) =>
          index !== entryIndex &&
          entry.Name === newExtensionName.trim() &&
          entry.Telephone === trimmedNewNumber
      );

      if (conflictExists) {
        return { success: false, message: `Another extension with name "${newExtensionName}" and number "${trimmedNewNumber}" already exists.` };
      }
    }


    directoryEntries[entryIndex].Name = newExtensionName.trim();
    directoryEntries[entryIndex].Telephone = trimmedNewNumber;

    // Sort entries for consistency
    directoryEntries.sort((a, b) => {
      const nameComparison = a.Name.localeCompare(b.Name);
      if (nameComparison !== 0) return nameComparison;
      return a.Telephone.localeCompare(b.Telephone);
    });

    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries;
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);

    revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
    revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');

    return { success: true, message: `Extension "${oldExtensionName}" updated to "${newExtensionName}".` };
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
    // If directoryEntries is empty after filter, assign undefined to remove the DirectoryEntry tag
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

// Action for uploading zone branch XML
export async function saveZoneBranchXmlAction(zoneFilenameBase: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }
  const paths = await getIvoxsPaths();
  if (!zoneFilenameBase) return { success: false, message: 'Zone filename is required.' };
  const sanitizedFilenameBase = sanitizeFilenamePart(zoneFilenameBase);
  if (!sanitizedFilenameBase) return { success: false, message: 'Invalid zone filename provided.' };
  const filename = `${sanitizedFilenameBase}.xml`;
  try {
    const parsedContent = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const validationResult = CiscoIPPhoneMenuSchema.safeParse(parsedContent.CiscoIPPhoneMenu);
    if (!validationResult.success) {
      return { success: false, message: `Invalid ZoneBranch XML structure for ${filename}.`, error: JSON.stringify(validationResult.error.flatten()) };
    }
    const filePath = path.join(paths.ZONE_BRANCH_DIR, filename);
    await fs.mkdir(paths.ZONE_BRANCH_DIR, { recursive: true });
    await buildAndWriteXML(filePath, { CiscoIPPhoneMenu: validationResult.data });
    revalidatePath('/'); // Revalidate homepage to pick up new zone links if MainMenu was implicitly part of this zone concept
    revalidatePath(`/${sanitizedFilenameBase}`); // Revalidate the specific zone page
    return { success: true, message: `ZoneBranch file ${filename} imported successfully.` };
  } catch (error: any) {
    // console.error(`Error saving ZoneBranch XML ${filename}:`, error);
    return { success: false, message: `Failed to save ZoneBranch file ${filename}.`, error: error.message };
  }
}

// Action for uploading department XML
export async function saveDepartmentXmlAction(departmentFilenameBase: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }
  const paths = await getIvoxsPaths();
  if (!departmentFilenameBase) return { success: false, message: 'Department filename is required.' };
  const sanitizedFilenameBase = sanitizeFilenamePart(departmentFilenameBase);
   if (!sanitizedFilenameBase) return { success: false, message: 'Invalid department filename provided.' };
  const filename = `${sanitizedFilenameBase}.xml`;
  try {
    const parsedContent = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const validationResult = CiscoIPPhoneDirectorySchema.safeParse(parsedContent.CiscoIPPhoneDirectory);
    if (!validationResult.success) {
      return { success: false, message: `Invalid Department XML structure for ${filename}.`, error: JSON.stringify(validationResult.error.flatten()) };
    }
    const filePath = path.join(paths.DEPARTMENT_DIR, filename);
    await fs.mkdir(paths.DEPARTMENT_DIR, { recursive: true });
    await buildAndWriteXML(filePath, { CiscoIPPhoneDirectory: validationResult.data });
    // Revalidate paths for locality pages that might display this department
    revalidatePath('/*/[localityId]', 'page'); // For localities under zones
    revalidatePath('/*/*/[localityId]', 'page'); // For localities under branches
    return { success: true, message: `Department file ${filename} imported successfully.` };
  } catch (error: any) {
    // console.error(`Error saving Department XML ${filename}:`, error);
    return { success: false, message: `Failed to save Department file ${filename}.`, error: error.message };
  }
}


async function processSingleXmlFileForHostUpdate(filePath: string, newHost: string, newPort: string): Promise<{ success: boolean; error?: string; filePath: string; changed: boolean }> {
  let fileChanged = false;
  try {
    // console.log(`[processSingleXmlFileForHostUpdate] Processing: ${filePath}`);
    const parsedXml = await readAndParseXML(filePath);
    if (!parsedXml) {
      // console.log(`[processSingleXmlFileForHostUpdate] Skipped (read error or empty): ${filePath}`);
      return { success: true, filePath: filePath, changed: fileChanged };
    }
    if (!parsedXml.CiscoIPPhoneMenu || !parsedXml.CiscoIPPhoneMenu.MenuItem) {
      // console.log(`[processSingleXmlFileForHostUpdate] Skipped (not Menu type or no MenuItems): ${filePath}`);
      return { success: true, filePath: filePath, changed: fileChanged };
    }

    const menuItems = ensureArray(parsedXml.CiscoIPPhoneMenu.MenuItem);
     if (!menuItems || menuItems.length === 0) {
        // console.log(`[processSingleXmlFileForHostUpdate] Skipped (no MenuItems array after ensureArray): ${filePath}`);
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
      await buildAndWriteXML(filePath, parsedXml);
      // console.log(`[processSingleXmlFileForHostUpdate] Updated URLs in: ${filePath}`);
    } else {
      // console.log(`[processSingleXmlFileForHostUpdate] No URL changes needed for: ${filePath}`);
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
      console.error(`Failed to process ${filePath}: ${result.error}`);
    }
    if (result.changed) {
        filesChangedCount++;
    }
  }

  // Revalidate all relevant paths once after all updates
  if (filesChangedCount > 0) {
    revalidatePath('/', 'layout'); // Revalidates all nested layouts and pages
  }

  try {
    const ivoxsDir = paths.IVOXS_DIR;
    const hostConfigPath = path.join(ivoxsDir, '.config.json');
    const currentConfig = { host: newHost.trim(), port: newPort.trim() };
    await fs.mkdir(ivoxsDir, { recursive: true });
    await fs.writeFile(hostConfigPath, JSON.stringify(currentConfig, null, 2));
    // console.log(`Network configuration (host/port for XML URLs) saved to ${hostConfigPath}`);
  } catch (e) {
      console.error("Could not save network configuration to .config.json within ivoxsdir", e);
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
    message: `Successfully processed ${filesProcessed} files. ${filesChangedCount} files had their URLs updated.`,
    filesProcessed,
    filesFailed,
    filesChangedCount
  };
}

export async function updateDirectoryRootPathAction(newPath: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  if (!newPath || !newPath.trim()) {
    return { success: false, message: "Directory path cannot be empty." };
  }

  // Basic check for absolute path. More robust checks might be needed depending on OS.
  const isAbsolutePath = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
  if (!isAbsolutePath(newPath.trim())) {
    return { success: false, message: "Directory path must be an absolute path." };
  }

  const trimmedPath = newPath.trim();

  try {
    // Check if the path exists and is a directory
    const stats = await fs.stat(trimmedPath);
    if (!stats.isDirectory()) {
      return { success: false, message: `The provided path "${trimmedPath}" is not a directory.` };
    }
    // Check if MainMenu.xml exists in the new path
    const pathsInfo = await getIvoxsPaths(); // This will use the *new* path if it's already saved, or default
    await fs.access(path.join(trimmedPath, pathsInfo.MAINMENU_FILENAME), fs.constants.F_OK); // Check MainMenu.xml

    await saveDirConfig({ ivoxsRootPath: trimmedPath });
    // Revalidate broader paths to ensure the application picks up the new directory root
    revalidatePath('/import-xml', 'page');
    revalidatePath('/', 'layout'); // Revalidate the entire layout to reload data from new path

    return { success: true, message: `ivoxsdir directory path updated to: ${trimmedPath}` };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       // If MainMenu.xml is not found, it's also an error.
       const pathsInfo = await getIvoxsPaths(); // Re-fetch with potentially new context
       return { success: false, message: `The provided path "${trimmedPath}" does not exist or ${pathsInfo.MAINMENU_FILENAME} was not found within it.` , error: error.message };
    }
    console.error('Error updating directory root path:', error);
    return { success: false, message: `Failed to update directory path: ${error.message}`, error: error.message };
  }
}

// Helper for search action
interface GlobalSearchResult {
  localityId: string;
  localityName: string;
  zoneId: string;
  branchId?: string;
  zoneName: string;
  branchName?: string;
  fullPath: string;
  localityNameMatch: boolean;
  matchingExtensions: MatchedExtension[];
}
interface MatchedExtension {
  name: string;
  number: string;
  matchedOn: 'extensionName' | 'extensionNumber';
}

async function processLocalityForSearch(
  zone: { id: string; name: string },
  branch: { id: string; name: string } | null,
  localityItem: { id: string; name: string },
  query: string,
  results: GlobalSearchResult[],
  processedLocalityIds: Set<string>
) {
  const lowerQuery = query.toLowerCase();
  // Dynamically import getLocalityWithExtensions to avoid circular dependency issues
  // or if data.ts also imports from actions.ts (less likely here)
  const { getLocalityWithExtensions } = await import('@/lib/data'); 

  const localityData = await getLocalityWithExtensions(localityItem.id); 

  if (!localityData) {
    // console.warn(`[GlobalSearch] Could not fetch locality data for ID: ${localityItem.id}`);
    return;
  }

  // Use the name from the fetched localityData (which reads Title from XML) if available
  const localityDisplayName = localityData.name || localityItem.name;

  if (processedLocalityIds.has(localityData.id)) {
    // Already processed this locality (e.g., if it's linked from multiple places or due to search iteration)
    return;
  }

  const localityNameMatch = localityDisplayName.toLowerCase().includes(lowerQuery);
  const matchingExtensions: MatchedExtension[] = [];

  if (localityData.extensions) {
    for (const ext of localityData.extensions) {
      let matchedOn: MatchedExtension['matchedOn'] | null = null;
      if (ext.department.toLowerCase().includes(lowerQuery)) {
        matchedOn = 'extensionName';
      } else if (ext.number.toLowerCase().includes(lowerQuery)) { // Search extension numbers
        matchedOn = 'extensionNumber';
      }
      if (matchedOn) {
        matchingExtensions.push({ name: ext.department, number: ext.number, matchedOn });
      }
    }
  }

  if (localityNameMatch || matchingExtensions.length > 0) {
    let fullPath = `/${zone.id}/localities/${localityData.id}`;
    if (branch) {
      fullPath = `/${zone.id}/branches/${branch.id}/localities/${localityData.id}`;
    }
    results.push({
      localityId: localityData.id,
      localityName: localityDisplayName,
      zoneId: zone.id,
      zoneName: zone.name,
      branchId: branch?.id,
      branchName: branch?.name,
      fullPath,
      localityNameMatch,
      matchingExtensions,
    });
    processedLocalityIds.add(localityData.id);
  }
}


export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const authenticated = await isAuthenticated();
  // No explicit authentication check here as this is a read-only operation
  // and intended for global search. If search needs protection, add the check.

  if (!query || query.trim().length < 2) { // Minimum 2 characters to trigger search
    return [];
  }

  // Dynamically import data functions to avoid potential circular dependencies
  const { getZones, getZoneItems, getBranchItems } = await import('@/lib/data');

  const results: GlobalSearchResult[] = [];
  const processedLocalityIds = new Set<string>(); // To avoid processing the same locality multiple times

  try {
    const zones = await getZones();

    for (const zone of zones) {
      const zoneItems = await getZoneItems(zone.id); // Gets branches or localities under a zone
      for (const item of zoneItems) {
        if (item.type === 'locality') {
          await processLocalityForSearch(zone, null, item, query, results, processedLocalityIds);
        } else if (item.type === 'branch') {
          // If the item is a branch, get its localities and search them
          const branchContext = { id: item.id, name: item.name };
          const branchLocalities = await getBranchItems(item.id); // Gets localities under this branch
          for (const loc of branchLocalities) {
            await processLocalityForSearch(zone, branchContext, loc, query, results, processedLocalityIds);
          }
        }
      }
    }
  } catch (error) {
    console.error("[GlobalSearchAction] Error during search:", error);
    // Optionally, return a partial result or an error indicator
  }

  // Sort results: localities with name match first, then by locality name
  results.sort((a, b) => {
    if (a.localityNameMatch && !b.localityNameMatch) return -1;
    if (!a.localityNameMatch && b.localityNameMatch) return 1;
    return a.localityName.localeCompare(b.localityName);
  });

  return results.slice(0, 20); // Limit number of results
}

// New Action: Sync Extension Names from Custom XML Feed
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
  const urls = feedUrlsString.split('\n').map(url => url.trim()).filter(url => {
    try {
      new URL(url); // Basic URL validation
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

  // Step 1: Aggregate all extensions from all feeds
  // Map: extensionNumber -> Array of { name: string, sourceFeed: string }
  const aggregatedFeedExtensions = new Map<string, Array<{ name: string; sourceFeed: string }>>();

  for (const feedUrl of urls) {
    try {
      console.log(`[Sync] Fetching feed: ${feedUrl}`);
      const response = await fetch(feedUrl, { cache: 'no-store' }); // Ensure fresh data
      if (!response.ok) {
        console.warn(`[Sync] Failed to fetch ${feedUrl}: ${response.statusText}`);
        continue; // Skip this feed if it fails
      }
      const xmlText = await response.text();
      const parsedFeed = await parseStringPromise(xmlText, { explicitArray: false, trim: true });
      const feedDirectory = parsedFeed.CiscoIPPhoneDirectory;

      if (feedDirectory && feedDirectory.DirectoryEntry) {
        const entries = ensureArray(feedDirectory.DirectoryEntry);
        for (const entry of entries) {
          if (entry.Telephone && entry.Name) {
            const trimmedTel = String(entry.Telephone).trim();
            const trimmedName = String(entry.Name).trim();
            if (trimmedTel && trimmedName) { // Ensure both are non-empty after trim
                const existingEntries = aggregatedFeedExtensions.get(trimmedTel) || [];
                existingEntries.push({ name: trimmedName, sourceFeed: feedUrl });
                aggregatedFeedExtensions.set(trimmedTel, existingEntries);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[Sync] Error processing feed ${feedUrl}:`, error);
      // Optionally, add this URL to a list of failed feeds to report back
    }
  }

  // Step 2: Identify conflicts and create a map of unique (non-conflicted) feed extensions
  const uniqueFeedExtensions = new Map<string, { name: string; sourceFeed: string }>();
  const conflictedExtensions: Array<{ number: string; conflicts: Array<{ name: string; sourceFeed: string }> }> = [];

  for (const [number, entries] of aggregatedFeedExtensions.entries()) {
    const uniqueNames = new Set(entries.map(e => e.name));
    if (uniqueNames.size > 1) {
      // Conflict: same number, different names from different feeds
      conflictedExtensions.push({ number, conflicts: entries });
    } else if (entries.length > 0) {
      // No conflict, or all names are the same for this number
      uniqueFeedExtensions.set(number, entries[0]); // Pick the first one (all names are the same)
    }
  }
  console.log(`[Sync] Total unique (non-conflicted) extensions from feeds: ${uniqueFeedExtensions.size}`);
  console.log(`[Sync] Total conflicted extensions from feeds: ${conflictedExtensions.length}`);


  // Step 3: Process local department XML files
  let updatedCount = 0;
  let filesModified = 0;
  let filesFailedToUpdate = 0;
  const localExtensionsFoundNumbers = new Set<string>(); // To track all unique extension numbers found locally

  try {
    const localDeptFiles = await fs.readdir(departmentDir);
    for (const localDeptFilename of localDeptFiles) {
      if (!localDeptFilename.endsWith('.xml') || localDeptFilename === 'MissingExtensionsFromFeed.xml') {
        continue; // Skip non-XML files and the special missing extensions file
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
        if (!localEntries) localEntries = []; // Handle case where DirectoryEntry might be missing

        for (const localEntry of localEntries) {
          if (localEntry.Telephone) {
            const trimmedLocalTel = String(localEntry.Telephone).trim();
            localExtensionsFoundNumbers.add(trimmedLocalTel); // Add to set of all local numbers

            const feedEntry = uniqueFeedExtensions.get(trimmedLocalTel); // Check against non-conflicted feed entries
            
            if (feedEntry) { // If found in non-conflicted feed entries
              const trimmedLocalName = String(localEntry.Name).trim();
              if (trimmedLocalName !== feedEntry.name) { // feedEntry.name is already trimmed
                console.log(`[Sync] Updating name for ${trimmedLocalTel} in ${localDeptFilename}: "${trimmedLocalName}" -> "${feedEntry.name}" (Source: ${feedEntry.sourceFeed})`);
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
      } catch (error: any)
       {
        console.error(`[Sync] Error processing local department file ${localDeptFilename}:`, error);
        filesFailedToUpdate++;
        // Continue to the next file even if one fails
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
      missingExtensions: [], // Cannot determine missing if local dir read fails
      error: error.message,
    };
  }
  console.log(`[Sync] Total unique extension numbers found locally: ${localExtensionsFoundNumbers.size}`);


  // Step 4: Identify extensions present in feeds but missing locally
  const missingExtensions: Array<{ number: string; name: string; sourceFeed: string }> = [];
  for (const [number, data] of uniqueFeedExtensions.entries()) {
    if (!localExtensionsFoundNumbers.has(number)) {
      missingExtensions.push({ number, name: data.name, sourceFeed: data.sourceFeed });
    }
  }
  console.log(`[Sync] Found ${missingExtensions.length} extensions in feeds that appear to be missing locally.`);


  // Step 5: Create/Update or Remove MissingExtensionsFromFeed.xml and its MainMenu entry
  const missingExtensionsFilename = "MissingExtensionsFromFeed.xml";
  const missingExtensionsFilePath = path.join(paths.DEPARTMENT_DIR, missingExtensionsFilename);
  const missingExtensionsMenuItemName = "Missing Extensions from Feed"; // Needs to be translatable later
  
  let currentHost = '127.0.0.1';
  let currentPort = '3000';
  try {
      const hostConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
      const configData = await fs.readFile(hostConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      if (config.host) currentHost = config.host;
      if (config.port) currentPort = config.port;
  } catch (e) { /* Use defaults if config.json not found or invalid */ }
  const missingExtensionsUrl = `http://${currentHost}:${currentPort}/ivoxsdir/department/${missingExtensionsFilename}`;


  if (missingExtensions.length > 0) {
    const missingExtensionsXmlContent: CiscoIPPhoneDirectory = {
      Title: "Missing Extensions from Feed", // Needs to be translatable
      Prompt: "Extensions found in feeds but not locally",
      DirectoryEntry: missingExtensions.map(ext => ({
        Name: `${ext.name} (Source: ${new URL(ext.sourceFeed).hostname})`, // Add source feed for clarity
        Telephone: ext.number,
      })),
    };
    await buildAndWriteXML(missingExtensionsFilePath, { CiscoIPPhoneDirectory: missingExtensionsXmlContent });
    console.log(`[Sync] Created/Updated ${missingExtensionsFilename} with ${missingExtensions.length} entries.`);

    // Add/Ensure entry in MainMenu.xml
    const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
    let parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      parsedMainMenu = { CiscoIPPhoneMenu: { Title: "Farmacia Carol", Prompt: "Select an option", MenuItem: [] }};
    }
    let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
    const existingMissingItemIndex = menuItems.findIndex(item => item.Name === missingExtensionsMenuItemName);
    if (existingMissingItemIndex === -1) {
      menuItems.push({ Name: missingExtensionsMenuItemName, URL: missingExtensionsUrl });
      menuItems.sort((a, b) => a.Name.localeCompare(b.Name)); // Keep sorted
      parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems;
      await buildAndWriteXML(mainMenuPath, parsedMainMenu);
      console.log(`[Sync] Added "${missingExtensionsMenuItemName}" to ${paths.MAINMENU_FILENAME}.`);
      revalidatePath('/');
    } else if (menuItems[existingMissingItemIndex].URL !== missingExtensionsUrl) {
        menuItems[existingMissingItemIndex].URL = missingExtensionsUrl; // Update URL if it changed
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems;
        await buildAndWriteXML(mainMenuPath, parsedMainMenu);
        console.log(`[Sync] Updated URL for "${missingExtensionsMenuItemName}" in ${paths.MAINMENU_FILENAME}.`);
        revalidatePath('/');
    }

  } else {
    // No missing extensions, attempt to remove the file and menu item if they exist
    try {
      await fs.unlink(missingExtensionsFilePath);
      console.log(`[Sync] Removed ${missingExtensionsFilename} as there are no missing extensions.`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') console.warn(`[Sync] Could not remove ${missingExtensionsFilename}: ${e.message}`);
    }

    const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
    let parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (parsedMainMenu && parsedMainMenu.CiscoIPPhoneMenu) {
      let menuItems = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);
      const initialLength = menuItems.length;
      menuItems = menuItems.filter(item => item.Name !== missingExtensionsMenuItemName);
      if (menuItems.length < initialLength) {
        parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined;
        await buildAndWriteXML(mainMenuPath, parsedMainMenu);
        console.log(`[Sync] Removed "${missingExtensionsMenuItemName}" from ${paths.MAINMENU_FILENAME}.`);
        revalidatePath('/');
      }
    }
  }


  // Step 6: Construct and return the summary message
  let message = `Sync complete. ${updatedCount} names updated in ${filesModified} files. `;
  message += `Found ${conflictedExtensions.length} conflicted extension numbers (not updated). `;
  if (missingExtensions.length > 0) {
    message += `Created/Updated a list of ${missingExtensions.length} extensions found in feeds but missing locally. Check the 'Missing Extensions from Feed' branch.`;
  } else {
    message += `No extensions from feeds were found to be missing locally.`;
  }


  if (filesFailedToUpdate > 0) {
    message += ` Failed to update ${filesFailedToUpdate} local files due to errors (check server logs).`;
  }


  return {
    success: filesFailedToUpdate === 0, // Overall success might depend on whether critical write errors occurred
    message,
    updatedCount,
    filesModified,
    filesFailedToUpdate,
    conflictedExtensions,
    missingExtensions,
  };
}
