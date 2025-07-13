import fetch from 'node-fetch';
const KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function getTravelTime(origin, dest) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    origin
  )}&destinations=${encodeURIComponent(dest)}&key=${KEY}&mode=driving`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.rows?.[0]?.elements?.[0]?.status === 'OK') {
    return j.rows[0].elements[0].duration.value;
  }
  return 0;
}