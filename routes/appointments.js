// Bestand: routes/appointments.js

import express from 'express';
import { pool } from '../db.js';
import { getAuthenticatedClient, bookAppointmentInGoogleCalendar } from '../services/googleService.js';
import { calculateAndVerifySlot, getInitialAvailability } from '../services/availabilityService.js';
import { apiRoutes } from '../shared/apiRoutes.js';

const router = express.Router();
const paths = apiRoutes.appointments;

// Middleware to check for authentication using Passport
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ status: 'error', message: 'Authenticatie vereist.', code: 'UNAUTHORIZED' });
};

// GET all appointments for a user or a specific link
router.get(paths.getAll, isAuthenticated, async (req, res) => {
    const { linkId } = req.query;
    let query;
    const params = [req.user.id];

    if (linkId) {
        query = 'SELECT * FROM appointments WHERE user_id = $1 AND link_id = $2 ORDER BY appointment_time DESC';
        params.push(linkId);
    } else {
        query = 'SELECT * FROM appointments WHERE user_id = $1 ORDER BY appointment_time DESC';
    }

    try {
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ message: 'Fout bij het ophalen van afspraken.', error: error.message });
    }
});

// DELETE an appointment
router.delete(paths.delete(':id'), isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const appointmentResult = await pool.query(
            `SELECT a.google_event_id, l.calendar_id 
             FROM appointments a
             JOIN links l ON a.link_id = l.id
             WHERE a.id = $1 AND a.user_id = $2`,
            [id, userId]
        );

        if (appointmentResult.rows.length === 0) {
            return res.status(404).send('Afspraak niet gevonden of geen toestemming.');
        }

        const { google_event_id, calendar_id } = appointmentResult.rows[0];

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
                console.warn(`Google Calendar event ${google_event_id} was already deleted.`);
            }
        }

        await pool.query('DELETE FROM appointments WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ message: 'Fout bij het verwijderen van de afspraak.', error: error.message });
    }
});

// --- Public facing routes for scheduling ---

router.get(paths.getAvailability, async (req, res) => {
    try {
        const data = await getInitialAvailability(req.query.linkId);
        res.json(data);
    } catch (err) {
        console.error('Error in /get-availability route:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

router.post(paths.verifySlot, async (req, res) => {
    try {
        const result = await calculateAndVerifySlot(req.body);
        res.json(result);
    } catch (err) {
        console.error(`[VERIFY_SLOT_ERROR] -`, err);
        res.status(err.statusCode || 500).json({ status: 'error', message: err.message, code: 'INTERNAL_SERVER_ERROR' });
    }
});

router.post(paths.book, async (req, res) => {
    const { linkId, startTime, name, email, destinationAddress, phone, comments } = req.body;
    try {
        const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id = $1', [linkId]);
        if (!link) {
             return res.status(404).json({ status: 'error', message: 'Link niet gevonden.', code: 'NOT_FOUND' });
        }

        const { rows: [dbAppointment] } = await pool.query(
            'INSERT INTO appointments (link_id, user_id, name, email, phone, comments, appointment_time, destination_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [linkId, link.user_id, name, email, phone, comments || null, startTime, destinationAddress]
        );
        
        const googleEvent = await bookAppointmentInGoogleCalendar(link, req.body);

        if (googleEvent.data.id) {
            await pool.query('UPDATE appointments SET google_event_id = $1 WHERE id = $2', [googleEvent.data.id, dbAppointment.id]);
        }

        res.status(200).json({ status: 'success', message: 'Afspraak succesvol ingepland.' });
    } catch (error) {
        console.error(`[BOOK_APPOINTMENT_ERROR] linkId: ${linkId} -`, error);
        res.status(500).json({ status: 'error', message: 'Fout bij het aanmaken van de afspraak.', code: 'INTERNAL_SERVER_ERROR' });
    }
});


export default router;