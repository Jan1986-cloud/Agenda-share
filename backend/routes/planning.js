// Bestand: routes/planning.js
// Dit bestand bevat alle publiek-toegankelijke routes voor het plannen van een afspraak.

import express from 'express';
import db from '../../db.js';
import { body, param, validationResult } from 'express-validator';
import { bookAppointmentInGoogleCalendar } from '../../services/googleService.js';
import { calculateAndVerifySlot, getInitialAvailability } from '../../services/availabilityService.js';
import { apiRoutes } from '../shared/apiRoutes.js';
import logger from '../../utils/logger.js';

const router = express.Router();
const paths = apiRoutes.planning;

// --- Validation Rules ---
const linkIdParamValidation = [
    param('linkId').isUUID().withMessage('Een geldig link ID is verplicht.')
];

const verifySlotRules = [
    param('linkId').isUUID().withMessage('Ongeldig link ID.'),
    body('destinationAddress').notEmpty().trim().withMessage('Adres is verplicht.'),
    body('slotStart').isISO8601().toDate().withMessage('Ongeldig starttijd formaat.')
];

const bookAppointmentRules = [
    param('linkId').isUUID().withMessage('Ongeldig link ID.'),
    body('startTime').isISO8601().toDate().withMessage('Ongeldig starttijd formaat.'),
    body('name').notEmpty().trim().escape().withMessage('Naam is verplicht.'),
    body('email').isEmail().normalizeEmail().withMessage('Ongeldig e-mailadres.'),
    body('destinationAddress').notEmpty().trim().withMessage('Adres is verplicht.'),
    body('phone').optional({ checkFalsy: true }).trim().escape(),
    body('comments').optional({ checkFalsy: true }).trim().escape()
];

// --- Middleware ---
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validatiefout.', errors: errors.array(), code: 'VALIDATION_ERROR' });
    }
    next();
};

// --- Routes ---

// GET link details for the scheduling page
router.get(paths.getLinkDetails, linkIdParamValidation, handleValidationErrors, async (req, res, next) => {
    try {
        const { linkId } = req.params;
        const link = await db('links')
            .where('id', linkId)
            .select('title', 'description')
            .first();

        if (!link) {
            return res.status(404).json({ status: 'error', message: 'Link niet gevonden.', code: 'NOT_FOUND' });
        }
        res.json({
            ...link,
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
    } catch (error) {
        next(error);
    }
});

// GET initial availability for a link
router.get(paths.getAvailability, linkIdParamValidation, handleValidationErrors, async (req, res, next) => {
    try {
        const data = await getInitialAvailability(req.params.linkId);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// POST to verify a specific time slot
router.post(paths.verifySlot, verifySlotRules, handleValidationErrors, async (req, res, next) => {
    try {
        const result = await calculateAndVerifySlot({
            linkId: req.params.linkId,
            ...req.body
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST to book an appointment
router.post(paths.book, bookAppointmentRules, handleValidationErrors, async (req, res, next) => {
    try {
        const { linkId } = req.params;
        const { startTime, name, email, destinationAddress, phone, comments } = req.body;
        
        const link = await db('links').where('id', linkId).first();
        if (!link) {
             return res.status(404).json({ status: 'error', message: 'Link niet gevonden.', code: 'NOT_FOUND' });
        }

        const appointmentData = {
            link_id: linkId,
            user_id: link.user_id,
            name, email, phone,
            comments: comments || null,
            appointment_time: startTime,
            destination_address: destinationAddress
        };

        const [dbAppointment] = await db('appointments').insert(appointmentData).returning('id');
        
        const googleEvent = await bookAppointmentInGoogleCalendar(link, req.body);

        if (googleEvent.data.id) {
            await db('appointments').where('id', dbAppointment.id).update({ google_event_id: googleEvent.data.id });
        }

        res.status(200).json({ status: 'success', message: 'Afspraak succesvol ingepland.' });
    } catch (error) {
        next(error);
    }
});

export default router;
