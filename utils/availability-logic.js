// utils/availability-logic.js
// ───────────────────────────────────────────────────────────────────────────
// Eén zelf-contained functie om vrije slots te berekenen.
// Houdt rekening met:
//   • werktijden per dag (availability[])
//   • reistijd heen/terug optioneel
//   • FLEXIBEL (= reistijd eerst, afspraak daarna) vs VAST (= eerst afspraak)
//   • buffer tussen afspraken
//   • drukke events uit Google Calendar
//   • locale weergave + UTC-iso voor booking
// ───────────────────────────────────────────────────────────────────────────
import {
  addMinutes,
  differenceInMinutes,
  areIntervalsOverlapping,
  set,
} from 'date-fns';

/**
 * @param {Object} opts
 * @param {import('../server.js').LinkRow}  opts.link   volledige rij uit links
 * @param {{start:Date,end:Date}[]}         opts.busySlots  UTC-datums
 * @param {string}                          opts.destinationAddress
 * @param {function(string,string):Promise<number>} opts.getTravelTime → seconden
 * @param {number} [opts.daysAhead=7]
 * @returns {Promise<{start:string,end:string,start_utc:string}[]>}
 */
export async function calculateAvailability ({
  link,
  busySlots,
  destinationAddress,
  getTravelTime,
  daysAhead = 7,
}) {
  const {
    availability,
    duration,
    buffer,
    start_address: startAddress,
    include_travel_start: incTravelStart,
    include_travel_end:   incTravelEnd,
    workday_mode:         mode,              // "VAST" of "FLEXIBEL"
    timezone = 'Europe/Amsterdam',
  } = link;

  // Maak busy-intervals alvast “buffered”
  const busy = busySlots.map(b => ({
    start: addMinutes(b.start, -buffer),
    end:   addMinutes(b.end,   +buffer),
  }));

  const gridMin   = 15;
  const result    = [];
  const todayUtc  = new Date();

  // Reistijd 1× opvragen en cachen (± 2 sec per Distance-Matrix-call)
  const secGo   = incTravelStart ? await getTravelTime(startAddress, destinationAddress) : 0;
  const secBack = incTravelEnd   ? await getTravelTime(destinationAddress, startAddress) : 0;

  for (let d = 1; d <= daysAhead; d++) {
    const dayUtc       = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() + d));
    const rule         = availability.find(r => r.dayOfWeek === dayUtc.getUTCDay());
    if (!rule) continue;

    // “08:30” → Date in UTC op dezelfde dag
    const dayStartUtc  = set(dayUtc, { hours: +rule.startTime.split(':')[0], minutes:+rule.startTime.split(':')[1], seconds:0, milliseconds:0 });
    const dayEndUtc    = set(dayUtc, { hours: +rule.endTime.split(':')[0],   minutes:+rule.endTime.split(':')[1],   seconds:0, milliseconds:0 });

    for (let slotStart = new Date(dayStartUtc); addMinutes(slotStart,duration) <= dayEndUtc; ) {

      // FLEXIBEL = afspraak na reistijd; VAST = eerst afspraak dan reistijd
      const apptStart = mode === 'FLEXIBEL' ? addMinutes(slotStart,  secGo/60) : slotStart;
      const apptEnd   = addMinutes(apptStart, duration);
      const totalInt  = {
        start: incTravelStart ? new Date(apptStart.getTime() - secGo*1000) : apptStart,
        end:   incTravelEnd   ? new Date(apptEnd .getTime() + secBack*1000): apptEnd ,
      };

      const clashes = busy.some(b => areIntervalsOverlapping(totalInt, b));

      if (!clashes) {
        result.push({
          start: apptStart.toLocaleString('nl-NL', { timeZone: timezone }),
          end:   apptEnd  .toLocaleString('nl-NL', { timeZone: timezone }),
          start_utc: apptStart.toISOString(),
        });
        // Volgende kans = einde afspraak + buffer
        slotStart = addMinutes(apptEnd, buffer);
      } else {
        // Verschuif met grid tot we uit het overlap-blok zijn
        slotStart = addMinutes(slotStart, gridMin);
      }
    }
  }
  return result;
}
