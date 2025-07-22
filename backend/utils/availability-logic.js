// Bestand: utils/availability-logic.js
// Finale, robuuste implementatie voor de "on-demand" architectuur met "ripple-effect" ondersteuning.

export async function calculateAvailability(options) {
    const {
        availability: availabilityRules,
        busySlots = [],
        duration: appointmentDuration,
        buffer,
        planningOffsetDays = 0,
        planningWindowDays = 14,
        targetDate, // Optioneel: voor het berekenen van een enkele dag
        knownTravelTimes // Optioneel: voor het "ripple" effect
    } = options;

    const appointmentDurationMs = appointmentDuration * 60000;
    const bufferMs = buffer * 60000;
    const now = new Date();
    const finalSlots = [];

    const daysToIterate = targetDate ? [new Date(targetDate)] : 
        Array.from({ length: planningWindowDays }, (_, i) => {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + planningOffsetDays + i));
            return d;
        });

    for (const currentDay of daysToIterate) {
        const dayOfWeek = currentDay.getUTCDay();
        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);
        if (!rule || !rule.startTime || !rule.endTime) continue;

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));

        if (isNaN(dayStart.getTime()) || isNaN(dayEnd.getTime())) {
            console.warn(`Ongeldige tijd gevonden in beschikbaarheidsregel voor dag ${dayOfWeek}, regel wordt overgeslagen.`, rule);
            continue;
        }

        const dailyBusySlots = busySlots.filter(slot => {
            const slotDate = new Date(slot.start);
            return slotDate.getUTCFullYear() === currentDay.getUTCFullYear() &&
                   slotDate.getUTCMonth() === currentDay.getUTCMonth() &&
                   slotDate.getUTCDate() === currentDay.getUTCDate();
        });

        const timeBoundaries = [dayStart.getTime(), dayEnd.getTime(), ...dailyBusySlots.flatMap(s => [s.start.getTime(), s.end.getTime()])];
        const uniqueBoundaries = [...new Set(timeBoundaries)].sort((a, b) => a - b);

        for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
            const gapStartMs = uniqueBoundaries[i];
            let gapEndMs = uniqueBoundaries[i + 1];
            gapEndMs = Math.min(gapEndMs, dayEnd.getTime());

            const isOverlapping = dailyBusySlots.some(slot => gapStartMs < slot.end.getTime() && gapEndMs > slot.start.getTime());
            if (isOverlapping || (gapEndMs - gapStartMs < appointmentDurationMs)) {
                continue;
            }

            const lastAppointmentBeforeGap = dailyBusySlots.filter(s => s.end.getTime() <= gapStartMs).pop();
            const nextAppointmentAfterGap = dailyBusySlots.find(s => s.start.getTime() >= gapEndMs);
            
            const earliestPossibleStartInGap = (lastAppointmentBeforeGap ? lastAppointmentBeforeGap.end.getTime() : dayStart.getTime()) + bufferMs;
            const latestPossibleEndInGap = (nextAppointmentAfterGap ? nextAppointmentAfterGap.start.getTime() : dayEnd.getTime()) - bufferMs;

            let cursorTime = Math.max(gapStartMs, now.getTime(), earliestPossibleStartInGap);
            const intervalMs = 15 * 60 * 1000;
            cursorTime = Math.ceil(cursorTime / intervalMs) * intervalMs;

            while (cursorTime + appointmentDurationMs <= latestPossibleEndInGap) {
                const potentialStart = new Date(cursorTime);
                const potentialEnd = new Date(cursorTime + appointmentDurationMs);
                
                let slotData = { start: potentialStart, end: potentialEnd };

                if (knownTravelTimes) {
                    // Ripple-effect logica: bereken of het past met de bekende reistijd.
                    const travelToMs = knownTravelTimes.travelToDuration * 1000;
                    const travelFromMs = knownTravelTimes.travelFromDuration * 1000;
                    if (potentialStart.getTime() >= earliestPossibleStartInGap + travelToMs && potentialEnd.getTime() + travelFromMs <= latestPossibleEndInGap) {
                        slotData.certainty = 'green';
                        finalSlots.push(slotData);
                    }
                } else {
                    // Initiële marge-berekening logica.
                    const timeBeforeMs = potentialStart.getTime() - earliestPossibleStartInGap;
                    const timeAfterMs = latestPossibleEndInGap - potentialEnd.getTime();
                    const marginMs = Math.min(timeBeforeMs, timeAfterMs);

                    if (marginMs >= 3600000) slotData.marginCategory = 'blue';
                    else if (marginMs >= 1800000) slotData.marginCategory = 'yellow';
                    else slotData.marginCategory = 'red';
                    finalSlots.push(slotData);
                }
                
                cursorTime += intervalMs;
            }
        }
    }

    return { slots: finalSlots, diagnosticLog: [] };
}
