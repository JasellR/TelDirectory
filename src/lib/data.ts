import type { DirectoryData, Zone, Locality, Extension } from '@/types';

const mockDirectory: DirectoryData = {
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
