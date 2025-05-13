
export interface Extension {
  id: string;
  department: string;
  number: string;
  name?: string; // Optional contact person
}

export interface Locality {
  id: string; // for URL slug
  name: string;
  extensions: Extension[];
}

export interface Zone {
  id: string; // for URL slug
  name: string;
  localities: Locality[];
}

export interface DirectoryData {
  zones: Zone[];
}
