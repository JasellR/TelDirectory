
import { NextResponse } from 'next/server';
import { getZones } from '@/lib/data';
import type { Zone } from '@/types';

// IMPORTANT: Replace 'YOUR_DEVICE_IP' with the actual IP address of your server accessible by the IP phones.
// The port should match where your Next.js app is running (default 9002 for dev).
const APP_BASE_URL = `http://YOUR_DEVICE_IP:9002`; // Or your server's actual IP and port

export async function GET() {
  const zones: Zone[] = await getZones();

  const xmlContent = `
<CiscoIPPhoneMenu>
  <Title>Farmacia Carol</Title>
  <Prompt>Select a Zone Branch</Prompt>
  ${zones.map(zone => {
    // Use zone.id for the URL, assuming it's URL-friendly (e.g., "este", "norte")
    // Or use a URL-friendly version of zone.name if IDs are not suitable for URLs directly.
    // For example, if zone.name is "Zona Este", zone.id could be "ZonaEste" or "este".
    // The getZoneById function in data.ts should be able to resolve this ID.
    const zoneUrlId = encodeURIComponent(zone.id); // Ensure this ID matches what [zoneId].xml expects
    return `
  <MenuItem>
    <Name>${zone.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Name>
    <URL>${APP_BASE_URL}/ivoxsdir/zonebranch/${zoneUrlId}.xml</URL>
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
