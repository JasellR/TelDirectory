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

// Simulate API delay
// const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to add or update zones from imported data
// In a real app, this would interact with a database or persistent storage.
export async function addOrUpdateZones(newZones: Zone[]): Promise<void> {
  // await delay(100);
  newZones.forEach(newZone => {
    const existingZoneIndex = mockDirectory.zones.findIndex(z => z.id === newZone.id);
    if (existingZoneIndex > -1) {
      // Merge localities: update existing ones, add new ones
      const existingZone = mockDirectory.zones[existingZoneIndex];
      newZone.localities.forEach(newLocality => {
        const existingLocalityIndex = existingZone.localities.findIndex(l => l.id === newLocality.id);
        if (existingLocalityIndex > -1) {
           // Merge extensions: update existing ones, add new ones
          const existingLocality = existingZone.localities[existingLocalityIndex];
          newLocality.extensions.forEach(newExtension => {
            const existingExtensionIndex = existingLocality.extensions.findIndex(e => e.id === newExtension.id);
            if (existingExtensionIndex > -1) {
              existingLocality.extensions[existingExtensionIndex] = newExtension; // Update
            } else {
              existingLocality.extensions.push(newExtension); // Add new
            }
          });
          // Update locality name if changed
          existingLocality.name = newLocality.name;

        } else {
          existingZone.localities.push(newLocality); // Add new locality
        }
      });
      // Update zone name if changed
      existingZone.name = newZone.name;

    } else {
      mockDirectory.zones.push(newZone); // Add new zone
    }
  });
  console.log("Directory data updated via XML import (in-memory)", mockDirectory);
}


export async function getZones(): Promise<Zone[]> {
  // await delay(100); // Simulate API call
  return mockDirectory.zones;
}

export async function getZoneById(zoneId: string): Promise<Zone | undefined> {
  // await delay(100);
  // Normalize zoneId comparison if needed, e.g. to match 'ZonaEste' with 'este'
  // For now, assumes zoneId matches the 'id' property in mockDirectory.zones
  return mockDirectory.zones.find(zone => zone.id === zoneId || zone.name === zoneId || toUrlFriendlyId(zone.name) === zoneId);
}

export async function getLocalitiesByZoneId(zoneId: string): Promise<Locality[] | undefined> {
  // await delay(100);
  const zone = await getZoneById(zoneId);
  return zone?.localities;
}

// This function is kept for internal UI use if needed, but API will use findLocalityByIdGlobally
export async function getLocalityById(zoneId: string, localityId: string): Promise<Locality | undefined> {
  // await delay(100);
  const localities = await getLocalitiesByZoneId(zoneId);
  return localities?.find(locality => locality.id === localityId);
}

export async function findLocalityByIdGlobally(localityId: string): Promise<Locality | undefined> {
  // await delay(100);
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
  // await delay(100);
  const locality = await getLocalityById(zoneId, localityId); // This might need to change if zoneId isn't available
  return locality?.extensions;
}

export async function getExtensionsByGlobalLocalityId(localityId: string): Promise<Extension[] | undefined> {
  // await delay(100);
  const locality = await findLocalityByIdGlobally(localityId);
  return locality?.extensions;
}