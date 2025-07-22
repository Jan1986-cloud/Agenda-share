// Bestand: server.js (Versie 2.0 - Gecorrigeerd & Geoptimaliseerd)

import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import cors from 'cors';

import db, { pool, testConnection } from './db.js';
import initializePassport from './config/passport.js';
import apiRoutes from './shared/apiRoutes.js';
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
const isProduction = process.env.NODE_ENV === 'production';

// --- Dynamische CORS Middleware --- // CORRECTIE 1: Dynamische origin policy
const allowedOrigins = [
  'http://localhost:5173', // Toegestaan voor lokale ontwikkeling
];

// Voeg de productie-URL alleen toe als deze is gedefinieerd
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Sta verzoeken toe als de origin in de whitelist staat (of als er geen origin is, zoals bij server-naar-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// --- Standaard Middleware ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // TOEGEVOEGD: Best practice voor sessiebeheer

// --- Session Store Setup ---
const PgStore = pgSession(session);
const sessionStore = new PgStore({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
});

// In productie vertrouwen we de eerste proxy (bv. van Railway/Heroku).
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dagen
    },
}));

// --- Passport Initialisatie ---
initializePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// --- API Routes ---
app.use(apiRoutes.auth.prefix, authRoutes);
app.use(apiRoutes.general.prefix, generalApiRoutes);
app.use(apiRoutes.links.prefix, linkRoutes);
app.use(apiRoutes.appointments.prefix, appointmentRoutes);
app.use(apiRoutes.planning.prefix, planningRoutes);

// --- Frontend Serving ---
if (isProduction) {
    const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
    app.use(express.static(frontendDistPath)); // CORRECTIE 3: Geen redundante static-aanroep meer

    // --- Frontend Catch-all ---
    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

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
        stack: isProduction ? undefined : err.stack,
    });
});

// --- Server Start ---
const startServer = async () => {
    try {
        // Gedeelte van de startServer functie in backend/server.js

	const requiredVars = [
    		'SESSION_SECRET',
    		'GOOGLE_CLIENT_ID',
    		'GOOGLE_CLIENT_SECRET',
    		'GOOGLE_REDIRECT_URI',
    		'GOOGLE_MAPS_API_KEY', // Toegevoegd
    		'DATABASE_URL',
    		'OPENROUTER_API_KEY'     // Toegevoegd
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

        const port = process.env.PORT || 3000;
        app.listen(port, () => {
             // CORRECTIE 2: Accurate en niet-misleidende log message
            logger.info(`Server listening on port ${port}`);
        });
    } catch (error) {
        logger.error({ message: 'Failed to initialize or start server', error });
        process.exit(1);
    }
};

startServer();