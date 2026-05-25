
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { GlobalSearchResult, MatchedExtension, Extension, CsvImportResult, SyncResult, Zone, ZoneItem, BranchItem } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema, getZones, getZoneItems } from '@/lib/data';
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth-actions';

// Helpers internos
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

async function ensureDirectoryStructure(root: string) {
    const dirs = ['zonebranch', 'branch', 'department'];
    for (const dir of dirs) {
        await fs.mkdir(path.join(root, dir), { recursive: true }).catch(() => {});
    }
}

async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  await ensureDirectoryStructure(ivoxsRoot);
  const mainMenuFilename = await findFileCaseInsensitive(ivoxsRoot, 'MainMenu.xml') || 'MainMenu.xml';

  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_FILENAME: mainMenuFilename,
    MAINMENU_PATH: path.join(ivoxsRoot, mainMenuFilename),
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
  if (!cleanedName.trim()) return `Item${Date.now()}`;
  return cleanedName.replace(/\s+/g, '');
}

async function readAndParseXML(filePath: string): Promise<any> {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    return await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function buildAndWriteXML(filePath: string, jsObject: any): Promise<void> {
   const builder = new Builder({
    headless: true,
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
  });
  const xmlString = builder.buildObject(jsObject);
  const finalXmlString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + xmlString;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalXmlString, 'utf-8');
}

function extractIdFromUrl(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  const fileName = parts.pop() || '';
  return fileName.replace(/\.xml$/i, '');
}

function getFolderSegmentFromUrl(url: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('/zonebranch/')) return 'zonebranch';
    if (lowerUrl.includes('/branch/')) return 'branch';
    if (lowerUrl.includes('/department/')) return 'department';
    return 'department'; // Fallback
}

async function getServiceUrlComponents(): Promise<{ protocol: string, host: string, port: string }> {
  let protocol = 'http';
  let host = '127.0.0.1';
  let port = '3000';
  
  const configPath = path.join(process.cwd(), '.config', 'directory.config.json');
    try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.serviceHost) host = config.serviceHost;
        if (config.servicePort) port = config.servicePort;
    } catch (error: any) {}
  return { protocol, host, port };
}

function constructServiceUrl(protocol: string, host: string, port: string, pathSegment: string): string {
    if (pathSegment.startsWith('/')) pathSegment = pathSegment.substring(1);
    const portPart = port ? `:${port}` : '';
    return `${protocol}://${host}${portPart}/ivoxsdir/${pathSegment.replace(/\\/g, '/')}`;
}

export async function addZoneAction(zoneName: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required." };
  
  const newZoneId = generateIdFromName(zoneName);
  const paths = await getPaths();
  
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);
  const { protocol, host, port } = await getServiceUrlComponents();
  const newZoneURL = constructServiceUrl(protocol, host, port, `zonebranch/${newZoneId}.xml`);

  try {
    await buildAndWriteXML(newZoneBranchFilePath, { CiscoIPPhoneMenu: { Title: zoneName, Prompt: 'Seleccione una localidad' } });
    
    let mainMenu = await readAndParseXML(paths.MAINMENU_PATH);
    if (!mainMenu) mainMenu = { CiscoIPPhoneMenu: { MenuItem: [] } };
    if (!mainMenu.CiscoIPPhoneMenu) mainMenu.CiscoIPPhoneMenu = { MenuItem: [] };
    
    mainMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
    mainMenu.CiscoIPPhoneMenu.MenuItem.push({ Name: zoneName, URL: newZoneURL });
    mainMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
    
    await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
    revalidatePath('/');
    return { success: true, message: `Zona "${zoneName}" agregada con éxito.` };
  } catch (e: any) {
    return { success: false, message: `Error al agregar zona.`, error: e.message };
  }
}

export async function deleteZoneAction(zoneId: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required." };
  const paths = await getPaths();

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
      return { success: true, message: `Zona "${zoneId}" eliminada con éxito.` };
  } catch(e: any) {
     return { success: false, message: `Error al eliminar zona.`, error: e.message };
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
        await buildAndWriteXML(newItemPath, itemType === 'branch' ? { CiscoIPPhoneMenu: { Title: itemName, Prompt: 'Seleccione una localidad' } } : { CiscoIPPhoneDirectory: { Title: itemName } });
        const parentMenu = await readAndParseXML(parentMenuPath);
        if (!parentMenu) throw new Error("Parent menu file not found.");
        if (!parentMenu.CiscoIPPhoneMenu) parentMenu.CiscoIPPhoneMenu = {};
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem);
        parentMenu.CiscoIPPhoneMenu.MenuItem.push({ Name: itemName, URL: newUrl });
        parentMenu.CiscoIPPhoneMenu.MenuItem.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
        await buildAndWriteXML(parentMenuPath, parentMenu);
        revalidatePath(revalidationPath);
        return { success: true, message: `${itemType === 'branch' ? 'Rama' : 'Localidad'} "${itemName}" agregada con éxito.` };
    } catch(e: any) {
        return { success: false, message: `Error al agregar ${itemType}.`, error: e.message };
    }
}

export async function updateDirectoryRootPathAction(newPath: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: "La ruta del directorio está fijada a 'public/ivoxsdir' para el servicio de archivos estáticos." };
}

export async function importExtensionsFromCsvAction(csvContent: string): Promise<CsvImportResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required." };

  const paths = await getPaths();
  const { protocol, host, port } = await getServiceUrlComponents();
  const rows = csvContent.split('\n').filter(line => line.trim() !== '');
  
  const details = {
    processedRows: 0,
    extensionsAdded: 0,
    newLocalitiesCreated: 0,
    parentMenusUpdated: 0,
    mainMenuUpdatedCount: 0,
    errors: [] as any[]
  };

  for (let i = 0; i < rows.length; i++) {
    if (i === 0 && rows[i].toLowerCase().includes('extension')) continue;

    const parts = rows[i].split(',').map(p => p.trim());
    if (parts.length < 4) {
        details.errors.push({ row: i + 1, data: rows[i], error: "Formato inválido" });
        continue;
    }

    const [name, extension, localityId, zoneId] = parts;
    details.processedRows++;

    try {
        const zonePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        let zoneMenu = await readAndParseXML(zonePath);
        if (!zoneMenu) {
            await buildAndWriteXML(zonePath, { CiscoIPPhoneMenu: { Title: zoneId, Prompt: 'Seleccione una localidad' } });
            zoneMenu = { CiscoIPPhoneMenu: { MenuItem: [] } };
            const mainMenu = await readAndParseXML(paths.MAINMENU_PATH) || { CiscoIPPhoneMenu: { MenuItem: [] } };
            const menuItems = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
            if (!menuItems.some((m: any) => extractIdFromUrl(m.URL) === zoneId)) {
                menuItems.push({ Name: zoneId, URL: constructServiceUrl(protocol, host, port, `zonebranch/${zoneId}.xml`) });
                menuItems.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
                await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
                details.mainMenuUpdatedCount++;
            }
        }

        const localityPath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
        let localityDir = await readAndParseXML(localityPath);
        if (!localityDir) {
            await buildAndWriteXML(localityPath, { CiscoIPPhoneDirectory: { Title: localityId, Prompt: 'Directorio' } });
            localityDir = { CiscoIPPhoneDirectory: { DirectoryEntry: [] } };
            details.newLocalitiesCreated++;

            const zoneItems = ensureArray(zoneMenu.CiscoIPPhoneMenu.MenuItem);
            if (!zoneItems.some((m: any) => extractIdFromUrl(m.URL) === localityId)) {
                zoneItems.push({ Name: localityId, URL: constructServiceUrl(protocol, host, port, `department/${localityId}.xml`) });
                zoneItems.sort((a: any, b: any) => a.Name.localeCompare(b.Name));
                await buildAndWriteXML(zonePath, zoneMenu);
                details.parentMenusUpdated++;
            }
        }

        if (!localityDir.CiscoIPPhoneDirectory) localityDir.CiscoIPPhoneDirectory = {};
        const entries = ensureArray(localityDir.CiscoIPPhoneDirectory.DirectoryEntry);
        if (!entries.some((e: any) => e.Telephone === extension)) {
            entries.push({ Name: name, Telephone: extension });
            entries.sort((a: any, b: any) => parseInt(a.Telephone) - parseInt(b.Telephone));
            await buildAndWriteXML(localityPath, localityDir);
            details.extensionsAdded++;
        }
    } catch (e: any) {
        details.errors.push({ row: i + 1, data: rows[i], error: e.message });
    }
  }

  revalidatePath('/', 'layout');
  return { success: details.errors.length === 0, message: "Importación completada", details };
}

export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Auth required.", updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };

  const paths = await getPaths();
  const urls = feedUrlsString.split('\n').map(u => u.trim()).filter(u => u !== '');
  const masterExtensionsMap = new Map<string, { name: string, source: string }[]>();

  for (const url of urls) {
      try {
          const response = await fetch(url);
          const xmlText = await response.text();
          const parsed = await parseStringPromise(xmlText, { explicitArray: false, trim: true });
          const entries = ensureArray(parsed?.CiscoIPPhoneDirectory?.DirectoryEntry);
          for (const entry of entries) {
              const num = entry.Telephone;
              const name = entry.Name;
              if (!masterExtensionsMap.has(num)) masterExtensionsMap.set(num, []);
              masterExtensionsMap.get(num)!.push({ name, source: url });
          }
      } catch (e) {}
  }

  const result: SyncResult = { success: true, message: "Sincronización finalizada", updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
  const deptFiles = await fs.readdir(paths.DEPARTMENT_DIR).catch(() => []);
  const localExtensionFound = new Set<string>();

  for (const file of deptFiles) {
      if (!file.endsWith('.xml')) continue;
      const filePath = path.join(paths.DEPARTMENT_DIR, file);
      try {
          const dept = await readAndParseXML(filePath);
          if (!dept?.CiscoIPPhoneDirectory?.DirectoryEntry) continue;
          const entries = ensureArray(dept.CiscoIPPhoneDirectory.DirectoryEntry);
          let modified = false;
          for (const entry of entries) {
              localExtensionFound.add(entry.Telephone);
              const feedMatches = masterExtensionsMap.get(entry.Telephone);
              if (feedMatches && feedMatches.length > 0) {
                  const uniqueNames = Array.from(new Set(feedMatches.map(m => m.name)));
                  if (uniqueNames.length > 1) {
                      if (!result.conflictedExtensions.some(c => c.number === entry.Telephone)) {
                          result.conflictedExtensions.push({ number: entry.Telephone, conflicts: feedMatches.map(m => ({ name: m.name, sourceFeed: m.source })) });
                      }
                  } else if (entry.Name !== uniqueNames[0]) {
                      entry.Name = uniqueNames[0];
                      modified = true;
                      result.updatedCount++;
                  }
              }
          }
          if (modified) {
              await buildAndWriteXML(filePath, dept);
              result.filesModified++;
          }
      } catch (e) { result.filesFailedToUpdate++; }
  }

  for (const [num, matches] of masterExtensionsMap.entries()) {
      if (!localExtensionFound.has(num)) {
          result.missingExtensions.push({ number: num, name: matches[0].name, sourceFeed: matches[0].source });
      }
  }

  if (result.missingExtensions.length > 0) {
      const missingPath = path.join(paths.DEPARTMENT_DIR, 'MissingExtensionsDepartment.xml');
      const missingDir = { CiscoIPPhoneDirectory: { Title: "Faltantes", DirectoryEntry: result.missingExtensions.map(m => ({ Name: m.name, Telephone: m.number })) } };
      await buildAndWriteXML(missingPath, missingDir);
      const zoneMissingPath = path.join(paths.ZONE_BRANCH_DIR, 'MissingExtensionsFromFeed.xml');
      const { protocol, host, port } = await getServiceUrlComponents();
      const zoneMissingDir = { CiscoIPPhoneMenu: { Title: "Sync Faltantes", MenuItem: [{ Name: "Gestionar Faltantes", URL: constructServiceUrl(protocol, host, port, 'department/MissingExtensionsDepartment.xml') }] } };
      await buildAndWriteXML(zoneMissingPath, zoneMissingDir);
  }

  revalidatePath('/', 'layout');
  return result;
}

export async function editExtensionAction(params: {
    localityId: string;
    oldExtensionName: string;
    oldExtensionNumber: string;
    newExtensionName: string;
    newExtensionNumber: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Auth required." };
    const paths = await getPaths();
    const filePath = path.join(paths.DEPARTMENT_DIR, `${params.localityId}.xml`);
    try {
        const department = await readAndParseXML(filePath);
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).map((entry: any) => {
            if (entry.Name === params.oldExtensionName && entry.Telephone === params.oldExtensionNumber) {
                entry.Name = params.newExtensionName;
                entry.Telephone = params.newExtensionNumber;
            }
            return entry;
        });
        department.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => parseInt(a.Telephone, 10) - parseInt(b.Telephone, 10));
        await buildAndWriteXML(filePath, department);
        revalidatePath(`/`);
        return { success: true, message: `Actualizada.` };
    } catch (e: any) { return { success: false, message: `Error.`, error: e.message }; }
}

export async function deleteExtensionAction(localityId: string, extensionName: string, extensionNumber: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Auth required." };
    const paths = await getPaths();
    const filePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
    try {
        const department = await readAndParseXML(filePath);
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).filter((entry: any) => !(entry.Name === extensionName && entry.Telephone === extensionNumber));
        await buildAndWriteXML(filePath, department);
        revalidatePath(`/`);
        return { success: true, message: `Eliminada.` };
    } catch (e: any) { return { success: false, message: `Error.`, error: e.message }; }
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
    if (!authenticated) return { success: false, message: "Auth required." };
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
        const dest = await readAndParseXML(destPath) || { CiscoIPPhoneDirectory: { Title: finalDestId, DirectoryEntry: [] } };
        if (!dest.CiscoIPPhoneDirectory) dest.CiscoIPPhoneDirectory = { Title: finalDestId };
        dest.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(dest.CiscoIPPhoneDirectory.DirectoryEntry);
        dest.CiscoIPPhoneDirectory.DirectoryEntry.push(...extensionsToMove.map(e => ({ Name: e.department, Telephone: e.number })));
        dest.CiscoIPPhoneDirectory.DirectoryEntry.sort((a: any, b: any) => parseInt(a.Telephone, 10) - parseInt(b.Telephone, 10));
        await buildAndWriteXML(destPath, dest);

        const srcPath = path.join(paths.DEPARTMENT_DIR, `${sourceLocalityId}.xml`);
        const src = await readAndParseXML(srcPath);
        const toMove = new Set(extensionsToMove.map(e => e.number));
        src.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(src.CiscoIPPhoneDirectory.DirectoryEntry).filter((e: any) => !toMove.has(e.Telephone));
        await buildAndWriteXML(srcPath, src);

        revalidatePath('/', 'layout');
        return { success: true, message: "Extensiones movidas con éxito." };
    } catch (e: any) { return { success: false, message: 'Error.', error: e.message }; }
}

export async function editLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  oldItemId: string;
  newItemName: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Auth required." };
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

    try {
        if (oldItemId !== newItemId) await fs.rename(oldItemPath, newItemPath).catch(() => {});
        const itemContent = await readAndParseXML(newItemPath);
        if (itemType === 'branch' && itemContent?.CiscoIPPhoneMenu) itemContent.CiscoIPPhoneMenu.Title = newItemName;
        if (itemType === 'locality' && itemContent?.CiscoIPPhoneDirectory) itemContent.CiscoIPPhoneDirectory.Title = newItemName;
        await buildAndWriteXML(newItemPath, itemContent);
        
        const parentMenu = await readAndParseXML(parentMenuPath);
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            if (extractIdFromUrl(item.URL) === oldItemId) {
                item.Name = newItemName;
                item.URL = constructServiceUrl(protocol, host, port, newUrlPath);
            }
            return item;
        });
        await buildAndWriteXML(parentMenuPath, parentMenu);
        revalidatePath(revalidationPath);
        return { success: true, message: `Actualizado correctamente.` };
    } catch(e: any) { return { success: false, message: `Error.`, error: e.message }; }
}

export async function deleteLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemId: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Auth required." };
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
        return { success: true, message: `Eliminado.` };
    } catch (e: any) { return { success: false, message: `Error.`, error: e.message }; }
}

export async function getZonesAction(): Promise<Omit<Zone, 'items'>[]> {
    return getZones();
}

export async function getZoneItemsAction(zoneId: string): Promise<ZoneItem[]> {
    return getZoneItems(zoneId);
}

export async function updateXmlUrlsAction(host: string, port: string): Promise<{ success: boolean; message: string; error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) return { success: false, message: "Authentication required." };
  
  try {
    const configPath = path.join(process.cwd(), '.config', 'directory.config.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ serviceHost: host, servicePort: port }, null, 2));

    const paths = await getPaths();
    const protocol = 'http';
    const currentHost = host;
    const currentPort = port;

    // 1. Update MainMenu.xml - Todo aquí siempre va a zonebranch/
    const mainMenu = await readAndParseXML(paths.MAINMENU_PATH);
    if (mainMenu?.CiscoIPPhoneMenu?.MenuItem) {
      const items = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
      mainMenu.CiscoIPPhoneMenu.MenuItem = items.map(item => ({
        ...item,
        URL: constructServiceUrl(protocol, currentHost, currentPort, `zonebranch/${extractIdFromUrl(item.URL)}.xml`)
      }));
      await buildAndWriteXML(paths.MAINMENU_PATH, mainMenu);
    }

    // 2. Update ZoneBranch files - Preservar carpeta original (zonebranch, branch o department)
    const zoneFiles = await fs.readdir(paths.ZONE_BRANCH_DIR).catch(() => []);
    for (const file of zoneFiles) {
        if (!file.endsWith('.xml')) continue;
        const filePath = path.join(paths.ZONE_BRANCH_DIR, file);
        const menu = await readAndParseXML(filePath);
        if (menu?.CiscoIPPhoneMenu?.MenuItem) {
            const items = ensureArray(menu.CiscoIPPhoneMenu.MenuItem);
            menu.CiscoIPPhoneMenu.MenuItem = items.map(item => {
                const id = extractIdFromUrl(item.URL);
                const segment = getFolderSegmentFromUrl(item.URL);
                return { ...item, URL: constructServiceUrl(protocol, currentHost, currentPort, `${segment}/${id}.xml`) };
            });
            await buildAndWriteXML(filePath, menu);
        }
    }

    // 3. Update Branch files - Normalmente apuntan a department/
    const branchFiles = await fs.readdir(paths.BRANCH_DIR).catch(() => []);
    for (const file of branchFiles) {
        if (!file.endsWith('.xml')) continue;
        const filePath = path.join(paths.BRANCH_DIR, file);
        const menu = await readAndParseXML(filePath);
        if (menu?.CiscoIPPhoneMenu?.MenuItem) {
            const items = ensureArray(menu.CiscoIPPhoneMenu.MenuItem);
            menu.CiscoIPPhoneMenu.MenuItem = items.map(item => {
                const id = extractIdFromUrl(item.URL);
                const segment = getFolderSegmentFromUrl(item.URL);
                return { ...item, URL: constructServiceUrl(protocol, currentHost, currentPort, `${segment}/${id}.xml`) };
            });
            await buildAndWriteXML(filePath, menu);
        }
    }

    revalidatePath('/', 'layout');
    return { success: true, message: "Configuración de red aplicada y URLs XML actualizadas con éxito." };
  } catch (e: any) {
    return { success: false, message: "Error al actualizar URLs XML.", error: e.message };
  }
}

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const paths = await getPaths();
  const results: GlobalSearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  try {
      const zones = await getZones();
      for (const zone of zones) {
          const items = await getZoneItems(zone.id);
          for (const item of items) {
              if (item.type === 'branch') {
                  const branchItems = await getBranchItems(item.id);
                  for (const bItem of branchItems) {
                      const locality = await processLocalitySearch(bItem.id, bItem.name, zone.id, zone.name, item.id, item.name, lowerQuery);
                      if (locality) results.push(locality);
                  }
              } else if (item.type === 'locality') {
                  const locality = await processLocalitySearch(item.id, item.name, zone.id, zone.name, undefined, undefined, lowerQuery);
                  if (locality) results.push(locality);
              }
          }
      }
  } catch (e) {
      console.error("Error in global search:", e);
  }
  return results;
}

async function processLocalitySearch(id: string, name: string, zoneId: string, zoneName: string, branchId: string | undefined, branchName: string | undefined, query: string): Promise<GlobalSearchResult | null> {
    const paths = await getPaths();
    const filePath = path.join(paths.DEPARTMENT_DIR, `${id}.xml`);
    const content = await readAndParseXML(filePath);
    if (!content?.CiscoIPPhoneDirectory) return null;

    const entries = ensureArray(content.CiscoIPPhoneDirectory.DirectoryEntry);
    const matchingExtensions: MatchedExtension[] = [];
    const localityNameMatch = name.toLowerCase().includes(query);

    for (const entry of entries) {
        if (!entry.Telephone || !entry.Name) continue;
        const nameMatch = entry.Name.toLowerCase().includes(query);
        const numMatch = entry.Telephone.toLowerCase().includes(query);
        if (nameMatch) matchingExtensions.push({ name: entry.Name, number: entry.Telephone, matchedOn: 'extensionName' });
        else if (numMatch) matchingExtensions.push({ name: entry.Name, number: entry.Telephone, matchedOn: 'extensionNumber' });
    }

    if (localityNameMatch || matchingExtensions.length > 0) {
        let fullPath = branchId ? `/${zoneId}/branches/${branchId}/localities/${id}` : `/${zoneId}/localities/${id}`;
        return {
            localityId: id,
            localityName: name,
            zoneId,
            zoneName,
            branchId,
            branchName,
            fullPath,
            localityNameMatch,
            matchingExtensions
        };
    }
    return null;
}

async function getBranchItems(branchId: string): Promise<BranchItem[]> {
  const { BRANCH_DIR } = await getPaths();
  const branchFilePath = path.join(BRANCH_DIR, `${branchId}.xml`);
  const xmlContent = await fs.readFile(branchFilePath, 'utf-8').catch(() => '');
  if (!xmlContent) return [];

  try {
      const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
      const menuItems = ensureArray(parsedXml?.CiscoIPPhoneMenu?.MenuItem);
      return menuItems.map((item: any) => ({
        id: extractIdFromUrl(item.URL),
        name: item.Name,
        type: 'locality',
      }));
  } catch (e) { return []; }
}
