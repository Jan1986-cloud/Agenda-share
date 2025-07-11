import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { pool, createTables } from './db.js';
import fetch from 'node-fetch';

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
      sameSite: 'lax' 
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
    const { tokens } = await oauth2Client.getToken(code);
    const userId = uuidv4();

    await pool.query(
      'INSERT INTO users (id, tokens) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET tokens = $2',
      [userId, tokens]
    );

    req.session.userId = userId;
    res.redirect('/share.html');
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Er is een fout opgetreden tijdens de authenticatie.');
  }
});

app.get('/share.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// Generate a shareable link
app.post('/generate-link', async (req, res) => {
  const { userId } = req.session;
  const { title, duration, buffer, availability, startAddress } = req.body;

  if (!userId) return res.status(403).send('Authenticatie vereist.');
  if (
    !title ||
    !duration ||
    !availability ||
    !Array.isArray(availability) ||
    !startAddress
  ) {
    return res
      .status(400)
      .send('Ongeldige invoer. Alle velden zijn verplicht.');
  }

  try {
    const linkId = uuidv4();
    await pool.query(
      'INSERT INTO links (id, user_id, title, duration, buffer, availability, start_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        linkId,
        userId,
        title,
        parseInt(duration, 10),
        parseInt(buffer, 10) || 0,
        JSON.stringify(availability),
        startAddress,
      ]
    );
    res.json({ linkId });
  } catch (error) {
    console.error('Error generating link:', error);
    res.status(500).send('Fout bij het aanmaken van de link.');
  }
});

app.get('/schedule', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'schedule.html'));
});

// Get travel time from Google Maps API
async function getTravelTime(origin, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY is not set.');
    return 0; // Return 0 if API key is missing
  }
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.rows[0].elements[0].status === 'OK') {
      return data.rows[0].elements[0].duration.value; // afronden op hele minuten
    }
  } catch (error) {
    console.error('Error fetching travel time:', error);
  }
  return 0; // Return 0 on error
}

// Get availability for a given link
app.get('/get-availability', async (req, res) => {
  const { linkId, destinationAddress } = req.query;
  if (!linkId || !destinationAddress) {
    return res.status(400).send('Link ID en bestemmingsadres zijn verplicht.');
  }

  try {
    const linkResult = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
    if (linkResult.rows.length === 0) return res.status(404).send('Link niet gevonden.');
    
    const linkInfo = linkResult.rows[0];
    const { user_id: userId, title, duration, buffer, availability, start_address: startAddress } = linkInfo;

    const userResult = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).send('Gebruiker niet gevonden.');

    const { tokens } = userResult.rows[0];
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    auth.setCredentials(tokens);
    // Token refresh logic
    auth.on('tokens', (refreshedTokens) => {
      const newTokens = { ...tokens, ...refreshedTokens };
      pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [newTokens, userId]).catch(err => console.error('Error updating tokens in DB:', err));
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).toISOString();

    const eventsResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    const busySlots = eventsResponse.data.items.map(e => ({ start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) }));

    const availableSlots = [];
    const appointmentDurationMs = parseInt(duration, 10) * 60000;
    const bufferMs = parseInt(buffer, 10) * 60000;

    const travelTimeSeconds = await getTravelTime(startAddress, destinationAddress);
    const travelTimeMs = Math.ceil(travelTimeSeconds / 60) * 60000;

    for (let d = 1; d <= 7; d++) {
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      const dayOfWeek = currentDay.getDay();
      const rule = availability.find(r => r.dayOfWeek === dayOfWeek);

      if (rule) {
        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        let potentialStartTime = new Date(currentDay);
        potentialStartTime.setHours(startHour, startMinute, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(endHour, endMinute, 0, 0);

        while (potentialStartTime < dayEnd) {
          const appointmentStartTime = new Date(potentialStartTime.getTime() + travelTimeMs);
          const appointmentEndTime = new Date(appointmentStartTime.getTime() + appointmentDurationMs);
          const totalBlockEndTime = new Date(appointmentEndTime.getTime() + bufferMs);

          if (totalBlockEndTime > dayEnd) break;

          let isAvailable = true;
          for (const busy of busySlots) {
            if (appointmentStartTime < busy.end && totalBlockEndTime > busy.start) {
              isAvailable = false;
              break;
            }
          }

          if (isAvailable) {
            availableSlots.push({
              start: appointmentStartTime.toISOString(),
              end: appointmentEndTime.toISOString(),
            });
          }
          potentialStartTime.setMinutes(potentialStartTime.getMinutes() + 15);
        }
      }
    }
    res.json({ title, duration, slots: availableSlots });
  } catch (error) {
    console.error('Error getting availability:', error);
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

    const { user_id: userId, title, duration, start_address: startAddress } = linkResult.rows[0];

    const userResult = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).send('Gebruiker niet gevonden.');

    const { tokens } = userResult.rows[0];
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    auth.setCredentials(tokens);
    auth.on('tokens', (refreshedTokens) => {
      const newTokens = { ...tokens, ...refreshedTokens };
      pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [newTokens, userId]).catch(err => console.error('Error updating tokens:', err));
    });

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
    await calendar.events.insert({ calendarId: 'primary', resource: mainEvent, sendNotifications: true });

    // Create travel time event
    const travelTimeSeconds = await getTravelTime(startAddress, destinationAddress);
    if (travelTimeSeconds > 0) {
      const travelTimeMs = travelTimeSeconds * 1000;
      const travelStart = new Date(appointmentStart.getTime() - travelTimeMs);
      const travelEvent = {
        summary: `Reistijd naar: ${title}`,
        start: { dateTime: travelStart.toISOString(), timeZone: 'Europe/Amsterdam' },
        end: { dateTime: appointmentStart.toISOString(), timeZone: 'Europe/Amsterdam' },
        transparency: 'opaque', // Marks user as busy
      };
      await calendar.events.insert({ calendarId: 'primary', resource: travelEvent });
    }

    res.status(200).send('Afspraak succesvol ingepland.');
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).send('Fout bij het aanmaken van de afspraak.');
  }
});

const startServer = async () => {
  await createTables();
  const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'DATABASE_URL',
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
};

startServer();
