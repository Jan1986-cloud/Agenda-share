// Bestand: routes/api.js

import express from 'express';
import { pool } from '../db.js';
import { getAuthenticatedClient } from '../services/googleService.js';
import { google } from 'googleapis';
import { apiRoutes } from '../shared/apiRoutes.js';

const router = express.Router();
const paths = apiRoutes.api;

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).send('Authenticatie vereist.');
};

// GET config
router.get(paths.config, (req, res) => {
    res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY });
});

// GET link details for the scheduling page
router.get(paths.linkDetails, async (req, res) => {
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

// GET user's calendars
router.get(paths.calendars, isAuthenticated, async (req, res) => {
    try {
        // Gebruik req.user.id, dat door Passport wordt geleverd
        const auth = await getAuthenticatedClient(req.user.id);
        const calendar = google.calendar({ version: 'v3', auth });
        const result = await calendar.calendarList.list();
        res.json(result.data.items);
    } catch (error) {
        console.error('Error fetching calendar list:', error);
        res.status(500).json({ message: error.message });
    }
});

// GET dashboard summary
router.get(paths.dashboardSummary, isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id; // Gebruik req.user.id
        const totalAppointmentsResult = await pool.query('SELECT COUNT(*) AS total_appointments FROM appointments WHERE user_id = $1', [userId]);
        const totalAppointments = parseInt(totalAppointmentsResult.rows[0].total_appointments, 10);
        const timeSavedMinutes = totalAppointments * 15;

        const linksWithCountsResult = await pool.query(`
            SELECT l.id, l.title, l.calendar_id, COUNT(a.id) AS appointment_count
            FROM links l LEFT JOIN appointments a ON l.id = a.link_id
            WHERE l.user_id = $1 GROUP BY l.id ORDER BY l.created_at DESC`, [userId]);
        
        const calendarsWithCountsResult = await pool.query(`
            SELECT l.calendar_id, COUNT(a.id) AS appointment_count
            FROM appointments a JOIN links l ON a.link_id = l.id
            WHERE a.user_id = $1 GROUP BY l.calendar_id ORDER BY appointment_count DESC`, [userId]);

        res.json({
            totalAppointments,
            timeSavedMinutes,
            links: linksWithCountsResult.rows,
            calendars: calendarsWithCountsResult.rows,
        });
    } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        res.status(500).json({ message: 'Fout bij het ophalen van de dashboard-samenvatting.' });
    }
});

export default router;