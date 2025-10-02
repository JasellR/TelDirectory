
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
 * This version is updated to ALWAYS point to the `public/ivoxsdir` directory,
 * as serving XMLs statically is the correct architectural approach for this app.
 * The ability to configure a custom path is removed to simplify logic and prevent errors.
 */
export async function getResolvedIvoxsRootPath(): Promise<string> {
  // This function now returns a static, reliable path.
  // All file operations (read, write, delete) for the directory
  // will correctly target the publicly served directory.
  return path.join(process.cwd(), 'public', 'ivoxsdir');
}
