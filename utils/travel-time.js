import fetch from 'node-fetch';

export async function getTravelTime(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.log("No Google Maps API key found, returning 0 for travel time.");
    return 0;
  }
  
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${key}`;
  
  try {
    const r = await fetch(url);
    const j = await r.json();
    return j.rows?.[0]?.elements?.[0]?.duration?.value ?? 0;
  } catch (error) {
    console.error("Error fetching travel time:", error);
    return 0;
  }
}
