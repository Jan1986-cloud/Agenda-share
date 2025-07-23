// Bestand: routes/auth.js
import express from 'express';
import passport from 'passport';
import { apiRoutes } from '#shared/apiRoutes.js';
import logger from '#utils/logger.js';

const router = express.Router();
const paths = apiRoutes.auth;

// @desc    Check user authentication status
// @route   GET /api/auth/status
router.get(paths.status, (req, res) => {
  logger.info('Executing /api/auth/status handler.');
  if (req.isAuthenticated()) {
    res.json({
      isAuthenticated: true,
      user: {
        id: req.user.id,
        displayName: req.user.displayName,
        email: req.user.email,
        avatar: req.user.avatar,
      },
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// @desc    Auth with Google
// @route   GET /api/auth/google
router.get(paths.login, (req, res, next) => {
  logger.info('AUTH_FLOW: Initiating Google OAuth login request.');
  passport.authenticate('google', {
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    accessType: 'offline',
    prompt: 'consent'
  })(req, res, next);
});

// @desc    Google auth callback
// @route   GET /api/auth/google/callback
router.get(
  paths.callback,
  (req, res, next) => {
    logger.info('AUTH_FLOW: Received Google OAuth callback. Attempting to authenticate.');
    passport.authenticate('google', {
      failureRedirect: '/login',
      successRedirect: '/dashboard',
    })(req, res, next);
  },
  (err, req, res, next) => {
    logger.error({ message: 'AUTH_FLOW: Passport authentication failed in callback', error: err });
    res.redirect('/login?error=' + encodeURIComponent(err.message || 'Authentication failed'));
  }
);

// @desc    Logout user
// @route   GET /api/auth/logout
router.get(paths.logout, (req, res, next) => {
  const returnTo = req.query.returnTo || '/';
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect(returnTo);
  });
});

export default router;
