
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { zoneId: string } }
) {
  const { zoneId } = params;
  if (!zoneId || !/^[a-zA-Z0-9_-]+$/.test(zoneId)) {
    return new NextResponse('<error>Invalid zone ID format</error>', { status: 400 });
  }

  try {
    const paths = {
      ZONE_BRANCH_DIR: path.join(await getResolvedIvoxsRootPath(), 'zonebranch'),
    };
    const filePath = path.join(paths.ZONE_BRANCH_DIR, `${zoneId}.xml`);
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: any) {
    console.error(`[Route /zonebranch/${zoneId}.xml] Error reading file:`, error);
     if (error.code === 'ENOENT') {
      return new NextResponse(`<error>Zone file for ${zoneId} not found</error>`, {
        status: 404,
        headers: { 'Content-Type': 'application/xml' },
      });
    }
    return new NextResponse('<error>Internal Server Error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
