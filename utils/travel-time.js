// utils/travel-time.js
// Reistijd in seconden met logging • Named export getTravelTime
import fetch from 'node-fetch';

/**
 * Haalt reistijd (seconden) op via Google Distance Matrix.
 * Retourneert 0 bij fout of ontbrekende data zodat de app niet crasht.
 */
export async function getTravelTime(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !origin || !destination) {
    console.warn('TRAVEL: key/origin/destination ontbreekt → 0s');
    return 0;
  }

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(origin)}` +
    `&destinations=${encodeURIComponent(destination)}` +
    `&mode=driving&units=metric&key=${key}`;

  try {
    const r   = await fetch(url);
    const j   = await r.json();
    const el  = j.rows?.[0]?.elements?.[0];
    const sec = el?.duration?.value ?? 0;

    console.log('TRAVEL', origin, '→', destination, 'secs:', sec, 'status:', el?.status);
    if (el?.status !== 'OK') return 0;
    return sec;
  } catch (err) {
    console.error('TRAVEL fetch error', err);
    return 0;
  }
}
