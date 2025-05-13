
import type { DirectoryData, Zone, Locality, Extension } from '@/types';

// Helper to generate URL-friendly IDs
const toUrlFriendlyId = (name: string): string => {
  if (!name) return 'unknown';
  return name.trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
};


// Updated localities for Zona Este based on the user's XML example
const zonaEsteLocalitiesFromXml: Locality[] = [
  { id: "Bavaro", name: "Bavaro", extensions: [] },
  { id: "BlueMallPuntaCana", name: "Blue Mall Punta Cana", extensions: [] },
  { id: "CasadeCampo", name: "Casa de Campo", extensions: [] },
  { id: "DowntownCenterPuntaCana", name: "Downtown Center Punta Cana", extensions: [] },
  { id: "Hemingway", name: "Hemingway", extensions: [] },
  { id: "Higuey", name: "Higuey", extensions: [] },
  { id: "JuanDolio", name: "Juan Dolio", extensions: [] },
  { id: "JumboLaRomana", name: "Jumbo La Romana", extensions: [] },
  { id: "JumboSanPedrodeMacoris", name: "Jumbo San Pedro de Macoris", extensions: [] },
  { id: "MUSASPM", name: "MUSA SPM", extensions: [] },
  { id: "Restauracion", name: "Restauracion", extensions: [] },
  { id: "Romana", name: "Romana", extensions: [] },
  { id: "RomanaMultiplaza", name: "Romana Multiplaza", extensions: [] },
  { id: "SPM", name: "SPM", extensions: [] },
  { id: "Veron", name: "Veron", extensions: [] },
  { id: "VillaHermosa", name: "Villa Hermosa", extensions: [] },
];

// Changed from const to let to allow modification for demo purposes
let mockDirectory: DirectoryData = {
  zones: [
    {
      name: "Zona Este",
      id: "este", 
      localities: zonaEsteLocalitiesFromXml,
    },
    {
      name: "Zona Norte",
      id: "norte",
      localities: [
        { 
          id: toUrlFriendlyId("Chalatenango"), // Example, can be updated with actual Zona Norte localities
          name: "Chalatenango", 
          extensions: [] // Extensions to be populated by import or specific locality XML
        },
        {
          id: toUrlFriendlyId("Santa Ana"), // Example
          name: "Santa Ana",
          extensions: [] 
        },
        // Add more localities for Zona Norte based on the provided XML structure if needed
        // e.g., { id: toUrlFriendlyId("Bibbia HOMS"), name: "Bibbia HOMS", extensions: [] },
        // For now, keeping it simple, assuming these are imported/managed elsewhere or are placeholders.
        // The user's XML for Zona Norte lists many localities.
        // We can pre-populate them here if desired for the demo, or assume they get imported.
        // For this change, the key is that `extensions` is `[]`.
        // Let's add a few from the user's example for Zona Norte:
        { id: toUrlFriendlyId("Bibbia HOMS"), name: "Bibbia HOMS", extensions: [] },
        { id: toUrlFriendlyId("Bonao"), name: "Bonao", extensions: [] },
        { id: toUrlFriendlyId("Bravo Santiago"), name: "Bravo Santiago", extensions: [] },
      ],
    },
    {
      name: "Zona Sur",
      id: "sur",
      localities: [
        {
          id: toUrlFriendlyId("Usulután"), // Example
          name: "Usulután",
          extensions: [] // Extensions to be populated by import or specific locality XML
        }
        // Add more localities for Zona Sur if known
      ]
    },
    {
      name: "Zona Metropolitana",
      id: "metropolitana",
      localities: [
        {
          id: toUrlFriendlyId("San Salvador"), // Example
          name: "San Salvador",
          extensions: [] // Extensions to be populated by import or specific locality XML
        }
        // Add more localities for Zona Metropolitana if known
      ]
    }
  ],
};

// Function to add or update localities and their extensions within a specific zone
export async function addOrUpdateLocalitiesForZone(zoneId: string, localitiesToImport: Locality[], newZoneName?: string): Promise<void> {
  const zoneIndex = mockDirectory.zones.findIndex(z => z.id === zoneId);
  if (zoneIndex === -1) {
    console.error(`Zone with id ${zoneId} not found. Cannot import localities.`);
    throw new Error(`Zone with id ${zoneId} not found.`);
  }

  const existingZone = mockDirectory.zones[zoneIndex];
  
  if (newZoneName && existingZone.name !== newZoneName) {
    existingZone.name = newZoneName;
  }

  localitiesToImport.forEach(newLocality => {
    const existingLocalityIndex = existingZone.localities.findIndex(l => l.id === newLocality.id);
    if (existingLocalityIndex > -1) {
      const existingLocality = existingZone.localities[existingLocalityIndex];
      existingLocality.name = newLocality.name; 

      // When importing localities for a zone, newLocality.extensions might contain extensions
      // This part merges/updates extensions if provided in the import.
      // If newLocality.extensions is empty, existing extensions are preserved unless overwritten.
      // For consistency with the request, we'll assume the import might overwrite extensions.
      existingLocality.extensions = newLocality.extensions || [];


    } else {
      // Ensure new locality also has an extensions array, even if empty.
      existingZone.localities.push({ ...newLocality, extensions: newLocality.extensions || [] });
    }
  });
  console.log(`Localities for zone ${zoneId} updated (in-memory).`);
}


// Function to add or update zones from imported data (full directory import)
export async function addOrUpdateZones(newZones: Zone[]): Promise<void> {
  newZones.forEach(newZone => {
    const existingZoneIndex = mockDirectory.zones.findIndex(z => z.id === newZone.id);
    if (existingZoneIndex > -1) {
      // Update existing zone's name
      mockDirectory.zones[existingZoneIndex].name = newZone.name;
      // Pass the localities from the newZone to update/add them
      // Ensure existing localities within this zone are correctly updated or preserved if not in newZone.localities.
      // The current addOrUpdateLocalitiesForZone will handle merging/adding.
      addOrUpdateLocalitiesForZone(newZone.id, newZone.localities, newZone.name);

    } else {
      // Add new zone with its localities and extensions
      // Ensure all nested structures have their extensions arrays initialized.
      const zoneToAdd: Zone = {
        ...newZone,
        localities: newZone.localities.map(loc => ({
          ...loc,
          extensions: loc.extensions || []
        }))
      };
      mockDirectory.zones.push(zoneToAdd); 
    }
  });
  console.log("Directory data updated via full XML import (in-memory).");
}

// Function to specifically update extensions for a given locality
export async function addOrUpdateExtensionsForLocality(zoneId: string, localityId: string, newExtensions: Extension[]): Promise<void> {
  const zone = mockDirectory.zones.find(z => z.id === zoneId);
  if (!zone) {
    console.error(`Zone with id ${zoneId} not found. Cannot update extensions for locality ${localityId}.`);
    throw new Error(`Zone with id ${zoneId} not found.`);
  }

  const locality = zone.localities.find(l => l.id === localityId || toUrlFriendlyId(l.name) === localityId);
  if (!locality) {
    console.error(`Locality with id ${localityId} in zone ${zoneId} not found. Cannot update extensions.`);
    throw new Error(`Locality with id ${localityId} in zone ${zoneId} not found.`);
  }

  // Replace all existing extensions with the new ones
  locality.extensions = newExtensions;
  console.log(`Extensions for locality ${localityId} (or ${toUrlFriendlyId(locality.name)}) in zone ${zoneId} updated (in-memory).`);
}


export async function getZones(): Promise<Zone[]> {
  return mockDirectory.zones;
}

export async function getZoneById(zoneId: string): Promise<Zone | undefined> {
  return mockDirectory.zones.find(zone => zone.id === zoneId || toUrlFriendlyId(zone.name) === zoneId);
}

export async function getLocalitiesByZoneId(zoneId: string): Promise<Locality[] | undefined> {
  const zone = await getZoneById(zoneId);
  return zone?.localities;
}

export async function getLocalityById(zoneId: string, localityId: string): Promise<Locality | undefined> {
  const localities = await getLocalitiesByZoneId(zoneId);
  return localities?.find(locality => locality.id === localityId || toUrlFriendlyId(locality.name) === localityId);
}

export async function findLocalityByIdGlobally(localityId: string): Promise<Locality | undefined> {
  const zones = await getZones();
  for (const zone of zones) {
    // Check against both original ID and URL-friendly ID
    const locality = zone.localities.find(l => l.id === localityId || toUrlFriendlyId(l.name) === localityId);
    if (locality) {
      return locality;
    }
  }
  return undefined;
}


export async function getExtensionsByLocalityId(zoneId: string, localityId: string): Promise<Extension[] | undefined> {
  const locality = await getLocalityById(zoneId, localityId); 
  return locality?.extensions;
}

// This function might be used by department/[localityId].xml if zoneId is not available in URL
export async function getExtensionsByGlobalLocalityId(localityId: string): Promise<Extension[] | undefined> {
  const locality = await findLocalityByIdGlobally(localityId);
  return locality?.extensions;
}

// Function to populate Zona Norte with its specific localities as per user's XML example
function populateZonaNorteLocalities() {
  const zonaNorte = mockDirectory.zones.find(z => z.id === 'norte');
  if (zonaNorte) {
    const norteLocalities: Locality[] = [
      { id: toUrlFriendlyId("Bibbia HOMS"), name: "Bibbia HOMS", extensions: [] },
      { id: toUrlFriendlyId("Bonao"), name: "Bonao", extensions: [] },
      { id: toUrlFriendlyId("Bravo Santiago"), name: "Bravo Santiago", extensions: [] },
      { id: toUrlFriendlyId("Colinas Mall"), name: "Colinas Mall", extensions: [] },
      { id: toUrlFriendlyId("El Encanto"), name: "El Encanto", extensions: [] },
      { id: toUrlFriendlyId("Embrujo"), name: "Embrujo", extensions: [] },
      { id: toUrlFriendlyId("Estrella Sadhala"), name: "Estrella Sadhala", extensions: [] },
      { id: toUrlFriendlyId("Galerias Del Atlantico"), name: "Galerias Del Atlantico", extensions: [] },
      { id: toUrlFriendlyId("Gurabito"), name: "Gurabito", extensions: [] },
      { id: toUrlFriendlyId("Gurabo"), name: "Gurabo", extensions: [] },
      { id: toUrlFriendlyId("La Normal"), name: "La Normal", extensions: [] },
      { id: toUrlFriendlyId("La Rinconada"), name: "La Rinconada", extensions: [] },
      { id: toUrlFriendlyId("Las Terrenas"), name: "Las Terrenas", extensions: [] },
      { id: toUrlFriendlyId("Los Jardines"), name: "Los Jardines", extensions: [] },
      { id: toUrlFriendlyId("Los Jazmines"), name: "Los Jazmines", extensions: [] },
      { id: toUrlFriendlyId("LS Bartolome Colon"), name: "LS Bartolome Colon", extensions: [] },
      { id: toUrlFriendlyId("LS del Sol"), name: "LS del Sol", extensions: [] },
      { id: toUrlFriendlyId("LS San Francisco de Macoris"), name: "LS San Francisco de Macoris", extensions: [] },
      { id: toUrlFriendlyId("Moca"), name: "Moca", extensions: [] },
      { id: toUrlFriendlyId("Plaza Porvenir"), name: "Plaza Porvenir", extensions: [] },
      { id: toUrlFriendlyId("Portal del Norte"), name: "Portal del Norte", extensions: [] },
      { id: toUrlFriendlyId("Samana"), name: "Samana", extensions: [] },
      { id: toUrlFriendlyId("San Francisco de Macoris"), name: "San Francisco de Macoris", extensions: [] },
      { id: toUrlFriendlyId("SN EMBRUJO"), name: "SN EMBRUJO", extensions: [] },
      { id: toUrlFriendlyId("SN Estrella Sadhala"), name: "SN Estrella Sadhala", extensions: [] },
      { id: toUrlFriendlyId("SN Villa Olga"), name: "SN Villa Olga", extensions: [] },
      { id: toUrlFriendlyId("Sosua"), name: "Sosua", extensions: [] },
    ];
    // Filter out any placeholder localities previously added, then add the new list.
    // This ensures no duplicates if this function is called multiple times or if placeholders existed.
    const existingPlaceholderNames = ["Chalatenango", "Santa Ana"];
    zonaNorte.localities = zonaNorte.localities.filter(loc => !existingPlaceholderNames.includes(loc.name));
    
    norteLocalities.forEach(newLoc => {
        if (!zonaNorte.localities.find(exLoc => exLoc.id === newLoc.id)) {
            zonaNorte.localities.push(newLoc);
        }
    });
  }
}

// Populate Zona Norte with its specific localities.
// This ensures that if `getZoneById('norte')` is called, it returns these localities.
populateZonaNorteLocalities();

    