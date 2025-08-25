
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
 * It will prioritize the custom path from the config file.
 * If no custom path is set, it defaults to 'ivoxsdir' in the project root.
 */
export async function getResolvedIvoxsRootPath(): Promise<string> {
  const config = await getDirectoryConfig();
  
  if (config.ivoxsRootPath && path.isAbsolute(config.ivoxsRootPath)) {
    // If a custom, absolute path is provided, use it directly.
    // The responsibility for the path's existence and permissions lies with the user/environment.
    return config.ivoxsRootPath;
  }
  
  if (config.ivoxsRootPath) {
     // This case handles a non-absolute path in the config, which is discouraged.
     // We log a warning but still attempt to use it relative to the current working directory.
    console.warn(`[Config] The configured ivoxsRootPath "${config.ivoxsRootPath}" is not an absolute path. It's recommended to use absolute paths to avoid ambiguity. Resolving relative to project root.`);
    return path.join(process.cwd(), config.ivoxsRootPath);
  }

  // If ivoxsRootPath is null, empty, or not in the config, use the default.
  return path.join(process.cwd(), 'ivoxsdir');
}
