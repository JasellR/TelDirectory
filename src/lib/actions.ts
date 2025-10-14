
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { CiscoIPPhoneMenu, CiscoIPPhoneDirectory, MenuItem as XmlMenuItem, DirectoryEntry } from '@/types/xml';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated, getCurrentUser } from '@/lib/auth-actions';
import { redirect } from 'next/navigation';
import { getDb, bcrypt } from './db';
import ldap from 'ldapjs';


// Case-insensitive file finder
async function findFileCaseInsensitive(directory: string, filename: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseName = filename.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseName) {
                return file; // Return the actual filename with its original casing
            }
        }
        return null; // No match found
    } catch (error: any) {
        if (error.code === 'ENOENT') return null; // Directory doesn't exist is a valid case
        console.error(`[findFileCaseInsensitive] Error reading directory ${directory}:`, error);
        return null;
    }
}

// Helper to get all dynamic paths based on the resolved IVOXS root
async function getPaths() {
  const ivoxsRoot = await getResolvedIvoxsRootPath();
  const mainMenuFilename = await findFileCaseInsensitive(ivoxsRoot, 'mainmenu.xml');

  return {
    IVOXS_DIR: ivoxsRoot,
    MAINMENU_FILENAME: mainMenuFilename, // This will be the actual filename, or null
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

const sanitizeFilenamePart = (filenamePart: string): string => {
  const cleaned = filenamePart
    .replace(/\.\.+/g, '') // Remove sequences of dots
    .replace(/[/\\]+/g, '') // Remove slashes and backslashes
    .replace(/[^a-zA-Z0-9_.-]+/g, '_'); // Replace other invalid chars with underscore
  return cleaned || `invalid_name_${Date.now()}`; // Fallback for empty or fully invalid names
};


function generateIdFromName(name: string): string {
  const cleanedName = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Transliterate accented characters
    .replace(/[^a-zA-Z0-9\s_.-]/g, ''); // Allow specific characters, remove others
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
      // console.warn(`File not found during action: ${filePath}`); // Reduced verbosity
      return null;
    }
    console.error(`Error reading or parsing XML file ${filePath}:`, error);
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
  return fileName.replace(/\.xml$/i, '');
}

function getItemTypeFromUrl(url: string): 'branch' | 'locality' | 'zone' | 'unknown' | 'pagination' {
    const lowerUrl = url.toLowerCase();
    
    // Check for explicit directory paths first, which are used for Cisco phones
    if (lowerUrl.includes('/branch/')) return 'branch';
    if (lowerUrl.includes('/department/')) return 'locality';
    if (lowerUrl.includes('/zonebranch/')) return 'zone';

    // Then, check for the "clean" URL pattern used by the web app for pagination
    // e.g., /ZonaMetropolitana/ZonaMetropolitana2
    const urlParts = url.split('/').filter(p => p && !p.startsWith('http'));
    if(urlParts.length === 2 && urlParts[0].toLowerCase() === 'zonametropolitana' && urlParts[1].toLowerCase().startsWith(urlParts[0].toLowerCase()) && urlParts[1] !== urlParts[0]) {
        return 'pagination';
    }

    return 'unknown';
}

const itemTypeToDir: Record<'zone' | 'branch' | 'locality', string> = {
    zone: 'zonebranch',
    branch: 'branch',
    locality: 'department',
};


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
  return `${protocol}://${host}:${port}/${path.join(rootDirName, pathSegment).replace(/\\/g, '/')}`;
}


async function readFileContent(filePath: string): Promise<string> {
  try {
    const parsedMainMenu = await readAndParseXML(mainMenuPath);
    if (!parsedMainMenu || !parsedMainMenu.CiscoIPPhoneMenu) {
      const newMainMenuContent = {
        CiscoIPPhoneMenu: {
          Title: "Farmacia Carol", 
          Prompt: "Select a Zone Branch",
          MenuItem: [{ Name: zoneName, URL: newZoneUrl }]
        }
        fileToRead = nextUrl!;
        currentPage++;
    }

    // 2. Delete old pagination files
    for (const file of filesToDelete) {
        await fs.unlink(file).catch(e => console.warn(`Could not delete old pagination file ${file}: ${e.message}`));
    }
    
    // 3. Repaginate if necessary
    if (allItems.length > PAGINATION_LIMIT) {
        const totalPages = Math.ceil(allItems.length / PAGINATION_LIMIT);
        for (let i = 0; i < totalPages; i++) {
            const pageItems = allItems.slice(i * PAGINATION_LIMIT, (i + 1) * PAGINATION_LIMIT);
            const pageNum = i + 1;
            const pageName = `${menuName}${pageNum > 1 ? pageNum : ''}`;
            const pagePath = path.join(path.dirname(parentFilePath), `${pageName}.xml`);

            if (i > 0) { // Add "<< Anterior" button
                const prevPageName = `${menuName}${pageNum - 1 > 1 ? pageNum - 1 : ''}`;
                pageItems.unshift({ Name: '<< Anterior', URL: path.join('..', 'zonebranch', `${prevPageName}.xml`) });
            }
            if (i < totalPages - 1) { // Add "Siguiente >>" button
                const nextPageName = `${menuName}${pageNum + 1}`;
                pageItems.push({ Name: 'Siguiente >>', URL: path.join('..', 'zonebranch', `${nextPageName}.xml`) });
            }

            const pageContent = {
                CiscoIPPhoneMenu: {
                    Title: menuName,
                    Prompt: 'Select a Locality',
                    MenuItem: pageItems
                }
            };
            await buildAndWriteXML(pagePath, pageContent);
        }
    } else { // No pagination needed, create a single file
        const content = {
            CiscoIPPhoneMenu: {
                Title: menuName,
                Prompt: 'Select a Locality',
                MenuItem: allItems.length > 0 ? allItems : undefined
            }
        };
        await buildAndWriteXML(parentFilePath, content);
    }
}


// ===================
// CRUD Actions
// ===================

export async function addZoneAction(zoneName: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
      return { success: false, message: "Authentication required." };
  }
  
  const newZoneId = generateIdFromName(zoneName);
  const paths = await getPaths();
  if (!paths.MAINMENU_PATH) {
    return { success: false, message: "Main menu file (e.g., MainMenu.xml) not found in the directory root." };
  }
  const mainMenuPath = paths.MAINMENU_PATH;
  const newZoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${newZoneId}.xml`);
  const { protocol, host, port, rootDirName } = await getServiceUrlComponents();
  const newZoneURL = constructServiceUrl(protocol, host, port, rootDirName, `zonebranch/${newZoneId}.xml`);

  try {
    // 1. Create the new zone branch file
    const newZoneBranchContent = {
      CiscoIPPhoneMenu: {
        Title: zoneName,
        Prompt: "Select an item"
      }
    };
    await buildAndWriteXML(newZoneBranchFilePath, newZoneBranchContent);

    // 2. Add the new zone to MAINMENU.xml
    const mainMenu = await readAndParseXML(mainMenuPath) || { CiscoIPPhoneMenu: { MenuItem: [] } };
    mainMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
    mainMenu.CiscoIPPhoneMenu.MenuItem.push({
      Name: zoneName,
      URL: newZoneURL
    });
    await buildAndWriteXML(mainMenuPath, mainMenu);

    revalidatePath('/');
    return { success: true, message: `Zone "${zoneName}" added successfully.` };
  } catch (e: any) {
    console.error(`[addZoneAction] Error:`, e);
    return { success: false, message: `Failed to add zone "${zoneName}".`, error: e.message };
  }
}


export async function deleteZoneAction(zoneId: string): Promise<{ success: boolean, message: string, error?: string }> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
      return { success: false, message: "Authentication required." };
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
  const mainMenuPath = paths.MAINMENU_PATH;
  const zoneBranchFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);

  try {
    // 1. Read the zone branch file to find all associated branch/department files
    const zoneBranchContent = await readAndParseXML(zoneBranchFilePath);
    if (zoneBranchContent?.CiscoIPPhoneMenu?.MenuItem) {
        const menuItems = ensureArray(zoneBranchContent.CiscoIPPhoneMenu.MenuItem);
        for (const item of menuItems) {
            const itemId = extractIdFromUrl(item.URL);
            const itemType = getItemTypeFromUrl(item.URL);
            let itemPathToDelete = '';

            if (itemType === 'branch') {
                const branchFilePath = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
                // Optionally, delete sub-localities of the branch as well
                const branchContent = await readAndParseXML(branchFilePath);
                if(branchContent?.CiscoIPPhoneMenu?.MenuItem) {
                    const branchItems = ensureArray(branchContent.CiscoIPPhoneMenu.MenuItem);
                    for (const subItem of branchItems) {
                        const subItemId = extractIdFromUrl(subItem.URL);
                        const subItemPath = path.join(paths.DEPARTMENT_DIR, `${subItemId}.xml`);
                        await fs.unlink(subItemPath).catch(err => console.warn(`Could not delete department file ${subItemPath}: ${err.message}`));
                    }
                }
                itemPathToDelete = branchFilePath;

            } else if (itemType === 'locality') {
                itemPathToDelete = path.join(paths.DEPARTMENT_DIR, `${itemId}.xml`);
            }

            if(itemPathToDelete) {
                await fs.unlink(itemPathToDelete).catch(err => console.warn(`Could not delete file ${itemPathToDelete}: ${err.message}`));
            }
        }
    }

    // 2. Delete the zone branch file itself
    await fs.unlink(zoneBranchFilePath).catch(err => console.warn(`Could not delete zone branch file ${zoneBranchFilePath}: ${err.message}`));

    // 3. Remove the zone from MAINMENU.xml
    const mainMenu = await readAndParseXML(mainMenuPath);
    if (mainMenu?.CiscoIPPhoneMenu?.MenuItem) {
      const menuItems = ensureArray(mainMenu.CiscoIPPhoneMenu.MenuItem);
      mainMenu.CiscoIPPhoneMenu.MenuItem = menuItems.filter(item => extractIdFromUrl(item.URL) !== zoneId);
      await buildAndWriteXML(mainMenuPath, mainMenu);
    }

    revalidatePath('/');
    return { success: true, message: `Zone "${zoneId}" and its contents deleted successfully.` };
  } catch (e: any) {
    console.error(`[deleteZoneAction] Error:`, e);
    return { success: false, message: `Failed to delete zone "${zoneId}".`, error: e.message };
  }
}


export async function addLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemName: string;
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

    const { zoneId, branchId, itemName, itemType } = params;
    const newItemId = generateIdFromName(itemName);
    const paths = await getPaths();
    const { protocol, host, port, rootDirName } = await getServiceUrlComponents();
    
    let parentMenuPath, newItemPath, newUrlPath, revalidationPath;
    const subDir = itemTypeToDir[itemType];

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
    
    const newUrl = constructServiceUrl(protocol, host, port, rootDirName, newUrlPath);

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


        revalidatePath(revalidationPath);
        return { success: true, message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemName}" added successfully.` };
    } catch(e: any) {
        console.error(`[addLocalityOrBranchAction] Error:`, e);
        return { success: false, message: `Failed to add ${itemType} "${itemName}".`, error: e.message };
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
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
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

    const newUrl = constructServiceUrl(protocol, host, port, rootDirName, newUrlPath);

    try {
        // 1. Rename the item's XML file if ID changes
        if (oldItemId !== newItemId) {
            await fs.rename(oldItemPath, newItemPath);
        }

        // 2. Update the item's own title (if it's not a department file)
        const itemContent = await readAndParseXML(newItemPath);
        if (itemType === 'branch' && itemContent?.CiscoIPPhoneMenu) {
            itemContent.CiscoIPPhoneMenu.Title = newItemName;
        } 
        // Department files don't have a title, so no 'else if' needed
        await buildAndWriteXML(newItemPath, itemContent);

        // 3. Update the item in its parent menu
        const parentMenu = await readAndParseXML(parentMenuPath);
        let itemUpdated = false;
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            if (extractIdFromUrl(item.URL) === oldItemId) {
                item.Name = newItemName;
                item.URL = newUrl;
                itemUpdated = true;
            }
            return item;
        });
        if (itemUpdated) {
            await buildAndWriteXML(parentMenuPath, parentMenu);
        }

        revalidatePath(revalidationPath);
        revalidatePath(newItemPath); // Also revalidate the item's own page
        return { success: true, message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} updated to "${newItemName}" successfully.` };
    } catch(e: any) {
        console.error(`[editLocalityOrBranchAction] Error:`, e);
        return { success: false, message: `Failed to update ${itemType}.`, error: e.message };
    }
}


export async function deleteLocalityOrBranchAction(params: {
  zoneId: string;
  branchId?: string;
  itemId: string;
  itemType: 'branch' | 'locality';
}): Promise<{ success: boolean; message: string; error?: string }> {
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

    const { zoneId, branchId, itemId, itemType } = params;
    const paths = await getPaths();
    
    let parentMenuPath, itemPathToDelete, revalidationPath;

    if (itemType === 'branch') {
        parentMenuPath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        itemPathToDelete = path.join(paths.BRANCH_DIR, `${itemId}.xml`);
        revalidationPath = `/${zoneId}`;
    } else { // locality
        parentMenuPath = branchId 
            ? path.join(paths.BRANCH_DIR, `${branchId}.xml`)
            : path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
        itemPathToDelete = path.join(paths.DEPARTMENT_DIR, `${itemId}.xml`);
        revalidationPath = branchId ? `/${zoneId}/branches/${branchId}` : `/${zoneId}`;
    }

    try {
        // 1. Attempt to delete the item's own XML file, but don't fail if it doesn't exist.
        await fs.unlink(itemPathToDelete).catch(error => {
            if (error.code !== 'ENOENT') {
                // If it's an error other than "Not Found", re-throw it.
                throw error;
            }
            // If the file doesn't exist, we just log it and continue.
            console.warn(`[deleteLocalityOrBranchAction] File not found, skipping delete: ${itemPathToDelete}`);
        });

        // 2. Remove the item from its parent menu
        const parentMenu = await readAndParseXML(parentMenuPath);
        let itemRemoved = false;
        const originalLength = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).length;
        parentMenu.CiscoIPPhoneMenu.MenuItem = ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).filter((item: any) => {
            return extractIdFromUrl(item.URL) !== itemId;
        });
        
        if (ensureArray(parentMenu.CiscoIPPhoneMenu.MenuItem).length < originalLength) {
            itemRemoved = true;
        }

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

        // 3. Repaginate if the parent is ZonaMetropolitana
        if (zoneId.toLowerCase() === 'zonametropolitana') {
            await repaginateMenuItems(parentMenuPath, 'ZonaMetropolitana');
        }

        revalidatePath(revalidationPath);
        return { success: true, message: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${itemId}" deleted successfully.` };
    } catch (e: any) {
        console.error(`[deleteLocalityOrBranchAction] Error:`, e);
        return { success: false, message: `Failed to delete ${itemType} "${itemId}".`, error: e.message };
    }
}


export async function addExtensionAction(localityId: string, newName: string, newTelephone: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    if (!/^\d+$/.test(newTelephone)) {
        return { success: false, message: "Extension must be a valid number." };
    }
    
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath) || { CiscoIPPhoneDirectory: { DirectoryEntry: [] } };
        if (!department.CiscoIPPhoneDirectory) department.CiscoIPPhoneDirectory = {};
        
        department.CiscoIPPhoneDirectory.DirectoryEntry = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry);
        
        department.CiscoIPPhoneDirectory.DirectoryEntry.push({
            Name: newName,
            Telephone: newTelephone
        });
        
        await buildAndWriteXML(departmentFilePath, department);
        
        revalidatePath(`/`); // Revalidate all paths as extension could be in any zone/branch
        return { success: true, message: `Extension "${newName}" added to ${localityId}.` };
    } catch(e: any) {
        console.error(`[addExtensionAction] Error:`, e);
        return { success: false, message: `Failed to add extension to ${localityId}.`, error: e.message };
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
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const { localityId, oldExtensionName, oldExtensionNumber, newExtensionName, newExtensionNumber } = params;
    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    try {
        const department = await readAndParseXML(departmentFilePath);
        let extensionFoundAndUpdated = false;

        const updatedEntries = ensureArray(department.CiscoIPPhoneDirectory.DirectoryEntry).map((entry: any) => {
            if (entry.Name === oldExtensionName && entry.Telephone === oldExtensionNumber) {
                entry.Name = newExtensionName;
                entry.Telephone = newExtensionNumber;
                extensionFoundAndUpdated = true;
            }
            return entry;
        });

        if (extensionFoundAndUpdated) {
            department.CiscoIPPhoneDirectory.DirectoryEntry = updatedEntries;
            await buildAndWriteXML(departmentFilePath, department);
            revalidatePath(`/`);
            return { success: true, message: `Extension updated to "${newExtensionName}".` };
        } else {
            return { success: false, message: `Original extension not found.` };
        }
    } catch (e: any) {
        console.error(`[editExtensionAction] Error:`, e);
        return { success: false, message: `Failed to edit extension.`, error: e.message };
    }
}

    if (newExtensionName.trim() !== oldExtensionName || trimmedNewNumber !== oldExtensionNumber) {
      const conflictExists = directoryEntries.some(
        (entry, index) =>
          index !== entryIndex && 
          entry.Name === newExtensionName.trim() &&
          entry.Telephone === trimmedNewNumber
      );

export async function deleteExtensionAction(localityId: string, extensionName: string, extensionNumber: string): Promise<{ success: boolean; message: string; error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const paths = await getPaths();
    const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);

    directoryEntries[entryIndex].Name = newExtensionName.trim();
    directoryEntries[entryIndex].Telephone = trimmedNewNumber;

    directoryEntries.sort((a, b) => {
      const nameComparison = a.Name.localeCompare(b.Name);
      if (nameComparison !== 0) return nameComparison;
      return a.Telephone.localeCompare(b.Telephone);
    });

        if(extensionFoundAndRemoved) {
            await buildAndWriteXML(departmentFilePath, department);
            revalidatePath(`/`);
            return { success: true, message: `Extension "${extensionName}" deleted from ${localityId}.` };
        } else {
            return { success: false, message: "Extension not found in file."};
        }
    } catch (e: any) {
        console.error(`[deleteExtensionAction] Error:`, e);
        return { success: false, message: `Failed to delete extension.`, error: e.message };
    }
}


// ===================
// Settings and Import Actions
// ===================

export async function updateDirectoryRootPathAction(newPath: string): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) return { success: false, message: "Authentication required." };
    
    // This action is now deprecated as the path is fixed to `public/ivoxsdir`
    return { success: false, message: "This functionality is deprecated. The directory path is fixed to 'public/ivoxsdir' for stability."}
}

export async function updateXmlUrlsAction(host: string, port: string): Promise<{ success: boolean, message: string, error?: string }> {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        return { success: false, message: "Authentication required." };
    }

    const paths = await getPaths();
    const { protocol, rootDirName } = await getServiceUrlComponents();
    
    const updateUrlsInFile = async (filePath: string | null) => {
        if (!filePath) {
            console.warn("[updateXmlUrlsAction] Skipping update because file path is null.");
            return;
        }
        const fileContent = await readAndParseXML(filePath);
        if (!fileContent?.CiscoIPPhoneMenu?.MenuItem) return;

        fileContent.CiscoIPPhoneMenu.MenuItem = ensureArray(fileContent.CiscoIPPhoneMenu.MenuItem).map((item: any) => {
            const urlString = item.URL || '';
            const itemType = getItemTypeFromUrl(urlString);
            const itemId = extractIdFromUrl(urlString);

            if (itemType === 'zone' || itemType === 'branch' || itemType === 'locality') {
                const subDirectory = itemTypeToDir[itemType];
                const relativePath = `${subDirectory}/${itemId}.xml`;
                item.URL = constructServiceUrl(protocol, host, port, rootDirName, relativePath);
            } else if (itemType === 'pagination') {
                 // For pagination, the URL is a relative path for the web app, not a service URL for the phone
                item.URL = `/${itemId}`;
            }
             else {
                 console.warn(`[updateXmlUrlsAction] Could not process URL: ${item.URL}. It might be malformed or pointing to an unknown type.`);
            }
            return item;
        });
        await buildAndWriteXML(filePath, fileContent);
    };
    
    try {
        await updateUrlsInFile(paths.MAINMENU_PATH);

        const zoneFiles = await fs.readdir(paths.ZONE_BRANCH_DIR);
        for(const file of zoneFiles) {
            if(file.endsWith('.xml')) {
                await updateUrlsInFile(path.join(paths.ZONE_BRANCH_DIR, file));
            }
        }
        
        try {
            const branchFiles = await fs.readdir(paths.BRANCH_DIR);
            for(const file of branchFiles) {
                if(file.endsWith('.xml')) {
                    await updateUrlsInFile(path.join(paths.BRANCH_DIR, file));
                }
            }
        } catch (branchError: any) {
            if (branchError.code !== 'ENOENT') {
                throw branchError;
            }
             console.log("[updateXmlUrlsAction] 'branch' directory not found, skipping.");
        }


        revalidatePath('/', 'layout');
        return { success: true, message: "All XML menu URLs have been updated." };
    } catch (e: any) {
        return { success: false, message: "An error occurred while updating XML URLs.", error: e.message };
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

export async function syncNamesFromXmlFeedAction(feedUrlsString: string): Promise<SyncResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      success: false,
      message: "Authentication required.",
      updatedCount: 0,
      filesModified: 0,
      filesFailedToUpdate: 0,
      conflictedExtensions: [],
      missingExtensions: [],
    };
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

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[SyncFeed] Failed to fetch ${url}: ${response.statusText}`);
        continue;
      }
      const xmlContent = await response.text();
      const parsed = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
      const validated = CiscoIPPhoneDirectorySchema.safeParse(parsed.CiscoIPPhoneDirectory);

      if (validated.success) {
        const entries = ensureArray(validated.data.DirectoryEntry);
        for (const entry of entries) {
          if (!allFeedExtensions[entry.Telephone]) {
            allFeedExtensions[entry.Telephone] = [];
          }
        } catch (urlError) {
           // console.warn(`[processSingleXmlFileForHostUpdate] Skipped malformed URL "${menuItem.URL}" in ${filePath}: ${urlError}`);
        }
      }
    } catch (e: any) {
      console.warn(`[SyncFeed] Error processing feed ${url}:`, e.message);
    }
  }

    if (fileChanged) {
      await buildAndWriteXML(filePath, parsedXml); 
      // console.log(`[processSingleXmlFileForHostUpdate] Updated URLs in: ${filePath}`);
    } else {
      // console.log(`[processSingleXmlFileForHostUpdate] No URL changes needed for: ${filePath}`);
    }
  }

  let updatedCount = 0;
  let filesModified = 0;
  let filesFailedToUpdate = 0;
  const localExtensionsFound = new Set<string>();

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
    return { success: false, message: "Error reading local department directory.", error: e.message, updatedCount: 0, filesModified: 0, filesFailedToUpdate: 0, conflictedExtensions: [], missingExtensions: [] };
  }

  const missingExtensions: MissingExtensionInfo[] = [];
  for (const number in extensionsToUpdate) {
    if (!localExtensionsFound.has(number)) {
      missingExtensions.push({ number, name: extensionsToUpdate[number], sourceFeed: allFeedExtensions[number][0].sourceFeed });
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


  revalidatePath('/', 'layout');

  return {
    success: true,
    message: `Sync complete. ${updatedCount} extensions updated across ${filesModified} files.`,
    updatedCount,
    filesModified,
    filesFailedToUpdate,
    conflictedExtensions,
    missingExtensions,
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

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  if (query.trim().length < 2) {
    return [];
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

  const processMenu = async (filePath: string, context: {zoneId: string, zoneName: string, branchId?: string, branchName?: string}) => {
    const menuContent = await readFileContent(filePath);
    if (!menuContent) return;

  if (!localityData) {
    return;
  }


  if (!MAINMENU_PATH) {
    console.error(`[Search] Fatal: Main menu file (e.g., MainMenu.xml) not found at ${IVOXS_DIR}. Search cannot proceed.`);
    return [];
  }
  
  const mainMenuContent = await readFileContent(MAINMENU_PATH);
  if (mainMenuContent) {
    try {
      const parsedMainMenu = await parseStringPromise(mainMenuContent, { explicitArray: false, trim: true });
      const zones = ensureArray(parsedMainMenu.CiscoIPPhoneMenu.MenuItem);

      for (const zoneMenuItem of zones) {
          const zoneId = extractIdFromUrl(zoneMenuItem.URL);
          const zoneContext = { zoneId: zoneId, zoneName: zoneMenuItem.Name };
          
          const zoneFilePath = path.join(IVOXS_DIR, 'zonebranch', `${zoneId}.xml`);
          try {
            await fs.access(zoneFilePath);
            await processMenu(zoneFilePath, zoneContext);
          } catch {
            console.warn(`[Search] Zone file not found, skipping: ${zoneFilePath}`);
          }
      }
    } catch(e) {
      console.error(`[Search] Fatal: Could not process main menu file:`, e);
      return [];
    }
  }

  const resultsMap = new Map<string, GlobalSearchResult>();

  for (const [localityId, localityInfo] of allLocalities.entries()) {
      const localityNameMatch = localityInfo.name.toLowerCase().includes(lowerQuery);
      let matchingExtensions: MatchedExtension[] = [];

export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    // Allow search for guest users
  }

  if (!query || query.trim().length < 2) {
    return [];
  }

  const { getZones, getZoneItems, getBranchItems } = await import('@/lib/data');



      if (localityNameMatch || matchingExtensions.length > 0) {
          if (!resultsMap.has(localityId)) {
               resultsMap.set(localityId, {
                  localityId: localityId,
                  localityName: localityInfo.name,
                  zoneId: localityInfo.zoneId,
                  zoneName: localityInfo.zoneName,
                  branchId: localityInfo.branchId,
                  branchName: localityInfo.branchName,
                  fullPath: localityInfo.branchId
                      ? `/${localityInfo.zoneId}/branches/${localityInfo.branchId}/localities/${localityId}`
                      : `/${localityInfo.zoneId}/localities/${localityId}`,
                  localityNameMatch,
                  matchingExtensions,
              });
          } else {
              const existing = resultsMap.get(localityId)!;
              existing.matchingExtensions.push(...matchingExtensions);
              if (localityNameMatch) {
                  existing.localityNameMatch = true;
              }
          }
      }
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

