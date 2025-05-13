
import { NextResponse } from 'next/server';
import { getZoneById } from '@/lib/data';
import type { Locality, Zone } from '@/types';

// IMPORTANT: Replace 'YOUR_DEVICE_IP' with the actual IP address of your server accessible by the IP phones.
const APP_BASE_URL = `http://YOUR_DEVICE_IP:9002`; // Or your server's actual IP and port

export async function GET(request: Request, { params }: { params: { zoneId: string } }) {
  // The zoneId from the URL might be 'ZonaEste', 'este', etc.
  // Ensure getZoneById can handle this.
  const { zoneId } = params; 
  const zone: Zone | undefined = await getZoneById(zoneId);

  if (!zone) {
    return new NextResponse(
      '<CiscoIPPhoneText><Title>Error</Title><Text>Zone not found</Text></CiscoIPPhoneText>',
      { 
        status: 404,
        headers: { 'Content-Type': 'text/xml' }
      }
    );
  }

  const xmlContent = `
<CiscoIPPhoneMenu>
  <Title>${zone.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Title>
  <Prompt>Select a Branch</Prompt>
  ${zone.localities.map((locality: Locality) => {
    // locality.id should be URL-friendly, e.g., "Bavaro", "BlueMallPuntaCana"
    const localityUrlId = encodeURIComponent(locality.id);
    return `
  <MenuItem>
    <Name>${locality.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Name>
    <URL>${APP_BASE_URL}/ivoxsdir/department/${localityUrlId}.xml</URL>
  </MenuItem>`;
    }).join('')}
</CiscoIPPhoneMenu>
  `.trim();

  return new NextResponse(xmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
