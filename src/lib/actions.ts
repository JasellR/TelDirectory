
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { GlobalSearchResult, MatchedExtension, Extension, CsvImportResult, SyncResult, ConflictedExtensionInfo, MissingExtensionInfo, Zone, ZoneItem } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema, getZones, getZoneItems } from '@/lib/data';
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { isAuthenticated, getCurrentUser } from '@/lib/auth-actions';

async function findFileCaseInsensitive(directory: string, filename: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseName = filename.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseName) {
                return file;
            }
        }
        return null;
    } catch (error: any) {
        return null;
    }
}

async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  const mainMenuFilename = await findFileCaseInsensitive(ivoxsRoot, 'mainmenu.xml');

  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_FILENAME: mainMenuFilename,
    MAINMENU_PATH: mainMenuFilename ? path.join(ivoxsRoot, mainMenuFilename) : null,
    ZONE_BRANCH_DIR: path.join(ivoxsRoot, 'zonebranch'),
    BRANCH_DIR: path.join(ivoxsRoot, 'branch'),
    DEPARTMENT_DIR: path.join(ivoxsRoot, 'department'),
  };
}

const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

function generateIdFromName(name: string): string {
  const cleanedName = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_.-]/g, '');
  if (!cleanedName.trim()) return `UnnamedItem${Date.now()}`;
  return cleanedName.replace(/\s+/g, '').replace(/_{2,}/g, '_').replace(/-{2,}/g, '-');
}

async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    return parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
   const builder = new Builder({
    headless: true,
    renderOpts: { pretty: false, indent: '', newline: '' },
  });
  const xmlString = builder.buildObject(jsObject);
  const finalXmlString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' + xmlString;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalXmlString, 'utf-8');
}

function extractIdFromUrl(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, '');
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'zone' | 'unknown' | 'pagination' {
    if (!url) return 'unknown';
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('/ivoxsdir/branch/')) return 'branch';
    if (lowerUrl.includes('/ivoxsdir/department/')) return 'locality';
    if (lowerUrl.includes('/ivoxsdir/zonebranch/')) return 'zone';
    return 'unknown';
}

const itemTypeToDir: Record<'zone' | 'branch' | 'locality', string> = {
    zone: 'zonebranch',
    branch: 'branch',
    locality: 'department',
};

async function getServiceUrlComponents(): Promise<{ protocol: string, host: string, port: string }> {
  let protocol = 'http';
  let host = '127.0.0.1';
  let port = '3000';
  
  const configPath = path.join(process.cwd(), '.config', 'directory.config.json');
    try {
        const configData = await fs.readFile(configPath, 'utf-8');
        if (configData && configData.trim() !== '') {
          const config = JSON.parse(configData);
          if (config.serviceHost) host = config.serviceHost;
          if (config.servicePort) port = config.servicePort;
        }
    } catch (error: any) {}
  return { protocol, host, port };
}

function constructServiceUrl(protocol: string, host: string, port: string, pathSegment: string): string {
    if (pathSegment.startsWith('/')) pathSegment = pathSegment.substring(1);
    const portPart = port ? `:${port}` : '';
    return `${protocol}://${host}${portPart}/ivoxsdir/${pathSegment.replace(/\\/g, '/')}`;
}

async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

export async function addZoneAction(zoneName: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required." };
  
  const newZoneId = generateIdFromName(zoneName);
  const paths = await getPaths();
  if (!paths.MAINMENU_PATH) return { success: false, message: "Main menu file not found." };
  
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);
  const { protocol, host, port } = await getServiceUrlComponents();
  const newZoneURL = constructServiceUrl(protocol, host, port, `zonebranch/${newZoneId}.xml`);

  try {
    await buildAndWriteXML(newZoneBranchFilePath, { CiscoIPPhoneMenu: { Title: zoneName, Prompt: 'Select a Locality' } });
    const mainMenu = await readAndParseXML(paths.MAINMENU_PATH) || { CiscoIPPhoneMenu: { MenuItem: [] } };
    mainMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
    mainMenu.CiscoIPPhoneMenu.MenuItem.push({ Name: zoneName, URL: newZoneURL });
    mainMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
    await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
    revalidatePath('/');
    return { success: true, message: `Zone "${zoneName}" added successfully.` };
  } catch (e: any) {
    return { success: false, message: `Failed to add zone.`, error: e.message };
  }
}

export async function deleteZoneAction(zoneId: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required." };
  const paths = await getPaths();
  if (!paths.MAINMENU_PATH) return { success: false, message: "Main menu file not found." };

  try {
      const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
      await fs.unlink(zoneBranchFilePath).catch(() => {});
      const mainMenu = await readAndParseXML(paths.MAINMENU_PATH);
      if (mainMenu?.CiscoIPPhoneMenu?.MenuItem) {
        const menuItems = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
        mainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.filter(item => extractIdFromUrl(item.URL) !== zoneId);
        await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
      }
      revalidatePath('/');
      return { success: true, message: `Zone "${zoneId}" deleted successfully.` };
  } catch(e: any) {
     return { success: false, message: `Failed to delete zone.`, error: e.message };
  }
}

export async function addLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemName: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    const { zoneId, branchId, itemName, itemType } = params;
    const newItemId = generateIdFromName(itemName);
    const paths = await getPaths();
    const { protocol, host, port } = await getServiceUrlComponents();
    
    let parentMenuPath, newItemPath, newUrlPath, revalidationPath;
    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        newItemPath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
        newUrlPath = `branch/${newItemId}.xml`;
        revalidationPath = `/${zoneId}`;
    } else {
        parentMenuPath = branchId ? path.join(paths.BRANCH_DIR, `${branchId}.xml`) : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        newItemPath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
        newUrlPath = `department/${newItemId}.xml`;
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }
    const newUrl = constructServiceUrl(protocol, host, port, newUrlPath);

    try {
        await buildAndWriteXML(newItemPath, itemType === 'branch' ? { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Select a Locality' } } : { CiscoIPPhoneDirectory: {} });
        const parentMenu = await readAndParseXML(parentMenuPath);
        if (!parentMenu.CiscoIPPhoneMenu) parentMenu.CiscoIPPhoneMenu = {};
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem);
        parentMenu.CiscoIPPhoneMenu.MenuItem.push({ Name: itemName, URL: newUrl });
        parentMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
        await buildAndWriteXML(parentMenuPath, parentMenu);
        revalidatePath(revalidationPath);
        return { success: true, message: `${itemType} "${itemName}" added successfully.` };
    } catch(e: any) {
        return { success: false, message: `Failed to add ${itemType}.`, error: e.message };
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
    if (!authenticated) return { success: false, message: "Authentication required." };
    const { zoneId, branchId, oldItemId, newItemName, itemType } = params;
    const newItemId = generateIdFromName(newItemName);
    const paths = await getPaths();
    const { protocol, host, port } = await getServiceUrlComponents();

    let parentMenuPath, oldItemPath, newItemPath, newUrlPath, revalidationPath;
    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        oldItemPath = path.join(paths.BRANCH_DIR, `${oldItemId}.xml`);
        newItemPath = path.join(paths.BRANCH_DIR, `${newItemId}.xml`);
        newUrlPath = `branch/${newItemId}.xml`;
        revalidationPath = `/${zoneId}`;
    } else {
        parentMenuPath = branchId ? path.join(paths.BRANCH_DIR, `${branchId}.xml`) : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        oldItemPath = path.join(paths.DEPARTMENT_DIR, `${oldItemId}.xml`);
        newItemPath = path.join(paths.DEPARTMENT_DIR, `${newItemId}.xml`);
        newUrlPath = `department/${newItemId}.xml`;
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }
    const newUrl = constructServiceUrl(protocol, host, port, newUrlPath);

    try {
        if (oldItemId !== newItemId) await fs.rename(oldItemPath, newItemPath);
        const itemContent = await readAndParseXML(newItemPath);
        if (itemType === 'branch' && itemContent?.CiscoIPPhoneMenu) itemContent.CiscoIPPhoneMenu.Title = newItemName;
        await buildAndWriteXML(newItemPath, itemContent);
        const parentMenu = await readAndParseXML(parentMenuPath);
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            if (extractIdFromUrl(item.URL) === oldItemId) {
                item.Name = newItemName;
                item.URL = newUrl;
            }
            return item;
        });
        parentMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
        await buildAndWriteXML(parentMenuPath, parentMenu);
        revalidatePath(revalidationPath);
        return { success: true, message: `Updated successfully.` };
    } catch(e: any) {
        return { success: false, message: `Failed to update.`, error: e.message };
    }
}

export async function deleteLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemId: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    const { zoneId, branchId, itemId, itemType } = params;
    const paths = await getPaths();
    let parentMenuPath, itemPathToDelete, revalidationPath;
    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        itemPathToDelete = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
        revalidationPath = `/${zoneId}`;
    } else {
        parentMenuPath = branchId ? path.join(paths.BRANCH_DIR, `${branchId}.xml`) : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        itemPathToDelete = path.join(paths.DEPARTMENT_DIR, `${itemId}.xml`);
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }

    try {
        await fs.unlink(itemPathToDelete).catch(() => {});
        const parentMenu = await readAndParseXML(parentMenuPath);
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).filter((item: any) => extractIdFromUrl(item.URL) !== itemId);
        await buildAndWriteXML(parentMenuPath, parentMenu);
        revalidatePath(revalidationPath);
        return { success: true, message: `Deleted successfully.` };
    } catch (e: any) {
        return { success: false, message: `Failed to delete.`, error: e.message };
    }
}

export async function addExtensionAction(localityId: string, newName: string, newTelephone: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath) || { CiscoIPPhoneDirectory: { DirectoryEntry: [] } };
        if (!department.CiscoIPPhoneDirectory) department.CiscoIPPhoneDirectory = {};
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry);
        department.CiscoIPPhoneDirectory.DirectoryEntry.push({ Name: newName, Telephone: newTelephone });
        department.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => parseInt(a.Telephone, 10) - parseInt(b.Telephone, 10));
        await buildAndWriteXML(departmentFilePath, department);
        revalidatePath(`/`);
        return { success: true, message: `Extension added.` };
    } catch(e: any) {
        return { success: false, message: `Failed to add extension.`, error: e.message };
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
    if (!authenticated) return { success: false, message: "Authentication required." };
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath);
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).map((entry: any) => {
            if (entry.Name === params.oldExtensionName && entry.Telephone === params.oldExtensionNumber) {
                entry.Name = params.newExtensionName;
                entry.Telephone = params.newExtensionNumber;
            }
            return entry;
        });
        department.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => parseInt(a.Telephone, 10) - parseInt(b.Telephone, 10));
        await buildAndWriteXML(departmentFilePath, department);
        revalidatePath(`/`);
        return { success: true, message: `Extension updated.` };
    } catch (e: any) {
        return { success: false, message: `Failed to edit extension.`, error: e.message };
    }
}

export async function deleteExtensionAction(localityId: string, extensionName: string, extensionNumber: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath);
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).filter((entry: any) => !(entry.Name === extensionName && entry.Telephone === extensionNumber));
        await buildAndWriteXML(departmentFilePath, department);
        revalidatePath(`/`);
        return { success: true, message: `Extension deleted.` };
    } catch (e: any) {
        return { success: false, message: `Failed to delete extension.`, error: e.message };
    }
}

export async function updateXmlUrlsAction(host: string, port: string): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    const configPath = path.join(process.cwd(), '.config', 'directory.config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ serviceHost: host, servicePort: port }, null, 2));
    revalidatePath('/', 'layout');
    return { success: true, message: "Network settings saved." };
}

export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required.", updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
  return { success: false, message: "Sync feature placeholder.", updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
}

export async function moveExtensionsAction(params: {
    extensionsToMove: Extension[];
    sourceLocalityId: string;
    destinationZoneId: string;
    destinationLocalityId?: string;
    newLocalityName?: string;
    destinationBranchId?: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    const { extensionsToMove, sourceLocalityId, destinationLocalityId, newLocalityName } = params;
    const paths = await getPaths();
    let finalDestId = destinationLocalityId;

    try {
        if (newLocalityName) {
            await addLocalityOrBranchAction({ zoneId: params.destinationZoneId, branchId: params.destinationBranchId, itemName: newLocalityName, itemType: 'locality' });
            finalDestId = generateIdFromName(newLocalityName);
        }
        if (!finalDestId) throw new Error("No destination.");
        
        const destPath = path.join(paths.DEPARTMENT_DIR, `${finalDestId}.xml`);
        const dest = await readAndParseXML(destPath) || { CiscoIPPhoneDirectory: { DirectoryEntry: [] } };
        dest.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(dest.CiscoIPPhoneDirectory.DirectoryEntry);
        dest.CiscoIPPhoneDirectory.DirectoryEntry.push(...extensionsToMove.map(e => ({ Name: e.department, Telephone: e.number })));
        await buildAndWriteXML(destPath, dest);

        const srcPath = path.join(paths.DEPARTMENT_DIR, `${sourceLocalityId}.xml`);
        const src = await readAndParseXML(srcPath);
        const toMove = new Set(extensionsToMove.map(e => e.number));
        src.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(src.CiscoIPPhoneDirectory.DirectoryEntry).filter((e: any) => !toMove.has(e.Telephone));
        await buildAndWriteXML(srcPath, src);

        revalidatePath('/', 'layout');
        return { success: true, message: "Extensions moved." };
    } catch (e: any) {
        return { success: false, message: 'Error moving extensions.', error: e.message };
    }
}

export async function getZonesAction(): Promise<Omit<Zone, 'items'>[]> {
    return getZones();
}

export async function getZoneItemsAction(zoneId: string): Promise<ZoneItem[]> {
    return getZoneItems(zoneId);
}

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  return [];
}
