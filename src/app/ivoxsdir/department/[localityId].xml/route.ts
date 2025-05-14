
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const ivoxsRootDir = path.join(process.cwd(), 'IVOXS');
const DEPARTMENT_DIR = path.join(ivoxsRootDir, 'Department');

export async function GET(request: Request, { params }: { params: { localityId: string } }) {
  console.log(`[GET /ivoxsdir/department/[localityId].xml] --- Debug Info ---`);
  console.log(`[GET /ivoxsdir/department/[localityId].xml] process.cwd(): ${process.cwd()}`);
  console.log(`[GET /ivoxsdir/department/[localityId].xml] Constructed ivoxsRootDir: ${ivoxsRootDir}`);
  console.log(`[GET /ivoxsdir/department/[localityId].xml] Constructed DEPARTMENT_DIR: ${DEPARTMENT_DIR}`);
  console.log(`[GET /ivoxsdir/department/[localityId].xml] Received request. URL: ${request.url}, Params:`, params);
  const { localityId } = params;
  console.log(`[GET /ivoxsdir/department/[localityId].xml] localityId: ${localityId}`);

  if (!localityId || !/^[a-zA-Z0-9_.-]+$/.test(localityId)) {
    console.error(`[GET /ivoxsdir/department/[localityId].xml] Invalid localityId: ${localityId}`);
    const errorXml = `<CiscoIPPhoneText><Title>Error</Title><Text>Invalid locality identifier: ${localityId}</Text></CiscoIPPhoneText>`;
    return new NextResponse(errorXml, { status: 400, headers: { 'Content-Type': 'text/xml' }});
  }
  
  try {
    await fs.access(DEPARTMENT_DIR);
    console.log(`[GET /ivoxsdir/department/[localityId].xml] Directory ${DEPARTMENT_DIR} confirmed to exist and is accessible.`);
  } catch (dirAccessError: any) {
    console.error(`[GET /ivoxsdir/department/[localityId].xml] Critical Error: Directory ${DEPARTMENT_DIR} does not exist or is not accessible:`, dirAccessError);
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Server Configuration Error</Title>
  <Text>The base directory for department files (${DEPARTMENT_DIR}) was not found or is inaccessible on the server.</Text>
  <Prompt>Please contact administrator. Server log contains details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { status: 500, headers: { 'Content-Type': 'text/xml' } });
  }

  const departmentFilePath = path.join(DEPARTMENT_DIR, `${localityId}.xml`);
  console.log(`[GET /ivoxsdir/department/[localityId].xml] Attempting to read file: ${departmentFilePath}`);

  try {
    const xmlContent = await fs.readFile(departmentFilePath, 'utf-8');
    console.log(`[GET /ivoxsdir/department/[localityId].xml] Successfully read file: ${departmentFilePath}`);
    return new NextResponse(xmlContent.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error(`[GET /ivoxsdir/department/[localityId].xml] Error reading department file ${localityId}.xml (Path: ${departmentFilePath}):`, error);
    const errorTitleDisplay = localityId.replace(/([A-Z])/g, ' $1').trim() || localityId;
    const errorXml = `
<CiscoIPPhoneText>
  <Title>Error Accessing Department File</Title>
  <Text>Department configuration for ${errorTitleDisplay} not found or unreadable. Attempted path: ${departmentFilePath}</Text>
  <Prompt>Verify file exists and has correct permissions. Server log may contain more details.</Prompt>
</CiscoIPPhoneText>
    `.trim();
    return new NextResponse(errorXml, { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
