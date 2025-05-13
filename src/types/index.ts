
export interface Extension {
  id: string;
  department: string; // This is the 'Name' field from CiscoIPPhoneDirectoryEntry (e.g., "S BAVARO CAJ1")
  number: string;
  name: string; // This is also derived from 'Name' field. Can be department role or contact.
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
