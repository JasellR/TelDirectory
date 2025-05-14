
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const BRANCH_DIR = path.join(process.cwd(), 'IVOXS', 'Branch');

export async function GET(request: Request, { params }: { params: { branchName: string } }) {
  const { branchName } = params; 
  
  if (!branchName || !/^[a-zA-Z0-9_-]+$/.test(branchName)) {
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid branch identifier: ${branchName}</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }
  
  const branchFilePath = path.join(BRANCH_DIR, `${branchName}.xml`);

  try {
    const xmlContent = await fs.readFile(branchFilePath, 'utf-8');
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error(`Error reading branch file ${branchName}.xml (Path: ${branchFilePath}):`, error);
    const errorTitle = branchName.replace(/([A-Z]+)/g, " $1").replace(/^ /, "");
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Branch File</Title>
  <Text>Branch configuration for ${errorTitle || branchName} not found or is unreadable. Attempted path: ${branchFilePath}</Text>
  <Prompt>Verify file exists and has correct permissions.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
