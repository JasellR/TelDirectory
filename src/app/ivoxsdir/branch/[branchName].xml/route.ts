
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request, { params }: { params: { branchName: string } }) {
  const { branchName } = params;

  console.log(`[GET /ivoxsdir/branch/] Received request for branchName: "${branchName}"`);

  if (!branchName || typeof branchName !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(branchName)) {
    console.error(`[GET /ivoxsdir/branch/] Invalid branchName format: "${branchName}"`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid branch identifier format provided.</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' } });
  }

  const projectRootDir = process.cwd();
  const branchDir = path.join(projectRootDir, 'IVOXS', 'Branch');
  const targetFilePath = path.join(branchDir, `${branchName}.xml`);

  console.log(`[GET /ivoxsdir/branch/] process.cwd(): "${projectRootDir}"`);
  console.log(`[GET /ivoxsdir/branch/] Branch directory: "${branchDir}"`);
  console.log(`[GET /ivoxsdir/branch/] Attempting to read file: "${targetFilePath}" for branchName: "${branchName}"`);

  try {
    try {
      await fs.access(branchDir);
    } catch (dirAccessError: any) {
      console.error(`[GET /ivoxsdir/branch/] Critical Error: Base directory "${branchDir}" does not exist or is not accessible:`, dirAccessError);
      const errorXml = `<CiscoIPPhoneText><Title>Server Configuration Error</Title><Text>Base directory for branch files (${path.basename(branchDir)}) not found or inaccessible.</Text></CiscoIPPhoneText>`;
      return new NextResponse(errorXml, { status: 500, headers: { 'Content-Type': 'text/xml' } });
    }

    const xmlContent = await fs.readFile(targetFilePath, 'utf-8');
    console.log(`[GET /ivoxsdir/branch/] Successfully read file: "${targetFilePath}"`);
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error: any) {
    console.error(`[GET /ivoxsdir/branch/] Error reading branch file "${branchName}.xml" (Path: "${targetFilePath}"):`, error);
    
    let errorMessage = `Branch configuration for ${branchName} not found or is unreadable.`;
    let statusCode = 500;

    if (error.code === 'ENOENT') {
      errorMessage = `File not found: ${targetFilePath}`;
      statusCode = 404;
    } else if (error.code === 'EACCES') {
      errorMessage = `Permission denied when trying to read: ${targetFilePath}`;
      statusCode = 403;
    }
    
    const errorTitleDisplay = branchName.replace(/([A-Z]+)/g, " $1").replace(/^ /, "") || branchName;
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Branch File</Title>
  <Text>${errorMessage.replace(branchName, errorTitleDisplay)}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log contains detailed error code: ${error.code || 'UNKNOWN'}.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: statusCode,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
