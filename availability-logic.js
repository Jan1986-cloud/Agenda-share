// availability-logic.js
// Dit bestand bevat de kernlogica voor het berekenen van beschikbare afspraak-slots.

/**
 * Berekent de beschikbare afspraak-slots voor een monteur, rekening houdend met werktijden,
 * drukke slots, reistijd en verschillende werkdagmodi.
 *
 * @param {object} options - De configuratie-opties voor de berekening.
 * @param {Array<object>} options.availabilityRules - Een array van regels die de start- en eindtijden per dag van de week definiëren.
 * Elke regel moet `dayOfWeek` (0=Zondag, 6=Zaterdag), `startTime` (string "HH:MM") en `endTime` (string "HH:MM") bevatten.
 * @param {Array<object>} options.busySlots - Een array van reeds geplande afspraken/blokkeringen.
 * Elk druk slot moet `start` (Date object), `end` (Date object) en `location` (string) bevatten.
 * @param {number} options.appointmentDuration - De standaard duur van een afspraak in minuten.
 * @param {number} options.buffer - De buffertijd in minuten die na elke afspraak nodig is.
 * @param {string} options.startAddress - Het startadres van de monteur voor reistijdberekeningen.
 * @param {string} options.destinationAddress - Het standaard bestemmingsadres voor afspraken.
 * @param {number|null} options.maxTravelTime - De maximale toegestane reistijd in minuten, of null indien geen limiet.
 * @param {'VAST'|'FLEXIBEL'} options.workdayMode - De modus van de werkdag: 'VAST' (reistijd telt mee in werkdag) of 'FLEXIBEL' (reistijd buiten werkdag).
 * @param {boolean} options.includeTravelStart - Of reistijd aan het begin van de dag moet worden meegerekend.
 * @param {boolean} options.includeTravelEnd - Of reistijd aan het einde van de dag moet worden meegerekend.
 * @param {function(string, string): Promise<number>} options.getTravelTime - Een asynchrone functie die de reistijd in seconden retourneert tussen twee adressen.
 * @returns {Promise<Array<object>>} Een Promise die resolved met een array van beschikbare slots.
 */
export async function calculateAvailability(options) {
    const {
        availabilityRules,
        busySlots = [], // Zorg ervoor dat busySlots altijd een array is
        appointmentDuration,
        buffer,
        startAddress,
        destinationAddress,
        maxTravelTime,
        workdayMode,
        includeTravelStart,
        includeTravelEnd,
        getTravelTime,
    } = options;

    const availableSlots = [];
    const appointmentDurationMs = appointmentDuration * 60000; // Converteer duur naar milliseconden
    const bufferMs = buffer * 60000; // Converteer buffer naar milliseconden

    const now = new Date(); // Huidige datum/tijd in lokale tijdzone

    // Loop door de komende 7 dagen om potentiële slots te vinden
    // Start bij d=0 om vandaag ook mee te nemen, d=1 voor morgen etc.
    for (let d = 0; d <= 7; d++) {
        // Maak een UTC-datum voor de huidige dag om tijdzone-problemen te voorkomen
        const currentDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d));
        const dayOfWeek = currentDay.getUTCDay(); // Haal de UTC dag van de week op (0 = Zondag, 6 = Zaterdag)

        const rule = availabilityRules.find(r => r.dayOfWeek === dayOfWeek);

        if (!rule) {
            // Geen beschikbaarheidsregel voor deze dag, dus sla deze dag over
            continue;
        }

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        // Definieer de start en het einde van de werkdag in UTC
        const dayStart = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), currentDay.getUTCDate(), endHour, endMinute));

        // Filter en sorteer drukke slots voor de huidige dag
        const dailyBusySlots = busySlots
            .filter(slot =>
                slot.start.getUTCFullYear() === currentDay.getUTCFullYear() &&
                slot.start.getUTCMonth() === currentDay.getUTCMonth() &&
                slot.start.getUTCDate() === currentDay.getUTCDate()
            )
            .sort((a, b) => a.start.getTime() - b.start.getTime());

        // potentialStartTime is de tijd die we itereren om mogelijke afspraken te starten
        let potentialStartTime = new Date(dayStart.getTime());

        // Loop zolang potentialStartTime binnen de werkdag valt en er nog ruimte is voor een afspraak
        while (potentialStartTime.getTime() + appointmentDurationMs <= dayEnd.getTime()) {
            let appointmentStart = new Date(potentialStartTime.getTime());
            let travelToMs = 0;
            let travelFromMs = 0;

            // Zoek de laatst geplande afspraak die eindigt vóór of overlapt met de huidige potentialStartTime
            let prevAppointment = null;
            for (let i = dailyBusySlots.length - 1; i >= 0; i--) {
                const busy = dailyBusySlots[i];
                if (busy.end <= potentialStartTime) {
                    prevAppointment = busy;
                    break;
                } else if (busy.start < potentialStartTime && busy.end > potentialStartTime) {
                    // Als potentialStartTime binnen een druk slot valt, spring dan over dit drukke slot heen
                    potentialStartTime = new Date(busy.end.getTime());
                    // Rond af naar het volgende 15-minuten interval na het drukke slot
                    potentialStartTime.setUTCMinutes(Math.ceil(potentialStartTime.getUTCMinutes() / 15) * 15, 0, 0);
                    // Ga direct naar de volgende iteratie van de while-lus met de nieuwe potentialStartTime
                    continue; // Dit zorgt ervoor dat de huidige potentialStartTime niet verder wordt verwerkt
                }
            }

            // Bereken reistijd naar de afspraaklocatie
            const originForTravelTo = prevAppointment ? prevAppointment.location : startAddress;
            const travelToSeconds = await getTravelTime(originForTravelTo, destinationAddress);

            // Controleer maximale reistijd
            if (maxTravelTime && (travelToSeconds / 60) > maxTravelTime) {
                potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15);
                continue; // Sla dit slot over en probeer het volgende
            }
            travelToMs = travelToSeconds * 1000;

            // Bepaal de werkelijke starttijd van de afspraak op basis van de modus
            if (workdayMode === 'FLEXIBEL') {
                if (prevAppointment) {
                    // In FLEXIBEL: afspraak start na vorige afspraak + reistijd
                    appointmentStart = new Date(prevAppointment.end.getTime() + travelToMs);
                } else {
                    // In FLEXIBEL: eerste afspraak van de dag, reistijd vanaf startpunt
                    appointmentStart = new Date(dayStart.getTime() + (includeTravelStart ? travelToMs : 0));
                }
            } else { // VASTE modus
                if (prevAppointment) {
                    // In VASTE: afspraak start na vorige afspraak + reistijd
                    appointmentStart = new Date(prevAppointment.end.getTime() + travelToMs);
                } else {
                    // In VASTE: eerste afspraak van de dag, start op dayStart
                    appointmentStart = new Date(dayStart.getTime());
                }
            }

            // Rond de berekende starttijd af naar het volgende 15-minuten interval
            const roundedMinutes = Math.ceil(appointmentStart.getUTCMinutes() / 15) * 15;
            appointmentStart.setUTCMinutes(roundedMinutes, 0, 0);

            // Zorg ervoor dat de afspraak niet te vroeg begint (vóór de potentialStartTime van de loop)
            // Dit is cruciaal voor het "impossible slot" probleem
            if (appointmentStart.getTime() < potentialStartTime.getTime()) {
                // Als de afgeronde starttijd nog steeds vóór de huidige potentialStartTime ligt,
                // betekent dit dat we dit slot moeten overslaan en de potentialStartTime moeten opschuiven.
                potentialStartTime = new Date(potentialStartTime.getTime()); // Behoud de huidige potentialStartTime
                potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15); // Ga naar het volgende interval
                continue; // Sla dit slot over en probeer de volgende iteratie
            }


            const appointmentEnd = new Date(appointmentStart.getTime() + appointmentDurationMs);

            // Controleer of de afspraak eindigt na de werkdag. Zo ja, dan stoppen we voor deze dag.
            // Dit is de fix voor de "boundary" fout
            if (appointmentEnd.getTime() > dayEnd.getTime()) {
                break; // Stop met het genereren van slots voor deze dag
            }

            // Bereken reistijd vanaf deze afspraak naar de volgende (indien aanwezig)
            const nextAppointment = dailyBusySlots.find(slot => slot.start.getTime() >= appointmentEnd.getTime());
            travelFromMs = nextAppointment ? await getTravelTime(destinationAddress, nextAppointment.location) * 1000 : 0;

            // totalBlockEnd is de tijd dat de monteur weer beschikbaar is na deze afspraak (incl. buffer en reistijd terug)
            let totalBlockEnd = new Date(appointmentEnd.getTime() + bufferMs);
            if (workdayMode === 'FLEXIBEL' && includeTravelEnd) {
                // Alleen reistijd terug toevoegen als FLEXIBEL en includeTravelEnd waar is,
                // en als er geen volgende afspraak is (anders wordt travelFromMs al gebruikt)
                if (!nextAppointment) {
                     totalBlockEnd = new Date(totalBlockEnd.getTime() + (await getTravelTime(destinationAddress, startAddress) * 1000));
                } else {
                    totalBlockEnd = new Date(totalBlockEnd.getTime() + travelFromMs);
                }
            } else if (workdayMode === 'VAST' && nextAppointment) {
                // In VASTE modus, als er een volgende afspraak is, moet de totalBlockEnd ook rekening houden met de reistijd naar de volgende afspraak.
                // Dit is al verrekend in travelFromMs.
                 totalBlockEnd = new Date(totalBlockEnd.getTime() + travelFromMs);
            }


            let isAvailable = true;

            // Controleer op overlap met bestaande drukke slots
            for (const busy of dailyBusySlots) {
                // Een slot is NIET beschikbaar als het overlapt met een druk slot
                // Overlap: (StartA < EindeB && EindeA > StartB)
                if (
                    (appointmentStart.getTime() < busy.end.getTime() && appointmentEnd.getTime() > busy.start.getTime()) ||
                    (totalBlockEnd.getTime() > busy.start.getTime() && appointmentStart.getTime() < busy.end.getTime()) // Overlap inclusief reistijd/buffer
                ) {
                    isAvailable = false;
                    // Als er een conflict is, verschuif potentialStartTime naar het einde van het drukke slot
                    potentialStartTime = new Date(busy.end.getTime());
                    potentialStartTime.setUTCMinutes(Math.ceil(potentialStartTime.getUTCMinutes() / 15) * 15, 0, 0); // Rond af
                    break; // Stop met controleren van drukke slots voor dit potentialStartTime
                }
            }

            // Voeg het slot toe als het beschikbaar is en nog niet bestaat
            if (isAvailable) {
                // Dubbelcheck of het slot niet buiten de werkdag valt (zou al door de while/if break moeten zijn)
                if (appointmentEnd.getTime() <= dayEnd.getTime()) {
                    // Voorkom duplicaten (hoewel de potentialStartTime progressie dit al zou moeten voorkomen)
                    if (!availableSlots.some(s => s.start.getTime() === appointmentStart.getTime())) {
                        availableSlots.push({
                            start: new Date(appointmentStart),
                            end: new Date(appointmentEnd),
                            // Optioneel: voeg hier andere relevante informatie toe, zoals location
                        });
                    }
                }
            }

            // Ga naar het volgende potentiële starttijd interval
            // Als er geen conflict was, schuif dan 15 minuten op vanaf de huidige appointmentStart
            // Als er een conflict was, is potentialStartTime al bijgewerkt in de busySlots loop
            if (isAvailable) { // Alleen opschuiven als er een slot is toegevoegd of geëvalueerd
                potentialStartTime = new Date(appointmentStart.getTime());
                potentialStartTime.setUTCMinutes(potentialStartTime.getUTCMinutes() + 15);
            }
            // Als !isAvailable, is potentialStartTime al bijgewerkt om het drukke slot te omzeilen, dus geen extra opschuiving nodig hier.
        }
    }

    // Sorteer de slots op chronologische volgorde
    return availableSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
}