// Bestand: frontend/src/utils/apiClient.js
import axios from 'axios';

const apiClient = axios.create({
  // Gebruikt de Railway URL in productie, en een fallback voor lokale ontwikkeling
  baseURL: '/', 
  withCredentials: true, // Essentieel voor sessie-cookies
});

export default apiClient;