// Bestand: server.js

import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import passport from 'passport';

import { pool, createTables, testConnection } from './db.js';
import initializePassport from './config/passport.js';
import { apiRoutes as allApiRoutes } from './shared/apiRoutes.js';

// Importeer de route-modules
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import appointmentRoutes from './routes/appointments.js';
import apiRoutes from './routes/api.js';

// --- Express App Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

// --- Session Store Setup ---
const PgStore = pgSession(session);
const sessionStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/shared', express.static('shared'));
app.use(cookieParser());
app.set('trust proxy', 1);
app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dagen
    },
}));

// --- Passport Initialisatie ---
initializePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// --- DE PROBLEMATISCHE MIDDLEWARE IS HIER VERWIJDERD ---

// --- Beveiligde Pagina Routes ---
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
};

app.get('/dashboard.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/appointments.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'appointments.html')));
app.get('/link-editor.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'link-editor.html')));

// --- Publieke Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/schedule.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'schedule.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));

// --- API Routes ---
app.use('/', authRoutes);
app.use(allApiRoutes.api.prefix, apiRoutes);
app.use(allApiRoutes.links.prefix, linkRoutes);
app.use(allApiRoutes.appointments.prefix, appointmentRoutes);

// --- Server Start ---
const startServer = async () => {
    try {
        const requiredVars = [
            'SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 
            'GOOGLE_REDIRECT_URI', 'GOOGLE_MAPS_API_KEY', 'DATABASE_URL',
            'OPENROUTER_API_KEY'
        ];
        for (const v of requiredVars) {
            if (!process.env[v]) {
                throw new Error(`FATAL ERROR: Environment variable ${v} is not defined.`);
            }
        }
        await testConnection();
        await createTables();
        app.listen(port, () => console.log(`Server luistert op http://localhost:${port}`));
    } catch (error) {
        console.error('Failed to initialize or start server:', error);
        process.exit(1);
    }
};

startServer();