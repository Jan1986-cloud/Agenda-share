// availability-logic.js
// Generates a 15-minute grid, blocks volledige reis- én gespreksduur + buffer,
// retourneert slots als lokale strings in link.timezone, ISO voor booking.

import { addMinutes, isBefore, areIntervalsOverlapping } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';

/**
 * @param {Object}  p
 * @param {Object}  p.link
 * @param {Array<{start:Date,end:Date}>} p.busySlots
 * @param {string}  p.destinationAddress
 * @param {function(string,string):Promise<number>} p.getTravelTime – returns seconden
 * @param {number} [p.daysAhead=7]
 * @returns {Promise<Array<{start:string,end:string,start_utc:string}>>}
 */
export async function calculateAvailability ({
  link,
  busySlots,
  destinationAddress,
  getTravelTime,
  daysAhead = 7
}) {
  const {
    availability,
    duration,
    buffer,
    start_address: startAddress,
    workday_mode: workdayMode,
    include_travel_start: includeTravelStart,
    include_travel_end: includeTravelEnd,
    timezone = 'Europe/Amsterdam'
  } = link;

  const busy = busySlots.map(s => ({ start: new Date(s.start), end: new Date(s.end) }));
  const now  = new Date();
  const grid = 15;               // minuten
  const out  = [];

  for (let d = 1; d <= daysAhead; d++) {
    const day   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
    const rule  = availability.find(r => r.dayOfWeek === day.getUTCDay());
    if (!rule) continue;

    const dateISO  = day.toISOString().split('T')[0];                       // YYYY-MM-DD
    const dayStart = zonedTimeToUtc(`${dateISO} ${rule.startTime}`, timezone);
    const dayEnd   = zonedTimeToUtc(`${dateISO} ${rule.endTime}` , timezone);

    let cursor = new Date(dayStart);

    while (isBefore(addMinutes(cursor, duration), dayEnd)) {
      const travelStartSec = includeTravelStart ? await getTravelTime(startAddress, destinationAddress) : 0;
      const travelEndSec   = includeTravelEnd   ? await getTravelTime(destinationAddress, startAddress) : 0;

      // FLEXIBEL: afspraak begint pas ná reistijd
      const appointmentStart = workdayMode === 'FLEXIBEL'
        ? addMinutes(cursor, travelStartSec / 60)
        : cursor;

      const appointmentEnd = addMinutes(appointmentStart, duration);
      const totalStart     = new Date(appointmentStart.getTime() - travelStartSec * 1000);
      const totalEnd       = new Date(appointmentEnd .getTime() + travelEndSec * 1000);

      const conflict = busy.some(b => areIntervalsOverlapping({ start: totalStart, end: totalEnd }, b));

      if (!conflict) {
        out.push({
          start     : appointmentStart.toLocaleString('nl-NL', { timeZone: timezone }),
          end       : appointmentEnd .toLocaleString('nl-NL', { timeZone: timezone }),
          start_utc : appointmentStart.toISOString()
        });
        cursor = addMinutes(totalEnd, buffer);          // voorbij blok + buffer
      } else {
        cursor = addMinutes(cursor, grid);              // schuif raster
      }
    }
  }
  return out;
}
