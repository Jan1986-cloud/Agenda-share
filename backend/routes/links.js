// Bestand: routes/links.js

import express from 'express';
import db from '../config/db.js'; // Gebruik de gecentraliseerde Knex instance
import { body, param, validationResult } from 'express-validator';
import { apiRoutes } from '../shared/apiRoutes.js';
import logger from '../utils/logger.js';

const router = express.Router();
const paths = apiRoutes.links;

// --- Validation Rules ---
const createLinkValidationRules = [
    body('title').notEmpty().trim().withMessage('Titel is verplicht.'),
    body('description').optional({ checkFalsy: true }).trim(),
    body('duration').isInt({ min: 1 }).withMessage('Duur moet een positief getal zijn.'),
    body('buffer').isInt({ min: 0 }).withMessage('Buffer moet een getal zijn (0 of hoger).'),
    body('availability').isJSON().withMessage('Beschikbaarheid moet een geldige JSON-string zijn.'),
    body('startAddress').notEmpty().trim().withMessage('Startadres is verplicht.'),
    body('calendarId').notEmpty().trim().withMessage('Agenda ID is verplicht.'),
    body('maxTravelTime').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Maximale reistijd moet een positief getal zijn.'),
    body('workdayMode').isIn(['VAST', 'DYNAMISCH']).withMessage('Werkdagmodus is ongeldig.'),
    body('includeTravelStart').isBoolean().withMessage('Inclusief reistijd (start) moet een boolean zijn.'),
    body('includeTravelEnd').isBoolean().withMessage('Inclusief reistijd (eind) moet een boolean zijn.'),
    body('planning_offset_days').isInt({ min: 0 }).withMessage('Planning offset moet een getal zijn (0 of hoger).'),
    body('planning_window_days').isInt({ min: 1 }).withMessage('Planning-venster moet een positief getal zijn.')
];

const updateLinkValidationRules = [
    param('id').isUUID().withMessage('Ongeldig link ID formaat.'),
    ...createLinkValidationRules // Hergebruik dezelfde body validaties
];

const idParamValidationRules = [
    param('id').isUUID().withMessage('Ongeldig link ID formaat.')
];


// --- Middleware ---
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ status: 'error', message: 'Authenticatie vereist.', code: 'UNAUTHORIZED' });
};

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validatiefout.', errors: errors.array(), code: 'VALIDATION_ERROR' });
    }
    next();
};


// --- Routes ---

// GET all links for the logged-in user
router.get(paths.getAll, isAuthenticated, async (req, res, next) => {
    try {
        const links = await db('links')
            .where('user_id', req.user.id)
            .orderBy('created_at', 'desc');
        res.json(links);
    } catch (error) {
        next(error);
    }
});

// GET a single link by ID
router.get(paths.getById(':id'), isAuthenticated, idParamValidationRules, handleValidationErrors, async (req, res, next) => {
    try {
        const link = await db('links')
            .where({ id: req.params.id, user_id: req.user.id })
            .first();

        if (!link) {
            return res.status(404).send('Link niet gevonden of geen toestemming.');
        }
        res.json(link);
    } catch (error) {
        next(error);
    }
});

// POST a new link
router.post(paths.create, isAuthenticated, createLinkValidationRules, handleValidationErrors, async (req, res, next) => {
    try {
        const { title, description, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days } = req.body;
        
        const newLinkData = {
            user_id: req.user.id,
            title,
            description,
            duration,
            buffer,
            availability, // Wordt al als JSON gevalideerd
            start_address: startAddress,
            calendar_id: calendarId,
            max_travel_time: maxTravelTime,
            workday_mode: workdayMode,
            include_travel_start: includeTravelStart,
            include_travel_end: includeTravelEnd,
            planning_offset_days,
            planning_window_days
        };

        const [insertedLink] = await db('links').insert(newLinkData).returning('id');
        
        res.status(201).json({ status: 'success', linkId: insertedLink.id });
    } catch (error) {
        next(error);
    }
});

// PUT (update) an existing link
router.put(paths.update(':id'), isAuthenticated, updateLinkValidationRules, handleValidationErrors, async (req, res, next) => {
    try {
        const { id } = req.params;
        const link = await db('links').where('id', id).select('user_id').first();
        if (!link || link.user_id !== req.user.id) {
            return res.status(403).json({ status: 'error', message: 'Geen toestemming.', code: 'FORBIDDEN' });
        }

        const { title, description, duration, buffer, availability, startAddress, calendarId, maxTravelTime, workdayMode, includeTravelStart, includeTravelEnd, planning_offset_days, planning_window_days } = req.body;
        const updatedData = {
            title, description, duration, buffer, availability,
            start_address: startAddress,
            calendar_id: calendarId,
            max_travel_time: maxTravelTime,
            workday_mode: workdayMode,
            include_travel_start: includeTravelStart,
            include_travel_end: includeTravelEnd,
            planning_offset_days,
            planning_window_days
        };

        await db('links').where('id', id).update(updatedData);
        
        res.status(200).json({ status: 'success', message: 'Link succesvol bijgewerkt.' });
    } catch (error) {
        next(error);
    }
});

// DELETE a link
router.delete(paths.delete(':id'), isAuthenticated, idParamValidationRules, handleValidationErrors, async (req, res, next) => {
    try {
        const { id } = req.params;
        const link = await db('links').where({ id: id, user_id: req.user.id }).first();
        if (!link) {
            return res.status(403).json({ status: 'error', message: 'Geen toestemming of link niet gevonden.', code: 'FORBIDDEN' });
        }
        await db('links').where('id', id).del();
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// POST to duplicate a link
router.post(paths.duplicate(':id'), isAuthenticated, idParamValidationRules, handleValidationErrors, async (req, res, next) => {
    try {
        const { id } = req.params;
        const originalLink = await db('links').where({ id: id, user_id: req.user.id }).first();
        if (!originalLink) {
            return res.status(404).send('Originele link niet gevonden.');
        }

        delete originalLink.id; 
        originalLink.title = `${originalLink.title} (kopie)`;
        
        const [newLink] = await db('links').insert(originalLink).returning('*');

        res.status(201).json({ message: 'Link succesvol gedupliceerd.', newLink });
    } catch (error) {
        next(error);
    }
});

export default router;