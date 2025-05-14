
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ivoxsRootDir = path.join(process.cwd(), 'IVOXS');
const BRANCH_DIR = path.join(ivoxsRootDir, 'Branch');

export async function GET(request: Request, { params }: { params: { branchName: string } }) {
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] --- Debug Info ---`);
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] process.cwd(): ${process.cwd()}`);
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] Constructed ivoxsRootDir: ${ivoxsRootDir}`);
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] Constructed BRANCH_DIR: ${BRANCH_DIR}`);
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] Received request. URL: ${request.url}, Params:`, params);
  const { branchName } = params;
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] branchName: ${branchName}`);
  
  // Updated regex to be more inclusive (allows dots, retains underscore and hyphen)
  if (!branchName || !/^[a-zA-Z0-9_.-]+$/.test(branchName)) {
    console.error(`[GET /ivoxsdir/branch/[branchName].xml] Invalid branchName: ${branchName}`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid branch identifier: ${branchName}</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }
  
  const branchFilePath = path.join(BRANCH_DIR, `${branchName}.xml`);
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] Attempting to read file: ${branchFilePath}`);

  try {
    const xmlContent = await fs.readFile(branchFilePath, 'utf-8');
    console.log(`[GET /ivoxsdir/branch/[branchName].xml] Successfully read file: ${branchFilePath}`);
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error(`[GET /ivoxsdir/branch/[branchName].xml] Error reading branch file ${branchName}.xml (Path: ${branchFilePath}):`, error);
    // Sanitize display name
    const errorTitleDisplay = branchName.replace(/([A-Z]+)/g, " $1").replace(/^ /, "") || branchName;
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Branch File</Title>
  <Text>Branch configuration for ${errorTitleDisplay} not found or is unreadable. Attempted path: ${branchFilePath}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log may contain more details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
