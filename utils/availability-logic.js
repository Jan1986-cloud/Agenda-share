// Bestand: utils/availability-logic.js
// Definitieve implementatie die de "sandwich"-logica voor reistijd aan beide kanten van een afspraak correct afhandelt.

export async function calculateAvailability(options) {
    const {
        availabilityRules, busySlots = [], appointmentDuration, buffer,
        startAddress, destinationAddress, maxTravelTime, getTravelTime,
    } = options;

    const appointmentDurationMs = appointmentDuration * 60000;
    const bufferMs = buffer * 60000;
    const now = new Date();

    const roundToNext15Minutes = (date) => {
        const d = new Date(date);
        const minutes = d.getUTCMinutes();
        if (minutes % 15 !== 0) {
            d.setUTCMinutes(minutes + (15 - (minutes % 15)), 0, 0);
        }
        return d;
    };

    const allBusySlotsSorted = busySlots
        .map(s => ({ ...s, start: new Date(s.start), end: new Date(s.end), location: s.location || startAddress }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    const finalSlots = [];

    for (let d = 0; d <= 7; d++) {
        const currentDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
        const dayOfWeek = currentDay.getUTCDay();
        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);
        if (!rule) continue;

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));
        
        let cursor = roundToNext15Minutes(new Date(Math.max(now.getTime(), dayStart.getTime())));

        while (cursor.getTime() < dayEnd.getTime()) {
            const potentialStart = new Date(cursor.getTime());
            
            // --- DE "SANDWICH" LOGICA ---
            const lastAppointmentBefore = allBusySlotsSorted.filter(s => s.end.getTime() <= potentialStart.getTime()).pop();
            const nextAppointmentAfter = allBusySlotsSorted.find(s => s.start.getTime() >= potentialStart.getTime());

            // 1. Check of het slot zelf overlapt met een bestaande afspraak
            if (nextAppointmentAfter && potentialStart.getTime() + appointmentDurationMs > nextAppointmentAfter.start.getTime()) {
                cursor = roundToNext15Minutes(new Date(nextAppointmentAfter.end.getTime() + bufferMs));
                continue;
            }
            
            const potentialEnd = new Date(potentialStart.getTime() + appointmentDurationMs);
            if (potentialEnd > dayEnd) {
                break;
            }

            // 2. Bepaal de reis-eindpunten
            const origin = lastAppointmentBefore ? (lastAppointmentBefore.location || startAddress) : startAddress;
            const destinationForNextTrip = nextAppointmentAfter ? (nextAppointmentAfter.location || startAddress) : startAddress;

            // 3. Haal BEIDE reistijden op
            const travelToResult = await getTravelTime(origin, destinationAddress);
            const travelFromResult = await getTravelTime(destinationAddress, destinationForNextTrip);
            
            const travelIsKnown = travelToResult.status === 'OK' && travelFromResult.status === 'OK';

            if (travelIsKnown) {
                const travelToMs = travelToResult.duration * 1000;
                const travelFromMs = travelFromResult.duration * 1000;
                
                const earliestPossibleStart = lastAppointmentBefore ? (lastAppointmentBefore.end.getTime() + bufferMs) : dayStart.getTime();
                const latestPossibleEnd = nextAppointmentAfter ? (nextAppointmentAfter.start.getTime() - bufferMs) : dayEnd.getTime();
                
                const requiredStartTime = earliestPossibleStart + travelToMs;
                const requiredEndTime = potentialEnd.getTime() + travelFromMs;

                if (potentialStart.getTime() >= requiredStartTime && requiredEndTime <= latestPossibleEnd) {
                    finalSlots.push({ start: potentialStart, end: potentialEnd, certainty: 'green' });
                }
            } else {
                // Als reistijd onbekend is, val terug op de marge-logica
                const timeBeforeMs = lastAppointmentBefore 
                    ? potentialStart.getTime() - (lastAppointmentBefore.end.getTime() + bufferMs)
                    : Infinity;
                
                const timeAfterMs = nextAppointmentAfter
                    ? nextAppointmentAfter.start.getTime() - (potentialEnd.getTime() + bufferMs)
                    : Infinity;
                
                const totalMarginMs = timeBeforeMs === Infinity || timeAfterMs === Infinity ? 3600001 : timeBeforeMs + timeAfterMs;

                let certainty;
                if (totalMarginMs >= 3600000) certainty = 'yellow';
                else if (totalMarginMs >= 1800000) certainty = 'orange';
                else certainty = 'red';
                
                finalSlots.push({ start: potentialStart, end: potentialEnd, certainty });
            }

            cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
        }
    }
    
    return finalSlots;
}