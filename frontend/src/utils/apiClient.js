// Bestand: frontend/src/utils/apiClient.js

/**
 * Een gecentraliseerde wrapper voor de Fetch API.
 * - Voegt automatisch 'credentials: include' toe om sessie-cookies mee te sturen.
 * - Standaardiseert headers en foutafhandeling.
 * - Verwerkt JSON-responses.
 * @param {string} url De URL om de aanroep naar te doen.
 * @param {object} options Optionele fetch-opties (bv. method, body).
 * @returns {Promise<object>} De JSON-response van de API.
 */
export const apiClient = async (url, options = {}) => {
  const defaultOptions = {
    // Essentieel: Instrueer de browser om cookies mee te sturen.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, defaultOptions);

  if (!response.ok) {
    // Probeer een JSON-foutbericht te parsen, anders gebruik de status tekst.
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || 'Er is een onbekende API-fout opgetreden.');
  }

  // Voorkom fouten bij lege responses (bv. een 204 No Content).
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};
