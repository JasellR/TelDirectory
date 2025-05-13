
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

export interface ZoneItem {
  id: string;
  name: string;
  type: 'branch' | 'locality'; // Type of item listed under a zone
}

export interface BranchItem {
 id: string;
 name: string;
 type: 'locality'; // Items under a branch are always localities
}

export interface Zone {
  id: string; // for URL slug
  name: string;
  items: ZoneItem[]; // Can list branches or localities
}

export interface Branch {
  id: string;
  name: string;
  zoneId: string; // To trace back to parent zone
  items: BranchItem[]; // Lists localities
}


export interface DirectoryData {
  zones: Zone[];
}
