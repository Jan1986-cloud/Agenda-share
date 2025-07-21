// Dit object wordt onze 'single source of truth' voor alle API-paden.
export const apiRoutes = {
  // Routes voor authenticatie
  auth: {
    login: '/auth',
    logout: '/logout',
    callback: '/oauth2callback',
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
    getAvailability: '/get-availability',
    verifySlot: '/verify-slot',
    book: '/book-appointment',
  },

  // Algemene API-routes
  api: {
    prefix: '/api',
    config: '/config',
    linkDetails: '/link-details',
    calendars: '/calendars',
    dashboardSummary: '/dashboard/summary',
  },
};