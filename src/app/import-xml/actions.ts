
'use server';

import { parseStringPromise } from 'xml2js';
import type { Zone, Locality, Extension } from '@/types';
import { addOrUpdateZones, addOrUpdateLocalitiesForZone, addOrUpdateExtensionsForLocality, deleteLocality } from '@/lib/data';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

// Helper to generate URL-friendly IDs from names, also used for extension IDs from their names
const toUrlFriendlyId = (name: string): string => {
  if (!name) return `unnamed-${Date.now()}`; // Handle cases where name might be undefined or empty
  return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
};


const ExtensionSchema = z.object({
  $: z.object({
    id: z.string().min(1, "Extension ID cannot be empty"),
    department: z.string().min(1, "Extension department cannot be empty"),
    number: z.string().min(1, "Extension number cannot be empty"),
    name: z.string().optional(),
  }),
});

const LocalitySchema = z.object({
  $: z.object({
    id: z.string().min(1, "Locality ID cannot be empty"),
    name: z.string().min(1, "Locality name cannot be empty"),
  }),
  extension: z.preprocess(
    (val) => ensureArray(val as any[] | any | undefined | null),
    z.array(ExtensionSchema).optional()
  ),
});

const ZoneSchema = z.object({
  $: z.object({
    id: z.string().min(1, "Zone ID cannot be empty"),
    name: z.string().min(1, "Zone name cannot be empty"),
  }),
  locality: z.preprocess(
    (val) => ensureArray(val as any[] | any | undefined | null),
    z.array(LocalitySchema).optional()
  ),
});

// Schema for importing a full directory
const DirectoryDataSchema = z.object({
  directorydata: z.object({
    zone: z.preprocess(
      (val) => ensureArray(val as any[] | any | undefined | null),
      z.array(ZoneSchema).optional()
    ),
  }),
});

// Schema for importing a single zone file (root tag is &lt;Zone>)
const SingleZoneFileSchema = z.object({
  Zone: ZoneSchema,
});

// Schema for DirectoryEntry in CiscoIPPhoneDirectory (for extensions within a locality)
const DirectoryEntrySchema = z.object({
  Name: z.string().min(1, "DirectoryEntry Name cannot be empty"),
  Telephone: z.string().min(1, "DirectoryEntry Telephone cannot be empty"),
});

const LocalityExtensionsDataSchema = z.object({
  CiscoIPPhoneDirectory: z.object({
    DirectoryEntry: z.preprocess(
      (val) => ensureArray(val as any[] | any | undefined | null),
      z.array(DirectoryEntrySchema).optional()
    ),
    Title: z.string().optional(),
    Prompt: z.string().optional(),
  }),
});

// Schema for MenuItem in CiscoIPPhoneMenu (for localities within a zone branch)
const MenuItemSchema = z.object({
  Name: z.string().min(1, "MenuItem Name cannot be empty"),
  URL: z.string().optional(), 
});

const ZoneBranchMenuItemsSchema = z.object({
  CiscoIPPhoneMenu: z.object({
    MenuItem: z.preprocess(
      (val) => ensureArray(val as any[] | any | undefined | null),
      z.array(MenuItemSchema).optional()
    ),
    Title: z.string().optional(),
    Prompt: z.string().optional(),
  }),
});


// Helper function to transform parsed XML zone data (from Zod schema) to domain Zone type
function transformParsedXmlZoneToDomainZone(parsedZoneData: z.infer<typeof ZoneSchema>): Zone {
  const localitiesFromSchema = parsedZoneData.locality || [];
  const localities = localitiesFromSchema.map((pl): Locality => {
    const extensionsFromSchema = pl.extension || [];
    const extensions = extensionsFromSchema.map((pe): Extension => ({
      id: pe.$.id,
      department: pe.$.department,
      number: pe.$.number,
      name: pe.$.name,
    }));
    return {
      id: pl.$.id,
      name: pl.$.name,
      extensions: extensions,
    };
  });
  return {
    id: parsedZoneData.$.id,
    name: parsedZoneData.$.name,
    localities: localities,
  };
}


function transformDirectoryXmlToZones(parsedXml: any): Zone[] {
  try {
    const validatedData = DirectoryDataSchema.parse(parsedXml);
    const zonesFromSchema = validatedData.directorydata.zone || [];
    return zonesFromSchema.map(transformParsedXmlZoneToDomainZone);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
      throw new Error(`XML data (DirectoryData) does not match expected structure. Specific issues: ${messages.join('; ')}`);
    }
    console.error("Directory XML parsing/validation error:", error);
    throw new Error("Invalid Directory XML structure or missing required fields due to an unexpected parsing issue.");
  }
}

export async function importZonesFromXml(xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided.' };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const zonesToImport = transformDirectoryXmlToZones(parsedXml);

    if (zonesToImport.length === 0 && parsedXml.directorydata && (!parsedXml.directorydata.zone || parsedXml.directorydata.zone.length === 0) ) {
        return { success: true, message: 'XML is valid (DirectoryData) but contains no zone data to import.' };
    }
    
    if (zonesToImport.length === 0) {
      return { success: false, message: 'No zone data found in the Directory XML or XML format is incorrect. Please verify the XML structure against documentation (expected &lt;directorydata> root).' };
    }

    await addOrUpdateZones(zonesToImport);
    revalidatePath('/'); // Revalidate home page
    zonesToImport.forEach(zone => revalidatePath(`/${zone.id}`)); // Revalidate each zone page
    return { success: true, message: `${zonesToImport.length} zone(s) processed from Directory XML successfully.` };
  } catch (error: any) {
    console.error('Error importing Directory XML:', error);
    return { success: false, message: 'Failed to import Directory XML.', error: error.message || 'Unknown parsing error' };
  }
}

// Action for importing XML for a single zone definition (expects &lt;Zone> root)
export async function importSingleZoneXml(targetZoneId: string, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided for single zone import.' };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    
    const validationResult = SingleZoneFileSchema.safeParse(parsedXml);
    if (!validationResult.success) {
      const messages = validationResult.error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
      throw new Error(`Single Zone XML data does not match expected structure (expected &lt;Zone> root). Specific issues: ${messages.join('; ')}`);
    }

    const parsedZoneDataFromXml = validationResult.data.Zone;

    if (parsedZoneDataFromXml.$.id !== targetZoneId) {
      return { 
        success: false, 
        message: `The ID of the Zone in the XML ('${parsedZoneDataFromXml.$.id}') does not match the target zone ID ('${targetZoneId}').`,
      };
    }

    const domainZone = transformParsedXmlZoneToDomainZone(parsedZoneDataFromXml);

    await addOrUpdateLocalitiesForZone(targetZoneId, domainZone.localities, domainZone.name);
    revalidatePath(`/${targetZoneId}`); // Revalidate the specific zone page
    domainZone.localities.forEach(locality => revalidatePath(`/${targetZoneId}/${locality.id}`));


    return { success: true, message: `Data for zone '${domainZone.name}' (ID: ${targetZoneId}) imported successfully from &lt;Zone> XML. ${domainZone.localities.length} localities processed.` };
  } catch (error: any) {
    console.error(`Error importing &lt;Zone> XML for zone ${targetZoneId}:`, error);
    return { success: false, message: `Failed to import &lt;Zone> XML for zone ${targetZoneId}.`, error: error.message || 'Unknown parsing error' };
  }
}


// Transformation for Locality Extensions XML (CiscoIPPhoneDirectory > DirectoryEntry)
function transformLocalityExtensionsXmlToExtensions(parsedXml: any): Extension[] {
  try {
    const validatedData = LocalityExtensionsDataSchema.parse(parsedXml);
    const directoryEntries = validatedData.CiscoIPPhoneDirectory.DirectoryEntry || [];
    
    return directoryEntries.map((entry, index): Extension => ({
      id: toUrlFriendlyId(`${entry.Name}-${entry.Telephone}`) || `ext-${index}-${Date.now()}`, 
      department: entry.Name,
      number: entry.Telephone,
      name: undefined, 
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
      throw new Error(`Locality Extensions XML data does not match expected structure (CiscoIPPhoneDirectory > DirectoryEntry). Specific issues: ${messages.join('; ')}`);
    }
    console.error("Locality Extensions XML parsing/validation error:", error);
    throw new Error("Invalid Locality Extensions XML structure or missing required fields.");
  }
}

// Server Action for Locality Extensions Import (CiscoIPPhoneDirectory > DirectoryEntry)
export async function importExtensionsForLocalityXml(
  zoneId: string,
  localityId: string,
  xmlContent: string
): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided for locality extensions import.' };
  }
  if (!zoneId || !localityId) {
    return { success: false, message: 'Zone ID and Locality ID are required.'}
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const extensionsToImport = transformLocalityExtensionsXmlToExtensions(parsedXml);

    if (extensionsToImport.length === 0 && parsedXml.CiscoIPPhoneDirectory && (!parsedXml.CiscoIPPhoneDirectory.DirectoryEntry || parsedXml.CiscoIPPhoneDirectory.DirectoryEntry.length === 0)) {
      return { success: true, message: 'XML is valid (CiscoIPPhoneDirectory) but contains no DirectoryEntry data to import.' };
    }
    if (extensionsToImport.length === 0) {
       return { success: false, message: 'No DirectoryEntry data found in the XML or XML format is incorrect for locality extensions. Expected &lt;CiscoIPPhoneDirectory> root with &lt;DirectoryEntry> items.' };
    }

    await addOrUpdateExtensionsForLocality(zoneId, localityId, extensionsToImport);
    revalidatePath(`/${zoneId}/${localityId}`); // Revalidate the specific locality page

    return { 
      success: true, 
      message: `Successfully imported ${extensionsToImport.length} extensions for locality ID '${localityId}' in zone ID '${zoneId}'.` 
    };
  } catch (error: any) {
    console.error(`Error importing extensions XML for locality ${localityId} in zone ${zoneId}:`, error);
    return { 
      success: false, 
      message: `Failed to import extensions for locality ${localityId}.`, 
      error: error.message || 'Unknown parsing error' 
    };
  }
}

// New Transformation for Zone Branch Menu Items (CiscoIPPhoneMenu > MenuItem) to Localities
function transformZoneBranchMenuItemsToLocalities(parsedXml: any): Locality[] {
  try {
    const validatedData = ZoneBranchMenuItemsSchema.parse(parsedXml);
    const menuItems = validatedData.CiscoIPPhoneMenu.MenuItem || [];
    
    return menuItems.map((item): Locality => ({
      id: toUrlFriendlyId(item.Name), 
      name: item.Name,
      extensions: [], 
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
      throw new Error(`Zone Branch Localities XML data does not match expected structure (CiscoIPPhoneMenu > MenuItem). Specific issues: ${messages.join('; ')}`);
    }
    console.error("Zone Branch Localities XML parsing/validation error:", error);
    throw new Error("Invalid Zone Branch Localities XML structure or missing required fields.");
  }
}

// New Server Action for Zone Branch Localities Import (CiscoIPPhoneMenu > MenuItem)
export async function importZoneBranchMenuItemsXml(
  targetZoneId: string,
  xmlContent: string
): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided for zone branch localities import.' };
  }
  if (!targetZoneId) {
    return { success: false, message: 'Target Zone ID is required.' };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    const localitiesToImport = transformZoneBranchMenuItemsToLocalities(parsedXml);

    if (localitiesToImport.length === 0 && parsedXml.CiscoIPPhoneMenu && (!parsedXml.CiscoIPPhoneMenu.MenuItem || parsedXml.CiscoIPPhoneMenu.MenuItem.length === 0)) {
      return { success: true, message: 'XML is valid (CiscoIPPhoneMenu) but contains no MenuItem data to import as localities.' };
    }
    if (localitiesToImport.length === 0) {
       return { success: false, message: 'No MenuItem data found in the XML to import as localities. Expected &lt;CiscoIPPhoneMenu> root with &lt;MenuItem> items.' };
    }

    await addOrUpdateLocalitiesForZone(targetZoneId, localitiesToImport);
    revalidatePath(`/${targetZoneId}`); // Revalidate the specific zone page
    localitiesToImport.forEach(locality => revalidatePath(`/${targetZoneId}/${locality.id}`));


    return { 
      success: true, 
      message: `Successfully imported ${localitiesToImport.length} localities for zone ID '${targetZoneId}' from CiscoIPPhoneMenu XML.` 
    };
  } catch (error: any) {
    console.error(`Error importing localities from CiscoIPPhoneMenu XML for zone ${targetZoneId}:`, error);
    return { 
      success: false, 
      message: `Failed to import localities for zone ${targetZoneId} from CiscoIPPhoneMenu XML.`, 
      error: error.message || 'Unknown parsing error' 
    };
  }
}

export async function deleteLocalityAction(
  zoneId: string,
  localityId: string
): Promise<{ success: boolean; message: string; error?: string }> {
  if (!zoneId || !localityId) {
    return { success: false, message: 'Zone ID and Locality ID are required for deletion.' };
  }

  try {
    await deleteLocality(zoneId, localityId);
    revalidatePath(`/${zoneId}`); // Revalidate the zone page to reflect the deletion
    return { success: true, message: `Locality '${localityId}' deleted successfully from zone '${zoneId}'.` };
  } catch (error: any) {
    console.error(`Error deleting locality ${localityId} from zone ${zoneId}:`, error);
    return {
      success: false,
      message: `Failed to delete locality '${localityId}'.`,
      error: error.message || 'Unknown error during deletion.',
    };
  }
}

