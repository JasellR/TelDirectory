import type { DirectoryData, Zone, Locality, Extension } from '@/types';

// Helper to generate URL-friendly IDs
const toUrlFriendlyId = (name: string) => {
  return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9-]/g, '');
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
      id: "este", // Matches 'ZonaEste' if needed for URL, but typically internal ID
      localities: zonaEsteLocalitiesFromXml,
    },
    {
      name: "Zona Norte",
      id: "norte",
      localities: [
        { 
          id: toUrlFriendlyId("Chalatenango"),
          name: "Chalatenango", 
          extensions: [
            { id: "ch-rh", department: "Recursos Humanos", number: "301" },
            { id: "ch-cont", department: "Contabilidad", number: "302", name: "Sofía Méndez" },
          ]
        },
        {
          id: toUrlFriendlyId("Santa Ana"),
          name: "Santa Ana",
          extensions: [
            { id: "sa-direccion", department: "Dirección General", number: "001", name: "Roberto Alvarado" },
            { id: "sa-marketing", department: "Marketing", number: "005" },
          ]
        }
      ],
    },
    {
      name: "Zona Sur",
      id: "sur",
      localities: [
        {
          id: toUrlFriendlyId("Usulután"),
          name: "Usulután",
          extensions: [
            { id: "us-atencion", department: "Atención al Cliente", number: "401" },
          ]
        }
      ]
    },
    {
      name: "Zona Metropolitana",
      id: "metropolitana", // Example: 'ZonaMetropolitana' if used in URL directly
      localities: [
        {
          id: toUrlFriendlyId("San Salvador"),
          name: "San Salvador",
          extensions: [
            { id: "ss-finanzas", department: "Finanzas", number: "501", name: "Elena Vásquez" },
            { id: "ss-it", department: "Tecnologías de Información", number: "502" },
            { id: "ss-operaciones", department: "Operaciones", number: "503" },
          ]
        }
      ]
    }
  ],
};

// Function to add or update localities and their extensions within a specific zone
export async function addOrUpdateLocalitiesForZone(zoneId: string, localitiesToImport: Locality[], newZoneName?: string): Promise<void> {
  const zoneIndex = mockDirectory.zones.findIndex(z => z.id === zoneId);
  if (zoneIndex === -1) {
    // Optionally, create the zone if it doesn't exist, or throw an error.
    // For now, let's assume the zone must exist for this specific import type.
    console.error(`Zone with id ${zoneId} not found. Cannot import localities.`);
    throw new Error(`Zone with id ${zoneId} not found.`);
  }

  const existingZone = mockDirectory.zones[zoneIndex];
  
  // Update zone name if provided and different
  if (newZoneName && existingZone.name !== newZoneName) {
    existingZone.name = newZoneName;
  }

  localitiesToImport.forEach(newLocality => {
    const existingLocalityIndex = existingZone.localities.findIndex(l => l.id === newLocality.id);
    if (existingLocalityIndex > -1) {
      // Update existing locality
      const existingLocality = existingZone.localities[existingLocalityIndex];
      existingLocality.name = newLocality.name; // Update name

      // Merge extensions: update existing ones, add new ones
      newLocality.extensions.forEach(newExtension => {
        const existingExtensionIndex = existingLocality.extensions.findIndex(e => e.id === newExtension.id);
        if (existingExtensionIndex > -1) {
          existingLocality.extensions[existingExtensionIndex] = newExtension; // Update
        } else {
          existingLocality.extensions.push(newExtension); // Add new
        }
      });
    } else {
      // Add new locality
      existingZone.localities.push(newLocality);
    }
  });
  console.log(`Localities for zone ${zoneId} updated (in-memory)`, existingZone);
}


// Function to add or update zones from imported data (full directory import)
export async function addOrUpdateZones(newZones: Zone[]): Promise<void> {
  newZones.forEach(newZone => {
    const existingZoneIndex = mockDirectory.zones.findIndex(z => z.id === newZone.id);
    if (existingZoneIndex > -1) {
      // Zone exists, update its name and localities
      mockDirectory.zones[existingZoneIndex].name = newZone.name;
      // Delegate locality and extension merging to the specialized function
      // This assumes newZone.localities contains all localities for this zone from the import
      addOrUpdateLocalitiesForZone(newZone.id, newZone.localities, newZone.name);
    } else {
      // Zone does not exist, add it
      // Ensure all localities and extensions are properly structured if it's a new zone.
      // The `newZone` object should already be in the correct domain format.
      mockDirectory.zones.push(newZone); 
    }
  });
  console.log("Directory data updated via full XML import (in-memory)", mockDirectory);
}


export async function getZones(): Promise<Zone[]> {
  return mockDirectory.zones;
}

export async function getZoneById(zoneId: string): Promise<Zone | undefined> {
  return mockDirectory.zones.find(zone => zone.id === zoneId || zone.name === zoneId || toUrlFriendlyId(zone.name) === zoneId);
}

export async function getLocalitiesByZoneId(zoneId: string): Promise<Locality[] | undefined> {
  const zone = await getZoneById(zoneId);
  return zone?.localities;
}

export async function getLocalityById(zoneId: string, localityId: string): Promise<Locality | undefined> {
  const localities = await getLocalitiesByZoneId(zoneId);
  return localities?.find(locality => locality.id === localityId);
}

export async function findLocalityByIdGlobally(localityId: string): Promise<Locality | undefined> {
  const zones = await getZones();
  for (const zone of zones) {
    const locality = zone.localities.find(l => l.id === localityId);
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

export async function getExtensionsByGlobalLocalityId(localityId: string): Promise<Extension[] | undefined> {
  const locality = await findLocalityByIdGlobally(localityId);
  return locality?.extensions;
}
