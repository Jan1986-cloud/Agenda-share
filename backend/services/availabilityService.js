// Bestand: services/availabilityService.js

import db from '../../db.js'; // Gebruik de Knex instance
import { getAuthenticatedClient, getBusySlots } from './googleService.js';
import { calculateAvailability } from '../../utils/availability-logic.js';
import { getTravelTime } from '../../utils/travel-time.js';
import { getCoordinatesForAddress } from '../../utils/geocoding.js';

const getCityFromAddress = (address) => {
    if (!address) return 'Onbekende locatie';
    const parts = address.split(',');
    let cityPart = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    const cityOnly = cityPart.trim().replace(/\d{4}\s?[A-Z]{2}/, '').trim();
    const finalCity = cityOnly.replace(/,/, '').trim();
    return finalCity || parts[0].trim();
};

export async function getInitialAvailability(linkId) {
    if (!linkId) {
        const err = new Error('Link ID is verplicht.');
        err.statusCode = 400;
        throw err;
    }
    
    const link = await db('links as l')
        .join('users as u', 'l.user_id', 'u.id')
        .where('l.id', linkId)
        .select('l.*', 'u.email')
        .first();

    if (!link) {
        const err = new Error('Link niet gevonden.');
        err.statusCode = 404;
        throw err;
    }
    if (typeof link.availability === 'string') link.availability = JSON.parse(link.availability);

    const auth = await getAuthenticatedClient(link.user_id);
    const now = new Date();
    const timeMin = new Date();
    timeMin.setUTCHours(0, 0, 0, 0);
    const timeMax = new Date(now.getTime() + (link.planning_offset_days + link.planning_window_days) * 24 * 60 * 60 * 1000);
    const busySlots = await getBusySlots(auth, link.calendar_id, timeMin, timeMax);

    const { slots } = await calculateAvailability({ ...link, busySlots });

    return {
        title: link.title,
        description: link.description,
        duration: link.duration,
        creatorEmail: link.email,
        initialSlots: slots.map(s => ({ 
            start: s.start.toISOString(), 
            end: s.end.toISOString(),
            marginCategory: s.marginCategory 
        })),
        offset: link.planning_offset_days,
        window: link.planning_window_days,
        linkId,
    };
}


export async function calculateAndVerifySlot({ linkId, destinationAddress, slotStart }) {
    const link = await db('links').where('id', linkId).first();
    if (!link) {
        const err = new Error('Link niet gevonden.');
        err.statusCode = 404;
        throw err;
    }
    if (typeof link.availability === 'string') link.availability = JSON.parse(link.availability);

    const auth = await getAuthenticatedClient(link.user_id);
    const potentialStart = new Date(slotStart);
    
    const timeMin = new Date(new Date(slotStart).setUTCHours(0, 0, 0, 0));
    const timeMax = new Date(timeMin.getTime() + 24 * 60 * 60 * 1000);
    const busySlots = await getBusySlots(auth, link.calendar_id, timeMin, timeMax);

    const lastAppointmentBefore = busySlots.filter(s => s.end.getTime() <= potentialStart.getTime()).pop();
    const nextAppointmentAfter = busySlots.find(s => s.start.getTime() >= new Date(potentialStart.getTime() + link.duration * 60000).getTime());

    const originAddress = lastAppointmentBefore ? (lastAppointmentBefore.location || link.start_address) : link.start_address;
    const destinationForNextTrip = nextAppointmentAfter ? (nextAppointmentAfter.location || link.start_address) : link.start_address;

    const [originCoords, destCoords, nextDestCoords] = await Promise.all([
        getCoordinatesForAddress(originAddress),
        getCoordinatesForAddress(destinationAddress),
        getCoordinatesForAddress(destinationForNextTrip)
    ]);

    const travelToResult = await getTravelTime(originCoords, destCoords);
    const travelFromResult = await getTravelTime(destCoords, nextDestCoords);

    travelToResult.originAddress = getCityFromAddress(originAddress);
    travelToResult.destinationAddress = getCityFromAddress(destinationAddress);
    travelFromResult.originAddress = getCityFromAddress(destinationAddress);
    travelFromResult.destinationAddress = getCityFromAddress(destinationForNextTrip);

    const travelIsKnown = travelToResult.status === 'OK' && travelFromResult.status === 'OK';
    let isViable = false;
    let updatedGapSlots = [];

    if (travelIsKnown) {
        const options = {
            ...link,
            busySlots,
            targetDate: slotStart.split('T')[0],
            knownTravelTimes: {
                travelToDuration: travelToResult.duration,
                travelFromDuration: travelFromResult.duration
            }
        };
        const { slots } = await calculateAvailability(options);
        updatedGapSlots = slots.map(s => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() }));
        
        if (updatedGapSlots.some(s => s.start === slotStart)) {
            isViable = true;
        }
    }

    return { 
        isViable,
        diagnostic: [travelToResult, travelFromResult],
        updatedGapSlots,
        travelIsKnown
    };
}
