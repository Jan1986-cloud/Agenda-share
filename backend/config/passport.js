// Bestand: config/passport.js

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import db from '../db.js'; // Gebruik de Knex instance
import logger from '../utils/logger.js'; // Zorg dat deze import bovenaan staat

export default function(passport) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_REDIRECT_URI,
      },
      async (accessToken, refreshToken, profile, done) => {
        logger.info('AUTH_FLOW: GoogleStrategy callback invoked for profile.', { email: profile.emails?.[0]?.value });
        const { emails } = profile;
        const email = emails && emails.length > 0 ? emails[0].value : null;

        if (!email) {
          logger.error('AUTH_FLOW: No email found in Google profile.');
          return done(new Error("Kon geen e-mailadres ophalen van Google."), null);
        }

        const tokens = { access_token: accessToken, refresh_token: refreshToken };

        try {
          logger.info('AUTH_FLOW: Attempting to find user by email in DB:', email);
          const user = await db('users').where('email', email).first();

          if (user) {
            logger.info('AUTH_FLOW: User found, updating tokens for user ID:', user.id);
            await db('users').where('id', user.id).update({ tokens });
            const updatedUser = { ...user, tokens };
            logger.info('AUTH_FLOW: User tokens updated in DB, calling done() for existing user.');
            return done(null, updatedUser);
          } else {
            logger.info('AUTH_FLOW: New user detected, inserting into DB with email:', email);
            const [newUser] = await db('users')
              .insert({ email, tokens })
              .returning('*');
            logger.info('AUTH_FLOW: New user inserted in DB, calling done() for new user.');
            return done(null, newUser);
          }
        } catch (err) {
          logger.error({ message: 'AUTH_FLOW: Error during database operation in GoogleStrategy callback', error: err, email });
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    logger.info('AUTH_FLOW: Serializing user ID:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    logger.info('AUTH_FLOW: Deserializing user ID:', id);
    try {
      const user = await db('users').where('id', id).first();
      if (user) {
        logger.info('AUTH_FLOW: User deserialized successfully for ID:', user.id);
        done(null, user);
      } else {
        logger.warn('AUTH_FLOW: User not found during deserialization for ID:', id);
        done(new Error('User not found'), null);
      }
    } catch (err) {
      logger.error({ message: 'AUTH_FLOW: Error during user deserialization', error: err, id });
      done(err, null);
    }
  });
}
