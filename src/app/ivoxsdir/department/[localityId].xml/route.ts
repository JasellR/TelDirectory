
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { localityId: string } }
) {
  const { localityId } = params;
  if (!localityId || !/^[a-zA-Z0-9_.-]+$/.test(localityId)) {
    return new NextResponse('<error>Invalid locality ID format</error>', { status: 400 });
  }

  try {
    const paths = {
      DEPARTMENT_DIR: path.join(await getResolvedIvoxsRootPath(), 'department'),
    };
    const filePath = path.join(paths.DEPARTMENT_DIR, `${localityId}.xml`);
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: any) {
    console.error(`[Route /department/${localityId}.xml] Error reading file:`, error);
     if (error.code === 'ENOENT') {
      return new NextResponse(`<error>Department file for ${localityId} not found</error>`, {
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
