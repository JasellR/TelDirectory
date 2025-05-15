
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
    if (typeof parsedData.ivoxsRootPath === 'string' || parsedData.ivoxsRootPath === null) {
      return parsedData;
    }
    // If structure is unexpected, return default
    return { ivoxsRootPath: null };
  } catch (error) {
    // If file doesn't exist or is invalid, return default
    return { ivoxsRootPath: null };
  }
}

export async function saveDirectoryConfig(config: DirectoryConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(DIRECTORY_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Resolves the root path for the ivoxsdir directory.
 * Uses the path from directory.config.json if set, otherwise defaults to 'ivoxsdir' in the project root.
 */
export async function getResolvedIvoxsRootPath(): Promise<string> {
  const config = await getDirectoryConfig();
  if (config.ivoxsRootPath && path.isAbsolute(config.ivoxsRootPath)) {
    try {
      // Basic check: does the path exist and is it a directory?
      const stats = await fs.stat(config.ivoxsRootPath);
      if (stats.isDirectory()) {
        return config.ivoxsRootPath;
      } else {
        console.warn(`Configured ivoxsdir root path "${config.ivoxsRootPath}" is not a directory. Falling back to default.`);
      }
    } catch (error) {
      console.warn(`Error accessing configured ivoxsdir root path "${config.ivoxsRootPath}": ${error}. Falling back to default.`);
    }
  } else if (config.ivoxsRootPath) {
    console.warn(`Configured ivoxsdir root path "${config.ivoxsRootPath}" is not an absolute path. Falling back to default.`);
  }
  // Default to 'ivoxsdir' in the project root
  return path.join(process.cwd(), 'ivoxsdir');
}

