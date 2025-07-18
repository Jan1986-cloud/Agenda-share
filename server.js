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
import { init as initAuth } from './auth/index.js';
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

// --- Rate Limiter ---
const apiLimiterStore = {};
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minuten
const RATE_LIMIT_MAX_REQUESTS = 5;

const apiLimiter = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!apiLimiterStore[ip]) {
        apiLimiterStore[ip] = [];
    }

    // Verwijder oude requests uit het window
    apiLimiterStore[ip] = apiLimiterStore[ip].filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (apiLimiterStore[ip].length >= RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).send('Te veel aanvragen. Probeer het over 5 minuten opnieuw.');
    }

    apiLimiterStore[ip].push(now);
    next();
};

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

// Initialize all authentication providers
initAuth(app);

// --- Static & Protected Routes ---

app.get('/api/config', (req, res) => res.json({ mapsApiKey: process.env.GOOGLE_MAPS_API_KEY }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/dashboard.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/appointments.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'appointments.html'));
});
app.get('/schedule.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'schedule.html')));

app.get('/api/link-details', async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).send('Link ID is verplicht.');
    }
    try {
        const { rows } = await pool.query('SELECT title, description FROM links WHERE id = $1', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Link niet gevonden.');
        }
        res.json({
            ...rows[0],
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
    } catch (error) {
        console.error('Error fetching link details:', error);
        res.status(500).send('Fout bij het ophalen van linkdetails.');
    }
});

// --- CRUD API for Links ---

app.get('/api/links', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const { rows } = await pool.query('SELECT * FROM links WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching links:', error);
        res.status(500).json({
            message: error.message,
            stack: error.stack,
        });
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

app.get('/api/links/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const { rows } = await pool.query('SELECT * FROM links WHERE id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
        if (rows.length === 0) {
            return res.status(404).send('Link niet gevonden of geen toestemming.');
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching single link:', error);
        res.status(500).send('Fout bij het ophalen van de link.');
    }
});

app.post('/api/links/:id/duplicate', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    const { id } = req.params;
    const userId = req.session.userId;

    try {
        // 1. Haal de originele link op
        const { rows: [originalLink] } = await pool.query(
            'SELECT * FROM links WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (!originalLink) {
            return res.status(404).send('Originele link niet gevonden.');
        }

        // 2. Bereid de nieuwe link data voor
        const newLink = { ...originalLink };
        newLink.id = uuidv4(); // Nieuwe unieke ID
        newLink.title = `${originalLink.title} (kopie)`; // Pas de titel aan
        
        // 3. Sla de nieuwe link op in de database
        await pool.query(
            'INSERT INTO links (id, user_id, title, description, duration, buffer, availability, start_address, calendar_id, max_travel_time, workday_mode, include_travel_start, include_travel_end, planning_offset_days, planning_window_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
            [newLink.id, newLink.user_id, newLink.title, newLink.description, newLink.duration, newLink.buffer, JSON.stringify(newLink.availability), newLink.start_address, newLink.calendar_id, newLink.max_travel_time, newLink.workday_mode, newLink.include_travel_start, newLink.include_travel_end, newLink.planning_offset_days, newLink.planning_window_days]
        );

        res.status(201).json({ message: 'Link succesvol gedupliceerd.', newLink });

    } catch (error) {
        console.error('Error duplicating link:', error);
        res.status(500).send('Fout bij het dupliceren van de link.');
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
        res.status(500).json({
            message: error.message,
            stack: error.stack,
        });
    }
});

// --- Dashboard & Appointments API ---

app.get('/api/dashboard/summary', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const userId = req.session.userId;

        // Query 1: Totaal aantal afspraken
        const totalAppointmentsResult = await pool.query(
            'SELECT COUNT(*) AS total_appointments FROM appointments WHERE user_id = $1',
            [userId]
        );
        const totalAppointments = parseInt(totalAppointmentsResult.rows[0].total_appointments, 10);
        const timeSavedMinutes = totalAppointments * 15;

        // Query 2: Links met hun afspraak-aantallen
        const linksWithCountsResult = await pool.query(`
            SELECT 
                l.id, 
                l.title, 
                l.calendar_id,
                COUNT(a.id) AS appointment_count
            FROM links l
            LEFT JOIN appointments a ON l.id = a.link_id
            WHERE l.user_id = $1
            GROUP BY l.id
            ORDER BY l.created_at DESC
        `, [userId]);
        
        // Query 3: Agenda's met hun afspraak-aantallen
        const calendarsWithCountsResult = await pool.query(`
            SELECT 
                l.calendar_id,
                COUNT(a.id) AS appointment_count
            FROM appointments a
            JOIN links l ON a.link_id = l.id
            WHERE a.user_id = $1
            GROUP BY l.calendar_id
            ORDER BY appointment_count DESC
        `, [userId]);

        res.json({
            totalAppointments,
            timeSavedMinutes,
            links: linksWithCountsResult.rows,
            calendars: calendarsWithCountsResult.rows,
        });

    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        res.status(500).json({ message: 'Fout bij het ophalen van de dashboard-samenvatting.', error: error.message });
    }
});

app.get('/api/appointments', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    
    const { linkId } = req.query;
    let query;
    const params = [req.session.userId];

    if (linkId) {
        query = 'SELECT * FROM appointments WHERE user_id = $1 AND link_id = $2 ORDER BY appointment_time DESC';
        params.push(linkId);
    } else {
        query = 'SELECT * FROM appointments WHERE user_id = $1 ORDER BY appointment_time DESC';
    }

    try {
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ message: 'Fout bij het ophalen van afspraken.', error: error.message });
    }
});

app.delete('/api/appointments/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');

    const { id } = req.params;
    const userId = req.session.userId;

    try {
        // 1. Haal de afspraak en de bijbehorende link-informatie op
        const appointmentResult = await pool.query(
            `SELECT a.google_event_id, l.calendar_id 
             FROM appointments a
             JOIN links l ON a.link_id = l.id
             WHERE a.id = $1 AND a.user_id = $2`,
            [id, userId]
        );

        if (appointmentResult.rows.length === 0) {
            return res.status(404).send('Afspraak niet gevonden of geen toestemming.');
        }

        const { google_event_id, calendar_id } = appointmentResult.rows[0];

        // 2. Verwijder de afspraak uit Google Calendar (indien ID bestaat)
        if (google_event_id) {
            const auth = await getAuthenticatedClient(userId);
            const calendar = google.calendar({ version: 'v3', auth });
            try {
                await calendar.events.delete({
                    calendarId: calendar_id || 'primary',
                    eventId: google_event_id,
                    sendNotifications: true,
                });
            } catch (gcalError) {
                // Als de afspraak al weg is in Google, is dat geen fatale fout.
                if (gcalError.code !== 404 && gcalError.code !== 410) {
                    throw gcalError; // Gooi de fout opnieuw als het iets anders is
                }
                console.warn(`Google Calendar event with ID ${google_event_id} was already deleted or not found.`);
            }
        }

        // 3. Verwijder de afspraak uit de lokale database
        await pool.query('DELETE FROM appointments WHERE id = $1', [id]);

        res.status(204).send(); // Success, no content

    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ message: 'Fout bij het verwijderen van de afspraak.', error: error.message });
    }
});


// --- Availability & Booking API ---

// STAP 1: /get-availability levert alleen de ruwe, ongefilterde slots op basis van de agenda.
app.get('/get-availability', async (req, res) => {
    const { linkId } = req.query;
    if (!linkId) return res.status(400).send('Link ID is verplicht.');

    try {
        const { rows: [link] } = await pool.query('SELECT l.*, u.email FROM links l JOIN users u ON l.user_id = u.id WHERE l.id = $1', [linkId]);
        if (!link) return res.status(404).json({ error: 'linkId not found' });
        if (typeof link.availability === 'string') link.availability = JSON.parse(link.availability);

        const auth = await getAuthenticatedClient(link.user_id);
        const now = new Date();
        const timeMin = new Date();
        timeMin.setUTCHours(0, 0, 0, 0);
        const timeMax = new Date(now.getTime() + (link.planning_offset_days + link.planning_window_days) * 24 * 60 * 60 * 1000);
        const busySlots = await getBusySlots(auth, link.calendar_id, timeMin, timeMax);

        const options = { ...link, busySlots };
        const { slots } = await calculateAvailability(options);

        const availableDays = Array.from({ length: link.planning_window_days }, (_, i) => {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + link.planning_offset_days + i));
            return d.toISOString().split('T')[0];
        });

        res.json({
            title: link.title,
            description: link.description,
            duration: link.duration,
            creatorEmail: link.email,
            initialSlots: slots.map(s => ({ 
                start: s.start.toISOString(), 
                end: s.end.toISOString(),
                marginCategory: s.marginCategory 
            })),
            offset: link.planning_offset_days,
            window: link.planning_window_days,
            linkId,
        });
    } catch (err) {
        console.error('Error in /get-availability:', err);
        res.status(500).send('Fout bij ophalen van beschikbaarheid.');
    }
});

// Functie om alleen de plaatsnaam uit een adres te halen
const getCityFromAddress = (address) => {
    if (!address) return 'Onbekende locatie';
    const parts = address.split(',');
    // Pakt meestal het deel voor de postcode, wat vaak de stad is.
    return parts.length > 1 ? parts[parts.length - 2].trim() : parts[0].trim();
};


// STAP 2: Endpoint om een specifiek slot te verifiëren EN het ripple-effect te berekenen.
app.post('/verify-slot', apiLimiter, async (req, res) => {
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
        const dayOfWeek = potentialStart.getUTCDay();
        const rule = link.availability.find(r => r.dayOfWeek === dayOfWeek);

        if (!rule) {
            return res.json({ isViable: false, certainty: 'red', diagnostic: [], updatedGapSlots: [] });
        }

        const a_day_in_ms = 24 * 60 * 60 * 1000;
        const timeMin = new Date(new Date(slotStart).setUTCHours(0, 0, 0, 0));
        const timeMax = new Date(timeMin.getTime() + a_day_in_ms);
        const busySlots = await getBusySlots(auth, link.calendar_id, timeMin, timeMax);

        const lastAppointmentBefore = busySlots.filter(s => s.end.getTime() <= potentialStart.getTime()).pop();
        const nextAppointmentAfter = busySlots.find(s => s.start.getTime() >= new Date(potentialStart.getTime() + link.duration * 60000).getTime());

        const originAddress = lastAppointmentBefore ? (lastAppointmentBefore.location || link.start_address) : link.start_address;
        const destinationForNextTrip = nextAppointmentAfter ? (nextAppointmentAfter.location || link.start_address) : link.start_address;

        const [originCoords, destCoords, nextDestCoords] = await Promise.all([
            getCoordinatesForAddress(originAddress),
            getCoordinatesForAddress(destinationAddress),
            getCoordinatesForAddress(destinationForNextTrip)
        ]);

        const travelToResult = await getTravelTime(originCoords, destCoords);
        const travelFromResult = await getTravelTime(destCoords, nextDestCoords);

        travelToResult.originAddress = getCityFromAddress(originAddress);
        travelToResult.destinationAddress = getCityFromAddress(destinationAddress);
        travelFromResult.originAddress = getCityFromAddress(destinationAddress);
        travelFromResult.destinationAddress = getCityFromAddress(destinationForNextTrip);

        const travelIsKnown = travelToResult.status === 'OK' && travelFromResult.status === 'OK';
        let isViable = false;
        let certainty = 'red';
        let updatedGapSlots = [];

        if (travelIsKnown) {
            const options = {
                ...link,
                busySlots,
                targetDate: slotStart.split('T')[0],
                knownTravelTimes: {
                    travelToDuration: travelToResult.duration,
                    travelFromDuration: travelFromResult.duration
                }
            };
            const { slots } = await calculateAvailability(options);
            updatedGapSlots = slots.map(s => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() }));
            
            if (updatedGapSlots.some(s => s.start === slotStart)) {
                isViable = true;
                certainty = 'green';
            }
        } else {
            const [startHour, startMinute] = rule.startTime.split(':').map(Number);
            const [endHour, endMinute] = rule.endTime.split(':').map(Number);
            const dayStart = new Date(Date.UTC(potentialStart.getUTCFullYear(), potentialStart.getUTCMonth(), potentialStart.getUTCDate(), startHour, startMinute));
            const dayEnd = new Date(Date.UTC(potentialStart.getUTCFullYear(), potentialStart.getUTCMonth(), potentialStart.getUTCDate(), endHour, endMinute));
            const earliestPossibleStart = (lastAppointmentBefore ? lastAppointmentBefore.end.getTime() : dayStart.getTime()) + (link.buffer * 60000);
            const latestPossibleEnd = (nextAppointmentAfter ? nextAppointmentAfter.start.getTime() : dayEnd.getTime()) - (link.buffer * 60000);
            const timeBeforeMs = potentialStart.getTime() - earliestPossibleStart;
            const timeAfterMs = latestPossibleEnd - new Date(potentialStart.getTime() + link.duration * 60000).getTime();
            const totalMarginMs = Math.min(timeBeforeMs, timeAfterMs);

            if (totalMarginMs >= 0) {
                 isViable = true;
                 if (totalMarginMs >= 3600000) certainty = 'grey';
                 else if (totalMarginMs >= 1800000) certainty = 'yellow';
                 else certainty = 'red';
            }
        }

        res.json({ 
            isViable,
            certainty,
            diagnostic: [travelToResult, travelFromResult],
            updatedGapSlots,
            travelIsKnown
        });

    } catch (err) {
        console.error('Error in /verify-slot:', err);
        res.status(500).send('Fout bij verifiëren van het slot.');
    }
});


app.post('/book-appointment', async (req, res) => {
    const { linkId, startTime, name, email, destinationAddress, phone, comments } = req.body;
    if (!linkId || !startTime || !name || !email || !destinationAddress || !phone) {
        return res.status(400).send('Alle velden zijn verplicht.');
    }
    try {
        const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
        if (!link) return res.status(404).send('Link niet gevonden.');

        const { rows: [dbAppointment] } = await pool.query(
            'INSERT INTO appointments (link_id, user_id, name, email, phone, comments, appointment_time, destination_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [linkId, link.user_id, name, email, phone, comments, startTime, destinationAddress]
        );

        const auth = await getAuthenticatedClient(link.user_id);
        const calendar = google.calendar({ version: 'v3', auth });
        const appointmentStart = new Date(startTime);
        const appointmentEnd = new Date(appointmentStart.getTime() + link.duration * 60000);

        // Bouw de omschrijving op
        let finalDescription = link.description || '';
        if (comments) {
            if (finalDescription) {
                finalDescription += '\n\n---\n\n';
            }
            finalDescription += `Opmerkingen van de klant:\n${comments}`;
        }
        finalDescription += `\n\n---\nIngepland door: ${name} (${email}, ${phone})`;


        const mainEvent = {
            summary: link.title,
            description: finalDescription,
            location: destinationAddress,
            start: { dateTime: appointmentStart.toISOString(), timeZone: 'Europe/Amsterdam' },
            end: { dateTime: appointmentEnd.toISOString(), timeZone: 'Europe/Amsterdam' },
            attendees: [{ email }],
            reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 24 * 60 }, { method: 'popup', minutes: 10 }] },
        };
        
        const createdEvent = await calendar.events.insert({ calendarId: link.calendar_id || 'primary', resource: mainEvent, sendNotifications: true });

        // Sla de Google Event ID op in onze database voor toekomstig beheer
        if (createdEvent.data.id) {
            await pool.query(
                'UPDATE appointments SET google_event_id = $1 WHERE id = $2',
                [createdEvent.data.id, dbAppointment.id]
            );
        }

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