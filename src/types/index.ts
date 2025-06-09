
export interface Extension {
  id: string;
  department: string;
  number: string;
  name: string;
}

export interface Locality {
  id: string;
  name: string;
  extensions: Extension[];
}

export interface ZoneItem {
  id: string;
  name: string;
  type: 'branch' | 'locality';
}

export interface BranchItem {
 id: string;
 name: string;
 type: 'locality';
}

export interface Zone {
  id: string;
  name: string;
}

export interface Branch {
  id: string;
  name: string;
  zoneId: string;
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

// User Session
export interface UserSession {
  userId: number;
  username: string;
}

// Type for XML Sync Action Result
export interface SyncConflict {
  name: string;
  sourceFeed: string;
}
export interface ConflictedExtensionInfo {
  number: string;
  conflicts: SyncConflict[];
}
export interface MissingExtensionInfo {
  number: string;
  name: string;
  sourceFeed: string;
}
export interface SyncResult {
  success: boolean;
  message: string;
  updatedCount: number;
  filesModified: number;
  filesFailedToUpdate: number;
  conflictedExtensions: ConflictedExtensionInfo[];
  missingExtensions: MissingExtensionInfo[];
  error?: string;
}

// Type for CSV Import Action Result
export interface CsvImportError {
  row: number;
  data: string;
  error: string;
}
export interface CsvImportDetails {
  processedRows: number;
  extensionsAdded: number;
  newLocalitiesCreated: number;
  parentMenusUpdated: number;
  mainMenuUpdatedCount: number;
  errors: CsvImportError[];
}
export interface CsvImportResult {
  success: boolean;
  message: string;
  details?: CsvImportDetails;
  error?: string; // Added to match AD Sync
}

// Types for Active Directory Sync
export interface AdSyncFormValues {
  ldapServerUrl: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
  searchFilter?: string;
  displayNameAttribute: string;
  extensionAttribute: string;
  departmentAttribute: string;
  emailAttribute: string;
  phoneAttribute: string;
}

export interface AdSyncDetails {
  usersProcessed: number;
  extensionsAdded: number; // Number of DirectoryEntry items written
  localitiesCreated: number; // New department XML files
  localitiesUpdated: number; // Existing department XML files modified
  zoneCreated: boolean; // If "Active Directory Users" zone was newly created
  errorsEncountered: number;
}

export interface AdSyncResult {
  success: boolean;
  message: string;
  details?: AdSyncDetails;
  error?: string;
}
