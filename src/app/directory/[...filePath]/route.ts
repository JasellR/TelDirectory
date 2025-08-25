
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

// This function attempts to find a file in a directory, ignoring case.
async function findFileCaseInsensitive(directory: string, filename: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseFilename = filename.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseFilename) {
                return file; // Return the actual filename with its original casing
            }
        }
        return null; // No match found
    } catch (error: any) {
        if (error.code === 'ENOENT') return null; // Directory doesn't exist, which is a valid case
        console.error(`[findFileCaseInsensitive] Error reading directory ${directory}:`, error);
        return null;
    }
}


export async function GET(
  request: Request,
  { params }: { params: { filePath: string[] } }
) {
  // Join the filePath array into a single path string. e.g., ['zonebranch', 'ZonaEste.xml'] -> 'zonebranch/ZonaEste.xml'
  const requestedPath = params.filePath.join('/');
  
  // Basic sanitization against path traversal and invalid characters
  if (!requestedPath || requestedPath.includes('..')) {
    return new NextResponse('<error>Invalid request path</error>', { status: 400, headers: { 'Content-Type': 'application/xml' } });
  }

  try {
    const ivoxsRoot = await getResolvedIvoxsRootPath();
    const fullFilePath = path.join(ivoxsRoot, requestedPath);

    // For case-insensitivity, we need to check the directory and filename
    const dirName = path.dirname(requestedPath);
    const fileName = path.basename(requestedPath);
    
    const absoluteDir = path.join(ivoxsRoot, dirName);
    const actualFilename = await findFileCaseInsensitive(absoluteDir, fileName);

    if (!actualFilename) {
        console.error(`[Route /directory] File not found: ${fileName} in directory ${absoluteDir}. Case-insensitive search failed.`);
        return new NextResponse(`<error>File for ${requestedPath} not found</error>`, {
            status: 404,
            headers: { 'Content-Type': 'application/xml' },
        });
    }
    
    const finalFilePath = path.join(absoluteDir, actualFilename);
    const xmlContent = await fs.readFile(finalFilePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }, // Specify charset
    });
  } catch (error: any) {
    console.error(`[Route /directory/${requestedPath}] Error reading file:`, error);
    return new NextResponse('<error>Internal Server Error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
