// utils/travel-time.js
// Haalt reistijd in seconden op via Google Distance Matrix API.
// Extra logging toegevoegd om te verifiëren dat de backend daadwerkelijk
// een niet-nul reistijd binnenkrijgt. Bij fout of ontbrekende data
// wordt 0 geretourneerd zodat de app blijft werken.

import fetch from 'node-fetch';

export default async function getTravelTime(origin, destination) {
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
    const response = await fetch(url);
    const data = await response.json();

    const element = data.rows?.[0]?.elements?.[0];
    const seconds = element?.duration?.value ?? 0;

    // Debug-log: zie Railway-logs om te bevestigen dat dit wordt aangeroepen.
    console.log('TRAVEL', origin, '→', destination, 'secs:', seconds);

    // Als API een foutstatus geeft (ZERO_RESULTS, NOT_FOUND …) valt element.status ≠ 'OK'
    if (element?.status !== 'OK') {
      console.warn('TRAVEL API status', element?.status, '→ 0s');
      return 0;
    }

    return seconds;
  } catch (err) {
    console.error('TRAVEL fetch error', err);
    return 0;
  }
}

