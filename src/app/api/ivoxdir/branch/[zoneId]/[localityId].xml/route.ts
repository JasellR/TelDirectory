
import { NextResponse } from 'next/server';
import { getLocalityById } from '@/lib/data';
import type { Extension, Locality } from '@/types';

export async function GET(request: Request, { params }: { params: { zoneId: string, localityId: string } }) {
  const { zoneId, localityId } = params;
  const locality: Locality | undefined = await getLocalityById(zoneId, localityId);

  if (!locality) {
    return new NextResponse('Locality not found', { 
      status: 404,
      headers: { 'Content-Type': 'text/xml' },
      body: '<CiscoIPPhoneText><Title>Error</Title><Text>Locality not found</Text></CiscoIPPhoneText>'
    });
  }

  const xmlContent = `
<CiscoIPPhoneDirectory>
  <Title>${locality.name}</Title>
  <Prompt>Select a contact</Prompt>
  ${locality.extensions.map((extension: Extension) => {
    // Sanitize names for XML: escape '&', '<', '>'
    const departmentName = extension.department.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const contactName = extension.name ? ` (${extension.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')})` : '';
    const fullDisplayName = `${departmentName}${contactName}`;
    
    return `
  <DirectoryEntry>
    <Name>${fullDisplayName}</Name>
    <Telephone>${extension.number}</Telephone>
  </DirectoryEntry>`;
  }).join('')}
</CiscoIPPhoneDirectory>
  `.trim();

  return new NextResponse(xmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
