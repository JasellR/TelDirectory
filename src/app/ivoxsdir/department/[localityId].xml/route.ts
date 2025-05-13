
import { NextResponse } from 'next/server';
import { findLocalityByIdGlobally } from '@/lib/data';
import type { Extension, Locality } from '@/types';

export async function GET(request: Request, { params }: { params: { localityId: string } }) {
  // localityId from URL, e.g., "Bavaro", "BlueMallPuntaCana"
  const { localityId } = params; 
  const locality: Locality | undefined = await findLocalityByIdGlobally(localityId);

  if (!locality) {
    return new NextResponse(
      '<CiscoIPPhoneText><Title>Error</Title><Text>Locality not found</Text></CiscoIPPhoneText>',
      { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
      }
    );
  }

  const xmlContent = `
<CiscoIPPhoneDirectory>
  <Title>${locality.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Title>
  <Prompt>Select a contact</Prompt>
  ${locality.extensions.map((extension: Extension) => {
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
