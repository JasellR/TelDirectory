
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ivoxsRootDir = path.join(process.cwd(), 'IVOXS');
const ZONE_BRANCH_DIR = path.join(ivoxsRootDir, 'ZoneBranch');

export async function GET(request: Request, { params }: { params: { zoneId: string } }) {
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] --- Debug Info ---`);
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] process.cwd(): ${process.cwd()}`);
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Constructed ivoxsRootDir: ${ivoxsRootDir}`);
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Constructed ZONE_BRANCH_DIR: ${ZONE_BRANCH_DIR}`);
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Received request. URL: ${request.url}, Params:`, params);
  const { zoneId } = params;
  console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] zoneId: ${zoneId}`);

  if (!zoneId || !/^[a-zA-Z0-9_.-]+$/.test(zoneId)) {
    console.error(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Invalid zoneId: ${zoneId}`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid zone identifier: ${zoneId}</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }

  try {
    await fs.access(ZONE_BRANCH_DIR);
    console.log(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Directory ${ZONE_BRANCH_DIR} confirmed to exist and is accessible.`);
  } catch (dirAccessError: any) {
    console.error(`[GET /ivoxsdir/zonebranch/[zoneId].xml] Critical Error: Directory ${ZONE_BRANCH_DIR} does not exist or is not accessible:`, dirAccessError);
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Server Configuration Error</Title>
  <Text>The base directory for zone files (${ZONE_BRANCH_DIR}) was not found or is inaccessible on the server.</Text>
  <Prompt>Please contact administrator. Server log contains details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { status: 500, headers: { 'Content-Type': 'text/xml' } });
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
    const errorTitleDisplay = zoneId.replace(/([A-Z])/g, ' $1').trim() || zoneId;
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Zone File</Title>
  <Text>Zone configuration for ${errorTitleDisplay} not found or is unreadable. Attempted path: ${zoneFilePath}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log may contain more details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, {
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
