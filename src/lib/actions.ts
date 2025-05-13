
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, MenuItem, CiscoIPPhoneDirectory, DirectoryEntry } from '@/types/xml'; 
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data'; 
import { z } from 'zod';

const IVOXS_DIR = path.join(process.cwd(), 'IVOXS');
const ZONE_BRANCH_DIR = path.join(IVOXS_DIR, 'ZoneBranch');
const DEPARTMENT_DIR = path.join(IVOXS_DIR, 'Department');
const MAINMENU_FILENAME = 'MAINMENU.xml';

// Helper to ensure an element is an array for consistent processing
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

// Sanitize filename part to prevent path traversal and invalid characters
const sanitizeFilenamePart = (filenamePart: string): string => {
  // Keep alphanumeric, underscore, hyphen. Remove others.
  // Additionally, handle cases where a name might become empty after sanitization.
  const sanitized = filenamePart.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized || `invalid_name_${Date.now()}`; // Fallback for empty sanitized names
};

// Generates a file-system friendly ID from a name (PascalCase like, no spaces/special chars)
function generateLocalityIdFromName(name: string): string {
  const cleanedName = name.replace(/[^a-zA-Z0-9\s]/g, ''); // Remove special chars, keep spaces for now
  if (!cleanedName.trim()) return `UnnamedLocality${Date.now()}`;
  return cleanedName
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // PascalCase each word
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
  // CiscoIPPhoneMenu and CiscoIPPhoneDirectory are root elements
  let xml;
  if (jsObject.CiscoIPPhoneMenu) {
    xml = builder.buildObject({ CiscoIPPhoneMenu: jsObject.CiscoIPPhoneMenu });
  } else if (jsObject.CiscoIPPhoneDirectory) {
     xml = builder.buildObject({ CiscoIPPhoneDirectory: jsObject.CiscoIPPhoneDirectory });
  } else {
    // Fallback for other structures, or throw error
    xml = builder.buildObject(jsObject);
  }
  // Add XML declaration if it's not there (Builder with headless:true might omit it)
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  await fs.mkdir(path.dirname(filePath), { recursive: true }); 
  await fs.writeFile(filePath, xmlDeclaration + xml.trim());
}


export async function addLocalityAction(zoneId: string, newLocalityName: string): Promise<{ success: boolean; message: string; error?: string }> {
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const newLocalityId = generateLocalityIdFromName(newLocalityName);
  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${newLocalityId}.xml`);

  // Construct the URL based on existing patterns or a fixed base.
  // For now, assuming the base URL structure is consistent.
  // This part needs to be robust. Let's try to infer from an existing URL or use a default.
  // A safer approach is to ensure all URLs in MAINMENU.xml/ZoneBranch.xml are relative or use a configurable base.
  // For now, we'll hardcode the structure for new entries.
  const newLocalityUrl = `http://YOUR_DEVICE_IP:9002/ivoxsdir/department/${newLocalityId}.xml`;


  try {
    // 1. Update Zone Branch XML
    const parsedZoneXml = await readAndParseXML(zoneFilePath);
    if (!parsedZoneXml || !parsedZoneXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Zone file ${sanitizedZoneId}.xml not found or invalid.` };
    }

    let menuItems = ensureArray(parsedZoneXml.CiscoIPPhoneMenu.MenuItem);
    
    // Check if locality with this ID or name already exists
    if (menuItems.some(item => extractIdFromUrl(item.URL) === newLocalityId || item.Name === newLocalityName)) {
        return { success: false, message: `A locality with name "${newLocalityName}" or ID "${newLocalityId}" already exists in this zone.` };
    }

    menuItems.push({
      Name: newLocalityName,
      URL: newLocalityUrl,
    });
    // Sort menu items by name for consistency
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
    parsedZoneXml.CiscoIPPhoneMenu.MenuItem = menuItems;
    await buildAndWriteXML(zoneFilePath, parsedZoneXml);

    // 2. Create new Department XML
    const newDepartmentXmlContent = {
      CiscoIPPhoneDirectory: {
        Title: newLocalityName,
        Prompt: 'Select an extension',
        // DirectoryEntry: [] // No entries initially, or undefined
      },
    };
    await buildAndWriteXML(departmentFilePath, newDepartmentXmlContent);

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    revalidatePath(`/ivoxsdir/zonebranch/${sanitizedZoneId}.xml`, 'route');
    revalidatePath(`/ivoxsdir/department/${newLocalityId}.xml`, 'route');

    return { success: true, message: `Locality "${newLocalityName}" added to zone "${zoneId}" and department file created.` };
  } catch (error: any) {
    console.error(`Error adding locality "${newLocalityName}" to ${zoneId}:`, error);
    return { success: false, message: `Failed to add locality: ${error.message}`, error: error.message };
  }
}

function extractIdFromUrl(url: string): string {
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace('.xml', '');
}

export async function editLocalityAction(zoneId: string, oldLocalityId: string, newLocalityName: string): Promise<{ success: boolean; message: string; error?: string }> {
  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedOldLocalityId = sanitizeFilenamePart(oldLocalityId);
  const newLocalityId = generateLocalityIdFromName(newLocalityName);

  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
  const oldDepartmentFilePath = path.join(DEPARTMENT_DIR, `${sanitizedOldLocalityId}.xml`);
  const newDepartmentFilePath = path.join(DEPARTMENT_DIR, `${newLocalityId}.xml`);
  
  // Reconstruct URL carefully
  const newLocalityUrl = `http://YOUR_DEVICE_IP:9002/ivoxsdir/department/${newLocalityId}.xml`;


  try {
    // 1. Update Zone Branch XML
    const parsedZoneXml = await readAndParseXML(zoneFilePath);
    if (!parsedZoneXml || !parsedZoneXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Zone file ${sanitizedZoneId}.xml not found or invalid.` };
    }

    let menuItems = ensureArray(parsedZoneXml.CiscoIPPhoneMenu.MenuItem);
    const localityIndex = menuItems.findIndex(item => extractIdFromUrl(item.URL) === sanitizedOldLocalityId);

    if (localityIndex === -1) {
      return { success: false, message: `Locality with ID "${sanitizedOldLocalityId}" not found in zone "${sanitizedZoneId}".` };
    }
    
    // Check if new name/ID conflicts with another existing locality (excluding the one being edited)
    if (menuItems.some((item, index) => index !== localityIndex && (extractIdFromUrl(item.URL) === newLocalityId || item.Name === newLocalityName))) {
        return { success: false, message: `Another locality with name "${newLocalityName}" or ID "${newLocalityId}" already exists in this zone.` };
    }

    menuItems[localityIndex].Name = newLocalityName;
    if (newLocalityId !== sanitizedOldLocalityId) {
      menuItems[localityIndex].URL = newLocalityUrl;
    }
    // Sort menu items by name for consistency
    menuItems.sort((a, b) => a.Name.localeCompare(b.Name));
    parsedZoneXml.CiscoIPPhoneMenu.MenuItem = menuItems;
    await buildAndWriteXML(zoneFilePath, parsedZoneXml);

    // 2. Update Department XML (rename if ID changed, update Title)
    if (newLocalityId !== sanitizedOldLocalityId) {
      try {
        await fs.rename(oldDepartmentFilePath, newDepartmentFilePath);
      } catch (renameError: any) {
        if (renameError.code === 'ENOENT') {
             // If old file didn't exist, create a new one
            const newDepartmentXmlContent = {
                CiscoIPPhoneDirectory: {
                    Title: newLocalityName,
                    Prompt: 'Select an extension',
                },
            };
            await buildAndWriteXML(newDepartmentFilePath, newDepartmentXmlContent);
            console.warn(`Old department file ${oldDepartmentFilePath} not found. Created ${newDepartmentFilePath}.`);
        } else {
            throw renameError; // Re-throw other rename errors
        }
      }
    }

    // Always try to read the (potentially new) department file to update its title
    const parsedDepartmentXml = await readAndParseXML(newDepartmentFilePath);
    if (parsedDepartmentXml && parsedDepartmentXml.CiscoIPPhoneDirectory) {
      parsedDepartmentXml.CiscoIPPhoneDirectory.Title = newLocalityName;
      await buildAndWriteXML(newDepartmentFilePath, parsedDepartmentXml);
    } else {
        // If file doesn't exist even after potential rename (e.g. original didn't exist and rename failed silently)
        // or is invalid, create/overwrite it with the new title.
        console.warn(`Department file ${newDepartmentFilePath} not found or invalid after edit. Recreating.`);
        const newDepartmentXmlContent = {
            CiscoIPPhoneDirectory: {
                Title: newLocalityName,
                Prompt: 'Select an extension',
            },
        };
        await buildAndWriteXML(newDepartmentFilePath, newDepartmentXmlContent);
    }


    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    revalidatePath(`/ivoxsdir/zonebranch/${sanitizedZoneId}.xml`, 'route');
    revalidatePath(`/ivoxsdir/department/${sanitizedOldLocalityId}.xml`, 'route'); // Old path
    if (newLocalityId !== sanitizedOldLocalityId) {
      revalidatePath(`/ivoxsdir/department/${newLocalityId}.xml`, 'route'); // New path
    }
    

    return { success: true, message: `Locality "${sanitizedOldLocalityId}" updated to "${newLocalityName}".` };
  } catch (error: any) {
    console.error(`Error editing locality ${sanitizedOldLocalityId}:`, error);
    return { success: false, message: `Failed to edit locality: ${error.message}`, error: error.message };
  }
}


export async function deleteLocalityAction(zoneId: string, localityId: string): Promise<{ success: boolean; message: string }> {
  if (!zoneId || !localityId) {
    return { success: false, message: 'Zone ID and Locality ID are required.' };
  }

  const sanitizedZoneId = sanitizeFilenamePart(zoneId);
  const sanitizedLocalityId = sanitizeFilenamePart(localityId);
  
  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${sanitizedZoneId}.xml`);
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${sanitizedLocalityId}.xml`);

  try {
    const parsedZoneXml = await readAndParseXML(zoneFilePath);
    if (!parsedZoneXml || !parsedZoneXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Zone file ${sanitizedZoneId}.xml not found or invalid.` };
    }

    let menuItems = ensureArray(parsedZoneXml.CiscoIPPhoneMenu.MenuItem);
    
    const initialLength = menuItems.length;
    menuItems = menuItems.filter(item => {
        if (item && typeof item.URL === 'string') {
            return !item.URL.endsWith(`/${sanitizedLocalityId}.xml`);
        }
        return true;
    });

    parsedZoneXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined; 

    await buildAndWriteXML(zoneFilePath, parsedZoneXml);

    try {
      await fs.unlink(departmentFilePath);
    } catch (unlinkError: any) {
      if (unlinkError.code !== 'ENOENT') {
        console.warn(`Could not delete department file ${departmentFilePath}: ${unlinkError.message}`);
      }
    }

    revalidatePath('/');
    revalidatePath(`/${sanitizedZoneId}`);
    revalidatePath(`/ivoxsdir/zonebranch/${sanitizedZoneId}.xml`, 'route');
    revalidatePath(`/ivoxsdir/department/${sanitizedLocalityId}.xml`, 'route');


    return { success: true, message: `Locality ${sanitizedLocalityId} deleted from ${sanitizedZoneId}.` };

  } catch (error: any) {
    console.error(`Error deleting locality ${sanitizedLocalityId} from ${sanitizedZoneId}:`, error);
    return { success: false, message: `Failed to delete locality: ${error.message}` };
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
    
    directoryEntries = directoryEntries.filter(entry => {
        return !(entry.Name === extensionDepartment && entry.Telephone === extensionNumber);
    });
    
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries.length > 0 ? directoryEntries : undefined;

    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);
    
    revalidatePath('/[zoneId]/[localityId]', 'page'); 
    revalidatePath(`/ivoxsdir/department/${sanitizedLocalityId}.xml`, 'route');

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
      console.error("MainMenu XML validation error:", validationResult.error.flatten());
      return { success: false, message: 'Invalid MainMenu XML structure.', error: JSON.stringify(validationResult.error.flatten()) };
    }
    
    const filePath = path.join(IVOXS_DIR, MAINMENU_FILENAME);
    await fs.mkdir(IVOXS_DIR, { recursive: true }); 
    await buildAndWriteXML(filePath, { CiscoIPPhoneMenu: validationResult.data }); // Use validated data

    revalidatePath('/');
    revalidatePath(`/ivoxsdir/mainmenu.xml`, 'route');
    return { success: true, message: `${MAINMENU_FILENAME} imported successfully.` };
  } catch (error: any) {
    console.error(`Error saving ${MAINMENU_FILENAME}:`, error);
    return { success: false, message: `Failed to save ${MAINMENU_FILENAME}.`, error: error.message };
  }
}

export async function saveZoneBranchXmlAction(zoneFilenameBase: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!zoneFilenameBase) {
    return { success: false, message: 'Zone filename is required.' };
  }
  const sanitizedFilenameBase = sanitizeFilenamePart(zoneFilenameBase);
  if (!sanitizedFilenameBase) {
     return { success: false, message: 'Invalid zone filename provided.' };
  }
  const filename = `${sanitizedFilenameBase}.xml`;

  try {
    const parsedContent = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const validationResult = CiscoIPPhoneMenuSchema.safeParse(parsedContent.CiscoIPPhoneMenu);

    if (!validationResult.success) {
      console.error(`ZoneBranch XML (${filename}) validation error:`, validationResult.error.flatten());
      return { success: false, message: `Invalid ZoneBranch XML structure for ${filename}.`, error: JSON.stringify(validationResult.error.flatten()) };
    }

    const filePath = path.join(ZONE_BRANCH_DIR, filename);
    await fs.mkdir(ZONE_BRANCH_DIR, { recursive: true });
    await buildAndWriteXML(filePath, { CiscoIPPhoneMenu: validationResult.data }); // Use validated data

    revalidatePath('/'); 
    revalidatePath(`/${sanitizedFilenameBase}`); 
    revalidatePath(`/ivoxsdir/zonebranch/${filename}`, 'route');
    return { success: true, message: `ZoneBranch file ${filename} imported successfully.` };
  } catch (error: any) {
    console.error(`Error saving ZoneBranch file ${filename}:`, error);
    return { success: false, message: `Failed to save ZoneBranch file ${filename}.`, error: error.message };
  }
}

export async function saveDepartmentXmlAction(departmentFilenameBase: string | null, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!departmentFilenameBase) {
    return { success: false, message: 'Department filename is required.' };
  }
  const sanitizedFilenameBase = sanitizeFilenamePart(departmentFilenameBase);
   if (!sanitizedFilenameBase) {
     return { success: false, message: 'Invalid department filename provided.' };
  }
  const filename = `${sanitizedFilenameBase}.xml`;

  try {
    const parsedContent = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const validationResult = CiscoIPPhoneDirectorySchema.safeParse(parsedContent.CiscoIPPhoneDirectory);

    if (!validationResult.success) {
      console.error(`Department XML (${filename}) validation error:`, validationResult.error.flatten());
      return { success: false, message: `Invalid Department XML structure for ${filename}.`, error: JSON.stringify(validationResult.error.flatten()) };
    }

    const filePath = path.join(DEPARTMENT_DIR, filename);
    await fs.mkdir(DEPARTMENT_DIR, { recursive: true });
    await buildAndWriteXML(filePath, { CiscoIPPhoneDirectory: validationResult.data }); // Use validated data

    revalidatePath('/[zoneId]/[localityId]', 'page'); 
    revalidatePath(`/ivoxsdir/department/${filename}`, 'route');
    return { success: true, message: `Department file ${filename} imported successfully.` };
  } catch (error: any) {
    console.error(`Error saving Department file ${filename}:`, error);
    return { success: false, message: `Failed to save Department file ${filename}.`, error: error.message };
  }
}

