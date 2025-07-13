// Bestand: utils/availability-logic.js
// Definitieve, productie-waardige versie

export async function calculateAvailability(options) {
    const {
        availabilityRules,
        busySlots = [],
        appointmentDuration,
        buffer,
        startAddress,
        destinationAddress,
        maxTravelTime,
        workdayMode,
        includeTravelStart,
        includeTravelEnd,
        getTravelTime,
    } = options;

    const availableSlots = [];
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

        let cursor = new Date(dayStart.getTime());

        while (cursor.getTime() < dayEnd.getTime()) {
            let potentialSlotStart = new Date(cursor.getTime());
            
            const lastAppointmentBefore = todayBusySlots.filter(s => s.end.getTime() <= potentialSlotStart.getTime()).pop();
            const origin = lastAppointmentBefore ? (lastAppointmentBefore.location || startAddress) : startAddress;

            const travelToSeconds = await getTravelTime(origin, destinationAddress).catch(() => null);
            if (travelToSeconds === null || (maxTravelTime && (travelToSeconds / 60) > maxTravelTime)) {
                cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
                continue;
            }
            const travelToMs = travelToSeconds * 1000;

            if (lastAppointmentBefore) {
                potentialSlotStart = new Date(Math.max(potentialSlotStart.getTime(), lastAppointmentBefore.end.getTime() + bufferMs));
            }
            
            if (workdayMode === 'FLEXIBEL') {
                 if(lastAppointmentBefore){
                     potentialSlotStart = new Date(lastAppointmentBefore.end.getTime() + bufferMs + travelToMs);
                 } else if (includeTravelStart){
                     potentialSlotStart = new Date(dayStart.getTime() + travelToMs);
                 }
            }
            
            potentialSlotStart = roundToNext15Minutes(potentialSlotStart);
            const potentialSlotEnd = new Date(potentialSlotStart.getTime() + appointmentDurationMs);

            if (potentialSlotEnd > dayEnd) {
                break;
            }

            let isClashing = false;
            for (const busy of todayBusySlots) {
                if (potentialSlotStart < busy.end && potentialSlotEnd > busy.start) {
                    isClashing = true;
                    cursor = roundToNext15Minutes(new Date(busy.end.getTime() + bufferMs));
                    break;
                }
            }

            if (!isClashing) {
                availableSlots.push({ start: potentialSlotStart, end: potentialSlotEnd });
                cursor = new Date(potentialSlotStart.getTime() + 15 * 60000);
            }
        }
    }
    
    const uniqueSlots = Array.from(new Map(availableSlots.map(slot => [slot.start.toISOString(), slot])).values());
    return uniqueSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
