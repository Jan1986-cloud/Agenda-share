// Bestand: frontend/src/utils/apiClient.js
import axios from 'axios';

const apiClient = axios.create({
  // Gebruikt de Railway URL in productie, en een fallback voor lokale ontwikkeling
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000', 
  withCredentials: true, // Essentieel voor sessie-cookies
});

export default apiClient;