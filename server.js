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

app.set('trust proxy', 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' },
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
  console.log('--- Starting /get-availability ---');
  const { linkId, destinationAddress } = req.query;
  console.log(
    `Request received with linkId: ${linkId} and destinationAddress: ${destinationAddress}`
  );

  if (!linkId || !destinationAddress) {
    console.error('Validation failed: Missing linkId or destinationAddress.');
    return res.status(400).send('Link ID en bestemmingsadres zijn verplicht.');
  }

  try {
    console.log('1. Fetching link info from DB...');
    const linkResult = await pool.query('SELECT * FROM links WHERE id = $1', [
      linkId,
    ]);
    if (linkResult.rows.length === 0) {
      console.error('DB Error: Link not found for ID:', linkId);
      return res.status(404).send('Link niet gevonden.');
    }

    const linkInfo = linkResult.rows[0];
    const {
      user_id: userId,
      title,
      duration,
      buffer,
      availability,
      start_address: startAddress,
    } = linkInfo;
    console.log(
      `Found link for user ${userId} with start address: ${startAddress}`
    );

    console.log('2. Fetching user tokens from DB...');
    const userResult = await pool.query(
      'SELECT tokens FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      console.error('DB Error: User not found for ID:', userId);
      return res.status(404).send('Gebruiker niet gevonden.');
    }

    const { tokens } = userResult.rows[0];
    if (!tokens || !tokens.refresh_token) {
      console.error('Auth Error: User is missing a refresh_token.');
      return res
        .status(500)
        .send(
          'Fout in de gebruikersauthenticatie. Probeer opnieuw in te loggen.'
        );
    }
    console.log('User tokens found.');

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(tokens);
    auth.on('tokens', (refreshedTokens) => {
      console.log('Google tokens were refreshed. Updating DB...');
      const newTokens = { ...tokens, ...refreshedTokens };
      pool
        .query('UPDATE users SET tokens = $1 WHERE id = $2', [
          newTokens,
          userId,
        ])
        .catch((err) => console.error('Error updating tokens in DB:', err));
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const timeMin = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    ).toISOString();
    const timeMax = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 8
    ).toISOString();
    console.log(`3. Checking Google Calendar from ${timeMin} to ${timeMax}`);

    const eventsResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    const busySlots = eventsResponse.data.items;
    console.log(`Found ${busySlots.length} busy slots in the calendar.`);

    const availableSlots = [];
    const appointmentDurationMinutes = parseInt(duration, 10);
    const bufferMinutes = parseInt(buffer, 10);
    console.log(
      `Appointment details: duration=${appointmentDurationMinutes}min, buffer=${bufferMinutes}min`
    );

    let currentDay = new Date(timeMin);
    console.log('4. Starting availability calculation loop...');
    while (currentDay < new Date(timeMax)) {
      const dayOfWeek = currentDay.getDay();
      const rule = availability.find((r) => r.dayOfWeek === dayOfWeek);

      if (rule) {
        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        let slotStart = new Date(currentDay);
        slotStart.setHours(startHour, startMinute, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(endHour, endMinute, 0, 0);

        while (slotStart < dayEnd) {
          const previousAppointment = [...busySlots]
            .reverse()
            .find(
              (event) =>
                event.end.dateTime && new Date(event.end.dateTime) <= slotStart
            );
          const origin = previousAppointment?.location || startAddress;

          console.log(
            `  - Checking slot at ${slotStart.toLocaleTimeString()}. Origin: ${origin}`
          );

          const travelTimeSeconds = await getTravelTime(
            origin,
            destinationAddress
          );
          const travelTimeMinutes = Math.ceil(travelTimeSeconds / 60);

          const appointmentStartTime = new Date(
            slotStart.getTime() + travelTimeMinutes * 60000
          );
          const appointmentEndTime = new Date(
            appointmentStartTime.getTime() + appointmentDurationMinutes * 60000
          );
          const totalBlockEndTime = new Date(
            appointmentEndTime.getTime() + bufferMinutes * 60000
          );

          if (totalBlockEndTime > dayEnd) {
            console.log(`  - Slot rejected: total block ends after day ends.`);
            break;
          }

          let isAvailable = true;
          for (const busy of busySlots) {
            // Skip all-day events for this specific check
            if (!busy.start.dateTime || !busy.end.dateTime) {
              continue;
            }
            const busyStart = new Date(busy.start.dateTime);
            const busyEnd = new Date(busy.end.dateTime);
            if (
              appointmentStartTime < busyEnd &&
              totalBlockEndTime > busyStart
            ) {
              console.log(
                `  - Slot rejected: conflicts with existing event from ${busyStart.toLocaleTimeString()} to ${busyEnd.toLocaleTimeString()}`
              );
              isAvailable = false;
              break;
            }
          }

          if (isAvailable) {
            console.log(
              `  - Slot FOUND: ${appointmentStartTime.toISOString()}`
            );
            availableSlots.push({
              start: appointmentStartTime.toISOString(),
              end: appointmentEndTime.toISOString(),
            });
          }

          slotStart = new Date(slotStart.getTime() + 15 * 60000); // Check every 15 minutes
        }
      }
      currentDay.setDate(currentDay.getDate() + 1);
    }
    console.log(
      `5. Calculation finished. Found ${availableSlots.length} total available slots.`
    );
    console.log('--- Finished /get-availability ---');
    res.json({ title, slots: availableSlots });
  } catch (error) {
    console.error('--- FATAL ERROR in /get-availability ---');
    console.error('Full error object:', error);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('--- END OF FATAL ERROR ---');
    res
      .status(500)
      .send(
        'Er is een kritieke fout opgetreden bij het ophalen van beschikbaarheid.'
      );
  }
});

// Book an appointment
app.post('/book-appointment', async (req, res) => {
  const { linkId, startTime, name, email, destinationAddress } = req.body;
  if (!linkId || !startTime || !name || !email || !destinationAddress) {
    return res.status(400).send('Alle velden zijn verplicht.');
  }

  try {
    const linkResult = await pool.query('SELECT * FROM links WHERE id = $1', [
      linkId,
    ]);
    if (linkResult.rows.length === 0)
      return res.status(404).send('Link niet gevonden.');

    const { user_id: userId, title, duration } = linkResult.rows[0];

    const userResult = await pool.query(
      'SELECT tokens FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0)
      return res.status(404).send('Gebruiker niet gevonden.');

    const { tokens } = userResult.rows[0];
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials(tokens);
    auth.on('tokens', (refreshedTokens) => {
      const newTokens = { ...tokens, ...refreshedTokens };
      pool
        .query('UPDATE users SET tokens = $1 WHERE id = $2', [
          newTokens,
          userId,
        ])
        .catch((err) => console.error('Error updating tokens:', err));
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: title,
      description: `Afspraak met ${name}.`,
      location: destinationAddress,
      start: { dateTime: startTime, timeZone: 'Europe/Amsterdam' },
      end: {
        dateTime: new Date(
          new Date(startTime).getTime() + duration * 60000
        ).toISOString(),
        timeZone: 'Europe/Amsterdam',
      },
      attendees: [{ email: email }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendNotifications: true,
    });
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
