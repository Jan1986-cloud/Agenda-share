// Bestand: utils/availability-logic.js
// Aangepaste implementatie die de marge berekent voor de "on-demand" architectuur.

export async function calculateAvailability(options) {
    const {
        availability: availabilityRules,
        busySlots = [],
        duration: appointmentDuration,
        buffer,
        planningOffsetDays = 0,
        planningWindowDays = 14,
    } = options;

    const appointmentDurationMs = appointmentDuration * 60000;
    const bufferMs = buffer * 60000;
    const now = new Date();
    const finalSlots = [];

    const daysToIterate = Array.from({ length: planningWindowDays }, (_, i) => {
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

        const timeBoundaries = [dayStart.getTime(), dayEnd.getTime()];
        dailyBusySlots.forEach(slot => {
            timeBoundaries.push(slot.start.getTime());
            timeBoundaries.push(slot.end.getTime());
        });
        
        const uniqueBoundaries = [...new Set(timeBoundaries)].sort((a, b) => a - b);

        for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
            const gapStartMs = uniqueBoundaries[i];
            let gapEndMs = uniqueBoundaries[i + 1];
            gapEndMs = Math.min(gapEndMs, dayEnd.getTime());

            const isOverlapping = dailyBusySlots.some(slot => 
                (gapStartMs >= slot.start.getTime() && gapStartMs < slot.end.getTime()) ||
                (gapEndMs > slot.start.getTime() && gapEndMs <= slot.end.getTime())
            );
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

                const timeBeforeMs = potentialStart.getTime() - earliestPossibleStartInGap;
                const timeAfterMs = latestPossibleEndInGap - potentialEnd.getTime();
                const marginMs = Math.min(timeBeforeMs, timeAfterMs);

                let marginCategory;
                if (marginMs >= 3600000) { // > 1 uur
                    marginCategory = 'blue';
                } else if (marginMs >= 1800000) { // 30-60 min
                    marginCategory = 'yellow';
                } else { // < 30 min
                    marginCategory = 'red';
                }
                
                finalSlots.push({ start: potentialStart, end: potentialEnd, marginCategory });
                cursorTime += intervalMs;
            }
        }
    }

    return { slots: finalSlots, diagnosticLog: [] };
}
