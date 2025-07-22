// Bestand: routes/auth.js
import express from 'express';
import passport from 'passport';
import { apiRoutes } from '../shared/apiRoutes.js';

const router = express.Router();
const paths = apiRoutes.auth;

// @desc    Check user authentication status
// @route   GET /api/auth/status
router.get(paths.status, (req, res) => {
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
router.get(paths.login, passport.authenticate('google', { 
  scope: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  accessType: 'offline',
  prompt: 'consent' 
}));

// @desc    Google auth callback
// @route   GET /api/auth/google/callback
router.get(
  paths.callback,
  passport.authenticate('google', { 
    failureRedirect: '/login',
  }),
  (req, res) => {
    // Stuur een script terug dat het login-venster sluit.
    // De hoofdapplicatie zal de statusverandering detecteren.
    res.send('<script>window.close();</script>');
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
