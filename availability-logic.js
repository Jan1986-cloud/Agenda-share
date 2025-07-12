// availability-logic.js

/**
 * Berekent de reistijd. Deze functie is hier geïsoleerd voor eenvoudige tests.
 * In de echte app wordt de Google Maps API gebruikt.
 * @param {string} origin - De startlocatie.
 * @param {string} destination - De eindlocatie.
 * @returns {Promise<number>} Reistijd in seconden.
 */
async function getTravelTime(origin, destination) {
    // Dummy implementatie voor testen.
    if (origin === 'Groningen' && destination === 'Venlo') {
        return 3 * 60 * 60; // 3 uur
    }
    if (origin === 'Amsterdam' && destination === 'Utrecht') {
        return 45 * 60; // 45 minuten
    }
    return 30 * 60; // Standaard 30 minuten
}


/**
 * Berekent de beschikbare afspraak-slots.
 * @param {object} options - De opties voor de berekening.
 * @returns {Array<object>} Een array met beschikbare slots.
 */
export async function calculateAvailability(options) {
    const {
        availabilityRules,
        busySlots,
        appointmentDuration,
        buffer,
        startAddress,
        destinationAddress,
        maxTravelTime,
        workdayMode,
        includeTravelStart,
        includeTravelEnd
    } = options;

    const availableSlots = [];
    const appointmentDurationMs = appointmentDuration * 60000;
    const bufferMs = buffer * 60000;
    const now = new Date();

    for (let d = 1; d <= 7; d++) {
        const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
        const dayOfWeek = currentDay.getDay();
        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);

        if (!rule) continue;

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = new Date(currentDay.setHours(startHour, startMinute, 0, 0));
        const dayEnd = new Date(currentDay.setHours(endHour, endMinute, 0, 0));
        
        const dailyBusySlots = busySlots.filter(slot => 
            slot.start.getDate() === currentDay.getDate() &&
            slot.start.getMonth() === currentDay.getMonth() &&
            slot.start.getFullYear() === currentDay.getFullYear()
        );

        let potentialStartTime = new Date(dayStart);

        while (potentialStartTime < dayEnd) {
            const prevAppointment = dailyBusySlots
                .filter(slot => slot.end <= potentialStartTime)
                .sort((a, b) => b.end - a.end)[0];

            const origin = prevAppointment?.location || startAddress;
            const travelToSeconds = await getTravelTime(origin, destinationAddress);

            if (maxTravelTime && (travelToSeconds / 60) > maxTravelTime) {
                potentialStartTime.setMinutes(potentialStartTime.getMinutes() + 15);
                continue;
            }

            const travelToMs = travelToSeconds * 1000;
            
            let appointmentStart = new Date(potentialStartTime.getTime());
            if (workdayMode === 'FLEXIBEL') {
                if (prevAppointment) {
                    appointmentStart = new Date(prevAppointment.end.getTime() + travelToMs);
                } else if (includeTravelStart) {
                    appointmentStart = new Date(potentialStartTime.getTime() + travelToMs);
                }
            }

            const appointmentEnd = new Date(appointmentStart.getTime() + appointmentDurationMs);

            const nextAppointment = dailyBusySlots.find(slot => slot.start >= appointmentEnd);
            const travelFromMs = nextAppointment ? await getTravelTime(destinationAddress, nextAppointment.location) * 1000 : 0;
            
            let totalBlockEnd = new Date(appointmentEnd.getTime() + bufferMs);
            if (workdayMode === 'FLEXIBEL') {
                if (nextAppointment) {
                    totalBlockEnd = new Date(totalBlockEnd.getTime() + travelFromMs);
                } else if (includeTravelEnd) {
                    totalBlockEnd = new Date(totalBlockEnd.getTime() + (await getTravelTime(destinationAddress, startAddress) * 1000));
                }
            }

            let isAvailable = true;
            if (appointmentStart < potentialStartTime || appointmentEnd > dayEnd) {
                isAvailable = false;
            } else if (nextAppointment && totalBlockEnd > nextAppointment.start) {
                isAvailable = false;
            }

            for (const busy of dailyBusySlots) {
                if (appointmentStart < busy.end && appointmentEnd > busy.start) {
                    isAvailable = false;
                    break;
                }
            }

            if (isAvailable) {
                availableSlots.push({
                    start: appointmentStart,
                    end: appointmentEnd,
                });
            }
            potentialStartTime.setMinutes(potentialStartTime.getMinutes() + 15);
        }
    }
    return availableSlots;
}