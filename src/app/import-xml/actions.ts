
'use server';

import { parseStringPromise } from 'xml2js';
import type { Zone, Locality, Extension } from '@/types';
import { addOrUpdateZones, addOrUpdateLocalitiesForZone } from '@/lib/data';
import { z } from 'zod';

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T,>(item: T | T[] | undefined | null): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
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

// Schema for importing a single zone file (root tag is <Zone>)
const SingleZoneFileSchema = z.object({
  Zone: ZoneSchema,
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
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false });
    const zonesToImport = transformDirectoryXmlToZones(parsedXml);

    if (zonesToImport.length === 0 && parsedXml.directorydata && (!parsedXml.directorydata.zone || parsedXml.directorydata.zone.length === 0) ) {
        return { success: true, message: 'XML is valid (DirectoryData) but contains no zone data to import.' };
    }
    
    if (zonesToImport.length === 0) {
      return { success: false, message: 'No zone data found in the Directory XML or XML format is incorrect. Please verify the XML structure against documentation (expected <directorydata> root).' };
    }

    await addOrUpdateZones(zonesToImport);
    return { success: true, message: `${zonesToImport.length} zone(s) processed from Directory XML successfully.` };
  } catch (error: any) {
    console.error('Error importing Directory XML:', error);
    return { success: false, message: 'Failed to import Directory XML.', error: error.message || 'Unknown parsing error' };
  }
}

// Action for importing XML for a single zone
export async function importSingleZoneXml(targetZoneId: string, xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided for single zone import.' };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, { explicitArray: false });
    
    // Validate the structure for a single zone import (expects <Zone> as root)
    const validationResult = SingleZoneFileSchema.safeParse(parsedXml);
    if (!validationResult.success) {
      const messages = validationResult.error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
      throw new Error(`Single Zone XML data does not match expected structure (expected <Zone> root). Specific issues: ${messages.join('; ')}`);
    }

    const parsedZoneDataFromXml = validationResult.data.Zone;

    // Check if the ID in the XML matches the targetZoneId from the context
    if (parsedZoneDataFromXml.$.id !== targetZoneId) {
      return { 
        success: false, 
        message: `The ID of the Zone in the XML ('${parsedZoneDataFromXml.$.id}') does not match the target zone ID ('${targetZoneId}').`,
      };
    }

    const domainZone = transformParsedXmlZoneToDomainZone(parsedZoneDataFromXml);

    await addOrUpdateLocalitiesForZone(targetZoneId, domainZone.localities, domainZone.name);

    return { success: true, message: `Data for zone '${domainZone.name}' (ID: ${targetZoneId}) imported successfully. ${domainZone.localities.length} localities processed.` };
  } catch (error: any) {
    console.error(`Error importing XML for zone ${targetZoneId}:`, error);
    return { success: false, message: `Failed to import XML for zone ${targetZoneId}.`, error: error.message || 'Unknown parsing error' };
  }
}
