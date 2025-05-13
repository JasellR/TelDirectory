
import { NextResponse } from 'next/server';
import { getZoneById } from '@/lib/data';
import type { Locality, Zone } from '@/types';

// IMPORTANT: Replace 'YOUR_DEVICE_IP' with the actual IP address of your server accessible by the IP phones.
// The port should match where your Next.js app is running (default 9002 for dev).
const APP_BASE_URL = `http://YOUR_DEVICE_IP:9002`;

export async function GET(request: Request, { params }: { params: { zoneId: string } }) {
  const { zoneId } = params;
  const zone: Zone | undefined = await getZoneById(zoneId);

  if (!zone) {
    return new NextResponse('Zone not found', { 
      status: 404,
      headers: { 'Content-Type': 'text/xml' },
      body: '<CiscoIPPhoneText><Title>Error</Title><Text>Zone not found</Text></CiscoIPPhoneText>'
    });
  }

  const xmlContent = `
<CiscoIPPhoneMenu>
  <Title>${zone.name}</Title>
  <Prompt>Select a Branch</Prompt>
  ${zone.localities.map((locality: Locality) => `
  <MenuItem>
    <Name>${locality.name}</Name>
    <URL>${APP_BASE_URL}/api/ivoxdir/branch/${encodeURIComponent(zone.id)}/${encodeURIComponent(locality.id)}.xml</URL>
  </MenuItem>`).join('')}
</CiscoIPPhoneMenu>
  `.trim();

  return new NextResponse(xmlContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
