// Bestand: auth/google.js

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

export default (passport) => {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI,
    },
    async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails[0].value;
        const tokens = { access_token: accessToken, refresh_token: refreshToken };

        try {
            let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            let user = result.rows[0];

            if (user) {
                // Update tokens voor bestaande gebruiker
                await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [tokens, user.id]);
                user.tokens = tokens; // Zorg ervoor dat het user object up-to-date is
            } else {
                // Maak nieuwe gebruiker aan
                const userId = uuidv4();
                await pool.query(
                    'INSERT INTO users (id, email, tokens) VALUES ($1, $2, $3)',
                    [userId, email, tokens]
                );
                result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
                user = result.rows[0];
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));
};