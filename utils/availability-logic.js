// Bestand: utils/availability-logic.js
// Nieuwe, vereenvoudigde implementatie voor de "on-demand" architectuur.
// Deze functie berekent alleen de ruwe, beschikbare gaten zonder reistijd.

export async function calculateAvailability(options) {
    const {
        availability: availabilityRules,
        busySlots = [],
        duration: appointmentDuration,
        planningOffsetDays = 0,
        planningWindowDays = 14,
    } = options;

    const appointmentDurationMs = appointmentDuration * 60000;
    const now = new Date();
    const finalSlots = [];

    // Bepaal de dagen die we moeten controleren
    const daysToIterate = Array.from({ length: planningWindowDays }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + planningOffsetDays + i));
        return d;
    });

    for (const currentDay of daysToIterate) {
        const dayOfWeek = currentDay.getUTCDay();
        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);
        if (!rule || !rule.startTime || !rule.endTime) {
            continue;
        }

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));

        // Essentiële validatie: sla corrupte regels over.
        if (isNaN(dayStart.getTime()) || isNaN(dayEnd.getTime())) {
            console.warn(`Ongeldige tijd gevonden in beschikbaarheidsregel voor dag ${dayOfWeek}, regel wordt overgeslagen. Regel:`, rule);
            continue;
        }

        // Verzamel alle "grenzen" op een dag: start/einde werkdag en start/einde afspraken.
        const timeBoundaries = [dayStart.getTime(), dayEnd.getTime()];
        busySlots.forEach(slot => {
            const slotDate = new Date(slot.start);
            if (slotDate.getUTCFullYear() === currentDay.getUTCFullYear() &&
                slotDate.getUTCMonth() === currentDay.getUTCMonth() &&
                slotDate.getUTCDate() === currentDay.getUTCDate()) {
                timeBoundaries.push(slot.start.getTime());
                timeBoundaries.push(slot.end.getTime());
            }
        });
        
        // Sorteer en ontdubbel de grenzen om schone "gaten" te krijgen.
        const uniqueBoundaries = [...new Set(timeBoundaries)].sort((a, b) => a - b);

        // Loop door elk gat.
        for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
            const gapStartMs = uniqueBoundaries[i];
            let gapEndMs = uniqueBoundaries[i + 1];

            // Zorg ervoor dat het gat niet buiten de werkdag valt.
            gapEndMs = Math.min(gapEndMs, dayEnd.getTime());

            // Controleer of dit "gat" niet binnen een bestaande afspraak valt.
            const isOverlapping = busySlots.some(slot => 
                (gapStartMs >= slot.start.getTime() && gapStartMs < slot.end.getTime()) ||
                (gapEndMs > slot.start.getTime() && gapEndMs <= slot.end.getTime())
            );

            if (isOverlapping) {
                continue;
            }

            // Als het gat te klein is voor de afspraak, sla het over.
            if (gapEndMs - gapStartMs < appointmentDurationMs) {
                continue;
            }

            // Start de cursor aan het begin van het gat, maar niet in het verleden.
            let cursorTime = Math.max(gapStartMs, now.getTime());

            // Rond de cursor af naar boven, naar het volgende kwartier voor schone slots.
            const intervalMs = 15 * 60 * 1000;
            cursorTime = Math.ceil(cursorTime / intervalMs) * intervalMs;

            // Blijf slots toevoegen in het gat totdat het niet meer past.
            while (cursorTime + appointmentDurationMs <= gapEndMs) {
                const potentialStart = new Date(cursorTime);
                const potentialEnd = new Date(cursorTime + appointmentDurationMs);
                finalSlots.push({ start: potentialStart, end: potentialEnd });

                // Verplaats de cursor naar het volgende slot.
                cursorTime += intervalMs;
            }
        }
    }

    // Geef de ruwe slots terug. De reistijd-check gebeurt on-demand.
    return { slots: finalSlots, diagnosticLog: [] };
}
