// Dit object wordt onze 'single source of truth' voor alle API-paden.
// Alle backend-routes moeten beginnen met /api/
export const apiRoutes = {
  // Routes voor authenticatie
  auth: {
    prefix: '/api/auth',
    status: '/status',
    login: '/google', // Start de Google OAuth flow
    logout: '/logout',
    callback: '/google/callback', // De callback URL die Google aanroept
  },

  // Routes voor links
  links: {
    prefix: '/api/links',
    getAll: '/',
    create: '/',
    getById: (id) => `/${id}`,
    update: (id) => `/${id}`,
    delete: (id) => `/${id}`,
    duplicate: (id) => `/${id}/duplicate`,
  },

  // Routes voor afspraken
  appointments: {
    prefix: '/api/appointments',
    getAll: '/',
    delete: (id) => `/${id}`,
  },

  // Routes voor de publieke planningspagina
  planning: {
    prefix: '/api/planning',
    getLinkDetails: '/:linkId',
    getAvailability: '/:linkId/availability',
    verifySlot: '/:linkId/verify-slot',
    book: '/:linkId/book',
  },

  // Algemene/gedeelde API-routes
  general: {
    prefix: '/api',
    config: '/config',
    calendars: '/calendars',
    dashboardSummary: '/dashboard/summary',
  },

  // Routes voor de frontend (React Router)
  frontend: {
    login: '/login',
    dashboard: '/dashboard',
    appointments: '/appointments',
    linkEditor: '/link-editor',
    linkEditorWithId: '/link-editor/:id',
    planning: '/planning/:linkId', // Voor de publieke planningspagina
    home: '/',
  },
};
