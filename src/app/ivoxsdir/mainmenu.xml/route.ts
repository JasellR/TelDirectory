
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const IVOXS_DIR = path.join(process.cwd(), 'IVOXS');
const MAINMENU_FILE_PATH = path.join(IVOXS_DIR, 'MAINMENU.xml');

export async function GET() {
  try {
    const xmlContent = await fs.readFile(MAINMENU_FILE_PATH, 'utf-8');
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error("Error reading MAINMENU.xml:", error);
    // Provide a valid, minimal XML error response for the IP phone
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error</Title>
  <Text>Main directory configuration file not found or unreadable.</Text>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 500,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
