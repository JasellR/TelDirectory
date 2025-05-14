
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const BRANCH_DIR = path.join(process.cwd(), 'IVOXS', 'Branch');

export async function GET(request: Request, { params }: { params: { branchName: string } }) {
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] Received request. URL: ${request.url}, Params:`, params);
  const { branchName } = params;
  console.log(`[GET /ivoxsdir/branch/[branchName].xml] branchName: ${branchName}`);
  
  if (!branchName || !/^[a-zA-Z0-9_-]+$/.test(branchName)) {
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
    const errorTitle = branchName.replace(/([A-Z]+)/g, " $1").replace(/^ /, "");
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Branch File</Title>
  <Text>Branch configuration for ${errorTitle || branchName} not found or is unreadable. Attempted path: ${branchFilePath}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log may contain more details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
