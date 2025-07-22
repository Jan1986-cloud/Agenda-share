// Bestand: utils/geocoding.js
import 'dotenv/config';
import fetch from 'node-fetch';
import logger from './logger.js';

const KEY = process.env.OPENROUTER_API_KEY;
const geocodeCache = new Map();

/**
 * Converteert een adres naar coördinaten [longitude, latitude].
 * Gebruikt een cache om herhaalde aanroepen te voorkomen.
 * @param {string} address - Het volledige adres.
 * @returns {Promise<Array<number>|null>} De coördinaten of null.
 */
export async function getCoordinatesForAddress(address) {
    if (!address || address.trim() === '') return null;
    if (geocodeCache.has(address)) return geocodeCache.get(address);

    if (!KEY) {
        logger.error('FATAL ERROR: OPENROUTER_API_KEY is niet ingesteld.');
        return null;
    }

    const url = `https://api.openrouteservice.org/geocode/search?api_key=${KEY}&text=${encodeURIComponent(address)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const coordinates = data.features[0].geometry.coordinates;
            geocodeCache.set(address, coordinates);
            return coordinates;
        }
        return null;
    } catch (error) {
        logger.error({ message: 'Error during geocoding', error, address });
        return null;
    }
}
