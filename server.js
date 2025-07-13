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
import fetch from 'node-fetch';
import { calculateAvailability } from './utils/availability-logic.js';
import { getTravelTime } from './utils/travel-time.js';

/**
 * Maak een geauthenticeerde OAuth2-client voor een gebruiker en update tokens automatisch.
 * @param {string} userId
 * @returns {Promise<import('googleapis').OAuth2Client>}
 */
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cookieParser());

app.set('trust proxy', true);

app.use(
  session({
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
  })
);

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

// API endpoint to provide the Google Maps API key to the frontend
app.get('/api/config', (req, res) => {
  res.json({ mapsApiKey: process.env.GOOGLE_MAPS_API_KEY });
});

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start OAuth flow
app.get('/auth', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
  res.redirect(url);
});

// OAuth callback
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken({
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    });
    oauth2Client.setCredentials(tokens);

    // Get user's email address
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const userEmail = data.email;

    if (!userEmail) {
        return res.status(500).send('Kon e-mailadres niet ophalen van Google.');
    }

    // Check if user exists, otherwise create them
    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [userEmail]);
    let userId;

    if (userResult.rows.length > 0) {
        // User exists, update tokens
        userId = userResult.rows[0].id;
        await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [tokens, userId]);
    } else {
        // New user, create them
        userId = uuidv4();
        await pool.query(
            'INSERT INTO users (id, email, tokens) VALUES ($1, $2, $3)',
            [userId, userEmail, tokens]
        );
    }

    req.session.userId = userId;
    res.redirect('/dashboard.html');
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Er is een fout opgetreden tijdens de authenticatie.');
  }
});

app.get('/dashboard.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- API for Links ---

// GET all links for the logged-in user
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

// GET all calendars for the logged-in user
app.get('/api/calendars', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const auth = await getAuthenticatedClient(req.session.userId);

        const calendar = google.calendar({ version: 'v3', auth });
        const calendarList = await calendar.calendarList.list();
        const writableCalendars = calendarList.data.items.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');
        res.json(writableCalendars);
    } catch (error) {
        console.error('Error fetching calendars:', error);
        res.status(500).send('Fout bij het ophalen van agenda\'s.');
    }
});

// POST a new link
app.post('/api/links', async (req, res) => {
  if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
  const { title, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd } = req.body;
  if (!title || !duration || !availability || !Array.isArray(availability) || !startAddress || !calendarId) {
    return res.status(400).send('Ongeldige invoer.');
  }
  try {
    const linkId = uuidv4();
    await pool.query(
      'INSERT INTO links (id, user_id, title, duration, buffer, availability, start_address, calendar_id, max_travel_time, workday_mode, include_travel_start, include_travel_end) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [linkId, req.session.userId, title, parseInt(duration, 10), parseInt(buffer, 10) || 0, JSON.stringify(availability), startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd]
    );
    res.status(201).json({ linkId });
  } catch (error) {
    console.error('Error creating link:', error);
    res.status(500).send('Fout bij het aanmaken van de link.');
  }
});

// PUT (update) a link
app.put('/api/links/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    const { id } = req.params;
    const { title, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd } = req.body;
    if (!title || !duration || !availability || !Array.isArray(availability) || !startAddress || !calendarId) {
        return res.status(400).send('Ongeldige invoer.');
    }
    try {
        const { rowCount } = await pool.query(
            'UPDATE links SET title = $1, duration = $2, buffer = $3, availability = $4, start_address = $5, calendar_id = $6, max_travel_time = $7, workday_mode = $8, include_travel_start = $9, include_travel_end = $10 WHERE id = $11 AND user_id = $12',
            [title, parseInt(duration, 10), parseInt(buffer, 10) || 0, JSON.stringify(availability), startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, id, req.session.userId]
        );
        if (rowCount === 0) {
            return res.status(404).send('Link niet gevonden of geen toestemming.');
        }
        res.status(200).send('Link succesvol bijgewerkt.');
    } catch (error) {
        console.error('Error updating link:', error);
        res.status(500).send('Fout bij het bijwerken van de link.');
    }
});

// DELETE a link
app.delete('/api/links/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query('DELETE FROM links WHERE id = $1 AND user_id = $2', [id, req.session.userId]);
        if (rowCount === 0) {
            return res.status(404).send('Link niet gevonden of geen toestemming.');
        }
        res.status(204).send(); // No Content
    } catch (error) {
        console.error('Error deleting link:', error);
        res.status(500).send('Fout bij het verwijderen van de link.');
    }
});

// --- API for Appointments ---

// GET appointment statistics for the logged-in user
app.get('/api/appointments/stats', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const { rows } = await pool.query('SELECT COUNT(*) FROM appointments WHERE user_id = $1', [req.session.userId]);
        res.json({ count: parseInt(rows[0].count, 10) });
    } catch (error) {
        console.error('Error fetching appointment stats:', error);
        res.status(500).send('Fout bij het ophalen van statistieken.');
    }
});

// GET all appointments for the logged-in user
app.get('/api/appointments', async (req, res) => {
    if (!req.session.userId) return res.status(401).send('Authenticatie vereist.');
    try {
        const { rows } = await pool.query('SELECT * FROM appointments WHERE user_id = $1 ORDER BY appointment_time DESC', [req.session.userId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).send('Fout bij het ophalen van afspraken.');
    }
});

app.get('/appointments.html', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'appointments.html'));
});

app.get('/schedule', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'schedule.html'));
});

app.get('/get-availability', async (req, res) => {
  const { linkId, destinationAddress } = req.query;
  if (!linkId || !destinationAddress) {
    return res.status(400).send('Link ID en bestemmingsadres zijn verplicht.');
  }

  try {
    const { rows: [link] } =
      await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
    if (!link) return res.status(404).json({ error: 'linkId not found' });

    const { rows: [user] } =
      await pool.query('SELECT * FROM users WHERE id = $1', [link.user_id]);
    if (!user) return res.status(404).json({ error: 'user not found' });

    // geauthenticeerde OAuth2-client per gebruiker
    const auth = await getAuthenticatedClient(link.user_id);
    const calendar = google.calendar({ version: 'v3', auth });

    // ── Busy events ophalen, maar vangen bij token-fout
    let busySlots = [];
    try {
      const now  = new Date();
      const resp = await calendar.events.list({
        calendarId : link.calendar_id || 'primary',
        timeMin    : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
        timeMax    : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).toISOString(),
        singleEvents: true,
        orderBy     : 'startTime',
      });
      busySlots = (resp.data.items || [])
        .filter(e => e.start?.dateTime)
        .map(e => ({ start: new Date(e.start.dateTime),
                     end  : new Date(e.end .dateTime) }));
    } catch (err) {
      console.warn('Calendar fetch failed → busySlots=[]', err.message);
    }

    // ── Beschikbaarheid berekenen
    const opts = { link, busySlots, destinationAddress, getTravelTime };
    const slots = await calculateAvailability(opts);
    console.log('SLOT sample', slots[0]);          // debug in Railway-logs
    res.json({ title: link.title, duration: link.duration, slots });
  } catch (err) {
    console.error('Error get-availability', err);
    res.status(500).send('Fout bij ophalen van beschikbaarheid.');
  }
});
// Book an appointment
app.post('/book-appointment', async (req, res) => {
  const { linkId, startTime, name, email, destinationAddress, phone } = req.body;
  if (!linkId || !startTime || !name || !email || !destinationAddress || !phone) {
    return res.status(400).send('Alle velden zijn verplicht.');
  }

  try {
    const linkResult = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
    if (linkResult.rows.length === 0) return res.status(404).send('Link niet gevonden.');

    const { user_id: userId, title, duration, calendar_id: calendarId } = linkResult.rows[0];

    // Log the appointment
    await pool.query(
        'INSERT INTO appointments (link_id, user_id, name, email, phone, appointment_time, destination_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [linkId, userId, name, email, phone, startTime, destinationAddress]
    );

    const userResult = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).send('Gebruiker niet gevonden.');

    const auth = await getAuthenticatedClient(userId);

    const calendar = google.calendar({ version: 'v3', auth });
    const appointmentStart = new Date(startTime);
    const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60000);

    // Create main appointment event
    const mainEvent = {
      summary: title,
      description: `Afspraak met ${name} (${phone}).`,
      location: destinationAddress,
      start: { dateTime: appointmentStart.toISOString(), timeZone: 'Europe/Amsterdam' },
      end: { dateTime: appointmentEnd.toISOString(), timeZone: 'Europe/Amsterdam' },
      attendees: [{ email }],
      reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 24 * 60 }, { method: 'popup', minutes: 10 }] },
    };
    await calendar.events.insert({ calendarId: calendarId || 'primary', resource: mainEvent, sendNotifications: true });

    res.status(200).send('Afspraak succesvol ingepland.');
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).send('Fout bij het aanmaken van de afspraak.');
  }
});

const startServer = async () => {
  try {
  await testConnection();
  await createTables();
    // console.log('Database tables checked/created successfully.');
    
    const requiredVars = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      // 'DATABASE_URL', // Tijdelijk uitgeschakeld
      'GOOGLE_MAPS_API_KEY',
    ];
    for (const v of requiredVars) {
      if (!process.env[v]) {
        console.warn(`WARNING: Environment variable ${v} is not set.`);
      }
    }
    app.listen(port, () => {
      console.log(`Server luistert op http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize database or start server:', error);
    process.exit(1);
  }
};

startServer();

// Trigger new deployment

