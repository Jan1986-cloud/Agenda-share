// Bestand: routes/appointments.js
// Dit bestand bevat de routes voor ingelogde gebruikers om hun afspraken te beheren.

import express from 'express';
import db from '#config/db.js';
import { param, query, validationResult } from 'express-validator';
import { getAuthenticatedClient } from '#services/googleService.js';
import { google } from 'googleapis';
import { apiRoutes } from '#shared/apiRoutes.js';
import logger from '#utils/logger.js';

const router = express.Router();
const paths = apiRoutes.appointments;

// --- Validation Rules ---
const idParamValidationRules = [
    param('id').isUUID().withMessage('Ongeldig afspraak ID formaat.')
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

// GET all appointments for a user or a specific link
router.get(
    paths.getAll, 
    isAuthenticated, 
    [query('linkId').optional().isUUID().withMessage('Ongeldig link ID formaat.')], 
    handleValidationErrors, 
    async (req, res, next) => {
        try {
            const { linkId } = req.query;
            let query = db('appointments')
                .where('user_id', req.user.id)
                .orderBy('appointment_time', 'desc');

            if (linkId) {
                query = query.andWhere('link_id', linkId);
            }

            const appointments = await query;
            res.json(appointments);
        } catch (error) {
            next(error);
        }
    }
);

// DELETE an appointment
router.delete(paths.delete(':id'), isAuthenticated, idParamValidationRules, handleValidationErrors, async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const appointment = await db('appointments as a')
            .join('links as l', 'a.link_id', 'l.id')
            .where({ 'a.id': id, 'a.user_id': userId })
            .select('a.google_event_id', 'l.calendar_id')
            .first();

        if (!appointment) {
            return res.status(404).send('Afspraak niet gevonden of geen toestemming.');
        }

        const { google_event_id, calendar_id } = appointment;

        if (google_event_id) {
            const auth = await getAuthenticatedClient(userId);
            const calendar = google.calendar({ version: 'v3', auth });
            try {
                await calendar.events.delete({
                    calendarId: calendar_id || 'primary',
                    eventId: google_event_id,
                    sendNotifications: true,
                });
            } catch (gcalError) {
                if (gcalError.code !== 404 && gcalError.code !== 410) throw gcalError;
                logger.warn({ message: 'Google Calendar event was already deleted.', eventId: google_event_id, error: gcalError });
            }
        }

        await db('appointments').where('id', id).del();
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export default router;
