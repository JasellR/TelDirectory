
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, MenuItem, CiscoIPPhoneDirectory, DirectoryEntry } from '@/types/xml'; // Assuming these types exist or are defined

const IVOXS_DIR = path.join(process.cwd(), 'IVOXS');
const ZONE_BRANCH_DIR = path.join(IVOXS_DIR, 'ZoneBranch');
const DEPARTMENT_DIR = path.join(IVOXS_DIR, 'Department');

// Helper to ensure an element is an array for consistent processing
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    // Preserve explicitArray: false as used in data.ts for consistency if it was intentional.
    // However, for modification, explicitArray: true might be safer, then handle single item arrays.
    // For this, we'll assume the structure as potentially read by data.ts.
    return parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`File not found during action: ${filePath}`);
      return null; // Indicate file not found to the action
    }
    throw error; // Re-throw other errors
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
  const builder = new Builder();
  const xml = builder.buildObject(jsObject);
  await fs.writeFile(filePath, xml);
}

export async function deleteLocalityAction(zoneId: string, localityId: string): Promise<{ success: boolean; message: string }> {
  if (!zoneId || !localityId) {
    return { success: false, message: 'Zone ID and Locality ID are required.' };
  }

  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);

  try {
    const parsedZoneXml = await readAndParseXML(zoneFilePath);
    if (!parsedZoneXml || !parsedZoneXml.CiscoIPPhoneMenu) {
      return { success: false, message: `Zone file ${zoneId}.xml not found or invalid.` };
    }

    let menuItems = ensureArray(parsedZoneXml.CiscoIPPhoneMenu.MenuItem);
    
    const initialLength = menuItems.length;
    menuItems = menuItems.filter(item => {
        if (item && typeof item.URL === 'string') {
            return !item.URL.endsWith(`/${localityId}.xml`);
        }
        return true;
    });

    if (menuItems.length === initialLength) {
      // No item was removed, maybe localityId was incorrect or URL format changed
      // console.warn(`Locality ${localityId} not found in zone ${zoneId}.xml or URL mismatch.`);
      // Depending on desired behavior, this could be an error or a silent success
    }

    parsedZoneXml.CiscoIPPhoneMenu.MenuItem = menuItems.length > 0 ? menuItems : undefined; // Remove MenuItem array if empty


    await buildAndWriteXML(zoneFilePath, parsedZoneXml);

    // Attempt to delete the department XML file, ignore if it doesn't exist
    try {
      await fs.unlink(departmentFilePath);
    } catch (unlinkError: any) {
      if (unlinkError.code !== 'ENOENT') {
        console.warn(`Could not delete department file ${departmentFilePath}: ${unlinkError.message}`);
        // Decide if this should make the whole operation fail. For now, we'll say deleting from zone is enough.
      }
    }

    revalidatePath('/');
    revalidatePath(`/${zoneId}`);
    return { success: true, message: `Locality ${localityId} deleted from ${zoneId}.` };

  } catch (error: any) {
    console.error(`Error deleting locality ${localityId} from ${zoneId}:`, error);
    return { success: false, message: `Failed to delete locality: ${error.message}` };
  }
}


export async function deleteExtensionAction(localityId: string, extensionDepartment: string, extensionNumber: string): Promise<{ success: boolean; message: string }> {
  if (!localityId || !extensionDepartment || !extensionNumber) {
    return { success: false, message: 'Locality ID, extension department, and number are required.' };
  }

  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);

  try {
    const parsedDepartmentXml = await readAndParseXML(departmentFilePath);
    if (!parsedDepartmentXml || !parsedDepartmentXml.CiscoIPPhoneDirectory) {
      return { success: false, message: `Department file ${localityId}.xml not found or invalid.` };
    }

    let directoryEntries = ensureArray(parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry);
    
    const initialLength = directoryEntries.length;
    directoryEntries = directoryEntries.filter(entry => {
        return !(entry.Name === extensionDepartment && entry.Telephone === extensionNumber);
    });

    if (directoryEntries.length === initialLength) {
      // No item was removed
      // console.warn(`Extension ${extensionDepartment} - ${extensionNumber} not found in ${localityId}.xml.`);
    }
    
    parsedDepartmentXml.CiscoIPPhoneDirectory.DirectoryEntry = directoryEntries.length > 0 ? directoryEntries : undefined;

    await buildAndWriteXML(departmentFilePath, parsedDepartmentXml);
    
    // Find which zone this localityId belongs to for revalidation - this is tricky.
    // For simplicity, we'll revalidate the specific locality page.
    // A more robust solution would need to know the zoneId or revalidate more broadly.
    // This requires knowledge of how URLs are constructed. Assuming /[zoneId]/[localityId]
    // We don't have zoneId here, so we might need to pass it or revalidate a generic path.
    // For now, let's revalidate related paths if possible, or a broader scope.
    // This is a limitation: we don't know the zoneId from just localityId here.
    // The page calling this action should handle revalidation or provide zoneId.
    // revalidatePath(`/${zoneId}/${localityId}`); // zoneId is not available here.
    // Fallback: Revalidate all dynamic locality pages (not ideal) or the specific one if possible.
    // For now, the component calling this will handle refreshing its view.
    // The revalidatePath call would be more effective if zoneId was known.
    // Let's revalidate a common path pattern for localities.
    revalidatePath('/[zoneId]/[localityId]', 'page');


    return { success: true, message: `Extension ${extensionDepartment} (${extensionNumber}) deleted from ${localityId}.` };

  } catch (error: any) {
    console.error(`Error deleting extension from ${localityId}:`, error);
    return { success: false, message: `Failed to delete extension: ${error.message}` };
  }
}
