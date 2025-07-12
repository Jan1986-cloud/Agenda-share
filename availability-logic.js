// availability-logic.js

/**
 * Berekent de beschikbare afspraak-slots.
 * @param {object} options - De opties voor de berekening.
 * @returns {Array<object>} Een array met beschikbare slots.
 */
export async function calculateAvailability(options) {
    const {
        link,
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
        timezone,
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
            
            let effectiveStartTime = prevAppointment ? new Date(prevAppointment.end.getTime()) : potentialStartTime;
            
            const totalBlockStart = new Date(effectiveStartTime.getTime() + (workdayMode === 'FLEXIBEL' && includeTravelStart && !prevAppointment ? travelToMs : 0));
            
            const roundedMinutes = Math.ceil(totalBlockStart.getUTCMinutes() / 15) * 15;
            totalBlockStart.setUTCMinutes(roundedMinutes, 0, 0);

            if (totalBlockStart < potentialStartTime) {
                totalBlockStart.setTime(potentialStartTime.getTime());
            }

            const appointmentStart = new Date(totalBlockStart.getTime() + (workdayMode === 'VAST' || (workdayMode === 'FLEXIBEL' && prevAppointment) ? travelToMs : 0));
            const appointmentEnd = new Date(appointmentStart.getTime() + appointmentDurationMs);
            
            if (appointmentEnd > dayEnd) {
                break;
            }

            const nextAppointment = dailyBusySlots.find(slot => slot.start >= appointmentEnd);
            const travelFromMs = nextAppointment ? await getTravelTime(destinationAddress, nextAppointment.location) * 1000 : 0;
            
            const totalBlockEnd = new Date(appointmentEnd.getTime() + bufferMs + (workdayMode === 'FLEXIBEL' && includeTravelEnd ? travelFromMs : 0));

            let isAvailable = true;
            if (nextAppointment && totalBlockEnd > nextAppointment.start) {
                isAvailable = false;
            }

            for (const busy of dailyBusySlots) {
                if (totalBlockStart < busy.end && totalBlockEnd > busy.start) {
                    isAvailable = false;
                    break;
                }
            }

            if (isAvailable) {
                if (!availableSlots.some(s => s.start.getTime() === appointmentStart.getTime())) {
                    availableSlots.push({
                        start: appointmentStart,
                        end: appointmentEnd,
                    });
                }
                // **CRITICAL FIX**: Advance potentialStartTime to the end of the current appointment
                potentialStartTime = new Date(appointmentEnd.getTime());
            } else {
                // If slot is not available, advance by 15 minutes to check the next interval
                potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15);
            }
        }
    }
    
    const userTimeZone = timezone || 'Europe/Amsterdam';
    return availableSlots.map(slot => ({
        start: slot.start.toLocaleString('nl-NL', { timeZone: userTimeZone }),
        end: slot.end.toLocaleString('nl-NL', { timeZone: userTimeZone }),
        start_utc: slot.start.toISOString(),
    }));
}
