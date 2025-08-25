
import { getResolvedIvoxsRootPath } from '@/lib/config';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET() {
  try {
    const paths = {
      IVOXS_DIR: await getResolvedIvoxsRootPath(),
    };
    const mainMenuPath = path.join(paths.IVOXS_DIR, 'MainMenu.xml');
    const xmlContent = await fs.readFile(mainMenuPath, 'utf-8');

    return new NextResponse(xmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error: any) {
    console.error('[Route /mainmenu.xml] Error reading MainMenu.xml:', error);
    if (error.code === 'ENOENT') {
      return new NextResponse('<error>MainMenu.xml not found</error>', {
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
