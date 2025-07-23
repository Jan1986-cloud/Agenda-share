import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import cors from 'cors';
import pgSession from 'connect-pg-simple';
import pg from 'pg';

// Importeer via de robuuste aliassen
import initializePassport from '#config/passport.js';
import { apiRoutes } from '#shared/apiRoutes.js';
import logger from '#utils/logger.js';
import db from '#config/db.js';

// Importeer de route-modules
import authRoutes from '#routes/auth.js';
import linkRoutes from '#routes/links.js';
import appointmentRoutes from '#routes/appointments.js';
import generalApiRoutes from '#routes/api.js';
import planningRoutes from '#routes/planning.js';

// --- Express App Setup ---
const { Pool } = pg;
const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// --- Middleware ---
app.use((req, res, next) => {
    logger.info({ message: `Request received: ${req.method} ${req.originalUrl}`, ip: req.ip });
    next();
});

const allowedOrigins = [
  'http://localhost:5173',
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

if (isProduction) {
  app.set('trust proxy', 1);
}

// --- Sessie Middleware (PostgreSQL Store) ---
logger.info('Initializing session middleware...');
const PgStore = pgSession(session);

// Gebruik de individuele environment variables voor de meest robuuste connectie.
// Dit omzeilt alle mogelijke problemen met het parsen van de DATABASE_URL.
const pgPool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: {
    rejectUnauthorized: false,
  },
});

const sessionStore = new PgStore({
  pool: pgPool,
  tableName: 'user_sessions',
  createTableIfMissing: true,
});

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
logger.info('Session middleware initialized.');

// --- Passport Initialisatie ---
initializePassport(passport);
logger.info('Initializing Passport middleware...');
app.use(passport.initialize());
app.use(passport.session());
logger.info('Passport middleware initialized.');

// --- API Routes ---
app.use(apiRoutes.auth.prefix, authRoutes);
app.use(apiRoutes.general.prefix, generalApiRoutes);
app.use(apiRoutes.links.prefix, linkRoutes);
app.use(apiRoutes.appointments.prefix, appointmentRoutes);
app.use(apiRoutes.planning.prefix, planningRoutes);

// --- Centrale Foutafhandeling ---
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
        const requiredVars = [
            'SESSION_SECRET',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GOOGLE_REDIRECT_URI',
            'GOOGLE_MAPS_API_KEY',
            'DATABASE_URL', // Blijft nodig voor Knex
            'PGHOST',       // Nodig voor de sessie-pool
            'PGUSER',
            'PGPASSWORD',
            'PGDATABASE',
            'OPENROUTER_API_KEY'
        ];
        for (const v of requiredVars) {
            if (!process.env[v]) {
                throw new Error(`FATAL ERROR: Environment variable ${v} is not defined.`);
            }
        }
        
        logger.info('Running database migrations...');
        await db.migrate.latest();
        logger.info('Migrations finished.');

        const port = process.env.PORT || 8080;
        app.listen(port, () => {
            logger.info(`Server listening on port ${port}`);
        });

    } catch (error) {
        console.error("--- DETAILED SERVER STARTUP ERROR ---");
        console.error("MESSAGE:", error ? error.message : 'No message available');
        console.error("STACK:", error ? error.stack : 'No stack available');
        console.error("FULL ERROR:", error);
        logger.error({ 
            message: 'Failed to initialize or start server', 
            error: error ? error.toString() : 'Undefined or null error thrown' 
        });
        process.exit(1);
    }
};

startServer();