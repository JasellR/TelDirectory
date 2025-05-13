
'use server';

import { parseStringPromise } from 'xml2js';
import type { Zone, Locality, Extension } from '@/types';
import { addOrUpdateZones } from '@/lib/data';
import { z } from 'zod';

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T>(item: T | T[] | undefined | null): T[] => {
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

const DirectoryDataSchema = z.object({
  directorydata: z.object({
    zone: z.preprocess(
      (val) => ensureArray(val as any[] | any | undefined | null),
      z.array(ZoneSchema).optional()
    ),
  }),
});


function transformParsedXmlToZones(parsedXml: any): Zone[] {
  try {
    const validatedData = DirectoryDataSchema.parse(parsedXml);
    
    const zonesFromSchema = validatedData.directorydata.zone || [];

    return zonesFromSchema.map((pz): Zone => {
      const localitiesFromSchema = pz.locality || [];
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
        id: pz.$.id,
        name: pz.$.name,
        localities: localities,
      };
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
      throw new Error(`XML data does not match expected structure. Specific issues: ${messages.join('; ')}`);
    }
    console.error("XML parsing/validation error:", error);
    throw new Error("Invalid XML structure or missing required fields due to an unexpected parsing issue.");
  }
}

export async function importZonesFromXml(xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided.' };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, {
      explicitArray: false, 
      // trim: true, // Already default
      // explicitRoot: true, // Already default
    });
    
    const zonesToImport = transformParsedXmlToZones(parsedXml);

    if (zonesToImport.length === 0 && !DirectoryDataSchema.safeParse(parsedXml).success) {
        // This case implies the XML might be empty or fundamentally malformed
        // before even trying to extract zones. The detailed error from transformParsedXmlToZones
        // would have been thrown if it passed basic parsing but failed schema.
        // If transformParsedXmlToZones itself didn't throw but returned empty, re-validate to get Zod errors.
        const validationResult = DirectoryDataSchema.safeParse(parsedXml);
        if(!validationResult.success) {
            const messages = validationResult.error.errors.map(e => `Field '${e.path.join('.')}': ${e.message}`);
            throw new Error(`XML data does not match expected structure. Specific issues: ${messages.join('; ')}`);
        }
        // If it's valid but empty, it's handled by the next check.
    }


    if (zonesToImport.length === 0 && parsedXml.directorydata && (!parsedXml.directorydata.zone || parsedXml.directorydata.zone.length === 0) ) {
        return { success: true, message: 'XML is valid but contains no zone data to import.' };
    }
    
    if (zonesToImport.length === 0) {
       // This means transformParsedXmlToZones did not throw but returned empty,
       // and it wasn't because of an empty <zone> array. This indicates some other issue
       // or a structure that parsed but didn't yield zones as expected by transform logic.
       // The error might have been caught and re-thrown by transformParsedXmlToZones.
       // To be safe, let's provide a fallback message if error isn't more specific.
      return { success: false, message: 'No zone data found in the XML or XML format is incorrect. Please verify the XML structure against documentation.' };
    }


    await addOrUpdateZones(zonesToImport);

    return { success: true, message: `${zonesToImport.length} zone(s) imported successfully.` };
  } catch (error: any) {
    console.error('Error importing XML:', error);
    // The error.message should now contain detailed Zod errors if they occurred in transformParsedXmlToZones
    return { success: false, message: 'Failed to import XML.', error: error.message || 'Unknown parsing error' };
  }
}

