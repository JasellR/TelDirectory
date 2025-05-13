
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DEPARTMENT_DIR = path.join(process.cwd(), 'IVOXS', 'Department');

export async function GET(request: Request, { params }: { params: { localityId: string } }) {
  const { localityId } = params; // e.g., "Bavaro", "BlueMallPuntaCana" (filename without .xml)

  if (!localityId || !/^[a-zA-Z0-9_-]+$/.test(localityId)) {
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid locality identifier.</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }
  
  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);

  try {
    const xmlContent = await fs.readFile(departmentFilePath, 'utf-8');
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error(`Error reading department file ${localityId}.xml:`, error);
    const errorTitle = localityId.replace(/([A-Z])/g, ' $1').trim(); // Basic spacing for camelCase
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error</Title>
  <Text>Department configuration for ${errorTitle} not found or unreadable.</Text>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
