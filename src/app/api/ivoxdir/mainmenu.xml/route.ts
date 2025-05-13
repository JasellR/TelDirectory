
import { NextResponse } from 'next/server';
import { getZones } from '@/lib/data';
import type { Zone } from '@/types';

// IMPORTANT: Replace 'YOUR_DEVICE_IP' with the actual IP address of your server accessible by the IP phones.
// The port should match where your Next.js app is running (default 9002 for dev).
const APP_BASE_URL = `http://YOUR_DEVICE_IP:9002`;

export async function GET() {
  const zones: Zone[] = await getZones();

  const xmlContent = `
<CiscoIPPhoneMenu>
  <Title>Farmacia Carol</Title>
  <Prompt>Select a Zone Branch</Prompt>
  ${zones.map(zone => `
  <MenuItem>
    <Name>${zone.name}</Name>
    <URL>${APP_BASE_URL}/api/ivoxdir/zonebranch/${encodeURIComponent(zone.id)}.xml</URL>
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
