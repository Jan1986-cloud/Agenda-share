import 'dotenv/config';
import fetch from 'node-fetch';

// Definitieve FIX: Zorg ervoor dat de correcte environment variable wordt geladen.
const KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Berekent de reistijd en retourneert een statusobject.
 * @param {string} origin - Het startadres.
 * @param {string} dest - Het bestemmingsadres.
 * @returns {Promise<{status: 'OK'|'ZERO_RESULTS'|'API_ERROR', duration: number|null}>}
 */
export async function getTravelTime(origin, dest) {
  // Essentiële controle: is de API-sleutel überhaupt geladen?
  if (!KEY) {
    console.error('FATAL ERROR: GOOGLE_MAPS_API_KEY is niet ingesteld of niet gevonden. De reistijdberekening kan niet worden uitgevoerd.');
    return { status: 'API_ERROR', duration: null };
  }

  if (!origin || !dest || origin === dest) {
    return { status: 'OK', duration: 0 };
  }

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    origin
  )}&destinations=${encodeURIComponent(dest)}&key=${KEY}&mode=driving`;
  
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`Google Maps API HTTP error: ${r.status}`);
      return { status: 'API_ERROR', duration: null };
    }
    const j = await r.json();
    
    // Controleer de overkoepelende status van het antwoord
    if (j.status !== 'OK') {
      console.warn(`Google Maps API returned top-level error: ${j.status} for ${origin} -> ${dest}`);
      return { status: j.status, duration: null };
    }

    const element = j.rows?.[0]?.elements?.[0];

    // Controleer de status van het specifieke route-element
    if (element?.status === 'OK') {
      return { status: 'OK', duration: element.duration.value };
    } else {
      console.warn(`Could not calculate travel time for ${origin} -> ${dest}. Element status: ${element?.status}`);
      return { status: element?.status || 'ZERO_RESULTS', duration: null };
    }
  } catch (error) {
    console.error("Fatal error during fetch in getTravelTime:", error);
    return { status: 'API_ERROR', duration: null };
  }
}