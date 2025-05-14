
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, CiscoIPPhoneDirectory, MenuItem as XmlMenuItem } from '@/types/xml'; 
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data'; 

const IVOXS_DIR = path.join(process.cwd(), 'IVOXS');
const ZONE_BRANCH_DIR = path.join(IVOXS_DIR, 'ZoneBranch');
const BRANCH_DIR = path.join(IVOXS_DIR, 'Branch'); 
const DEPARTMENT_DIR = path.join(IVOXS_DIR, 'Department');
const MAINMENU_FILENAME = 'MAINMENU.xml';

// Helper to ensure an element is an array for consistent processing
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

const sanitizeFilenamePart = (filenamePart: string): string => {
  const sanitized = filenamePart.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized || `invalid_name_${Date.now()}`;
};

function generateIdFromName(name: string): string {
  const cleanedName = name.replace(/[^a-zA-Z0-9\s]/g, ''); 
  if (!cleanedName.trim()) return `UnnamedItem${Date.now()}`;
  return cleanedName
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) 
    .join('');
}

async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    return parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`File not found during action: ${filePath}`);
      return null; 
    }
    throw error; 
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
  const builder = new Builder({ headless: true, renderOpts: { pretty: true, indent: '  ', newline: '\n' } });
  let xml;
  if (jsObject.CiscoIPPhoneMenu) {
    xml = builder.buildObject({ CiscoIPPhoneMenu: jsObject.CiscoIPPhoneMenu });
  } else if (jsObject.CiscoIPPhoneDirectory) {
     xml = builder.buildObject({ CiscoIPPhoneDirectory: jsObject.CiscoIPPhoneDirectory });
  } else {
    xml = builder.buildObject(jsObject);
  }
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  await fs.mkdir(path.dirname(filePath), { recursive: true }); 
  await fs.writeFile(filePath, xmlDeclaration + xml.trim());
}

function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace('.xml', '');
}

interface AddItemArgs {
  zoneId: string;
  branchId?: string; // If adding a locality to a branch
  itemName: string;
  itemType: 'branch' | 'locality';
}
export async function addLocalityOrBranchAction(args: AddItemArgs): Promise<{ success: boolean; message: string; error?: string }> {
  const { zoneId, branchId, itemName, itemType } = args;
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const newItemId = generateIdFromName(itemName);

  // TODO: Get current host and port, perhaps from a config file or environment variables
  // For now, using the placeholder, which will be updated by updateXmlUrlsAction
  const currentHost = 'YOUR_DEVICE_IP'; 
  const currentPort = '9002';


  let parentFilePath: string;
  let childDirPath: string;
  let newChildItemUrl: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') { // Adding a branch to a ZoneBranch file
    if (branchId) return { success: false, message: "Cannot add a branch under another branch using this action."};
    parentFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childDirPath = BRANCH_DIR;
    newChildItemUrl = `http://${currentHost}:${currentPort}/ivoxsdir/branch/${newItemId}.xml`;
    itemTypeNameForMessage = "Branch";
  } else { // Adding a locality
    if (branchId) { // Adding locality to a Branch file
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (to branch)";
    } else { // Adding locality to a ZoneBranch file
      parentFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (to zone)";
    }
    childDirPath = DEPARTMENT_DIR;
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

    const newChildXmlContent = itemType === 'branch'
      ? { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a locality' } }
      : { CiscoIPPhoneDirectory: { Title: itemName, Prompt: 'Select an extension' } };
    await buildAndWriteXML(childFilePath, newChildXmlContent);

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    revalidatePath(`/ivoxsdir/${itemType === 'branch' ? 'zonebranch' : (branchId ? 'branch' : 'zonebranch')}/${path.basename(parentFilePath)}`, 'route');
    revalidatePath(`/ivoxsdir/${itemType === 'branch' ? 'branch' : 'department'}/${newItemId}.xml`, 'route');
    

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
  const { zoneId, branchId, oldItemId, newItemName, itemType } = args;
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedOldItemId = sanitizeFilenamePart(oldItemId);
  const newItemId = generateIdFromName(newItemName);
  
  const currentHost = 'YOUR_DEVICE_IP';
  const currentPort = '9002';


  let parentFilePath: string;
  let oldChildFilePath: string;
  let newChildFilePath: string;
  let newChildItemUrlSegment: string;
  let itemTypeNameForMessage: string;

  if (itemType === 'branch') {
    if (branchId) return { success: false, message: "Cannot edit a branch under another branch using this action."};
    parentFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    oldChildFilePath = path.join(BRANCH_DIR, `${sanitizedOldItemId}.xml`);
    newChildFilePath = path.join(BRANCH_DIR, `${newItemId}.xml`);
    newChildItemUrlSegment = `/branch/${newItemId}.xml`;
    itemTypeNameForMessage = "Branch";
  } else { 
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (in branch)";
    } else {
      parentFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (in zone)";
    }
    oldChildFilePath = path.join(DEPARTMENT_DIR, `${sanitizedOldItemId}.xml`);
    newChildFilePath = path.join(DEPARTMENT_DIR, `${newItemId}.xml`);
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
    
    const parsedChildXml = await readAndParseXML(newChildFilePath);
    if (parsedChildXml) {
        if (itemType === 'branch' && parsedChildXml.CiscoIPPhoneMenu) {
            parsedChildXml.CiscoIPPhoneMenu.Title = newItemName;
        } else if (itemType === 'locality' && parsedChildXml.CiscoIPPhoneDirectory) {
            parsedChildXml.CiscoIPPhoneDirectory.Title = newItemName;
        }
        await buildAndWriteXML(newChildFilePath, parsedChildXml);
    } else {
        const newChildXmlContent = itemType === 'branch'
            ? { CiscoIPPhoneMenu: { Title: newItemName, Prompt: 'Select a locality' } }
            : { CiscoIPPhoneDirectory: { Title: newItemName, Prompt: 'Select an extension' } };
        await buildAndWriteXML(newChildFilePath, newChildXmlContent);
    }

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    if (branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}`);
    if (itemType === 'locality' && branchId) revalidatePath(`/${sanitizedZoneId}/branches/${branchId}/localities/${sanitizedOldItemId}`);
    else if (itemType === 'locality') revalidatePath(`/${sanitizedZoneId}/localities/${sanitizedOldItemId}`);

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
    parentFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
    childFilePath = path.join(BRANCH_DIR, `${sanitizedItemId}.xml`);
    itemTypeNameForMessage = "Branch";
  } else { 
    if (branchId) {
      const sanitizedBranchId = sanitizeFilenamePart(branchId);
      parentFilePath = path.join(BRANCH_DIR, `${sanitizedBranchId}.xml`);
      itemTypeNameForMessage = "Locality (from branch)";
    } else {
      parentFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
      itemTypeNameForMessage = "Locality (from zone)";
    }
    childFilePath = path.join(DEPARTMENT_DIR, `${sanitizedItemId}.xml`);
  }

  try {
    const parsedParentXml = await readAndParseXML(parentFilePath);
    if (!parsedParentXml || !parsedParentXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Parent XML file ${path.basename(parentFilePath)} not found or invalid.` };
    }
    let menuItems = ensureArray(parsedParentXml.CiscoIPPhoneMenu.MenuItem);
    menuItems = menuItems.filter(item => !(item && typeof item.URL === 'string' && item.URL.includes(`/${sanitizedItemId}.xml`)));
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
  const sanitizedLocalityId = sanitizeFilenamePart(localityId);
  if (!sanitizedLocalityId) return { success: false, message: 'Invalid Locality ID.' };
  if (!name.trim()) return { success: false, message: 'Extension name cannot be empty.' };
  if (!telephone.trim()) return { success: false, message: 'Extension telephone cannot be empty.' };
  if (!/^\d+$/.test(telephone.trim())) return { success: false, message: 'Extension telephone must be a valid number.' };

  const departmentFilePath = path.join(DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);
  try {
    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      const newDirectory: CiscoIPPhoneDirectory = {
        Title: sanitizedLocalityId, 
        Prompt: 'Select an extension',
        DirectoryEntry: [{ Name: name.trim(), Telephone: telephone.trim() }],
      };
      await buildAndWriteXML(departmentFilePath, { CiscoIPPhoneDirectory: newDirectory });
      revalidatePath(`/ivoxsdir/department/${sanitizedLocalityId}.xml`, 'route');
      revalidatePath('/*/[localityId]', 'page'); 
      revalidatePath('/*/*/[localityId]', 'page'); 
      return { success: true, message: `Extension "${name}" added to new locality "${sanitizedLocalityId}".` };
    }
    
    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    if (directoryEntries.some(entry => entry.Name === name.trim() && entry.Telephone === telephone.trim())) {
      return { success: false, message: `An extension with Name "${name}" and Telephone "${telephone}" already exists.` };
    }
    directoryEntries.push({ Name: name.trim(), Telephone: telephone.trim() });
    directoryEntries.sort((a, b) => {
      const nameComparison = a.Name.localeCompare(b.Name);
      if (nameComparison !== 0) return nameComparison;
      return a.Telephone.localeCompare(b.Telephone);
    });
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries;
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);

    revalidatePath(`/ivoxsdir/department/${sanitizedLocalityId}.xml`, 'route');
    revalidatePath('/*/[localityId]', 'page'); 
    revalidatePath('/*/*/[localityId]', 'page'); 

    return { success: true, message: `Extension "${name}" added to locality "${sanitizedLocalityId}".` };
  } catch (error: any) {
    console.error(`Error adding extension to ${sanitizedLocalityId}:`, error);
    return { success: false, message: `Failed to add extension: ${error.message}`, error: error.toString() };
  }
}


export async function deleteExtensionAction(localityId: string, extensionDepartment: string, extensionNumber: string): Promise<{ success: boolean; message: string }> {
  if (!localityId || !extensionDepartment || !extensionNumber) {
    return { success: false, message: 'Locality ID, extension department, and number are required.' };
  }
  const sanitizedLocalityId = sanitizeFilenamePart(localityId);
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);
  try {
    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      return { success: false, message: `Department file ${sanitizedLocalityId}.xml not found or invalid.` };
    }
    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    directoryEntries = directoryEntries.filter(entry => !(entry.Name === extensionDepartment && entry.Telephone === extensionNumber));
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries.length > 0 ? directoryEntries : undefined;
    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);
    
    revalidatePath(`/ivoxsdir/department/${sanitizedLocalityId}.xml`, 'route');
    revalidatePath('/*/[localityId]', 'page');
    revalidatePath('/*/*/[localityId]', 'page');

    return { success: true, message: `Extension ${extensionDepartment} (${extensionNumber}) deleted from ${sanitizedLocalityId}.` };
  } catch (error: any) {
    console.error(`Error deleting extension from ${sanitizedLocalityId}:`, error);
    return { success: false, message: `Failed to delete extension: ${error.message}` };
  }
}

export async function saveMainMenuXmlAction(id: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const parsedContent = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const validationResult = CiscoIPPhoneMenuSchema.safeParse(parsedContent.CiscoIPPhoneMenu);
    if (!validationResult.success) {
      return { success: false, message: 'Invalid MainMenu XML structure.', error: JSON.stringify(validationResult.error.flatten()) };
    }
    const filePath = path.join(IVOXS_DIR, MAINMENU_FILENAME);
    await fs.mkdir(IVOXS_DIR, { recursive: true }); 
    await buildAndWriteXML(filePath, { CiscoIPPhoneMenu: validationResult.data });
    revalidatePath('/');
    revalidatePath(`/ivoxsdir/mainmenu.xml`, 'route');
    return { success: true, message: `${MAINMENU_FILENAME} imported successfully.` };
  } catch (error: any) {
    return { success: false, message: `Failed to save ${MAINMENU_FILENAME}.`, error: error.message };
  }
}

export async function saveZoneBranchXmlAction(zoneFilenameBase: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
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
    const filePath = path.join(ZONE_BRANCH_DIR, filename);
    await fs.mkdir(ZONE_BRANCH_DIR, { recursive: true });
    await buildAndWriteXML(filePath, { CiscoIPPhoneMenu: validationResult.data });
    revalidatePath('/'); 
    revalidatePath(`/${sanitizedFilenameBase}`); 
    revalidatePath(`/ivoxsdir/zonebranch/${filename}`, 'route');
    return { success: true, message: `ZoneBranch file ${filename} imported successfully.` };
  } catch (error: any) {
    return { success: false, message: `Failed to save ZoneBranch file ${filename}.`, error: error.message };
  }
}

export async function saveDepartmentXmlAction(departmentFilenameBase: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
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
    const filePath = path.join(DEPARTMENT_DIR, filename);
    await fs.mkdir(DEPARTMENT_DIR, { recursive: true });
    await buildAndWriteXML(filePath, { CiscoIPPhoneDirectory: validationResult.data });
    revalidatePath('/*/[localityId]', 'page'); 
    revalidatePath('/*/*/[localityId]', 'page');
    revalidatePath(`/ivoxsdir/department/${filename}`, 'route');
    return { success: true, message: `Department file ${filename} imported successfully.` };
  } catch (error: any) {
    return { success: false, message: `Failed to save Department file ${filename}.`, error: error.message };
  }
}

async function processSingleXmlFileForHostUpdate(filePath: string, newHost: string, newPort: string): Promise<{ success: boolean; error?: string; RfilePath: string; changed: boolean }> {
  let fileChanged = false;
  try {
    const parsedXml = await readAndParseXML(filePath);
    if (!parsedXml) {
      console.log(`[processSingleXmlFileForHostUpdate] Skipped: File ${filePath} could not be read or was empty.`);
      return { success: true, RfilePath: filePath, changed: fileChanged };
    }
    if (!parsedXml.CiscoIPPhoneMenu) {
      console.log(`[processSingleXmlFileForHostUpdate] Skipped: File ${filePath} is not a CiscoIPPhoneMenu type or has no MenuItem root.`);
      return { success: true, RfilePath: filePath, changed: fileChanged };
    }

    const menuItems = ensureArray(parsedXml.CiscoIPPhoneMenu.MenuItem);
     if (!menuItems || menuItems.length === 0) {
        console.log(`[processSingleXmlFileForHostUpdate] Skipped: File ${filePath} has no MenuItems to update.`);
        return { success: true, RfilePath: filePath, changed: fileChanged };
    }


    for (const menuItem of menuItems) {
      if (menuItem && typeof menuItem.URL === 'string') {
        try {
          const urlObj = new URL(menuItem.URL);
          let urlWasUpdated = false;
          if (urlObj.hostname !== newHost) {
            urlObj.hostname = newHost;
            urlWasUpdated = true;
          }
          if (urlObj.port !== newPort) {
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
      console.log(`[processSingleXmlFileForHostUpdate] Updated URLs in: ${filePath}`);
    } else {
      console.log(`[processSingleXmlFileForHostUpdate] No URL changes needed for: ${filePath}`);
    }
    return { success: true, RfilePath: filePath, changed: fileChanged };
  } catch (error: any) {
    console.error(`[processSingleXmlFileForHostUpdate] Error processing file ${filePath} for host update:`, error);
    return { success: false, error: error.message, RfilePath: filePath, changed: fileChanged };
  }
}


export async function updateXmlUrlsAction(newHost: string, newPort: string): Promise<{ success: boolean; message: string; error?: string; filesProcessed?: number; filesFailed?: number }> {
  if (!newHost || !newHost.trim()) {
    return { success: false, message: 'New host cannot be empty.' };
  }
  if (!newPort || !/^\d+$/.test(newPort.trim())) {
    return { success: false, message: 'New port must be a valid number.' };
  }

  let filesProcessed = 0;
  let filesFailed = 0;
  const filesToRevalidate: string[] = [];

  console.log(`[updateXmlUrlsAction] Starting update for host "${newHost}" and port "${newPort}".`);

  // Process MAINMENU.xml
  const mainMenuPath = path.join(IVOXS_DIR, MAINMENU_FILENAME);
  console.log(`[updateXmlUrlsAction] Processing ${mainMenuPath}`);
  const mainMenuResult = await processSingleXmlFileForHostUpdate(mainMenuPath, newHost.trim(), newPort.trim());
  if (mainMenuResult.success) {
    filesProcessed++;
    if (mainMenuResult.changed) {
      filesToRevalidate.push(`/ivoxsdir/${path.basename(mainMenuResult.RfilePath)}`);
    }
  } else {
    filesFailed++;
    console.error(`[updateXmlUrlsAction] Failed to update ${MAINMENU_FILENAME}: ${mainMenuResult.error}`);
  }

  // Process files in ZoneBranch and Branch directories
  const directoriesToScan = [
    { dirPath: ZONE_BRANCH_DIR, routePrefix: '/ivoxsdir/zonebranch/' },
    { dirPath: BRANCH_DIR, routePrefix: '/ivoxsdir/branch/' }
  ];

  for (const { dirPath, routePrefix } of directoriesToScan) {
    try {
      console.log(`[updateXmlUrlsAction] Scanning directory: ${dirPath}`);
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (file.endsWith('.xml')) {
          const filePath = path.join(dirPath, file);
          console.log(`[updateXmlUrlsAction] Processing ${filePath}`);
          const result = await processSingleXmlFileForHostUpdate(filePath, newHost.trim(), newPort.trim());
          if (result.success) {
            filesProcessed++;
            if (result.changed) {
               filesToRevalidate.push(`${routePrefix}${path.basename(result.RfilePath)}`);
            }
          } else {
            filesFailed++;
            console.error(`[updateXmlUrlsAction] Failed to update ${file} in ${dirPath}: ${result.error}`);
          }
        }
      }
    } catch (dirError: any) {
      console.error(`[updateXmlUrlsAction] Error reading directory ${dirPath}:`, dirError);
       // Optionally, increment filesFailed if the directory itself is inaccessible
    }
  }
  
  // Revalidate web pages
  revalidatePath('/', 'layout'); 

  // Revalidate specific API routes for XML files that were changed
  console.log(`[updateXmlUrlsAction] Revalidating ${filesToRevalidate.length} API routes.`);
  for (const routePath of filesToRevalidate) {
    try {
      revalidatePath(routePath, 'route');
      console.log(`[updateXmlUrlsAction] Revalidated API route: ${routePath}`);
    } catch (e) {
        console.warn(`[updateXmlUrlsAction] Failed to revalidate API route ${routePath}: `, e)
    }
  }

  console.log(`[updateXmlUrlsAction] Update complete. Processed: ${filesProcessed}, Failed: ${filesFailed}`);
  if (filesFailed > 0) {
    return { 
      success: false, 
      message: `XML URL update partially failed. ${filesFailed} file(s) could not be updated. Check server logs for details.`, 
      filesProcessed, 
      filesFailed 
    };
  }
  return { 
    success: true, 
    message: `XML URLs updated successfully in ${filesProcessed} processed file(s). ${filesToRevalidate.length} file(s) were modified.`, 
    filesProcessed, 
    filesFailed 
  };
}


    
