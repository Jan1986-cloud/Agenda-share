// availability-logic.test.js
import { calculateAvailability } from './availability-logic.js';

// Mock de reistijd functie voor voorspelbare tests
// Retourneert reistijd in seconden
const mockGetTravelTime = async (origin, destination) => {
    if (origin === 'Veenendaal' && destination === 'Rotterdam') return 3600; // 1 uur
    if (origin === 'Amsterdam' && destination === 'Utrecht') return 2700; // 45 min
    if (origin === 'StartLocatie' && destination === 'Utrecht') return 1800; // 30 min standaard voor eerste reis
    if (origin === 'StartLocatie' && destination === 'Rotterdam') return 3600; // 1 uur voor eerste reis naar Rotterdam
    return 1800; // Standaard 30 min (0.5 uur)
};

describe('calculateAvailability', () => {
    // Gebruik altijd UTC-tijden in tests voor consistentie
    const today = new Date();
    // Stel tomorrow in als een specifieke datum in UTC om te zorgen dat tests consistent zijn,
    // ongeacht wanneer ze worden uitgevoerd.
    const fixedTomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 0, 0, 0));
    const dayOfWeek = fixedTomorrow.getUTCDay(); // Haal de UTC dag van de week op

    const baseOptions = {
        availabilityRules: [{ dayOfWeek, startTime: '09:00', endTime: '17:00' }], // Werktijden van 09:00 UTC tot 17:00 UTC
        busySlots: [],
        appointmentDuration: 30, // 30 minuten
        buffer: 15, // 15 minuten buffer
        startAddress: 'StartLocatie', // Nieuw startadres voor duidelijkheid
        destinationAddress: 'Utrecht',
        maxTravelTime: null,
        workdayMode: 'VAST',
        includeTravelStart: true,
        includeTravelEnd: true,
        getTravelTime: mockGetTravelTime,
    };

    it('should return correct slots for a standard empty day, respecting UTC', async () => {
        const slots = await calculateAvailability(baseOptions);
        expect(slots.length).toBeGreaterThan(0);
        // De eerste afspraak moet om 09:00 UTC zijn
        expect(slots[0].start.getUTCHours()).toBe(9);
        expect(slots[0].start.getUTCMinutes()).toBe(0);

        // Controleer of de laatste slot eindigt vóór 17:00 UTC
        const lastSlot = slots[slots.length - 1];
        const lastSlotEnd = new Date(lastSlot.start.getTime() + baseOptions.appointmentDuration * 60000);
        expect(lastSlotEnd.getUTCHours()).toBeLessThanOrEqual(17); // Kan 17:00 zijn als het precies past
        if (lastSlotEnd.getUTCHours() === 17) {
            expect(lastSlotEnd.getUTCMinutes()).toBe(0); // Als het 17:00 is, moeten de minuten 0 zijn
        }
    });

    it('should not suggest a slot if travel time makes it impossible (FLEXIBEL mode)', async () => {
        const busySlots = [
            // Een druk slot van 13:00 UTC tot 13:45 UTC in Veenendaal
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 13, 0, 0)),
              end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 13, 45, 0)),
              location: 'Veenendaal' }
        ];
        // Reistijd van Veenendaal naar Rotterdam is 1 uur (3600s)
        // Dus een afspraak na 13:45 in Veenendaal kan pas om 14:45 in Rotterdam beginnen.
        const options = { ...baseOptions, busySlots, destinationAddress: 'Rotterdam', workdayMode: 'FLEXIBEL' };
        const slots = await calculateAvailability(options);

        // Er mag geen slot zijn dat begint vóór 14:45 UTC (13:45 einde busy + 1 uur reistijd)
        const impossibleSlot = slots.find(s => s.start.getUTCHours() < 14 || (s.start.getUTCHours() === 14 && s.start.getUTCMinutes() < 45));
        expect(impossibleSlot).toBeUndefined();

        // Controleer of er wel slots ná 14:45 UTC zijn
        const possibleSlotAfterBusy = slots.find(s => s.start.getUTCHours() >= 14 && s.start.getUTCMinutes() >= 45);
        expect(possibleSlotAfterBusy).toBeDefined();
        expect(possibleSlotAfterBusy.start.getUTCHours()).toBe(14);
        expect(possibleSlotAfterBusy.start.getUTCMinutes()).toBe(45);
    });

    it('should strictly respect the end time and not schedule on the boundary', async () => {
        // Stel een werkdag in die eindigt om 17:00 UTC
        const options = { ...baseOptions, availabilityRules: [{ dayOfWeek, startTime: '09:00', endTime: '17:00' }] };
        const slots = await calculateAvailability(options);

        // De laatste afspraak moet eindigen vóór 17:00 UTC.
        // Als een afspraak van 30 minuten precies om 16:30 start en om 17:00 eindigt,
        // dan zou deze nog steeds niet gepland moeten worden als de regel 'toBeLessThan(17)' is.
        // Echter, als de regel 'toBeLessThanOrEqual(17)' is, dan is 17:00 toegestaan.
        // De test verwacht 'toBeLessThan(17)', dus een slot dat om 16:30 begint en om 17:00 eindigt,
        // zou niet in de lijst moeten staan.
        const lastSlot = slots[slots.length - 1];
        const lastSlotEnd = new Date(lastSlot.start.getTime() + baseOptions.appointmentDuration * 60000);

        // De test verwacht strikt minder dan 17. Als een slot om 16:30 start en 17:00 eindigt,
        // dan is getUTCHours() 17. Dit moet dus voorkomen worden.
        expect(lastSlotEnd.getUTCHours()).toBeLessThan(17);
        // Controleer ook dat er geen slots zijn die na 17:00 eindigen
        const slotAfterEndTime = slots.find(s => (s.start.getTime() + baseOptions.appointmentDuration * 60000) > options.availabilityRules[0].endTime.split(':').map(Number)[0] * 3600000 + options.availabilityRules[0].endTime.split(':').map(Number)[1] * 60000);
        expect(slotAfterEndTime).toBeUndefined();
    });

    it('should handle buffer time correctly', async () => {
        const busySlots = [
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 0, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 30, 0)), location: 'Veenendaal' }
        ];
        const options = { ...baseOptions, busySlots, buffer: 30 }; // 30 min buffer
        const slots = await calculateAvailability(options);

        // Een afspraak van 30 min eindigt om 10:30. Met 30 min buffer is monteur pas 11:00 vrij.
        // Volgende slot kan pas om 11:00 starten.
        const slotAfterBusy = slots.find(s => s.start.getUTCHours() === 11 && s.start.getUTCMinutes() === 0);
        expect(slotAfterBusy).toBeDefined();
        expect(slotAfterBusy.start.getUTCHours()).toBe(11);
        expect(slotAfterBusy.start.getUTCMinutes()).toBe(0);
    });

    it('should correctly handle multiple busy slots and gaps', async () => {
        const busySlots = [
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 9, 30, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 0, 0)), location: 'Loc1' },
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 11, 0, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 11, 45, 0)), location: 'Loc2' },
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 14, 0, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 14, 30, 0)), location: 'Loc3' }
        ];
        const options = { ...baseOptions, busySlots, appointmentDuration: 30, buffer: 0 }; // Geen buffer voor deze test
        const slots = await calculateAvailability(options);

        // Verwachte slots:
        // 09:00 - 09:30 (voor eerste busy)
        // 10:00 - 10:30 (na eerste busy)
        // 10:30 - 11:00 (vult gat voor tweede busy)
        // 11:45 - 12:15 (na tweede busy)
        // 12:15 - 12:45
        // ...
        // 14:30 - 15:00 (na derde busy)
        // ...
        // Laatste slot eindigt voor 17:00

        const expectedStarts = [
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 9, 0, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 0, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 30, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 11, 45, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 12, 15, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 12, 45, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 13, 15, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 13, 45, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 14, 30, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 15, 0, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 15, 30, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 16, 0, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 16, 30, 0)).getTime(),
        ];

        const actualStarts = slots.map(s => s.start.getTime());
        expect(actualStarts).toEqual(expectedStarts);
    });

    it('should handle travel time for the first appointment of the day (VAST mode)', async () => {
        const options = { ...baseOptions, startAddress: 'Amsterdam', destinationAddress: 'Utrecht', includeTravelStart: true, workdayMode: 'VAST' };
        // Reistijd Amsterdam naar Utrecht is 45 min (2700s)
        // In VASTE modus, eerste afspraak start op 09:00, reistijd wordt als onderdeel van de werkdag gezien.
        // Dus de eerste afspraak om 09:00 moet gewoon beschikbaar zijn.
        const slots = await calculateAvailability(options);
        expect(slots[0].start.getUTCHours()).toBe(9);
        expect(slots[0].start.getUTCMinutes()).toBe(0);
    });

    it('should handle travel time for the first appointment of the day (FLEXIBEL mode)', async () => {
        const options = { ...baseOptions, startAddress: 'Amsterdam', destinationAddress: 'Utrecht', includeTravelStart: true, workdayMode: 'FLEXIBEL' };
        // Reistijd Amsterdam naar Utrecht is 45 min (2700s)
        // In FLEXIBEL modus, reistijd wordt opgeteld bij de start van de werkdag.
        // Werkdag start 09:00, plus 45 min reistijd = 09:45
        const slots = await calculateAvailability(options);
        expect(slots[0].start.getUTCHours()).toBe(9);
        expect(slots[0].start.getUTCMinutes()).toBe(45);
    });

    it('should handle travel time at the end of the day (FLEXIBEL mode)', async () => {
        const options = { ...baseOptions, startAddress: 'Amsterdam', destinationAddress: 'Utrecht', includeTravelEnd: true, workdayMode: 'FLEXIBEL' };
        // Reistijd Utrecht naar Amsterdam is 30 min (standaard mock)
        // Werkdag eindigt 17:00. Laatste afspraak moet eindigen zodat er nog 30 min reistijd terug is.
        // Afspraak duur 30 min. Dus laatste afspraak kan uiterlijk 16:00 starten (16:30 einde afspraak + 30 min reistijd = 17:00)
        // Maar de test verwacht dat het slot eindigt VOOR 17:00. Dus 16:30 slot is te laat.
        // Het laatste slot zou 15:30-16:00 moeten zijn.
        const slots = await calculateAvailability(options);
        const lastSlot = slots[slots.length - 1];
        const lastSlotEnd = new Date(lastSlot.start.getTime() + baseOptions.appointmentDuration * 60000);
        expect(lastSlotEnd.getUTCHours()).toBeLessThan(16); // Moet eindigen voor 16:00
        expect(lastSlotEnd.getUTCMinutes()).toBe(0); // Of 15:45 als afgerond
    });

    it('should not schedule if total block (appointment + buffer + travel) conflicts with next busy slot', async () => {
        const busySlots = [
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 45, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 11, 15, 0)), location: 'Veenendaal' }
        ];
        const options = { ...baseOptions, busySlots, appointmentDuration: 30, buffer: 15, destinationAddress: 'Utrecht', workdayMode: 'VAST' };
        // Afspraak duur 30 min, buffer 15 min. Totaal 45 min.
        // Reistijd naar Utrecht is 45 min.
        // Als een slot om 09:00 start, eindigt het om 09:30. Met 15 min buffer is monteur vrij om 09:45.
        // Volgende busy slot start om 10:45.
        // Als een slot om 10:00 start, eindigt het om 10:30. Met 15 min buffer is monteur vrij om 10:45.
        // Dit overlapt precies met het begin van de busy slot. Dit slot mag dus niet gepland worden.
        const slots = await calculateAvailability(options);
        
        const conflictingSlot = slots.find(s => 
            s.start.getUTCHours() === 10 && s.start.getUTCMinutes() === 0
        );
        expect(conflictingSlot).toBeUndefined(); // Het slot dat om 10:00 zou beginnen, mag er niet zijn.

        // Het slot van 09:45-10:15 zou wel moeten bestaan
        const previousSlot = slots.find(s => 
            s.start.getUTCHours() === 9 && s.start.getUTCMinutes() === 45
        );
        expect(previousSlot).toBeDefined();
    });

    it('should correctly round potential start times to 15-minute intervals', async () => {
        // Stel een busy slot in dat eindigt op een niet-15-minuten interval
        const busySlots = [
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 9, 0, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 9, 23, 0)), location: 'Loc' }
        ];
        const options = { ...baseOptions, busySlots, appointmentDuration: 30, buffer: 0 };
        const slots = await calculateAvailability(options);

        // Het busy slot eindigt om 09:23. Volgende potentiële starttijd moet 09:30 zijn (afgerond).
        const firstSlotAfterBusy = slots.find(s => s.start.getUTCHours() >= 9 && s.start.getUTCMinutes() >= 23);
        expect(firstSlotAfterBusy).toBeDefined();
        expect(firstSlotAfterBusy.start.getUTCHours()).toBe(9);
        expect(firstSlotAfterBusy.start.getUTCMinutes()).toBe(30);
    });

    it('should not schedule before dayStart even with travel time (FLEXIBEL mode)', async () => {
        const options = {
            ...baseOptions,
            availabilityRules: [{ dayOfWeek, startTime: '10:00', endTime: '17:00' }], // Werkdag start om 10:00 UTC
            startAddress: 'Verwegistan', // Adres met lange reistijd
            destinationAddress: 'Utrecht',
            includeTravelStart: true,
            workdayMode: 'FLEXIBEL',
            getTravelTime: async () => 7200 // 2 uur reistijd
        };
        // Werkdag start 10:00. 2 uur reistijd. Eerste afspraak zou 12:00 moeten starten.
        const slots = await calculateAvailability(options);
        expect(slots[0].start.getUTCHours()).toBe(12);
        expect(slots[0].start.getUTCMinutes()).toBe(0);
    });

    it('should not schedule before dayStart even with travel time (VAST mode)', async () => {
        const options = {
            ...baseOptions,
            availabilityRules: [{ dayOfWeek, startTime: '10:00', endTime: '17:00' }], // Werkdag start om 10:00 UTC
            startAddress: 'Verwegistan', // Adres met lange reistijd
            destinationAddress: 'Utrecht',
            includeTravelStart: true,
            workdayMode: 'VAST',
            getTravelTime: async () => 7200 // 2 uur reistijd
        };
        // In VASTE modus, reistijd wordt als onderdeel van de werkdag gezien.
        // De werkdag begint om 10:00, dus de eerste afspraak moet om 10:00 starten.
        const slots = await calculateAvailability(options);
        expect(slots[0].start.getUTCHours()).toBe(10);
        expect(slots[0].start.getUTCMinutes()).toBe(0);
    });

    it('should not schedule if appointment duration exceeds remaining time in day', async () => {
        const options = {
            ...baseOptions,
            availabilityRules: [{ dayOfWeek, startTime: '09:00', endTime: '09:30' }], // Korte werkdag
            appointmentDuration: 60 // Afspraak van 60 minuten
        };
        // Geen enkel slot van 60 minuten past in een werkdag van 30 minuten.
        const slots = await calculateAvailability(options);
        expect(slots.length).toBe(0);
    });

    it('should correctly handle a busy slot that spans across potential start times', async () => {
        const busySlots = [
            { start: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 9, 10, 0)), end: new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 9, 50, 0)), location: 'Loc' }
        ];
        const options = { ...baseOptions, busySlots, appointmentDuration: 30, buffer: 0 };
        const slots = await calculateAvailability(options);

        // Verwachte slots:
        // 09:00 - 09:30 (overlapt met busy, dus mag niet)
        // 09:15 - 09:45 (overlapt met busy, dus mag niet)
        // 09:30 - 10:00 (overlapt met busy, dus mag niet)
        // Eerste geldige slot zou 10:00 moeten zijn (na 09:50 busy end, afgerond naar 10:00)
        const expectedStarts = [
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 0, 0)).getTime(),
            new Date(Date.UTC(fixedTomorrow.getUTCFullYear(), fixedTomorrow.getUTCMonth(), fixedTomorrow.getUTCDate(), 10, 30, 0)).getTime(),
            // ... rest van de dag
        ];
        expect(slots[0].start.getTime()).toBe(expectedStarts[0]);
        // Controleer dat de slots tot 10:00 er niet zijn.
        const impossibleSlotsBefore10 = slots.filter(s => s.start.getUTCHours() < 10);
        expect(impossibleSlotsBefore10.length).toBe(0);
    });
});
