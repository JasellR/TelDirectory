
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

// This function attempts to find a file or directory in a parent directory, ignoring case.
async function findCaseInsensitive(directory: string, name: string): Promise<string | null> {
    try {
        const files = await fs.readdir(directory);
        const lowerCaseName = name.toLowerCase();
        for (const file of files) {
            if (file.toLowerCase() === lowerCaseName) {
                return file; // Return the actual name with its original casing
            }
        }
        return null; // No match found
    } catch (error: any) {
        if (error.code === 'ENOENT') return null; // Directory doesn't exist, which is a valid case
        console.error(`[findCaseInsensitive] Error reading directory ${directory}:`, error);
        return null;
    }
}


export async function GET(
  request: Request,
  { params }: { params: { filePath: string[] } }
) {
  // Join the filePath array into a single path string. e.g., ['ZoneBranch', 'ZonaEste.xml'] -> 'ZoneBranch/ZonaEste.xml'
  const requestedPathSegments = params.filePath;
  
  // Basic sanitization
  if (!requestedPathSegments || requestedPathSegments.includes('..') || !requestedPathSegments.slice(-1)[0].toLowerCase().endsWith('.xml')) {
    return new NextResponse('<error>Invalid request path</error>', { status: 400, headers: { 'Content-Type': 'application/xml' } });
  }

  try {
    const ivoxsRoot = await getResolvedIvoxsRootPath();
    let currentPath = ivoxsRoot;
    let actualPathSegments: string[] = [];

    // Traverse the path segments case-insensitively
    for (const segment of requestedPathSegments) {
        const actualName = await findCaseInsensitive(currentPath, segment);
        if (!actualName) {
            console.error(`[Route /directory] Path segment not found: "${segment}" in directory "${currentPath}". Case-insensitive search failed.`);
            const requestedPathForError = requestedPathSegments.join('/');
            return new NextResponse(`<error>File or directory for path "${requestedPathForError}" not found</error>`, {
                status: 404,
                headers: { 'Content-Type': 'application/xml' },
            });
        }
        actualPathSegments.push(actualName);
        currentPath = path.join(currentPath, actualName);
    }
    
    const finalFilePath = path.join(ivoxsRoot, ...actualPathSegments);
    const xmlContent = await fs.readFile(finalFilePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }, // Specify charset
    });
  } catch (error: any) {
    console.error(`[Route /directory/${requestedPathSegments.join('/')}] Error reading file:`, error);
    return new NextResponse('<error>Internal Server Error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
