// Bestand: utils/travel-time.js
import 'dotenv/config';
import fetch from 'node-fetch';

const KEY = process.env.OPENROUTER_API_KEY;

/**
 * Berekent de reistijd tussen twee sets coördinaten met de OpenRouteService Directions API.
 * @param {Array<number>} originCoords - De [lon, lat] van de oorsprong.
 * @param {Array<number>} destCoords - De [lon, lat] van de bestemming.
 * @returns {Promise<{status: 'OK'|'API_ERROR'|'ZERO_RESULTS', duration: number|null}>}
 */
export async function getTravelTime(originCoords, destCoords) {
    // Als start- en eindpunt (bijna) gelijk zijn, is de reistijd 0.
    if (!originCoords || !destCoords) return { status: 'API_ERROR', duration: null, origin: originCoords, destination: destCoords };
    if (originCoords.join(',') === destCoords.join(',')) return { status: 'OK', duration: 0, origin: originCoords, destination: destCoords };

    if (!KEY) {
        console.error('FATAL ERROR: OPENROUTER_API_KEY is niet ingesteld.');
        return { status: 'API_ERROR', duration: null, origin: originCoords, destination: destCoords };
    }

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${originCoords.join(',')}&end=${destCoords.join(',')}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Authorization': KEY
            }
        });

        if (!response.ok) {
            // Als de API een error geeft (bv. 404, 500), log dit en geef een fout terug.
            console.error(`Error from OpenRouteService API: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error('Error body:', errorBody);
            return { status: 'API_ERROR', duration: null, origin: originCoords, destination: destCoords };
        }
        
        const data = await response.json();

        // Controleer of er een route is gevonden.
        if (data.features && data.features.length > 0 && data.features[0].properties.summary) {
            const durationInSeconds = data.features[0].properties.summary.duration;
            return { status: 'OK', duration: Math.round(durationInSeconds), origin: originCoords, destination: destCoords };
        }
        
        // Geen route gevonden tussen de punten.
        return { status: 'ZERO_RESULTS', duration: null, origin: originCoords, destination: destCoords };

    } catch (error) {
        console.error('Error fetching travel time from OpenRouteService:', error);
        return { status: 'API_ERROR', duration: null, origin: originCoords, destination: destCoords };
    }
}