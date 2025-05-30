
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, CiscoIPPhoneDirectory, MenuItem as XmlMenuItem, DirectoryEntry } from '@/types/xml';
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
  const sanitized = filenamePart.replace(/[^a-zA-Z0-9_.-]/g, '');
  return sanitized || `invalid_name_${Date.now()}`;
};


function generateIdFromName(name: string): string {
  const cleanedName = name.replace(/[^a-zA-Z0-9\\s_.-]/g, '');
  if (!cleanedName.trim()) return `UnnamedItem${Date.now()}`;
  return cleanedName
    .replace(/\\s+/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/-{2,}/g, '-');
}


async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    return parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // console.warn(`File not found during action: ${filePath}`); // Reduced verbosity
      return null;
    }
    throw error;
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
  const builder = new Builder({
    renderOpts: { pretty: true, indent: '  ', newline: '\n' } 
  });

  let xmlContentBuiltByBuilder;
  xmlContentBuiltByBuilder = builder.buildObject(jsObject);

  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  const finalXmlString = xmlDeclaration + xmlContentBuiltByBuilder.trim();

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
    const mainMenuDir = path.dirname(mainMenuPath);
    const hostConfigPath = path.join(mainMenuDir, '.config.json'); 
    try {
        const configData = await fs.readFile(hostConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.host) currentHost = config.host;
        if (config.port) currentPort = config.port;
    } catch (e) {
        // console.warn("Could not read .config.json for host/port from ivoxsdir, using default host/port for new zone URL.");
    }
  } catch (e) { /* ignore error if .config.json cannot be read */ }

  const newZoneUrl = `http://${currentHost}:${currentPort}/ivoxsdir/zonebranch/${newZoneId}.xml`;

  try {
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      const newMainMenuContent = {
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
      parsedMainMenu.CiscoIPPhoneMenu.MenuItem = menuItems;
      await buildAndWriteXML(mainMenuPath, parsedMainMenu);
    }

    const newZoneBranchContent = {
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
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems;
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
    if (branchId) return { success: false, message: "Cannot edit a branch under another branch using this action."};
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
    parsedParentXml.CiscoIPPhoneMenu.MenuItem = menuItems;
    await buildAndWriteXML(parentFilePath, parsedParentXml);

    if (newItemId !== sanitizedOldItemId) {
      try {
        await fs.rename(oldChildFilePath, newChildFilePath);
      } catch (renameError: any) {
        if (renameError.code === 'ENOENT') {
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
        revalidatePath(`/${sanitizedZoneId}/branches/${branchId}/localities/${newItemId}`);
    } else if (itemType === 'locality') {
        revalidatePath(`/${sanitizedZoneId}/localities/${sanitizedOldItemId}`);
        revalidatePath(`/${sanitizedZoneId}/localities/${newItemId}`);
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
      return { success: false, message: 'SERVER: Extension telephone must be a valid number.' };
    }

    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);

    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      const newDirectory: CiscoIPPhoneDirectory = {
        Title: sanitizedLocalityId, 
        Prompt: 'Select an extension',
        DirectoryEntry: [{ Name: name.trim(), Telephone: trimmedTelephone }],
      };
      await buildAndWriteXML(departmentFilePath, { CiscoIPPhoneDirectory: newDirectory });
      
      revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
      revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');
      return { success: true, message: `Extension "${name}" added to new locality "${sanitizedLocalityId}".` };
    }

    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    if (directoryEntries.some(entry => entry.Name === name.trim() && entry.Telephone === trimmedTelephone)) {
      return { success: false, message: `An extension with Name "${name}" and Telephone "${trimmedTelephone}" already exists.` };
    }
    directoryEntries.push({ Name: name.trim(), Telephone: trimmedTelephone });
    directoryEntries.sort((a, b) => {
      const nameComparison = a.Name.localeCompare(b.Name);
      if (nameComparison !== 0) return nameComparison;
      return a.Telephone.localeCompare(b.Telephone);
    });
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries;
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);

    revalidatePath(`/app/[zoneId]/localities/${localityId}`, 'page');
    revalidatePath(`/app/[zoneId]/branches/[branchId]/localities/${localityId}`, 'page');

    return { success: true, message: `Extension "${name}" added to locality "${sanitizedLocalityId}".` };
  } catch (error: any) {
    console.error(`[AddExtensionAction Error] Failed to add extension to ${localityId}:`, error);
    return { success: false, message: `An unexpected error occurred while adding the extension. ${error.message}`, error: error.toString() };
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
    if (!newExtensionName.trim()) return { success: false, message: 'New extension name cannot be empty.' };
    
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
    return { success: false, message: `An unexpected error occurred while editing the extension. ${error.message}`, error: error.toString() };
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
    revalidatePath('/');
    revalidatePath(`/${sanitizedFilenameBase}`);
    return { success: true, message: `ZoneBranch file ${filename} imported successfully.` };
  } catch (error: any) {
    return { success: false, message: `Failed to save ZoneBranch file ${filename}.`, error: error.message };
  }
}

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
    revalidatePath('/*/[localityId]', 'page'); 
    revalidatePath('/*/*/[localityId]', 'page'); 
    return { success: true, message: `Department file ${filename} imported successfully.` };
  } catch (error: any) {
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
           // console.warn(`[processSingleXmlFileForHostUpdate] Skipped malformed URL "${menuItem.URL}" in ${filePath}: ${urlError}`);
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
  if (newPort.trim() && !/^\\d+$/.test(newPort.trim())) {
    return { success: false, message: "Port must be a valid number." };
  }

  let filesProcessed = 0;
  let filesFailed = 0;
  let filesChangedCount = 0;

  const allFilesToProcess: string[] = [];
  const mainMenuPath = path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME);
  try {
    await fs.access(mainMenuPath); 
    allFilesToProcess.push(mainMenuPath);
  } catch (e) {
    // console.warn(`MainMenu.xml not found at ${mainMenuPath}, skipping URL update for it.`);
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
      console.error(`Failed to process ${filePath}: ${result.error}`);
    }
    if (result.changed) { 
        filesChangedCount++;
    }
  }

  revalidatePath('/', 'layout'); 

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
        message: `Processed ${filesProcessed} files. ${filesChangedCount} files updated. ${filesFailed} files failed to update. Check server logs for details.`,
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

    return { success: true, message: `ivoxsdir directory path updated to: ${trimmedPath}` };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       const pathsInfo = await getIvoxsPaths(); 
       return { success: false, message: `The provided path "${trimmedPath}" does not exist or ${pathsInfo.MAINMENU_FILENAME} was not found within it.` , error: error.message };
    }
    console.error('Error updating directory root path:', error);
    return { success: false, message: `Failed to update directory path: ${error.message}`, error: error.message };
  }
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
  const { getLocalityWithExtensions } = await import('@/lib/data'); 

  const localityData = await getLocalityWithExtensions(localityItem.id); 

  if (!localityData) {
    return;
  }

  const localityDisplayName = localityData.name || localityItem.name; 

  if (processedLocalityIds.has(localityData.id)) {
    return;
  }

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
  if (!authenticated) {
    // Allow search for guest users
  }

  if (!query || query.trim().length < 2) {
    return [];
  }

  const { getZones, getZoneItems, getBranchItems } = await import('@/lib/data');


  const results: GlobalSearchResult[] = [];
  const processedLocalityIds = new Set<string>(); 

  try {
    const zones = await getZones();

    for (const zone of zones) {
      const zoneItems = await getZoneItems(zone.id); 
      for (const item of zoneItems) {
        if (item.type === 'locality') {
          await processLocalityForSearch(zone, null, item, query, results, processedLocalityIds);
        } else if (item.type === 'branch') {
          const branchContext = { id: item.id, name: item.name };
          const branchLocalities = await getBranchItems(item.id); 
          for (const loc of branchLocalities) {
            await processLocalityForSearch(zone, branchContext, loc, query, results, processedLocalityIds);
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
    return a.localityName.localeCompare(b.localityName);
  });

  return results.slice(0, 20); 
}


interface FeedExtensionInfo {
  name: string;
  sourceFeed: string;
}
interface ConflictedExtensionInfo {
  number: string;
  conflicts: FeedExtensionInfo[];
}
interface MissingExtensionInfo {
  number: string;
  name: string;
  sourceFeed: string;
}
export interface SyncResult {
  success: boolean;
  message: string;
  error?: string;
  updatedCount?: number;
  filesModified?: number;
  conflictedExtensions?: ConflictedExtensionInfo[];
  missingExtensions?: MissingExtensionInfo[];
}


export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { success: false, message: 'Authentication required.', error: 'User not authenticated' };
  }

  if (!feedUrlsString || !feedUrlsString.trim()) {
    return { success: false, message: 'At least one XML Feed URL is required.' };
  }

  const urls = feedUrlsString.split('\n').map(url => url.trim()).filter(url => url.length > 0);
  if (urls.length === 0) {
    return { success: false, message: 'No valid XML Feed URLs provided.' };
  }

  let updatedCount = 0;
  let filesProcessed = 0;
  let filesModified = 0;
  const conflictedExtensionsList: ConflictedExtensionInfo[] = [];
  const missingExtensionsList: MissingExtensionInfo[] = [];
  
  // Step 1: Aggregate data from all feeds and detect conflicts
  const feedExtensionOccurrences: Map<string, FeedExtensionInfo[]> = new Map();

  for (const feedUrl of urls) {
    try {
      new URL(feedUrl); // Validate URL format
    } catch (e) {
      console.warn(`[Sync] Invalid URL format, skipping: ${feedUrl}`);
      continue; // Skip this invalid URL
    }

    try {
      console.log(`[Sync] Fetching XML feed from: ${feedUrl}`);
      const response = await fetch(feedUrl, { cache: 'no-store' });
      if (!response.ok) {
        console.warn(`[Sync] Failed to fetch XML feed from ${feedUrl}. Status: ${response.status}`);
        continue; // Skip this feed
      }
      const feedXmlText = await response.text();
      const parsedFeedXml = await parseStringPromise(feedXmlText, { explicitArray: false, trim: true });
      
      const feedValidationResult = CiscoIPPhoneDirectorySchema.safeParse(parsedFeedXml.CiscoIPPhoneDirectory);
      if (!feedValidationResult.success) {
        console.warn(`[Sync] Invalid XML structure from feed ${feedUrl}:`, JSON.stringify(feedValidationResult.error.flatten(), null, 2));
        continue; // Skip this feed
      }
      const feedEntries = ensureArray(feedValidationResult.data.DirectoryEntry);
      for (const entry of feedEntries) {
        if (entry.Telephone && entry.Name) {
          const occurrences = feedExtensionOccurrences.get(entry.Telephone) || [];
          occurrences.push({ name: entry.Name, sourceFeed: feedUrl });
          feedExtensionOccurrences.set(entry.Telephone, occurrences);
        }
      }
    } catch (error: any) {
      console.error(`[Sync] Error processing feed ${feedUrl}:`, error.message);
      // Optionally, accumulate these errors to report back
    }
  }

  // Step 2: Consolidate feed data, identify non-conflicted entries
  const consolidatedFeedMap: Map<string, { name: string, sourceFeed: string }> = new Map();
  feedExtensionOccurrences.forEach((occurrences, number) => {
    const uniqueNames = new Set(occurrences.map(occ => occ.name));
    if (uniqueNames.size === 1) { // All names are the same, or only one occurrence
      consolidatedFeedMap.set(number, occurrences[0]); // Use the first one (name and sourceFeed are consistent)
    } else { // Conflict: multiple different names for the same number
      conflictedExtensionsList.push({ number, conflicts: occurrences });
    }
  });

  // Step 3: Iterate through local department XMLs and update names
  const paths = await getIvoxsPaths();
  const allLocalExtensionNumbersProcessed: Set<string> = new Set();

  try {
    const departmentFiles = await fs.readdir(paths.DEPARTMENT_DIR);
    for (const deptFilename of departmentFiles) {
      if (!deptFilename.endsWith('.xml')) continue;
      filesProcessed++;
      const deptFilePath = path.join(paths.DEPARTMENT_DIR, deptFilename);
      let localFileModified = false;

      try {
        const localParsedXml = await readAndParseXML(deptFilePath);
        if (!localParsedXml || !localParsedXml.CiscoIPPhoneDirectory) {
          console.warn(`[Sync] Skipping invalid or empty local department file: ${deptFilename}`);
          continue;
        }
        
        const localValidation = CiscoIPPhoneDirectorySchema.safeParse(localParsedXml.CiscoIPPhoneDirectory);
        if (!localValidation.success) {
            console.warn(`[Sync] Skipping local department file with invalid structure: ${deptFilename}`);
            continue;
        }

        let localEntries = ensureArray(localValidation.data.DirectoryEntry);
        if (!localEntries) localEntries = [];

        for (const localEntry of localEntries) {
          if (localEntry.Telephone) {
            allLocalExtensionNumbersProcessed.add(localEntry.Telephone); // Track all local numbers
            const feedData = consolidatedFeedMap.get(localEntry.Telephone); // Check against non-conflicted feed data
            if (feedData && localEntry.Name !== feedData.name) {
              // console.log(`[Sync] Updating name for extension ${localEntry.Telephone} in ${deptFilename}: "${localEntry.Name}" -> "${feedData.name}" (from ${feedData.sourceFeed})`);
              localEntry.Name = feedData.name;
              updatedCount++;
              localFileModified = true;
            }
          }
        }

        if (localFileModified) {
          const dataToWrite = { 
            CiscoIPPhoneDirectory: {
              ...localValidation.data, 
              DirectoryEntry: localEntries.length > 0 ? localEntries : undefined 
            }
          };
          await buildAndWriteXML(deptFilePath, dataToWrite);
          filesModified++;
        }
      } catch (fileError: any) {
        console.error(`[Sync] Error processing local department file ${deptFilename}:`, fileError);
      }
    }
  } catch (dirError: any) {
     if (dirError.code === 'ENOENT') {
        console.warn(`[Sync] Department directory not found at ${paths.DEPARTMENT_DIR}. No local files processed.`);
     } else {
        console.error(`[Sync] Error reading department directory ${paths.DEPARTMENT_DIR}:`, dirError);
        return { success: false, message: `Error reading department directory: ${dirError.message}`, error: dirError.message };
     }
  }
  
  // Step 4: Identify missing extensions (exist in non-conflicted feed data but not locally)
  consolidatedFeedMap.forEach((feedInfo, number) => {
    if (!allLocalExtensionNumbersProcessed.has(number)) {
      missingExtensionsList.push({ number, name: feedInfo.name, sourceFeed: feedInfo.sourceFeed });
    }
  });

  revalidatePath('/', 'layout');
  let summaryMessage = `Sync complete. ${updatedCount} names updated in ${filesModified} files.`;
  if (conflictedExtensionsList.length > 0) {
    summaryMessage += ` Found ${conflictedExtensionsList.length} extensions with conflicting names from different feeds.`;
  }
  if (missingExtensionsList.length > 0) {
    summaryMessage += ` Found ${missingExtensionsList.length} extensions in feeds that are missing locally.`;
  }

  return { 
    success: true, 
    message: summaryMessage,
    updatedCount,
    filesModified,
    conflictedExtensions: conflictedExtensionsList,
    missingExtensions: missingExtensionsList
  };
}

