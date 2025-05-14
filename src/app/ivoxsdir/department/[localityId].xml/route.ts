
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request, { params }: { params: { localityId: string } }) {
  const { localityId } = params;

  console.log(`[GET /ivoxsdir/department/] Received request for localityId: "${localityId}"`);
  
  if (!localityId || typeof localityId !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(localityId)) {
    console.error(`[GET /ivoxsdir/department/] Invalid localityId format: "${localityId}"`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid locality identifier format provided.</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' } });
  }

  const projectRootDir = process.cwd();
  const departmentDir = path.join(projectRootDir, 'IVOXS', 'Department');
  const targetFilePath = path.join(departmentDir, `${localityId}.xml`);

  console.log(`[GET /ivoxsdir/department/] process.cwd(): "${projectRootDir}"`);
  console.log(`[GET /ivoxsdir/department/] Department directory: "${departmentDir}"`);
  console.log(`[GET /ivoxsdir/department/] Attempting to read file: "${targetFilePath}" for localityId: "${localityId}"`);
  
  try {
    try {
      await fs.access(departmentDir);
    } catch (dirAccessError: any) {
      console.error(`[GET /ivoxsdir/department/] Critical Error: Base directory "${departmentDir}" does not exist or is not accessible:`, dirAccessError);
      const errorXml = `<CiscoIPPhoneText><Title>Server Configuration Error</Title><Text>Base directory for department files (${path.basename(departmentDir)}) not found or inaccessible.</Text></CiscoIPPhoneText>`;
      return new NextResponse(errorXml, { status: 500, headers: { 'Content-Type': 'text/xml' } });
    }

    const xmlContent = await fs.readFile(targetFilePath, 'utf-8');
    console.log(`[GET /ivoxsdir/department/] Successfully read file: "${targetFilePath}"`);
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error: any) {
    console.error(`[GET /ivoxsdir/department/] Error reading department file "${localityId}.xml" (Path: "${targetFilePath}"):`, error);

    let errorMessage = `Department configuration for ${localityId} not found or is unreadable.`;
    let statusCode = 500;

    if (error.code === 'ENOENT') {
      errorMessage = `File not found: ${targetFilePath}`;
      statusCode = 404;
    } else if (error.code === 'EACCES') {
      errorMessage = `Permission denied when trying to read: ${targetFilePath}`;
      statusCode = 403;
    }
    
    const errorTitleDisplay = localityId.replace(/([A-Z])/g, ' $1').trim() || localityId;
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Department File</Title>
  <Text>${errorMessage.replace(localityId, errorTitleDisplay)}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log contains detailed error code: ${error.code || 'UNKNOWN'}.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: statusCode,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
