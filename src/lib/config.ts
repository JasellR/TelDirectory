
'use server';

import fs from 'fs/promises';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), '.config');
const DIRECTORY_CONFIG_PATH = path.join(CONFIG_DIR, 'directory.config.json');

export interface DirectoryConfig {
  ivoxsRootPath: string | null;
  serviceHost?: string;
  servicePort?: string;
}

export async function getDirectoryConfig(): Promise<DirectoryConfig> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(DIRECTORY_CONFIG_PATH, 'utf-8');
    if (!data || data.trim() === '') {
      return { ivoxsRootPath: null };
    }
    const parsedData = JSON.parse(data);
    if (parsedData && typeof parsedData.ivoxsRootPath !== 'undefined') {
      return parsedData;
    }
    return { ivoxsRootPath: null };
  } catch (error) {
    return { ivoxsRootPath: null };
  }
}

export async function saveDirectoryConfig(config: DirectoryConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(DIRECTORY_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function getResolvedIvoxsRootPath(): Promise<string> {
  return path.join(process.cwd(), 'public', 'ivoxsdir');
}
