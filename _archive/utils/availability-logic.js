// Bestand: availability-logic.js
// VERBETERDE VERSIE

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
    // Helper functie om te checken of twee tijdvakken overlappen
    const hasOverlap = (start1, end1, start2, end2) => {
        return start1 < end2 && end1 > start2;
    };
    // Helper functie om tijd af te ronden naar het volgende kwartier
    const roundToNext15Minutes = (date) => {
        const rounded = new Date(date);
        const minutes = rounded.getUTCMinutes();
        const remainder = minutes % 15;
        if (remainder !== 0) {
            rounded.setUTCMinutes(minutes + (15 - remainder), 0, 0);
        } else {
            rounded.setUTCSeconds(0, 0);
        }
        return rounded;
    };
    // Loop door de komende 7 dagen
    for (let d = 0; d <= 7; d++) {
        const currentDay = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + d
        ));
        const dayOfWeek = currentDay.getUTCDay();

        // Vind de beschikbaarheidsregel voor deze dag
        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);
        if (!rule) continue; // Geen regel = niet beschikbaar

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        // Werkdag start en einde in UTC
        const dayStart = new Date(Date.UTC(
            currentDay.getUTCFullYear(),
            currentDay.getUTCMonth(),
            currentDay.getUTCDate(),
            startHour,
            startMinute
        ));

        const dayEnd = new Date(Date.UTC(
            currentDay.getUTCFullYear(),
            currentDay.getUTCMonth(),
            currentDay.getUTCDate(),
            endHour,
            endMinute
        ));

        // Filter busy slots voor deze dag
        const todayBusySlots = busySlots
            .filter(slot => {
                const slotDate = new Date(slot.start);
                return slotDate.getUTCFullYear() === currentDay.getUTCFullYear() &&
                    slotDate.getUTCMonth() === currentDay.getUTCMonth() &&
                    slotDate.getUTCDate() === currentDay.getUTCDate();
            })
            .sort((a, b) => a.start.getTime() - b.start.getTime());

        // Start met het eerste mogelijke tijdstip
        let currentTime = new Date(dayStart);

        if (d === 0 && now > dayStart) {
            currentTime = roundToNext15Minutes(now);
            if (currentTime >= dayEnd) continue;
        }

        // Loop door de dag in stappen van 15 minuten
        while (currentTime < dayEnd) {
            let slotStart = new Date(currentTime);
            let slotEnd = new Date(slotStart.getTime() + appointmentDurationMs);

            if (slotEnd > dayEnd) {
                break; 
            }

            let travelTimeToMs = 0;

            const previousAppointment = todayBusySlots
                .filter(slot => slot.end <= slotStart)
                .sort((a, b) => b.end.getTime() - a.end.getTime())[0];

            const nextAppointment = todayBusySlots
                .find(slot => slot.start >= slotEnd);

            const originForTravel = previousAppointment ?
                previousAppointment.location : startAddress;

            try {
                const travelTimeSeconds = await getTravelTime(originForTravel, destinationAddress);

                if (maxTravelTime && (travelTimeSeconds / 60) > maxTravelTime) {
                    currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 15);
                    continue;
                }

                travelTimeToMs = travelTimeSeconds * 1000;
            } catch (error) {
                console.error('Error getting travel time:', error);
                currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 15);
                continue;
            }

            if (workdayMode === 'FLEXIBEL') {
                if (previousAppointment) {
                    const earliestStart = new Date(previousAppointment.end.getTime() + travelTimeToMs);
                    if (earliestStart > slotStart) {
                        slotStart = roundToNext15Minutes(earliestStart);
                        slotEnd = new Date(slotStart.getTime() + appointmentDurationMs);
                        
                        if (slotEnd > dayEnd) break;
                    }
                } else if (includeTravelStart) {
                    const earliestStart = new Date(dayStart.getTime() + travelTimeToMs);
                    if (earliestStart > slotStart) {
                        slotStart = roundToNext15Minutes(earliestStart);
                        slotEnd = new Date(slotStart.getTime() + appointmentDurationMs);

                        if (slotEnd > dayEnd) break;
                    }
                }
            } else { // VAST mode
                if (previousAppointment) {
                    const earliestStart = new Date(previousAppointment.end.getTime() + travelTimeToMs);
                    if (earliestStart > slotStart) {
                        currentTime = roundToNext15Minutes(earliestStart);
                        continue;
                    }
                }
            }

            let totalBlockEnd = new Date(slotEnd.getTime() + bufferMs);

            if (nextAppointment) {
                try {
                    const travelFromSeconds = await getTravelTime(destinationAddress, nextAppointment.location);
                    const travelTimeFromMs = travelFromSeconds * 1000;
                    const latestEnd = new Date(nextAppointment.start.getTime() - travelTimeFromMs);
                    if (slotEnd > latestEnd) {
                        currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 15);
                        continue;
                    }
                } catch (error) {
                    console.error('Error getting travel time:', error);
                    currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 15);
                    continue;
                }
            } else if (workdayMode === 'FLEXIBEL' && includeTravelEnd) {
                try {
                    const travelHomeSeconds = await getTravelTime(destinationAddress, startAddress);
                    const travelHomeMs = travelHomeSeconds * 1000;
                    const latestEnd = new Date(dayEnd.getTime() - travelHomeMs);
                    if (slotEnd > latestEnd) {
                        currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 15);
                        continue;
                    }
                } catch (error) {
                    console.error('Error getting travel time home:', error);
                }
            }

            let hasConflict = false;
            for (const busy of todayBusySlots) {
                if (hasOverlap(
                    slotStart.getTime(),
                    totalBlockEnd.getTime(),
                    busy.start.getTime(),
                    busy.end.getTime()
                )) {
                    hasConflict = true;
                    currentTime = roundToNext15Minutes(busy.end);
                    break;
                }
            }

            if (!hasConflict) {
                availableSlots.push({
                    start: slotStart,
                    end: slotEnd
                });

                currentTime = new Date(slotStart.getTime());
                currentTime.setUTCMinutes(currentTime.getUTCMinutes() + 15);
            }
        }
    }
    return availableSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
}