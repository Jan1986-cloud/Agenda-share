// availability-logic.js
import { addMinutes, isBefore, areIntervalsOverlapping } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

/**
 * Hoofdalgoritme: genereert 15-minuten-grid, blokkeert totale reis +
 * gespreksduur + buffer en geeft slots terug in link.timezone.
 */
export async function calculateAvailability ({
  link,
  busySlots = [],
  destinationAddress,
  getTravelTime,
  daysAhead = 7
}) {
  const {
    availability,
    duration,                     // minuten
    buffer,
    start_address: startAddress,
    workday_mode: workdayMode,
    include_travel_start: includeTravelStart,
    include_travel_end: includeTravelEnd,
    timezone = 'Europe/Amsterdam'
  } = link;

  const busy = busySlots.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
  const results = [];
  const grid = 15;
  const today = new Date();

  for (let d = 1; d <= daysAhead; d++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d));
    const rule = availability.find(r => r.dayOfWeek === day.getUTCDay());
    if (!rule) continue;

    // Dagstart/dag-einde in UTC op basis van tijdzone
    const dateIso = day.toISOString().split('T')[0];
    const dayStart = zonedTimeToUtc(`${dateIso} ${rule.startTime}`, timezone);
    const dayEnd   = zonedTimeToUtc(`${dateIso} ${rule.endTime}`,  timezone);

    let pointer = new Date(dayStart);

    while (isBefore(addMinutes(pointer, duration), dayEnd)) {

      const tStartSec = includeTravelStart ? await getTravelTime(startAddress, destinationAddress) : 0;
      const tEndSec   = includeTravelEnd   ? await getTravelTime(destinationAddress, startAddress) : 0;

      // FLEXIBEL-modus → afspraak begint pas ná heenreis
      const appointmentStart = workdayMode === 'FLEXIBEL'
        ? addMinutes(pointer, tStartSec / 60)
        : pointer;

      const appointmentEnd = addMinutes(appointmentStart, duration);

      const totalStart = new Date(appointmentStart.getTime() - tStartSec * 1000);
      const totalEnd   = new Date(appointmentEnd .getTime() + tEndSec * 1000);

      const overlap = busy.some(b =>
        areIntervalsOverlapping({ start: totalStart, end: totalEnd }, b)
      );

      if (!overlap) {
        results.push({
          start     : appointmentStart.toLocaleString('nl-NL', { timeZone: timezone }),
          end       : appointmentEnd .toLocaleString('nl-NL', { timeZone: timezone }),
          start_utc : appointmentStart.toISOString()
        });
        pointer = addMinutes(totalEnd, buffer);      // verder na totaalblok + buffer
      } else {
        pointer = addMinutes(pointer, grid);         // stap raster
      }
    }
  }
  return results;
}
