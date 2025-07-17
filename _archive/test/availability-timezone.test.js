// test/availability-timezone.test.js
import { calculateAvailability } from '../../utils/availability-logic.js';

// stub reistijd (override voor elke test)
const mockGetTravelTime = async (origin, destination) => ({ duration: 0, status: 'OK', origin, destination });

const today = new Date();
const fixedTomorrow = new Date(
  Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + 1,
    0,
    0,
    0
  )
);
const dayOfWeek = fixedTomorrow.getUTCDay();

const link = {
  availability: [{ dayOfWeek, startTime: '09:00', endTime: '17:00' }],
  duration: 30,
  buffer: 15,
  start_address: 'StartLocatie',
  max_travel_time: null,
  workday_mode: 'VAST',
  include_travel_start: true,
  include_travel_end: true,
  timezone: 'Europe/Amsterdam'
};


describe('calculateAvailability with Timezone and Travel Time', () => {
    const today = new Date();
    // Set a fixed date in UTC to ensure tests are consistent
    const fixedTomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 0, 0, 0));
    const dayOfWeek = fixedTomorrow.getUTCDay();

    // 1. Test Case: Timezone conversion and travel time deduction
    it('should return slots in the correct timezone and account for travel time', async () => {
        const link = {
            availability: [{ dayOfWeek, startTime: '09:00', endTime: '17:00' }],
            duration: 60, // 60 minutes
            buffer: 0,
            start_address: 'Test HQ',
            max_travel_time: 120,
            workday_mode: 'FLEXIBEL',
            include_travel_start: true,
            include_travel_end: false,
            timezone: 'America/New_York', // A timezone significantly different from UTC
            planningOffsetDays: 1,
            planningWindowDays: 1,
        };

        const options = {
            ...link, // Spread the link properties into the main options object
            busySlots: [],
            destinationAddress: 'New York Test Office',
            getTravelTime: mockGetTravelTime,
        };

        const { slots } = await calculateAvailability(options);

        // --- Assertions ---
        expect(slots.length).toBeGreaterThan(0);

        // Check if travel time was correctly subtracted at the start
        // Workday starts at 9:00 AM New York Time.
        // Travel time is 30 minutes (1800s).
        // In FLEXIBEL mode, the first slot should start at 9:30 AM.
        const firstSlot = slots[0];
        
        // The response format is now a Date object
        const expectedFirstSlotHour = 9;
        const expectedFirstSlotMinute = 30;

        // We need to check the hours and minutes in the correct timezone
        const slotTimeInNY = new Date(firstSlot.start.toLocaleString('en-US', { timeZone: 'America/New_York' }));

        expect(slotTimeInNY.getHours()).toBe(expectedFirstSlotHour);
        expect(slotTimeInNY.getMinutes()).toBe(expectedFirstSlotMinute);

        // Verify that the date part of the string corresponds to the correct local date
        // For a test run in Europe, 'America/New_York' is several hours behind.
        // The UTC date of the slot should still be the 'fixedTomorrow' date.
        const slotUtcDate = firstSlot.start;
        expect(slotUtcDate.getUTCDate()).toBe(fixedTomorrow.getUTCDate());
        expect(slotUtcDate.getUTCMonth()).toBe(fixedTomorrow.getUTCMonth());
        expect(slotUtcDate.getUTCFullYear()).toBe(fixedTomorrow.getUTCFullYear());
    });
});
