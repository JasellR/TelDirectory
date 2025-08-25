
'use server';

import fs from 'fs/promises';
import path from 'path';

// Ensure .config directory is at the project root, not within src
const CONFIG_DIR = path.join(process.cwd(), '.config');
const DIRECTORY_CONFIG_PATH = path.join(CONFIG_DIR, 'directory.config.json');

export interface DirectoryConfig {
  ivoxsRootPath: string | null;
}

export async function getDirectoryConfig(): Promise<DirectoryConfig> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(DIRECTORY_CONFIG_PATH, 'utf-8');
    const parsedData = JSON.parse(data);
    // Basic validation to ensure the object has the expected key
    if (parsedData && typeof parsedData.ivoxsRootPath !== 'undefined') {
      return { ivoxsRootPath: parsedData.ivoxsRootPath };
    }
    // If structure is unexpected, return default
    return { ivoxsRootPath: null };
  } catch (error) {
    // If file doesn't exist or is invalid JSON, it's not an application error, just means no config is set.
    return { ivoxsRootPath: null };
  }
}

export async function saveDirectoryConfig(config: DirectoryConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(DIRECTORY_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Resolves the root path for the ivoxsdir directory.
 * It will prioritize the custom path from the config file.
 * If no custom path is set, it defaults to 'ivoxsdir' in the project root.
 * This is the single source of truth for the data path.
 */
export async function getResolvedIvoxsRootPath(): Promise<string> {
  try {
    const config = await getDirectoryConfig();
    
    // If a custom path is set in the config, it is the source of truth.
    if (config.ivoxsRootPath) {
      // It's the user's responsibility to ensure this path is absolute and correct.
      // The application will use it as is.
      return config.ivoxsRootPath;
    }
  } catch (e) {
      // This catch block is for potential errors in getDirectoryConfig itself, though it's designed to be resilient.
      console.error("[Config] Error retrieving directory configuration. Falling back to default path.", e);
  }

  // If no custom path is configured or an error occurred, fall back to the default path.
  return path.join(process.cwd(), 'ivoxsdir');
}
