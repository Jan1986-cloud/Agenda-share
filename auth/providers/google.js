// Bestand: auth/providers/google.js

import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db.js';

// The register function is now the default export
export default function register(app) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
    ];

    // The route to initiate the authentication process
    app.get('/auth/google', (req, res) => {
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: scopes
        });
        res.redirect(url);
    });

    // The callback route that Google redirects to after authentication
    app.get('/oauth2callback', async (req, res) => {
        const { code } = req.query;
        try {
            // Exchange authorization code for tokens
            const { tokens } = await oauth2Client.getToken({ code, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
            oauth2Client.setCredentials(tokens);

            // Get user information
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const { data } = await oauth2.userinfo.get();

            if (!data.email) {
                return res.status(500).send('Kon e-mailadres niet ophalen van Google.');
            }

            // Check if user exists, or create a new one
            let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [data.email]);
            let userId = userResult.rows[0]?.id;

            if (userId) {
                // Update tokens for existing user
                await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [tokens, userId]);
            } else {
                // Create a new user
                userId = uuidv4();
                await pool.query('INSERT INTO users (id, email, tokens) VALUES ($1, $2, $3)', [userId, data.email, tokens]);
            }

            // Establish a session and redirect to the dashboard
            req.session.userId = userId;
            res.redirect('/dashboard.html');
        } catch (error) {
            console.error('Error during Google authentication:', error);
            res.status(500).send('Er is een fout opgetreden tijdens de authenticatie.');
        }
    });
}