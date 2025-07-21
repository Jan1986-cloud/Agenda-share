// Bestand: config/passport.js

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid'; // Zorg ervoor dat uuid geïmporteerd is

export default function(passport) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI,
      },
      async (accessToken, refreshToken, profile, done) => {
        const { emails } = profile;
        const email = emails && emails.length > 0 ? emails[0].value : null;

        if (!email) {
          return done(new Error("Kon geen e-mailadres ophalen van Google."), null);
        }

        const tokens = { access_token: accessToken, refresh_token: refreshToken };

        try {
          // Stap 1: Zoek gebruiker op E-MAIL (zoals in de oude server.js)
          const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

          if (userResult.rows.length > 0) {
            // Gebruiker bestaat: update de tokens en geef de gebruiker terug
            const user = userResult.rows[0];
            await pool.query('UPDATE users SET tokens = $1 WHERE id = $2', [tokens, user.id]);
            const updatedUser = { ...user, tokens };
            return done(null, updatedUser);
          } else {
            // Nieuwe gebruiker: maak aan met een UUID (zoals in de oude server.js)
            const userId = uuidv4();
            const newUserResult = await pool.query(
              'INSERT INTO users (id, email, tokens) VALUES ($1, $2, $3) RETURNING *',
              [userId, email, tokens]
            );
            return done(null, newUserResult.rows[0]);
          }
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  // Serialize en Deserialize blijven werken op basis van de user.id (wat nu weer een UUID is)
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (result.rows.length > 0) {
        done(null, result.rows[0]);
      } else {
        done(new Error('User not found'), null);
      }
    } catch (err) {
      done(err, null);
    }
  });
}