
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
  // items: ZoneItem[]; // items are fetched dynamically now
}

export interface Branch {
  id: string;
  name: string;
  zoneId: string; // To trace back to parent zone
  // items: BranchItem[]; // items are fetched dynamically now
}


export interface DirectoryData {
  zones: Zone[];
}

// Types for Global Search
export interface MatchedExtension {
  name: string;
  number: string;
  matchedOn: 'extensionName' | 'extensionNumber';
}
export interface GlobalSearchResult {
  localityId: string;
  localityName: string;
  zoneId: string;
  branchId?: string;
  zoneName: string;
  branchName?: string;
  fullPath: string;
  localityNameMatch: boolean;
  matchingExtensions: MatchedExtension[];
}
