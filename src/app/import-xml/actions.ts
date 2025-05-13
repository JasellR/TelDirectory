'use server';

import { parseStringPromise } from 'xml2js';
import type { Zone, Locality, Extension } from '@/types';
import { addOrUpdateZones } from '@/lib/data';
import { z } from 'zod';

const ExtensionSchema = z.object({
  $: z.object({
    id: z.string(),
    department: z.string(),
    number: z.string(),
    name: z.string().optional(),
  }),
});

const LocalitySchema = z.object({
  $: z.object({
    id: z.string(),
    name: z.string(),
  }),
  extension: z.array(ExtensionSchema).optional(),
});

const ZoneSchema = z.object({
  $: z.object({
    id: z.string(),
    name: z.string(),
  }),
  locality: z.array(LocalitySchema).optional(),
});

const DirectoryDataSchema = z.object({
  directorydata: z.object({
    zone: z.array(ZoneSchema).optional(),
  }),
});

// Helper to ensure an element is an array, useful for xml2js when explicitArray: false
const ensureArray = <T>(item: T | T[] | undefined): T[] => {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

function transformParsedXmlToZones(parsedXml: any): Zone[] {
  try {
    const validatedData = DirectoryDataSchema.parse(parsedXml);
    const parsedZones = ensureArray(validatedData.directorydata.zone);

    return parsedZones.map((pz: z.infer<typeof ZoneSchema>): Zone => {
      const localities = ensureArray(pz.locality).map((pl: z.infer<typeof LocalitySchema>): Locality => {
        const extensions = ensureArray(pl.extension).map((pe: z.infer<typeof ExtensionSchema>): Extension => ({
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
    console.error("XML structure validation error:", error);
    throw new Error("Invalid XML structure or missing required fields.");
  }
}

export async function importZonesFromXml(xmlContent: string): Promise<{ success: boolean; message: string; error?: string }> {
  if (!xmlContent) {
    return { success: false, message: 'No XML content provided.' };
  }

  try {
    const parsedXml = await parseStringPromise(xmlContent, {
      explicitArray: false, // Handles single elements as objects, not arrays of one
      // attributeNamePrefix: '@_', // If you prefer attributes prefixed, default is '$'
      // charkey: '#', // If you have text content directly in tags
      // trim: true, // Trim whitespace from text nodes
      // explicitRoot: true, // The root element is directly accessible
    });
    
    const zonesToImport = transformParsedXmlToZones(parsedXml);

    if (zonesToImport.length === 0) {
      return { success: false, message: 'No zone data found in the XML or XML format is incorrect.' };
    }

    await addOrUpdateZones(zonesToImport);

    return { success: true, message: `${zonesToImport.length} zone(s) imported successfully.` };
  } catch (error: any) {
    console.error('Error importing XML:', error);
    return { success: false, message: 'Failed to import XML.', error: error.message || 'Unknown parsing error' };
  }
}
