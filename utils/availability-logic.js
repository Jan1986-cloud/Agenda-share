// Bestand: utils/availability-logic.js
// Definitieve versie met genuanceerde risico-analyse op basis van marge.

export async function calculateAvailability(options) {
    const {
        availabilityRules,
        busySlots = [],
        appointmentDuration,
        buffer,
        startAddress,
        destinationAddress,
        maxTravelTime,
        getTravelTime,
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

    // --- Fase 1: Genereer alle theoretisch mogelijke slots (zonder reistijd) ---
    const theoreticalSlots = [];
    for (let d = 0; d <= 7; d++) {
        const currentDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
        const dayOfWeek = currentDay.getUTCDay();

        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);
        if (!rule) continue;

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));
        
        const todayBusySlots = busySlots
            .filter(slot => slot && slot.start && slot.end)
            .map(s => ({ start: new Date(s.start), end: new Date(s.end), location: s.location || startAddress }))
            .filter(slot => slot.start.getUTCFullYear() === currentDay.getUTCFullYear() &&
                             slot.start.getUTCMonth() === currentDay.getUTCMonth() &&
                             slot.start.getUTCDate() === currentDay.getUTCDate())
            .sort((a, b) => a.start.getTime() - b.start.getTime());

        let cursor = roundToNext15Minutes(new Date(dayStart.getTime()));

        while (cursor.getTime() < dayEnd.getTime()) {
            const potentialSlotStart = new Date(cursor.getTime());
            const potentialSlotEnd = new Date(potentialSlotStart.getTime() + appointmentDurationMs);

            if (potentialSlotEnd > dayEnd) break;

            let isClashing = false;
            for (const busy of todayBusySlots) {
                if (potentialSlotStart < busy.end && potentialSlotEnd > busy.start) {
                    isClashing = true;
                    cursor = roundToNext15Minutes(new Date(busy.end.getTime() + bufferMs));
                    break;
                }
            }

            if (!isClashing) {
                theoreticalSlots.push({ start: potentialSlotStart, end: potentialSlotEnd });
                cursor = new Date(potentialSlotStart.getTime() + 15 * 60000);
            }
        }
    }

    // --- Fase 2 & 3: Valideer met reistijd en bepaal 'certainty' op basis van marge ---
    const validatedSlots = [];
    const allBusySlotsSorted = busySlots
        .map(s => ({ ...s, start: new Date(s.start), end: new Date(s.end) }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const slot of theoreticalSlots) {
        const lastAppointmentBefore = allBusySlotsSorted
            .filter(s => s.end.getTime() <= slot.start.getTime())
            .pop();
            
        const origin = lastAppointmentBefore ? (lastAppointmentBefore.location || startAddress) : startAddress;

        const travelResult = await getTravelTime(origin, destinationAddress);

        if (travelResult.status === 'OK') {
            const travelToMs = travelResult.duration * 1000;
            if (maxTravelTime && (travelToMs / 60000) > maxTravelTime) continue;

            const availableTimeBefore = lastAppointmentBefore 
                ? slot.start.getTime() - (lastAppointmentBefore.end.getTime() + bufferMs)
                : Infinity; 

            if (availableTimeBefore >= travelToMs) {
                validatedSlots.push({ ...slot, certainty: 'green' });
            }
        } else {
            // API call mislukt, bepaal 'certainty' op basis van de beschikbare marge
            const timeBeforeMs = lastAppointmentBefore
                ? slot.start.getTime() - (lastAppointmentBefore.end.getTime() + bufferMs)
                : 3600001; // Als er niks voor is, is de marge effectief > 1 uur

            let certainty;
            if (timeBeforeMs >= 3600000) { // 1 uur of meer
                certainty = 'yellow';
            } else if (timeBeforeMs >= 1800000) { // 30 min of meer
                certainty = 'orange';
            } else { // Minder dan 30 min
                certainty = 'red';
            }
            validatedSlots.push({ ...slot, certainty });
        }
    }

    const uniqueSlots = Array.from(new Map(validatedSlots.map(slot => [slot.start.toISOString(), slot])).values());
    return uniqueSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
