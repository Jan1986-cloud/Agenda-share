// Bestand: auth/google.js

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import db from '../../db.js'; // Gebruik de Knex instance

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
            let user = await db('users').where('email', email).first();

            if (user) {
                // Update tokens voor bestaande gebruiker
                await db('users').where('id', user.id).update({ tokens });
                user.tokens = tokens; // Zorg ervoor dat het user object up-to-date is
            } else {
                // Maak nieuwe gebruiker aan en haal deze op
                const [newUser] = await db('users')
                    .insert({ email, tokens })
                    .returning('*');
                user = newUser;
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));
};
