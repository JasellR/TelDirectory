
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
  { params }: { params: { localityId: string } }
) {
  const { localityId } = params;
  if (!localityId || !/^[a-zA-Z0-9_.-]+$/.test(localityId)) {
    return new NextResponse('<error>Invalid locality ID format</error>', { status: 400, headers: { 'Content-Type': 'application/xml' } });
  }

  try {
    const departmentDir = path.join(await getResolvedIvoxsRootPath(), 'department');
    const actualFilename = await findFileCaseInsensitive(departmentDir, `${localityId}.xml`);
    
    if (!actualFilename) {
        console.error(`[Route /department] File not found for locality: ${localityId}. Case-insensitive search failed in ${departmentDir}`);
        return new NextResponse(`<error>Department file for ${localityId} not found</error>`, {
            status: 404,
            headers: { 'Content-Type': 'application/xml' },
        });
    }

    const filePath = path.join(departmentDir, actualFilename);
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: any) {
    console.error(`[Route /department/${localityId}.xml] Error reading file:`, error);
    return new NextResponse('<error>Internal Server Error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
