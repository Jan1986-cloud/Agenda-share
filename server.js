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
import cors from 'cors'; // Nieuw

import db, { pool, testConnection } from './db.js';
import initializePassport from './config/passport.js';
import { apiRoutes } from './shared/apiRoutes.js';
import logger from './utils/logger.js';

// Importeer de route-modules
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import appointmentRoutes from './routes/appointments.js';
import generalApiRoutes from './routes/api.js';
import planningRoutes from './routes/planning.js';

// --- Express App Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

// --- CORS Middleware ---
// Essentieel voor de dev-omgeving waar frontend en backend op verschillende poorten draaien.
app.use(cors({
  origin: 'http://localhost:5173', // De origin van de Vite dev server
  credentials: true // Sta het meesturen van cookies toe
}));

// --- Session Store Setup ---
const PgStore = pgSession(session);
const sessionStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));
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

// --- API Routes ---
// Alle routes worden nu consistent onder /api gehangen
app.use(apiRoutes.auth.prefix, authRoutes);
app.use(apiRoutes.general.prefix, generalApiRoutes); // CORRECTED: Use renamed router
app.use(apiRoutes.links.prefix, linkRoutes);
app.use(apiRoutes.appointments.prefix, appointmentRoutes);
app.use(apiRoutes.planning.prefix, planningRoutes);


// --- Frontend Serving ---
// In production, serve the built frontend files
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'frontend', 'dist')));
}

// --- Frontend Catch-all ---
// Alle GET-verzoeken die niet door een API-route zijn afgehandeld, serveren de React-app.
// Dit moet NA de API-routes komen.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

// --- Central Error Handler ---
app.use((err, req, res, next) => {
    logger.error({
        message: `Unhandled error for request ${req.method} ${req.path}`,
        error: {
            message: err.message,
            stack: err.stack,
            code: err.code,
        },
        request: {
            path: req.path,
            method: req.method,
            body: req.body,
            query: req.query,
            ip: req.ip,
        }
    });

    if (res.headersSent) {
        return next(err);
    }

    res.status(err.statusCode || 500).json({
        status: 'error',
        message: err.message || 'Er is een interne serverfout opgetreden.',
        code: err.code || 'INTERNAL_SERVER_ERROR',
        // Toon de stacktrace alleen in development
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
});


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
        logger.info('Running database migrations...');
        await db.migrate.latest();
        logger.info('Migrations finished.');
        app.listen(port, () => logger.info(`Server listening on http://localhost:${port}`));
    } catch (error) {
        logger.error({ message: 'Failed to initialize or start server', error });
        process.exit(1);
    }
};

startServer();
