import type { DirectoryData, Zone, Locality, Extension } from '@/types';

// Changed from const to let to allow modification for demo purposes
let mockDirectory: DirectoryData = {
  zones: [
    {
      name: "Zona Este",
      id: "este",
      localities: [
        { 
          id: "san-miguel",
          name: "San Miguel", 
          extensions: [
            { id: "sm-ventas", department: "Ventas", number: "101", name: "Juan Pérez" },
            { id: "sm-soporte", department: "Soporte Técnico", number: "102" },
            { id: "sm-gerencia", department: "Gerencia", number: "100", name: "Ana Gómez" },
          ] 
        },
        { 
          id: "la-union",
          name: "La Unión", 
          extensions: [
            { id: "lu-admin", department: "Administración", number: "201", name: "Carlos López" },
            { id: "lu-bodega", department: "Bodega", number: "202" },
          ] 
        },
      ],
    },
    {
      name: "Zona Norte",
      id: "norte",
      localities: [
        { 
          id: "chalatenango",
          name: "Chalatenango", 
          extensions: [
            { id: "ch-rh", department: "Recursos Humanos", number: "301" },
            { id: "ch-cont", department: "Contabilidad", number: "302", name: "Sofía Méndez" },
          ]
        },
        {
          id: "santa-ana",
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
          id: "usulutan",
          name: "Usulután",
          extensions: [
            { id: "us-atencion", department: "Atención al Cliente", number: "401" },
          ]
        }
      ]
    },
    {
      name: "Zona Metropolitana",
      id: "metropolitana",
      localities: [
        {
          id: "san-salvador",
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
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  return mockDirectory.zones.find(zone => zone.id === zoneId);
}

export async function getLocalitiesByZoneId(zoneId: string): Promise<Locality[] | undefined> {
  // await delay(100);
  const zone = await getZoneById(zoneId);
  return zone?.localities;
}

export async function getLocalityById(zoneId: string, localityId: string): Promise<Locality | undefined> {
  // await delay(100);
  const localities = await getLocalitiesByZoneId(zoneId);
  return localities?.find(locality => locality.id === localityId);
}

export async function getExtensionsByLocalityId(zoneId: string, localityId: string): Promise<Extension[] | undefined> {
  // await delay(100);
  const locality = await getLocalityById(zoneId, localityId);
  return locality?.extensions;
}
