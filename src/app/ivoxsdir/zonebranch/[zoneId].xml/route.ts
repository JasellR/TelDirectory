
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
                return file;
            }
        }
        return null;
    } catch (error) {
        console.error(`[findFileCaseInsensitive] Error reading directory ${directory}:`, error);
        return null;
    }
}

export async function GET(
  request: Request,
  { params }: { params: { zoneId: string } }
) {
  const { zoneId } = params;
  if (!zoneId || !/^[a-zA-Z0-9_.-]+$/.test(zoneId)) {
    return new NextResponse('<error>Invalid zone ID format</error>', { status: 400, headers: { 'Content-Type': 'application/xml' } });
  }

  try {
    const zoneBranchDir = path.join(await getResolvedIvoxsRootPath(), 'zonebranch');
    const actualFilename = await findFileCaseInsensitive(zoneBranchDir, `${zoneId}.xml`);
    
    if (!actualFilename) {
        console.error(`[Route /zonebranch] File not found for zone: ${zoneId}. Case-insensitive search failed in ${zoneBranchDir}`);
        return new NextResponse(`<error>Zone file for ${zoneId} not found</error>`, {
            status: 404,
            headers: { 'Content-Type': 'application/xml' },
        });
    }

    const filePath = path.join(zoneBranchDir, actualFilename);
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: any) {
    console.error(`[Route /zonebranch/${zoneId}.xml] Error reading file:`, error);
    return new NextResponse('<error>Internal Server Error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
