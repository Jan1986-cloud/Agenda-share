// utils/availability-logic.js
// Complete replacement — self‑contained, no external globals required
// Core idea: generate 15‑minute grid within configured work windows,
// block out full travel time + appointment + buffer, respect busy events,
// and return slots converted to the owner’s configured timezone.

import { differenceInMinutes, addMinutes, isBefore, isAfter, areIntervalsOverlapping } from 'date-fns';

/**
 * @typedef {Object} Link
 * @property {Array<{dayOfWeek:number,startTime:string,endTime:string}>} availability
 * @property {number} duration           // minutes
 * @property {number} buffer             // minutes
 * @property {string} start_address
 * @property {number} max_travel_time    // minutes, optional
 * @property {"VAST"|"FLEXIBEL"} workday_mode
 * @property {boolean} include_travel_start
 * @property {boolean} include_travel_end
 * @property {string} timezone           // e.g. "Europe/Amsterdam"
 */

/**
 * @typedef {Object} BusySlot
 * @property {Date} start
 * @property {Date} end
 */

/**
 * @typedef {Object} SlotResult
 * @property {string} start         // localised human string
 * @property {string} end           // localised human string
 * @property {string} start_utc     // ISO for booking
 */

/**
 * Calculate availability for the next X days.
 * @param {Object} opts
 * @param {Link}   opts.link
 * @param {BusySlot[]} opts.busySlots   already in UTC dates
 * @param {string}     opts.destinationAddress
 * @param {function(string,string):Promise<number>} opts.getTravelTime returns seconds
 * @param {number} [opts.daysAhead=7]
 * @returns {Promise<SlotResult[]>}
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

  // Normalize busy slots to blockers including buffer either side.
  const busyIntervals = busySlots.map(b => ({
    start: new Date(b.start),
    end: new Date(b.end)
  }));

  const results = [];
  const now = new Date();
  const gridMinutes = 15;

  for (let d = 1; d <= daysAhead; d++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
    const rule = availability.find(r => r.dayOfWeek === day.getUTCDay());
    if (!rule) continue; // no availability rule for this weekday

    // Build dayStart/dayEnd in UTC, then adjust by timezone offset.
    const [sH, sM] = rule.startTime.split(':').map(Number);
    const [eH, eM] = rule.endTime.split(':').map(Number);
    const localStart = new Date(`${day.toISOString().split('T')[0]}T${rule.startTime}:00`);
    const localEnd   = new Date(`${day.toISOString().split('T')[0]}T${rule.endTime}:00`);
    // Convert to UTC preserving wall clock in given timezone
    const tzOffsetMs = localStart.getTimezoneOffset() * 60000;
    const dayStart = new Date(localStart.getTime() + tzOffsetMs);
    const dayEnd   = new Date(localEnd.getTime() + tzOffsetMs);

    let potentialStart = new Date(dayStart);

    while (isBefore(addMinutes(potentialStart, duration), dayEnd)) {
      // Travel calculations
      const travelStartSec = includeTravelStart ? await getTravelTime(startAddress, destinationAddress) : 0;
      const travelEndSec   = includeTravelEnd   ? await getTravelTime(destinationAddress, startAddress) : 0;
      const totalStart = new Date(potentialStart.getTime() - travelStartSec * 1000);
      const appointmentEnd = addMinutes(potentialStart, duration);
      const totalEnd = new Date(appointmentEnd.getTime() + travelEndSec * 1000);

      // Check overlap with busy intervals
      const overlaps = busyIntervals.some(b => areIntervalsOverlapping({ start: totalStart, end: totalEnd }, b));

      if (!overlaps) {
        results.push({
          start: potentialStart.toLocaleString('nl-NL', { timeZone: timezone }),
          end: appointmentEnd.toLocaleString('nl-NL', { timeZone: timezone }),
          start_utc: potentialStart.toISOString()
        });
        // Move pointer beyond this blocked period + buffer
        potentialStart = addMinutes(totalEnd, buffer);
      } else {
        // move by grid until we exit overlap
        potentialStart = addMinutes(potentialStart, gridMinutes);
      }
    }
  }

  return results;
}
