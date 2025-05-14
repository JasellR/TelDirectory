
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ZONE_BRANCH_DIR = path.join(process.cwd(), 'IVOXS', 'ZoneBranch');

export async function GET(request: Request, { params }: { params: { zoneId: string } }) {
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Received request. URL: ${request.url}, Params:`, params);
  const { zoneId } = params;
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] zoneId: ${zoneId}`);

  if (!zoneId || !/^[a-zA-Z0-9_-]+$/.test(zoneId)) {
    console.error(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Invalid zoneId: ${zoneId}`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid zone identifier: ${zoneId}</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }

  const zoneFilePath = path.join(ZONE_BRANCH_DIR, `${zoneId}.xml`);
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Attempting to read file: ${zoneFilePath}`);

  try {
    const xmlContent = await fs.readFile(zoneFilePath, 'utf-8');
    console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Successfully read file: ${zoneFilePath}`);
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Error reading zone file ${zoneId}.xml (Path: ${zoneFilePath}):`, error);
    const errorTitle = zoneId.charAt(0).toUpperCase() + zoneId.slice(1);
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Zone File</Title>
  <Text>Zone configuration for ${errorTitle} not found or is unreadable. Attempted path: ${zoneFilePath}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log may contain more details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, {
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
