import { calculateAvailability } from './availability-logic.js';

async function runTest() {
    console.log('--- STARTING ISOLATED DIAGNOSTIC TEST ---');

    const mockOptions = {
        availabilityRules: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }], // Maandag 09:00-17:00
        busySlots: [
            {
                start: new Date(Date.UTC(2025, 6, 14, 12, 30, 0)), // 14 juli 2025, 12:30 UTC
                end: new Date(Date.UTC(2025, 6, 14, 13, 30, 0)),   // 14 juli 2025, 13:30 UTC
                location: 'Geboekte Afspraak Locatie'
            }
        ],
        appointmentDuration: 30,
        buffer: 15,
        startAddress: 'Veenendaal',
        destinationAddress: 'Amersfoort',
        maxTravelTime: 60,
        workdayMode: 'VAST',
        includeTravelStart: true,
        includeTravelEnd: true,
        getTravelTime: async (origin, destination) => {
            console.log(`Mock getTravelTime called for: ${origin} -> ${destination}`);
            return 1200; // Mock reistijd: retourneert altijd 20 minuten (1200 seconden)
        },
    };

    console.log('Input Options:', {
        ...mockOptions,
        getTravelTime: '<function>',
        busySlots: mockOptions.busySlots.map(s => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() })),
    });

    try {
        const availableSlots = await calculateAvailability(mockOptions);

        console.log('--- TEST RESULT: AVAILABLE SLOTS ---');
        if (availableSlots.length === 0) {
            console.log('No available slots found.');
        } else {
            for (const slot of availableSlots) {
                console.log(`Slot: ${new Date(slot.start).toISOString()} -> ${new Date(slot.end).toISOString()}`);
            }
        }
    } catch (error) {
        console.error('--- TEST FAILED WITH ERROR ---', error);
    }
}

runTest();