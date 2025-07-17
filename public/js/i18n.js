// Bestand: public/js/i18n.js

// Globaal object om de vertalingen van de huidige taal op te slaan
let translations = {};

/**
 * Vertaalt alle elementen op de pagina die een 'data-i18n' attribuut hebben.
 */
const translatePage = () => {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = translations[key];
        if (translation) {
            // Specifieke logica voor bepaalde elementen
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.placeholder !== undefined) {
                    element.placeholder = translation;
                }
            } else if (element.title !== undefined && element.title !== '') {
                 element.title = translation;
            }
            else {
                element.innerHTML = translation;
            }
        }
    });
};

/**
 * Laadt het JSON-vertaalbestand voor een specifieke taal.
 * @param {string} lang - De taalcode (bijv. 'nl', 'en').
 */
const loadTranslations = async (lang) => {
    try {
        const response = await fetch(`/locales/${lang}.json`);
        if (!response.ok) {
            console.error(`Could not load translation file for language: ${lang}`);
            // Val terug op Engels als de gevraagde taal niet bestaat
            if (lang !== 'en') {
                await loadTranslations('en');
            }
            return;
        }
        translations = await response.json();
        document.documentElement.lang = lang;
        translatePage();
        updateLanguageSelector();
    } catch (error) {
        console.error('Error loading or parsing translation file:', error);
    }
};

/**
 * Werkt de taalwisselaar bij om de huidige taal weer te geven en de links correct in te stellen.
 */
const updateLanguageSelector = () => {
    const languageDropdown = document.getElementById('languageDropdown');
    if (!languageDropdown) return;

    const dropdownMenu = languageDropdown.nextElementSibling;
    dropdownMenu.innerHTML = ''; // Maak de lijst leeg

    const languages = {
        nl: translations['lang_nl'] || '🇳🇱 Nederlands',
        en: translations['lang_en'] || '🇬🇧 English',
        de: translations['lang_de'] || '🇩🇪 Deutsch',
        fr: translations['lang_fr'] || '🇫🇷 Français'
    };

    // Stel de titel van de dropdown knop in
    const dropdownToggleText = languageDropdown.querySelector('span');
    if (dropdownToggleText) {
        dropdownToggleText.textContent = translations['lang_selector_title'] || 'Languages';
    }

    // Bouw de dropdown items opnieuw op
    for (const [code, name] of Object.entries(languages)) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'dropdown-item';
        a.href = `#${code}`;
        a.textContent = name;
        a.onclick = (e) => {
            e.preventDefault();
            setLanguage(code);
        };
        li.appendChild(a);
        dropdownMenu.appendChild(li);
    }
};

/**
 * Stelt de taal in, slaat deze op en laadt de vertalingen.
 * @param {string} lang - De taalcode om in te stellen.
 */
const setLanguage = (lang) => {
    localStorage.setItem('language', lang);
    loadTranslations(lang);
};

// --- Initialisatie ---
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('language') || navigator.language.split('-')[0] || 'nl';
    setLanguage(savedLang);
});
