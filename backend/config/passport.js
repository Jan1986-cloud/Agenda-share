// Bestand: config/passport.js

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import db from '../db.js'; // Gebruik de Knex instance

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
          const user = await db('users').where('email', email).first();

          if (user) {
            // Gebruiker bestaat: update de tokens en geef de gebruiker terug
            await db('users').where('id', user.id).update({ tokens });
            const updatedUser = { ...user, tokens };
            return done(null, updatedUser);
          } else {
            // Nieuwe gebruiker: maak aan
            const [newUser] = await db('users')
              .insert({ email, tokens })
              .returning('*');
            return done(null, newUser);
          }
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await db('users').where('id', id).first();
      if (user) {
        done(null, user);
      } else {
        done(new Error('User not found'), null);
      }
    } catch (err) {
      done(err, null);
    }
  });
}
