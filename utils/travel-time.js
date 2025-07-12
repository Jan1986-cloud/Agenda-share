import fetch from 'node-fetch';

export default async function getTravelTime(origin, destination) {
 const key = process.env.GOOGLE_MAPS_API_KEY;
 // If no key, return 0 immediately
 if (!key) return 0;
 
 const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${key}`;
 
 try {
   const r = await fetch(url);
   const j = await r.json();
   // Safely access the duration value
   return j.rows?.[0]?.elements?.[0]?.duration?.value || 0;
 } catch { 
   // If the API call fails for any reason, return 0
   return 0; 
 }
}