import 'dotenv/config';
import { google } from 'googleapis';
import { calculateAvailability } from './availability-logic.js';
import { getTravelTime } from './utils/travel-time.js';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runLiveTest() {
    // --- CONFIGURATIE: Pas deze waarden aan ---
    const linkIdToTest = '64efc34e-ca68-459e-b64b-b415d55e6664'; // Alleen de ID, niet de volledige URL
    const destinationAddressToTest = 'Maastricht, Nederland'; 
    // --- EINDE CONFIGURATIE ---

    console.log(`--- STARTING LIVE DATA TEST ---`);
    console.log(`Testing Link ID: ${linkIdToTest}`);
    console.log(`Testing Destination: ${destinationAddressToTest}`);

    try {
        // 1. Haal link en user data op uit de database
        const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id = $1', [linkIdToTest]);
        if (!link) throw new Error('Link niet gevonden in de database.');

        if (typeof link.availability === 'string') {
            link.availability = JSON.parse(link.availability);
        }

        const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [link.user_id]);
        if (!user) throw new Error('Gebruiker niet gevonden voor deze link.');

        // 2. Authenticeer met Google
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials(user.tokens);

        // 3. Haal echte 'busySlots' op uit Google Calendar
        const calendar = google.calendar({ version: 'v3', auth });
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
        const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).toISOString();

        const eventsResponse = await calendar.events.list({
            calendarId: link.calendar_id || 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        const busySlots = (eventsResponse.data.items || [])
           .filter(e => e.start?.dateTime && e.transparency !== 'transparent' && e.status === 'confirmed')
           .map(e => ({ start: new Date(e.start.dateTime), end: new Date(e.end.dateTime), location: e.location || '' }));

        console.log(`Gevonden drukke afspraken in agenda: ${busySlots.length}`);
        console.log('Busy slots:', JSON.stringify(busySlots, null, 2));

        // 4. Roep de availability logic aan met live data
        const liveOptions = {
            availabilityRules: link.availability,
            busySlots,
            appointmentDuration: link.duration,
            buffer: link.buffer,
            startAddress: link.start_address,
            destinationAddress: destinationAddressToTest,
            maxTravelTime: link.max_travel_time,
            workdayMode: link.workday_mode,
            includeTravelStart: link.include_travel_start,
            includeTravelEnd: link.include_travel_end,
            getTravelTime,
        };

        const availableSlots = await calculateAvailability(liveOptions);

        // 5. Toon het resultaat
        console.log('--- LIVE TEST RESULT: AVAILABLE SLOTS ---');
        if (availableSlots.length === 0) {
            console.log('Geen beschikbare slots gevonden.');
        } else {
            availableSlots.forEach(slot => {
                console.log(`Slot: ${new Date(slot.start).toISOString()} -> ${new Date(slot.end).toISOString()}`);
            });
        }

    } catch (error) {
        console.error('--- LIVE TEST FAILED WITH ERROR ---', error);
    } finally {
        await pool.end();
    }
}

runLiveTest();