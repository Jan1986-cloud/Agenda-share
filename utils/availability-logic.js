// availability-logic.js
// FINALE, CORRECTE IMPLEMENTATIE

/**
 * Berekent de beschikbare afspraak-slots op basis van werktijden, bestaande afspraken en reistijd.
 * Alle interne datumberekeningen verlopen strikt in UTC.
 *
 * @param {object} options - De configuratie-opties voor de berekening.
 * @param {object} options.link - Het link-object uit de database.
 * @param {Array<object>} options.busySlots - Array van bezette slots uit Google Calendar. Elk object moet { start: Date, end: Date, location: string } bevatten.
 * @param {string} options.destinationAddress - Het doeladres voor de nieuwe afspraak.
 * @param {function(string, string): Promise<number>} options.getTravelTime - Functie die reistijd in seconden retourneert.
 * @param {number} [options.daysAhead=7] - Het aantal dagen vooruit om te controleren.
 * @returns {Promise<Array<object>>} Een Promise die resolved met een array van beschikbare slots.
 */
export async function calculateAvailability({
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
    workday_mode: workdayMode,
    include_travel_start: includeTravelStart,
    include_travel_end: includeTravelEnd,
    max_travel_time: maxTravelTime,
  } = link;

  const availableSlots = [];
  const now = new Date();
  const sortedBusySlots = busySlots.sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let d = 1; d <= daysAhead; d++) {
    const currentDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
    const dayOfWeek = currentDay.getUTCDay();

    const rule = availability.find(r => r.dayOfWeek === dayOfWeek);
    if (!rule) continue;

    const [startHour, startMinute] = rule.startTime.split(':').map(Number);
    const [endHour, endMinute] = rule.endTime.split(':').map(Number);

    const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
    const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));

    let potentialStart = new Date(dayStart.getTime());

    while (potentialStart < dayEnd) {
      // Stap 1: Bepaal de échte oorsprong voor de reistijd.
      const lastBusySlotBeforePotentialStart = sortedBusySlots
        .filter(slot => slot.end.getTime() <= potentialStart.getTime())
        .pop();
      
      const origin = lastBusySlotBeforePotentialStart?.location || startAddress;

      // Stap 2: Bereken reistijd vanaf de échte oorsprong.
      const travelToSeconds = await getTravelTime(origin, destinationAddress);
      
      if (maxTravelTime && (travelToSeconds / 60) > maxTravelTime) {
        potentialStart.setUTCMinutes(potentialStart.getUTCMinutes() + 15);
        continue;
      }
      
      const travelToMs = travelToSeconds * 1000;

      // Stap 3: Bepaal de starttijd van de afspraak, rekening houdend met de vorige afspraak.
      let appointmentStart = new Date(potentialStart.getTime());
      if (lastBusySlotBeforePotentialStart) {
        const availableAfterBusy = lastBusySlotBeforePotentialStart.end.getTime() + buffer * 60000;
        appointmentStart = new Date(Math.max(potentialStart.getTime(), availableAfterBusy));
      }

      // VASTE modus: reistijd is onderdeel van de werkdag. Starttijd afspraak is de berekende `appointmentStart`.
      // FLEXIBELE modus: reistijd komt bovenop de beschikbare tijd.
      if (workdayMode === 'FLEXIBEL') {
         if (lastBusySlotBeforePotentialStart) {
             appointmentStart = new Date(lastBusySlotBeforePotentialStart.end.getTime() + buffer * 60000 + travelToMs);
         } else if (includeTravelStart) {
             appointmentStart = new Date(dayStart.getTime() + travelToMs);
         }
      }

      // Afronden op het volgende kwartier
      const roundedMinutes = Math.ceil(appointmentStart.getUTCMinutes() / 15) * 15;
      appointmentStart.setUTCMinutes(roundedMinutes, 0, 0);

      if(appointmentStart < potentialStart) {
          potentialStart.setUTCMinutes(potentialStart.getUTCMinutes() + 15);
          continue;
      }
      
      const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60000);

      // Stap 4: Controleer of het volledige blok (inclusief reistijd terug) past.
      const travelBackMs = includeTravelEnd ? (await getTravelTime(destinationAddress, startAddress)) * 1000 : 0;
      const totalBlockEnd = new Date(appointmentEnd.getTime() + travelBackMs);
      
      if (totalBlockEnd.getTime() > dayEnd.getTime()) {
        potentialStart.setUTCMinutes(potentialStart.getUTCMinutes() + 15);
        continue;
      }

      // Stap 5: Finale clash-detectie met alle bestaande afspraken.
      let hasConflict = false;
      for (const busy of sortedBusySlots) {
        if (appointmentStart.getTime() < busy.end.getTime() && appointmentEnd.getTime() > busy.start.getTime()) {
          hasConflict = true;
          // Spring naar het einde van het conflict-slot voor de volgende poging
          potentialStart = new Date(busy.end.getTime() + buffer * 60000);
          break;
        }
      }

      if (!hasConflict) {
        availableSlots.push({
          start_utc: appointmentStart.toISOString(),
          end_utc: appointmentEnd.toISOString(),
        });
        potentialStart = new Date(appointmentStart.getTime());
        potentialStart.setUTCMinutes(potentialStart.getUTCMinutes() + 15);
      }
    }
  }

  // Verwijder duplicaten en sorteer
  const uniqueSlots = Array.from(new Set(availableSlots.map(s => s.start_utc)))
    .map(start_utc => availableSlots.find(s => s.start_utc === start_utc));

  return uniqueSlots.sort((a, b) => new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime());
}