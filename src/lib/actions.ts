
'use server';

import fs from 'fs/promises';
import path from 'path';
import { parseStringPromise, Builder } from 'xml2js';
import { revalidatePath } from 'next/cache';
import type { GlobalSearchResult, MatchedExtension, Extension } from '@/types';
import { CiscoIPPhoneMenuSchema, CiscoIPPhoneDirectorySchema } from '@/lib/data';
import { getResolvedIvoxsRootPath, saveDirectoryConfig as saveDirConfig } from '@/lib/config';
import { isAuthenticated } from '@/lib/auth-actions';
import { redirect } from 'next/navigation';


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
  const contentWithoutBuilderDecl = xmlContentBuiltByBuilder.replace(/^<\?xml.+?\?>\s*/, '');
  const finalXmlString = xmlDeclaration + contentWithoutBuilderDecl.trim();


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

// Helper to get configured service URL components
async function getServiceUrlComponents(paths: Awaited<ReturnType<typeof getIvoxsPaths>>): Promise<{ protocol: string, host: string, port: string }> {
  const networkConfigPath = path.join(paths.IVOXS_DIR, '.config.json');
  let protocol = 'http';
  let host = '127.0.0.1';
  let port = '3000';
  try {
    const netConfigData = await fs.readFile(networkConfigPath, 'utf-8');
    const netConfig = JSON.parse(netConfigData);
    if (netConfig.protocol) protocol = netConfig.protocol;
    if (netConfig.host) host = netConfig.host;
    if (netConfig.port) port = netConfig.port;
  } catch (e) {
    // console.warn(`[getServiceUrlComponents] Network config for XML URLs at ${networkConfigPath} not found or unreadable. Using defaults.`);
  }
  return { protocol, host, port };
}

function constructServiceUrl(protocol: string, host: string, port: string, pathSegment: string): string {
  let baseUrl = `${protocol}://${host}`;
  if (port && !((protocol === 'http' && port === '80') || (protocol === 'https' && port === '443'))) {
    baseUrl += `:${port}`;
  }
  return `${baseUrl}${pathSegment}`;
}


export async function loginAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE username = ?', username);
  if (!user) {
    return { error: 'Invalid username or password.' };
  }

  const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

  if (!passwordMatch) {
    return { error: 'Invalid username or password.' };
  }
  
  const sessionData = { userId: user.id, username: user.username };
  cookies().set(AUTH_COOKIE_NAME, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });

  return { success: true };
}


export async function searchAllDepartmentsAndExtensionsAction(query: string): Promise<GlobalSearchResult[]> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    console.warn('[GlobalSearch] Unauthenticated search attempt.');
    return [];
  }

  if (query.trim().length < 2) {
    return [];
  }

  const paths = await getPaths();
  const lowerQuery = query.toLowerCase();

  const mainMenuContent = await readFileContent(path.join(paths.IVOXS_DIR, paths.MAINMENU_FILENAME));
  if (!mainMenuContent) {
    console.error('[GlobalSearch] MainMenu.xml is empty or not found.');
    return [];
  }
  const parsedMainMenu = await parseStringPromise(mainMenuContent, { explicitArray: false, trim: true });
  const mainMenu = CiscoIPPhoneMenuSchema.safeParse(parsedMainMenu.CiscoIPPhoneMenu);

  if (!mainMenu.success) {
    console.error('[GlobalSearch] Could not parse MainMenu.xml:', mainMenu.error);
    return [];
  }

  const zones = ensureArray(mainMenu.data.MenuItem);
  let allResults: GlobalSearchResult[] = [];

  for (const zoneMenuItem of zones) {
    const zoneId = extractIdFromUrl(zoneMenuItem.URL);
    const zoneName = zoneMenuItem.Name;
    const zoneResults = await processZone(paths, zoneId, zoneName, lowerQuery);
    allResults = allResults.concat(zoneResults);
  }

  return allResults;
}

async function processZone(paths: Awaited<ReturnType<typeof getIvoxsPaths>>, zoneId: string, zoneName: string, lowerQuery: string): Promise<GlobalSearchResult[]> {
  const zoneFilePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
  const zoneContent = await readFileContent(zoneFilePath);
  if (!zoneContent) return [];

  const parsedZone = await parseStringPromise(zoneContent, { explicitArray: false, trim: true });
  const zoneMenu = CiscoIPPhoneMenuSchema.safeParse(parsedZone.CiscoIPPhoneMenu);

  if (!zoneMenu.success) return [];
  const zoneItems = ensureArray(zoneMenu.data.MenuItem);
  let results: GlobalSearchResult[] = [];

  for (const item of zoneItems) {
    const itemType = getItemTypeFromUrl(item.URL);
    const itemId = extractIdFromUrl(item.URL);
    const itemName = item.Name;

    if (itemType === 'branch') {
      const branchResults = await processBranch(paths, itemId, itemName, zoneId, zoneName, lowerQuery);
      results = results.concat(branchResults);
    } else if (itemType === 'locality') {
      const localityResult = await processLocality(paths, itemId, itemName, zoneId, zoneName, lowerQuery);
      if (localityResult) {
        results.push(localityResult);
      }
    }
  }
  return results;
}

async function processBranch(paths: Awaited<ReturnType<typeof getIvoxsPaths>>, branchId: string, branchName: string, zoneId: string, zoneName: string, lowerQuery: string): Promise<GlobalSearchResult[]> {
  const branchFilePath = path.join(paths.BRANCH_DIR, `${branchId}.xml`);
  const branchContent = await readFileContent(branchFilePath);
  if (!branchContent) return [];

  const parsedBranch = await parseStringPromise(branchContent, { explicitArray: false, trim: true });
  const branchMenu = CiscoIPPhoneMenuSchema.safeParse(parsedBranch.CiscoIPPhoneMenu);

  if (!branchMenu.success) return [];
  const branchItems = ensureArray(branchMenu.data.MenuItem);
  let results: GlobalSearchResult[] = [];

  for (const item of branchItems) {
    const localityId = extractIdFromUrl(item.URL);
    const localityName = item.Name;
    const localityResult = await processLocality(paths, localityId, localityName, zoneId, zoneName, lowerQuery, branchId, branchName);
    if (localityResult) {
      results.push(localityResult);
    }
  }
  return results;
}

async function processLocality(
  paths: Awaited<ReturnType<typeof getIvoxsPaths>>,
  localityId: string,
  localityName: string,
  zoneId: string,
  zoneName: string,
  lowerQuery: string,
  branchId?: string,
  branchName?: string
): Promise<GlobalSearchResult | null> {
  const departmentFilePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
  const departmentContent = await readFileContent(departmentFilePath);
  
  // Use the name from the parent menu as the initial display name
  let currentLocalityDisplayName = localityName;
  let localityNameMatch = currentLocalityDisplayName.toLowerCase().includes(lowerQuery);
  const matchingExtensions: MatchedExtension[] = [];

  if (departmentContent) {
    try {
      const parsedDept = await parseStringPromise(departmentContent, { explicitArray: false, trim: true });
      const validatedDept = CiscoIPPhoneDirectorySchema.safeParse(parsedDept.CiscoIPPhoneDirectory);
      
      if (validatedDept.success) {
        // If the department file has a Title, it's more authoritative.
        if (validatedDept.data.Title) {
          currentLocalityDisplayName = validatedDept.data.Title;
          // Re-check if the title matches if the menu name didn't
          if (!localityNameMatch) {
            localityNameMatch = currentLocalityDisplayName.toLowerCase().includes(lowerQuery);
          }
        }
        
        const extensions = ensureArray(validatedDept.data.DirectoryEntry);
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
      }
    } catch (e) {
      console.error(`Error parsing department file ${departmentFilePath}:`, e);
    }
  }

  if (localityNameMatch || matchingExtensions.length > 0) {
    return {
      localityId,
      localityName: currentLocalityDisplayName,
      zoneId,
      zoneName,
      branchId,
      branchName,
      fullPath: branchId
        ? `/${zoneId}/branches/${branchId}/localities/${localityId}`
        : `/${zoneId}/localities/${localityId}`,
      localityNameMatch,
      matchingExtensions,
    };
  }

  return null;
}
