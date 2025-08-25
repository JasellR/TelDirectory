
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { branchName: string } }
) {
  const { branchName } = params;
  if (!branchName || !/^[a-zA-Z0-9_-]+$/.test(branchName)) {
    return new NextResponse('<error>Invalid branch name format</error>', { status: 400 });
  }

  try {
    const paths = {
      BRANCH_DIR: path.join(await getResolvedIvoxsRootPath(), 'branch'),
    };
    const filePath = path.join(paths.BRANCH_DIR, `${branchName}.xml`);
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: any) {
    console.error(`[Route /branch/${branchName}.xml] Error reading file:`, error);
     if (error.code === 'ENOENT') {
      return new NextResponse(`<error>Branch file for ${branchName} not found</error>`, {
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
