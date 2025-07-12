// availability-logic.js

/**
 * Berekent de beschikbare afspraak-slots.
 * @param {object} options - De opties voor de berekening.
 * @returns {Array<object>} Een array met beschikbare slots.
 */
export async function calculateAvailability(options) {
    const {
        link, // Pass the entire link object
        busySlots,
        destinationAddress,
        getTravelTime,
    } = options;

    const {
        availability: availabilityRules,
        duration: appointmentDuration,
        buffer,
        start_address: startAddress,
        max_travel_time: maxTravelTime,
        workday_mode: workdayMode,
        include_travel_start: includeTravelStart,
        include_travel_end: includeTravelEnd,
        timezone, // Destructure timezone
    } = link;

    const availableSlots = [];
    const appointmentDurationMs = appointmentDuration * 60000;
    const bufferMs = buffer * 60000;
    const now = new Date();

    for (let d = 1; d <= 7; d++) {
        const currentDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
        const dayOfWeek = currentDay.getUTCDay();
        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);

        if (!rule) continue;

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));
        
        const dailyBusySlots = busySlots.filter(slot => 
            slot.start.getUTCDate() === currentDay.getUTCDate() &&
            slot.start.getUTCMonth() === currentDay.getUTCMonth() &&
            slot.start.getUTCFullYear() === currentDay.getUTCFullYear()
        );

        let potentialStartTime = new Date(dayStart);

        while (potentialStartTime < dayEnd) {
            const prevAppointment = dailyBusySlots
                .filter(slot => slot.end <= potentialStartTime)
                .sort((a, b) => b.end - a.end)[0];

            const origin = prevAppointment?.location || startAddress;
            const travelToSeconds = await getTravelTime(origin, destinationAddress);

            if (maxTravelTime && (travelToSeconds / 60) > maxTravelTime) {
                potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15);
                continue;
            }

            const travelToMs = travelToSeconds * 1000;
            
            let appointmentStart;
            if (prevAppointment) {
                appointmentStart = new Date(prevAppointment.end.getTime() + travelToMs);
            } else {
                appointmentStart = new Date(potentialStartTime.getTime() + (workdayMode === 'FLEXIBEL' && includeTravelStart ? travelToMs : 0));
            }
            
            const roundedMinutes = Math.ceil(appointmentStart.getUTCMinutes() / 15) * 15;
            appointmentStart.setUTCMinutes(roundedMinutes, 0, 0);

            if (appointmentStart < potentialStartTime) {
                 potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15);
                 continue;
            }

            const appointmentEnd = new Date(appointmentStart.getTime() + appointmentDurationMs);

            if (appointmentEnd > dayEnd) {
                break; 
            }

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
            if (nextAppointment && totalBlockEnd > nextAppointment.start) {
                isAvailable = false;
            }

            for (const busy of dailyBusySlots) {
                if (appointmentStart < busy.end && appointmentEnd > busy.start) {
                    isAvailable = false;
                    break;
                }
            }

            if (isAvailable) {
                if (!availableSlots.some(s => s.start.getTime() === appointmentStart.getTime())) {
                    availableSlots.push({
                        start: appointmentStart, // Keep as Date object for now
                        end: appointmentEnd,
                    });
                }
            }
            
            potentialStartTime = new Date(appointmentStart.getTime());
            potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15);
        }
    }
    
    // Convert final slots to the user's timezone string before returning
    const userTimeZone = timezone || 'Europe/Amsterdam';
    return availableSlots.map(slot => ({
        start: slot.start.toLocaleString('nl-NL', { timeZone: userTimeZone }),
        end: slot.end.toLocaleString('nl-NL', { timeZone: userTimeZone }),
        start_utc: slot.start.toISOString(), // Also include ISO string for booking
    }));
}
