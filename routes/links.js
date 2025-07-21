// Bestand: routes/links.js

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { apiRoutes } from '../shared/apiRoutes.js';

const router = express.Router();
const paths = apiRoutes.links;

// Middleware to check for authentication using Passport
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ status: 'error', message: 'Authenticatie vereist.', code: 'UNAUTHORIZED' });
};

// GET all links for the logged-in user
router.get(paths.getAll, isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM links WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching links:', error);
        res.status(500).json({ message: error.message, stack: error.stack });
    }
});

// GET a single link by ID
router.get(paths.getById(':id'), isAuthenticated, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM links WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (rows.length === 0) {
            return res.status(404).send('Link niet gevonden of geen toestemming.');
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching single link:', error);
        res.status(500).send('Fout bij het ophalen van de link.');
    }
});

// POST a new link
router.post(paths.create, isAuthenticated, async (req, res) => {
    const { title, description, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days } = req.body;
    if (!title || !duration || !buffer || !startAddress || !calendarId) {
        return res.status(400).json({ status: 'error', message: 'Required fields are missing.', code: 'VALIDATION_ERROR' });
    }
    try {
        const linkId = uuidv4();
        await pool.query(
            'INSERT INTO links (id, user_id, title, description, duration, buffer, availability, start_address, calendar_id, max_travel_time, workday_mode, include_travel_start, include_travel_end, planning_offset_days, planning_window_days) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
            [linkId, req.user.id, title, description, parseInt(duration), parseInt(buffer), JSON.stringify(availability), startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days || 0, planning_window_days || 14]
        );
        res.status(201).json({ status: 'success', linkId });
    } catch (error) {
        console.error('[CREATE_LINK_ERROR]', error);
        res.status(500).json({ status: 'error', message: 'Fout bij het aanmaken van de link.', code: 'INTERNAL_SERVER_ERROR' });
    }
});

// PUT (update) an existing link
router.put(paths.update(':id'), isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { title, description, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days } = req.body;
    
    try {
        const { rows: [link] } = await pool.query('SELECT user_id FROM links WHERE id = $1', [id]);
        if (!link || link.user_id !== req.user.id) {
            return res.status(403).json({ status: 'error', message: 'Geen toestemming.', code: 'FORBIDDEN' });
        }

        await pool.query(
            'UPDATE links SET title = $1, description = $2, duration = $3, buffer = $4, availability = $5, start_address = $6, calendar_id = $7, max_travel_time = $8, workday_mode = $9, include_travel_start = $10, include_travel_end = $11, planning_offset_days = $12, planning_window_days = $13 WHERE id = $14',
            [title, description, duration, buffer, JSON.stringify(availability), startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days, id]
        );
        res.status(200).json({ status: 'success', message: 'Link succesvol bijgewerkt.' });
    } catch (error) {
        console.error(`[UPDATE_LINK_ERROR] linkId: ${id} -`, error);
        res.status(500).json({ status: 'error', message: 'Fout bij het bijwerken van de link.', code: 'INTERNAL_SERVER_ERROR' });
    }
});

// DELETE a link
router.delete(paths.delete(':id'), isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: [link] } = await pool.query('SELECT user_id FROM links WHERE id = $1', [id]);
        if (!link || link.user_id !== req.user.id) {
            return res.status(403).json({ status: 'error', message: 'Geen toestemming.', code: 'FORBIDDEN' });
        }
        await pool.query('DELETE FROM links WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error(`[DELETE_LINK_ERROR] linkId: ${id} -`, error);
        res.status(500).json({ status: 'error', message: 'Fout bij het verwijderen van de link.', code: 'INTERNAL_SERVER_ERROR' });
    }
});

// POST to duplicate a link
router.post(paths.duplicate(':id'), isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows: [originalLink] } = await pool.query('SELECT * FROM links WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        if (!originalLink) {
            return res.status(404).send('Originele link niet gevonden.');
        }

        const newLink = { ...originalLink };
        newLink.id = uuidv4();
        newLink.title = `${originalLink.title} (kopie)`;
        
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

export default router;