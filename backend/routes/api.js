// Bestand: routes/api.js

import express from 'express';
import db from '../db.js'; // Gebruik de Knex instance
import { getAuthenticatedClient } from '../services/googleService.js';
import { google } from 'googleapis';
import { apiRoutes } from '../shared/apiRoutes.js';
import logger from '../utils/logger.js';

const router = express.Router();
const paths = apiRoutes.general;

// --- Middleware ---
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).send('Authenticatie vereist.');
};

// --- Routes ---

// GET config
router.get(paths.config, (req, res) => {
    // Deze route is publiek, geen authenticatie nodig.
    res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY });
});

// GET user's calendars
router.get(paths.calendars, isAuthenticated, async (req, res, next) => {
    try {
        const auth = await getAuthenticatedClient(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth });
        const result = await calendar.calendarList.list();
        res.json(result.data.items);
    } catch (error) {
        next(error);
    }
});

// GET dashboard summary
router.get(paths.dashboardSummary, isAuthenticated, async (req, res, next) => {
    try {
        const userId = req.user.id;

        const totalAppointmentsResult = await db('appointments')
            .where('user_id', userId)
            .count('* as total_appointments')
            .first();
        
        const totalAppointments = parseInt(totalAppointmentsResult.total_appointments, 10);
        const timeSavedMinutes = totalAppointments * 15;

        const linksWithCountsResult = await db('links as l')
            .leftJoin('appointments as a', 'l.id', 'a.link_id')
            .where('l.user_id', userId)
            .groupBy('l.id')
            .orderBy('l.created_at', 'desc')
            .select('l.id', 'l.title', 'l.calendar_id', db.raw('COUNT(a.id) as appointment_count'));
        
        const calendarsWithCountsResult = await db('appointments as a')
            .join('links as l', 'a.link_id', 'l.id')
            .where('a.user_id', userId)
            .groupBy('l.calendar_id')
            .orderBy('appointment_count', 'desc')
            .select('l.calendar_id', db.raw('COUNT(a.id) as appointment_count'));

        res.json({
            totalAppointments,
            timeSavedMinutes,
            links: linksWithCountsResult,
            calendars: calendarsWithCountsResult,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
