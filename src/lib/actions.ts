
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, MenuItem, CiscoIPPhoneDirectory, DirectoryEntry } from '@/types/xml'; 
// Assuming CiscoIPPhoneMenuSchema and CiscoIPPhoneDirectorySchema are available
// For now, let's import them from data.ts, consider moving them to a dedicated schema file if widely used.
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data'; // Adjust path as needed
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
  return filenamePart.replace(/[^a-zA-Z0-9_-]/g, '');
};

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
  const builder = new Builder();
  const xml = builder.buildObject(jsObject);
  await fs.mkdir(path.dirname(filePath), { recursive: true }); // Ensure directory exists
  await fs.writeFile(filePath, xml.trim());
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
            // URL might be http://YOUR_DEVICE_IP:PORT/ivoxsdir/department/LocalityId.xml
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
    
    // Revalidate the specific locality page and its API route
    revalidatePath('/[zoneId]/[localityId]', 'page'); // This revalidates layout, affects all such pages
    revalidatePath(`/ivoxsdir/department/${sanitizedLocalityId}.xml`, 'route');

    return { success: true, message: `Extension ${extensionDepartment} (${extensionNumber}) deleted from ${sanitizedLocalityId}.` };

  } catch (error: any) {
    console.error(`Error deleting extension from ${sanitizedLocalityId}:`, error);
    return { success: false, message: `Failed to delete extension: ${error.message}` };
  }
}

// --- New XML Import Actions ---

export async function saveMainMenuXmlAction(xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const parsedContent = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const validationResult = CiscoIPPhoneMenuSchema.safeParse(parsedContent.CiscoIPPhoneMenu);

    if (!validationResult.success) {
      console.error("MainMenu XML validation error:", validationResult.error.flatten());
      return { success: false, message: 'Invalid MainMenu XML structure.', error: JSON.stringify(validationResult.error.flatten()) };
    }
    
    const filePath = path.join(IVOXS_DIR, MAINMENU_FILENAME);
    await fs.mkdir(IVOXS_DIR, { recursive: true }); // Ensure base IVOXS directory exists
    await fs.writeFile(filePath, xmlContent.trim());

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
    await fs.writeFile(filePath, xmlContent.trim());

    revalidatePath('/'); // Revalidate homepage as it lists zones
    revalidatePath(`/${sanitizedFilenameBase}`); // Revalidate specific zone page
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
    await fs.writeFile(filePath, xmlContent.trim());

    revalidatePath('/[zoneId]/[localityId]', 'page'); // Revalidate all locality pages
    revalidatePath(`/ivoxsdir/department/${filename}`, 'route');
    return { success: true, message: `Department file ${filename} imported successfully.` };
  } catch (error: any) {
    console.error(`Error saving Department file ${filename}:`, error);
    return { success: false, message: `Failed to save Department file ${filename}.`, error: error.message };
  }
}
