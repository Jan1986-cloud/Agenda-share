// Bestand: routes/auth.js
import express from 'express';
import passport from 'passport';
import { apiRoutes } from '../shared/apiRoutes.js';

const router = express.Router();
const paths = apiRoutes.auth;

// @desc    Auth with Google
// @route   GET /auth/google
router.get(paths.login, passport.authenticate('google', { 
  scope: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  accessType: 'offline',
  prompt: 'consent' 
}));

// @desc    Google auth callback
// @route   GET /oauth2callback
router.get(
  paths.callback,
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Succesvolle authenticatie, redirect naar het dashboard.
    res.redirect('/dashboard.html');
  }
);

// @desc    Logout user
// @route   /auth/logout
router.get(paths.logout, (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

export default router;