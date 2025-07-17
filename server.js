// Bestand: server.js

import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { pool, createTables, testConnection } from './db.js';
import { calculateAvailability } from './utils/availability-logic.js';
import { getTravelTime } from './utils/travel-time.js';
import { getCoordinatesForAddress } from './utils/geocoding.js';

// --- Helper Functions ---

async function getAuthenticatedClient(userId) {
	const result = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
	if (!result.rows.length) throw new Error('User not found');
	const { tokens } = result.rows[0];
	const auth = new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		process.env.GOOGLE_REDIRECT_URI
	);
	auth.setCredentials(tokens);
	auth.on('tokens', refreshed => {
		const newTokens = { ...tokens, ...refreshed };
		pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [newTokens, userId]).catch(console.error);
	});
	return auth;
}

async function getBusySlots(auth, calendarId, timeMin, timeMax) {
    const calendar = google.calendar({ version: 'v3', auth });
    try {
        const resp = await calendar.events.list({
            calendarId: calendarId || 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        return (resp.data.items || []).reduce((acc, e) => {
            if (e.start?.dateTime && e.end?.dateTime && e.transparency !== 'transparent' && e.status === 'confirmed') {
                const start = new Date(e.start.dateTime);
                const end = new Date(e.end.dateTime);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    acc.push({ start, end, location: e.location });
                }
            }
            return acc;
        }, []);

    } catch (err) {
        console.warn('Calendar fetch failed → busySlots=[]', err.message);
        return [];
    }
}

// --- Express App Setup ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cookieParser());
app.set('trust proxy', true);
app.use(session({
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    },
}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

// --- Static & Auth Routes ---

app.get('/api/config', (req, res) => res.json({ mapsApiKey: process.env.GOOGLE_MAPS_API_KEY }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/auth', (req, res) => {
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes });
    res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken({ code, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();
        if (!data.email) return res.status(500).send('Kon e-mailadres niet ophalen van Google.');

        let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [data.email]);
        let userId = userResult.rows[0]?.id;

        if (userId) {
            await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [tokens, userId]);
        } else {
            userId = uuidv4();
            await pool.query('INSERT INTO users (id, email, tokens) VALUES ($1, $2, $3)', [userId, data.email, tokens]);
        }
        req.session.userId = userId;
        res.redirect('/dashboard.html');
    } catch (error) {
        console.error('Error during authentication:', error);
        res.status(500).send('Er is een fout opgetreden tijdens de authenticatie.');
    }
});

app.get('/dashboard.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/appointments.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'appointments.html'));
});
app.get('/schedule.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'schedule.html')));

// --- CRUD API for Links ---

app.get('/api/links', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const { rows } = await pool.query('SELECT * FROM links WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching links:', error);
        res.status(500).send('Fout bij het ophalen van links.');
    }
});

app.post('/api/links', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    const { title, description, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days } = req.body;
    if (!title || !duration || !availability || !Array.isArray(availability) || !startAddress || !calendarId) {
        return res.status(400).send('Ongeldige invoer.');
    }
    try {
        const linkId = uuidv4();
        await pool.query(
            'INSERT INTO links (id, user_id, title, description, duration, buffer, availability, start_address, calendar_id, max_travel_time, workday_mode, include_travel_start, include_travel_end, planning_offset_days, planning_window_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
            [linkId, req.session.userId, title, description, parseInt(duration, 10), parseInt(buffer, 10) || 0, JSON.stringify(availability), startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, parseInt(planning_offset_days, 10) || 0, parseInt(planning_window_days, 10) || 14]
        );
        res.status(201).json({ linkId });
    } catch (error) {
        console.error('Error creating link:', error);
        res.status(500).send('Fout bij het aanmaken van de link.');
    }
});

app.put('/api/links/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    const { id } = req.params;
    const { title, description, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days } = req.body;
    if (!title || !duration || !availability || !Array.isArray(availability) || !startAddress || !calendarId) {
        return res.status(400).send('Ongeldige invoer.');
    }
    try {
        const { rowCount } = await pool.query(
            'UPDATE links SET title = $1, description = $2, duration = $3, buffer = $4, availability = $5, start_address = $6, calendar_id = $7, max_travel_time = $8, workday_mode = $9, include_travel_start = $10, include_travel_end = $11, planning_offset_days = $12, planning_window_days = $13 WHERE id = $14 AND user_id = $15',
            [title, description, parseInt(duration, 10), parseInt(buffer, 10) || 0, JSON.stringify(availability), startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, parseInt(planning_offset_days, 10) || 0, parseInt(planning_window_days, 10) || 14, id, req.session.userId]
        );
        if (rowCount === 0) return res.status(404).send('Link niet gevonden of geen toestemming.');
        res.status(200).send('Link succesvol bijgewerkt.');
    } catch (error) {
        console.error('Error updating link:', error);
        res.status(500).send('Fout bij het bijwerken van de link.');
    }
});

app.delete('/api/links/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const { rowCount } = await pool.query('DELETE FROM links WHERE id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
        if (rowCount === 0) return res.status(404).send('Link niet gevonden of geen toestemming.');
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting link:', error);
        res.status(500).send('Fout bij het verwijderen van de link.');
    }
});

app.get('/api/calendars', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('Authenticatie vereist.');
    }
    try {
        const auth = await getAuthenticatedClient(req.session.userId);
        const calendar = google.calendar({ version: 'v3', auth });
        const result = await calendar.calendarList.list();
        res.json(result.data.items);
    } catch (error) {
        console.error('Error fetching calendar list:', error);
        res.status(500).send('Fout bij het ophalen van de kalenderlijst.');
    }
});

// --- Availability & Booking API ---

// STAP 1: /get-availability levert alleen de ruwe, ongefilterde slots op basis van de agenda.
app.get('/get-availability', async (req, res) => {
    const { linkId } = req.query;
    if (!linkId) return res.status(400).send('Link ID is verplicht.');

    try {
        const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
        if (!link) return res.status(404).json({ error: 'linkId not found' });
        if (typeof link.availability === 'string') link.availability = JSON.parse(link.availability);

        const auth = await getAuthenticatedClient(link.user_id);
        const now = new Date();
        const timeMin = new Date();
        timeMin.setUTCHours(0, 0, 0, 0);
        const timeMax = new Date(now.getTime() + (link.planning_offset_days + link.planning_window_days) * 24 * 60 * 60 * 1000);
        const busySlots = await getBusySlots(auth, link.calendar_id, timeMin, timeMax);

        // We sturen de 'calculateAvailability' functie nu een 'dummy' getTravelTime, omdat we de reistijd hier niet berekenen.
        const options = { ...link, busySlots, getTravelTime: () => Promise.resolve({ status: 'SKIPPED' }) };
        const { slots } = await calculateAvailability(options);

        const availableDays = Array.from({ length: link.planning_window_days }, (_, i) => {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + link.planning_offset_days + i));
            return d.toISOString().split('T')[0];
        });

        res.json({
            title: link.title,
            description: link.description,
            duration: link.duration,
            initialSlots: slots.map(s => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
            availableDays,
            linkId,
        });
    } catch (err) {
        console.error('Error in /get-availability:', err);
        res.status(500).send('Fout bij ophalen van beschikbaarheid.');
    }
});

// STAP 2: Nieuw endpoint om een specifiek slot te verifiëren MET reistijd.
app.post('/verify-slot', async (req, res) => {
    const { linkId, destinationAddress, slotStart } = req.body;
    if (!linkId || !destinationAddress || !slotStart) {
        return res.status(400).send('Link ID, adres en starttijd van het slot zijn verplicht.');
    }

    try {
        const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
        if (!link) return res.status(404).json({ error: 'linkId not found' });
        if (typeof link.availability === 'string') link.availability = JSON.parse(link.availability);

        const auth = await getAuthenticatedClient(link.user_id);
        
        const potentialStart = new Date(slotStart);
        const potentialEnd = new Date(potentialStart.getTime() + link.duration * 60000);

        // Essentiële CRASH FIX: Controleer of er een regel bestaat voor deze dag.
        const dayOfWeek = potentialStart.getUTCDay();
        const rule = link.availability.find(r => r.dayOfWeek === dayOfWeek);
        if (!rule) {
            return res.json({ isViable: false, certainty: 'red', diagnostic: [] });
        }

        // Haal busy slots op voor de HELE dag van het geselecteerde slot.
        const a_day_in_ms = 24 * 60 * 60 * 1000;
        const slot_start_date = new Date(slotStart)
        const timeMin = new Date(slot_start_date.setUTCHours(0,0,0,0));
        const timeMax = new Date(timeMin.getTime() + a_day_in_ms);
        const busySlots = await getBusySlots(auth, link.calendar_id, timeMin, timeMax);

        const lastAppointmentBefore = busySlots
            .filter(s => s.end.getTime() <= potentialStart.getTime())
            .pop();
        const nextAppointmentAfter = busySlots
            .find(s => s.start.getTime() >= potentialEnd.getTime());

        const originAddress = lastAppointmentBefore ? (lastAppointmentBefore.location || link.start_address) : link.start_address;
        const destinationForNextTrip = nextAppointmentAfter ? (nextAppointmentAfter.location || link.start_address) : link.start_address;

        const [originCoords, destCoords, nextDestCoords] = await Promise.all([
            getCoordinatesForAddress(originAddress),
            getCoordinatesForAddress(destinationAddress),
            getCoordinatesForAddress(destinationForNextTrip)
        ]);

        const travelToResult = await getTravelTime(originCoords, destCoords);
        const travelFromResult = await getTravelTime(destCoords, nextDestCoords);

        const travelIsKnown = travelToResult.status === 'OK' && travelFromResult.status === 'OK';
        let isViable = false;
        let certainty = 'red';

        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);
        const dayStart = new Date(Date.UTC(potentialStart.getUTCFullYear(), potentialStart.getUTCMonth(), potentialStart.getUTCDate(), startHour, startMinute));
        const dayEnd = new Date(Date.UTC(potentialStart.getUTCFullYear(), potentialStart.getUTCMonth(), potentialStart.getUTCDate(), endHour, endMinute));

        const earliestPossibleStart = (lastAppointmentBefore ? lastAppointmentBefore.end.getTime() : dayStart.getTime()) + (link.buffer * 60000);
        const latestPossibleEnd = (nextAppointmentAfter ? nextAppointmentAfter.start.getTime() : dayEnd.getTime()) - (link.buffer * 60000);

        if (travelIsKnown) {
            const travelToMs = travelToResult.duration * 1000;
            const travelFromMs = travelFromResult.duration * 1000;
            
            if (potentialStart.getTime() >= earliestPossibleStart + travelToMs && potentialEnd.getTime() + travelFromMs <= latestPossibleEnd) {
                isViable = true;
                certainty = 'green';
            }
        } else {
            // Fallback naar marge-gebaseerde logica als reistijd onbekend is.
            const timeBeforeMs = potentialStart.getTime() - earliestPossibleStart;
            const timeAfterMs = latestPossibleEnd - potentialEnd.getTime();
            const totalMarginMs = Math.min(timeBeforeMs, timeAfterMs);

            if (totalMarginMs >= 0) {
                 isViable = true; // Het past in ieder geval zonder reistijd.
                 if (totalMarginMs >= 3600000) { // > 1 uur marge
                    certainty = 'grey'; // Grijs voor grote marge
                } else if (totalMarginMs >= 1800000) { // 30-60 min marge
                    certainty = 'yellow'; // Geel voor medium marge
                } else { // < 30 min marge
                    certainty = 'red';
                }
            }
        }

        res.json({ 
            isViable,
            certainty,
            diagnostic: [travelToResult, travelFromResult]
        });

    } catch (err) {
        console.error('Error in /verify-slot:', err);
        res.status(500).send('Fout bij verifiëren van het slot.');
    }
});


app.post('/book-appointment', async (req, res) => {
    const { linkId, startTime, name, email, destinationAddress, phone } = req.body;
    if (!linkId || !startTime || !name || !email || !destinationAddress || !phone) {
        return res.status(400).send('Alle velden zijn verplicht.');
    }
    try {
        const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
        if (!link) return res.status(404).send('Link niet gevonden.');

        await pool.query(
            'INSERT INTO appointments (link_id, user_id, name, email, phone, appointment_time, destination_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [linkId, link.user_id, name, email, phone, startTime, destinationAddress]
        );

        const auth = await getAuthenticatedClient(link.user_id);
        const calendar = google.calendar({ version: 'v3', auth });
        const appointmentStart = new Date(startTime);
        const appointmentEnd = new Date(appointmentStart.getTime() + link.duration * 60000);

        const mainEvent = {
            summary: link.title,
            description: `Afspraak met ${name} (${phone}).`,
            location: destinationAddress,
            start: { dateTime: appointmentStart.toISOString(), timeZone: 'Europe/Amsterdam' },
            end: { dateTime: appointmentEnd.toISOString(), timeZone: 'Europe/Amsterdam' },
            attendees: [{ email }],
            reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 24 * 60 }, { method: 'popup', minutes: 10 }] },
        };
        await calendar.events.insert({ calendarId: link.calendar_id || 'primary', resource: mainEvent, sendNotifications: true });

        res.status(200).send('Afspraak succesvol ingepland.');
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).send('Fout bij het aanmaken van de afspraak.');
    }
});

// --- Server Start ---

const startServer = async () => {
    try {
        await testConnection();
        await createTables();
        const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_MAPS_API_KEY'];
        for (const v of requiredVars) {
            if (!process.env[v]) console.warn(`WARNING: Environment variable ${v} is not set.`);
        }
        app.listen(port, () => console.log(`Server luistert op http://localhost:${port}`));
    } catch (error) {
        console.error('Failed to initialize database or start server:', error);
        process.exit(1);
    }
};

startServer();