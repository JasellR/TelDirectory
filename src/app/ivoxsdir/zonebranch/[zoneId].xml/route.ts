
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request, { params }: { params: { zoneId: string } }) {
  const { zoneId } = params;

  // Log the received zoneId at the very beginning
  console.log(`[GET /ivoxsdir/zonebranch/] Received request for zoneId: "${zoneId}"`);

  // Validate the zoneId format
  if (!zoneId || typeof zoneId !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(zoneId)) {
    console.error(`[GET /ivoxsdir/zonebranch/] Invalid zoneId format: "${zoneId}"`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid zone identifier format provided.</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' } });
  }

  const projectRootDir = process.cwd();
  const zoneBranchDir = path.join(projectRootDir, 'IVOXS', 'ZoneBranch');
  const targetFilePath = path.join(zoneBranchDir, `${zoneId}.xml`);

  // Log constructed paths for clarity
  console.log(`[GET /ivoxsdir/zonebranch/] process.cwd(): "${projectRootDir}"`);
  console.log(`[GET /ivoxsdir/zonebranch/] ZoneBranch directory: "${zoneBranchDir}"`);
  console.log(`[GET /ivoxsdir/zonebranch/] Attempting to read file: "${targetFilePath}" for zoneId: "${zoneId}"`);
  
  try {
    // Optional: Check if base directory exists (fs.readFile will also fail if parent dirs don't exist)
    // This can give a slightly more specific error if the entire ZoneBranch folder is missing.
    try {
      await fs.access(zoneBranchDir);
    } catch (dirAccessError: any) {
      console.error(`[GET /ivoxsdir/zonebranch/] Critical Error: Base directory "${zoneBranchDir}" does not exist or is not accessible:`, dirAccessError);
      const errorXml = `<CiscoIPPhoneText><Title>Server Configuration Error</Title><Text>Base directory for zone files (${path.basename(zoneBranchDir)}) not found or inaccessible.</Text></CiscoIPPhoneText>`;
      return new NextResponse(errorXml, { status: 500, headers: { 'Content-Type': 'text/xml' } });
    }

    const xmlContent = await fs.readFile(targetFilePath, 'utf-8');
    console.log(`[GET /ivoxsdir/zonebranch/] Successfully read file: "${targetFilePath}"`);
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error: any) {
    console.error(`[GET /ivoxsdir/zonebranch/] Error reading zone file "${zoneId}.xml" (Path: "${targetFilePath}"):`, error);
    
    let errorMessage = `Zone configuration for ${zoneId} not found or is unreadable.`;
    let statusCode = 500;

    if (error.code === 'ENOENT') {
      errorMessage = `File not found: ${targetFilePath}`;
      statusCode = 404;
    } else if (error.code === 'EACCES') {
      errorMessage = `Permission denied when trying to read: ${targetFilePath}`;
      statusCode = 403; // 403 Forbidden is more appropriate for permission issues
    }

    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Zone File</Title>
  <Text>${errorMessage}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log contains detailed error code: ${error.code || 'UNKNOWN'}.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, {
      status: statusCode,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
