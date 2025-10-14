
'use server';

import fs from 'fs/promises';
import path from 'path';
import type { DirectoryConfig } from '@/types';

// Ensure .config directory is at the project root, not within src
const CONFIG_DIR = path.join(process.cwd(), '.config');
const DIRECTORY_CONFIG_PATH = path.join(CONFIG_DIR, 'directory.config.json');

const DEFAULT_CONFIG: DirectoryConfig = {
  ivoxsRootPath: path.join(process.cwd(), 'public', 'ivoxsdir'),
  host: '127.0.0.1',
  port: '3000',
};


export async function getDirectoryConfig(): Promise<DirectoryConfig> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(DIRECTORY_CONFIG_PATH, 'utf-8');
    const parsedData = JSON.parse(data);
    
    // Return a merged object with defaults for any missing properties
    return { ...DEFAULT_CONFIG, ...parsedData };
  } catch (error) {
    // If file doesn't exist or is invalid JSON, return the full default config
    return DEFAULT_CONFIG;
  }
}

export async function saveDirectoryConfig(newConfig: Partial<DirectoryConfig>): Promise<void> {
  const currentConfig = await getDirectoryConfig();
  const mergedConfig = { ...currentConfig, ...newConfig };
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(DIRECTORY_CONFIG_PATH, JSON.stringify(mergedConfig, null, 2));
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
