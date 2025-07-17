/* eslint-env jest */
import { calculateAvailability } from '../utils/availability-logic.js';

// Helper to get a UTC date for tomorrow
const now = new Date();
const tomorrowUtc = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
);
const dayOfWeek = tomorrowUtc.getUTCDay();

// Base link definition for tests
const BASE_LINK = {
  availability: [{ dayOfWeek, startTime: '09:00', endTime: '17:00' }],
  duration: 60,
  buffer: 15,
  start_address: 'START',
  timezone: 'UTC',
};

describe('calculateAvailability', () => {
  // 1. Basis scenario: lege dag zonder busy slots
  it('should return correct slots for VAST and FLEXIBEL modes with no travel', async () => {
    const noTravel = async (origin, destination) => ({ duration: 0, status: 'OK', origin, destination });
    const vastLink = { ...BASE_LINK, workday_mode: 'VAST', include_travel_start: false, include_travel_end: false };
    const flexLink = { ...BASE_LINK, workday_mode: 'FLEXIBEL', include_travel_start: false, include_travel_end: false };

    const { slots: slotsVast } = await calculateAvailability({
      ...vastLink,
      busySlots: [],
      destinationAddress: 'DEST',
      getTravelTime: noTravel,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    const { slots: slotsFlex } = await calculateAvailability({
      ...flexLink,
      busySlots: [],
      destinationAddress: 'DEST',
      getTravelTime: noTravel,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });

    // Er worden 6 slots verwacht: (17-9)=8 uur; 8*60/(60+15)=6
    expect(slotsVast).toHaveLength(6);
    expect(slotsFlex).toHaveLength(6);
    expect(slotsVast[0].start.getUTCHours()).toBe(9);
  });

  // 2. Grensgevallen: exacte einde en voorbij einde
  it('should allow an appointment ending exactly at end time but not beyond', async () => {
    const noTravel = async (origin, destination) => ({ duration: 0, status: 'OK', origin, destination });
    const linkExact = { ...BASE_LINK, workday_mode: 'VAST', include_travel_start: false, include_travel_end: false, buffer: 0 };

    // duration=480 (8h) -> single slot 09:00-17:00
    const longDayLink = { ...linkExact, duration: 480 };
    let { slots } = await calculateAvailability({
      ...longDayLink,
      busySlots: [],
      destinationAddress: 'D',
      getTravelTime: noTravel,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    expect(slots).toHaveLength(1);

    // duration one minute more should yield no slots
    const tooLongLink = { ...linkExact, duration: 481 };
    ({ slots } = await calculateAvailability({
      ...tooLongLink,
      busySlots: [],
      destinationAddress: 'D',
      getTravelTime: noTravel,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    }));
    expect(slots).toHaveLength(0);
  });

  // 3. Reistijd scenario's
  it('should offset first slot by travel time when includeTravelStart is true', async () => {
    const travelStub = async (origin, destination) => ({ duration: 30 * 60, status: 'OK', origin, destination }); // 30 min
    const link = {
      ...BASE_LINK,
      workday_mode: 'FLEXIBEL',
      include_travel_start: true,
      include_travel_end: false,
    };
    const { slots } = await calculateAvailability({
      ...link,
      busySlots: [],
      destinationAddress: 'D',
      getTravelTime: travelStub,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    expect(slots[0]).toBeDefined();
    expect(slots[0].start.getUTCHours()).toBe(9);
    expect(slots[0].start.getUTCMinutes()).toBe(30);
  });

  it('should adjust last slot when includeTravelEnd is true', async () => {
    const travelStub = async () => ({ duration: 30 * 60, status: 'OK' }); // 30 min back
    const link = {
      ...BASE_LINK,
      workday_mode: 'VAST',
      include_travel_start: false,
      include_travel_end: true,
    };
    const { slots } = await calculateAvailability({
      ...link,
      busySlots: [],
      destinationAddress: 'D',
      getTravelTime: travelStub,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    // laatste slot start op 15:30 UTC (zodat +1h appointment +30min travel <= 17:00)
    const last = slots[slots.length - 1];
    expect(last.start.getUTCHours()).toBe(15);
    expect(last.start.getUTCMinutes()).toBe(30);
  });

  it('should not propose slots when travel time exceeds available window', async () => {
    const travelStub = async () => ({ duration: 8 * 3600, status: 'OK' }); // 8 uur reistijd
    const link = {
      ...BASE_LINK,
      workday_mode: 'FLEXIBEL',
      include_travel_start: true,
      include_travel_end: false,
    };
    const { slots } = await calculateAvailability({
      ...link,
      busySlots: [],
      destinationAddress: 'D',
      getTravelTime: travelStub,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    expect(slots).toHaveLength(0);
  });

  it('should use travel time between consecutive appointments', async () => {
    const calls = [];
    const travelStub = async (from, to) => {
      calls.push([from, to]);
      return { duration: 15 * 60, status: 'OK' }; // 15 min
    };
    const link = {
      ...BASE_LINK,
      buffer: 0,
      workday_mode: 'VAST',
      include_travel_start: true,
      include_travel_end: false,
    };
    const { slots } = await calculateAvailability({
      ...link,
      busySlots: [],
      destinationAddress: 'D',
      getTravelTime: travelStub,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    expect(slots.length).toBeGreaterThan(1);
    // minimaal twee calls: eerste van START->D, daarna D->D
    expect(calls[0][0]).toBe('START');
    expect(calls[0][1]).toBe('D');
  });

  // 4. Buffer scenario's
  it('should apply buffer after busy slot correctly', async () => {
    const noTravel = async () => ({ duration: 0, status: 'OK' });
    const bufferLink = { ...BASE_LINK, buffer: 30, workday_mode: 'VAST', include_travel_start: false, include_travel_end: false };
    const busySlots = [
      {
        start: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 10, 0, 0)),
        end:   new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 10, 30, 0)),
      },
    ];
    const { slots } = await calculateAvailability({
      ...bufferLink,
      busySlots,
      destinationAddress: 'D',
      getTravelTime: noTravel,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    // eerste slot na buffer start op 11:00 UTC
    const found = slots.find(s => s.start.getUTCHours() === 11 && s.start.getUTCMinutes() === 0);
    expect(found).toBeDefined();
  });

  // 5. Conflict scenario's
  it('should handle multiple non-contiguous busy slots', async () => {
    const noTravel = async () => ({ duration: 0, status: 'OK' });
    const link = { ...BASE_LINK, buffer: 0, workday_mode: 'VAST', include_travel_start: false, include_travel_end: false };
    const busySlots = [
      { start: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 9, 30, 0)), end: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 10, 0, 0)) },
      { start: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 11, 0, 0)), end: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 11, 45, 0)) },
    ];
    const { slots } = await calculateAvailability({
      ...link,
      busySlots,
      destinationAddress: 'D',
      getTravelTime: noTravel,
      planningOffsetDays: 1,
      planningWindowDays: 1,
    });
    // Verwacht ten minste slots vóór eerste busy en tussen busy slots
    expect(slots.some(s => s.start.getUTCHours() === 9 && s.start.getUTCMinutes() === 0)).toBe(true);
    expect(slots.some(s => s.start.getUTCHours() === 10)).toBe(true);
  });

  it('should skip slots overlapping the start of workday', async () => {
    const noTravel = async () => ({ duration: 0, status: 'OK' });
    const link = { ...BASE_LINK, buffer: 0, workday_mode: 'VAST', include_travel_start: false, include_travel_end: false };
    const busySlots = [
      { start: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 8, 30, 0)), end: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 9, 30, 0)) },
    ];
    const { slots } = await calculateAvailability({ ...link, busySlots, destinationAddress: 'D', getTravelTime: noTravel, planningOffsetDays: 1, planningWindowDays: 1 });
    // eerste slot start op 09:30
    expect(slots[0].start.getUTCHours()).toBe(9);
    expect(slots[0].start.getUTCMinutes()).toBe(30);
  });

  it('should skip slots overlapping the end of workday', async () => {
    const noTravel = async () => ({ duration: 0, status: 'OK' });
    const link = { ...BASE_LINK, buffer: 0, workday_mode: 'VAST', include_travel_start: false, include_travel_end: false };
    const busySlots = [
      { start: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 16, 30, 0)), end: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 17, 30, 0)) },
    ];
    const { slots } = await calculateAvailability({ ...link, busySlots, destinationAddress: 'D', getTravelTime: noTravel, planningOffsetDays: 1, planningWindowDays: 1 });
    // Laatste slot moet om 15:00 of 15:30 starten (afhankelijk van buffer)
    const last = slots[slots.length - 1];
    expect(last.start.getUTCHours()).toBeLessThan(16);
  });

  it('should invalidate slots that exactly overlap a busy slot including buffer and travel', async () => {
    // test scenario waarbij appt+travel+buffer precies in busy valt
    const travelStub = async () => ({ duration: 15 * 60, status: 'OK' });
    const link = { ...BASE_LINK, buffer: 15, workday_mode: 'VAST', include_travel_start: true, include_travel_end: false };
    // stel busy slot exact na reistijd+buffer
    const busySlots = [
      { start: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 9, 30, 0)), end: new Date(Date.UTC(tomorrowUtc.getUTCFullYear(), tomorrowUtc.getUTCMonth(), tomorrowUtc.getUTCDate(), 10, 30, 0)) },
    ];
    const { slots } = await calculateAvailability({ ...link, busySlots, destinationAddress: 'D', getTravelTime: travelStub, planningOffsetDays: 1, planningWindowDays: 1 });
    // De eerste haalbare slot start niet vóór 10:30+buffer
    expect(slots[0].start.getUTCHours()).toBeGreaterThanOrEqual(11);
  });
});