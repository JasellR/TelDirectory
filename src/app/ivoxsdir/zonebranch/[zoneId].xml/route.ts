
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ZONE_BRANCH_DIR = path.join(process.cwd(), 'IVOXS', 'ZoneBranch');

export async function GET(request: Request, { params }: { params: { zoneId: string } }) {
  const { zoneId } = params; // e.g., "este", "norte" (filename without .xml)
  
  if (!zoneId || !/^[a-zA-Z0-9_-]+$/.test(zoneId)) {
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid zone identifier.</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }

  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);

  try {
    const xmlContent = await fs.readFile(zoneFilePath, 'utf-8');
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error(`Error reading zone file ${zoneId}.xml:`, error);
    const errorTitle = zoneId.charAt(0).toUpperCase() + zoneId.slice(1); // Basic capitalization
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error</Title>
  <Text>Zone configuration for ${errorTitle} not found or unreadable.</Text>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 404, // Or 500 if it's a server read error rather than not found
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
