
// Basic types to represent the expected structure of parsed XML objects.
// These are simplified and may need to be more robust depending on xml2js parsing options (e.g., explicitArray).

export interface MenuItem {
  Name: string;
  URL: string;
}

export interface CiscoIPPhoneMenu {
  Title?: string;
  Prompt?: string;
  MenuItem?: MenuItem[] | MenuItem; // Can be single or array
}

export interface DirectoryEntry {
  Name: string;      // Department name
  Telephone: string; // Extension number
}

export interface CiscoIPPhoneDirectory {
  Title?: string;
  Prompt?: string;
  DirectoryEntry?: DirectoryEntry[] | DirectoryEntry; // Can be single or array
}
