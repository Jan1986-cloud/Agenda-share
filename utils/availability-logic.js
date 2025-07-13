/**
 * Bereken vrije afsprakenlots op basis van werktijden, reistijd en bezette tijden.
 * Alle interne datumberekeningen verlopen strikt in UTC.
 *
 * @param {Object} options
 * @param {import('../server.js').LinkRow} options.link
 * @param {{start: Date, end: Date}[]} options.busySlots
 * @param {string} options.destinationAddress
 * @param {(from: string, to: string) => Promise<number>} options.getTravelTime  Reistijd in seconden
 * @param {number} [options.daysAhead=7]
 * @returns {Promise<{start: string, end: string, start_utc: string}[]>}
 */
export async function calculateAvailability({ link, busySlots, destinationAddress, getTravelTime, daysAhead = 7 }) {
	const {
		availability,
		duration,
		buffer,
		start_address: startAddress,
		include_travel_start: incTravelStart,
		include_travel_end: incTravelEnd,
		workday_mode: mode,
		timezone = 'Europe/Amsterdam',
	} = link;

	const bufferedBusy = busySlots.map(({ start, end }) => ({
		start: new Date(start.getTime() - buffer * 60000),
		end: new Date(end.getTime() + buffer * 60000),
	}));

	const result = [];
	const MS_PER_MIN = 60000;
	const STEP_MS = 15 * MS_PER_MIN;
	const now = new Date();

	for (let dayOffset = 1; dayOffset <= daysAhead; dayOffset++) {
		const year = now.getUTCFullYear();
		const month = now.getUTCMonth();
		const date = now.getUTCDate() + dayOffset;
		const dayUtc = new Date(Date.UTC(year, month, date));

		const rule = availability.find(r => r.dayOfWeek === dayUtc.getUTCDay());
		if (!rule) continue;

		const [startHour, startMin] = rule.startTime.split(':').map(Number);
		const [endHour, endMin] = rule.endTime.split(':').map(Number);
		const dayStartMs = Date.UTC(year, month, date, startHour, startMin);
		const dayEndMs = Date.UTC(year, month, date, endHour, endMin);

		let slotCursorMs = dayStartMs;
		let prevLocation = startAddress;
		while (slotCursorMs <= dayEndMs) {
			const travelToSec = incTravelStart ? await getTravelTime(prevLocation, destinationAddress) : 0;
			const travelBackSec = incTravelEnd ? await getTravelTime(destinationAddress, startAddress) : 0;
			const travelToMs = travelToSec * 1000;
			const travelBackMs = travelBackSec * 1000;

			const apptStartMs = mode === 'FLEXIBEL' && incTravelStart
				? slotCursorMs + travelToMs
				: slotCursorMs;
			const apptEndMs = apptStartMs + duration * MS_PER_MIN;

			const blockEndMs = apptEndMs + (incTravelEnd ? travelBackMs : 0);
			if (blockEndMs > dayEndMs) break;

			const blockStartMs = apptStartMs - (incTravelStart ? travelToMs : 0);

			const clash = bufferedBusy.some(b => blockStartMs < b.end.getTime() && b.start.getTime() < blockEndMs);

			if (!clash) {
				const apptStartDate = new Date(apptStartMs);
				const apptEndDate = new Date(apptEndMs);
				result.push({
					start: apptStartDate.toLocaleString('nl-NL', { timeZone: timezone }),
					end: apptEndDate.toLocaleString('nl-NL', { timeZone: timezone }),
					start_utc: apptStartDate.toISOString(),
				});
				slotCursorMs = apptEndMs + buffer * MS_PER_MIN;
				prevLocation = destinationAddress;
			} else {
				slotCursorMs += STEP_MS;
			}
		}
	}

	return result;
}