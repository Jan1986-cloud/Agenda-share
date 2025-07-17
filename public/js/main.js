document.addEventListener('DOMContentLoaded', () => {
    const languageDropdown = document.getElementById('languageDropdown');
    if (languageDropdown) {
        const dropdownItems = languageDropdown.nextElementSibling.querySelectorAll('.dropdown-item');

        const setLanguage = (lang) => {
            // Store the selected language
            localStorage.setItem('language', lang);

            // Set the lang attribute on the html tag
            document.documentElement.lang = lang;

            // Translate all elements with data-translate attribute
            document.querySelectorAll('[data-translate]').forEach(element => {
                const key = element.getAttribute('data-translate');
                if (Dictionaries[lang] && Dictionaries[lang][key]) {
                    element.innerText = Dictionaries[lang][key];
                }
            });

            // Translate all elements with data-translate-placeholder attribute
            document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
                const key = element.getAttribute('data-translate-placeholder');
                if (Dictionaries[lang] && Dictionaries[lang][key]) {
                    element.placeholder = Dictionaries[lang][key];
                }
            });
        };

        dropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = e.target.getAttribute('href').substring(1);
                setLanguage(lang);
                // Update the dropdown button text
                languageDropdown.querySelector('.bi-translate').nextSibling.textContent = ` ${e.target.textContent}`;
            });
        });

        // Set initial language
        const savedLang = localStorage.getItem('language') || 'nl';
        setLanguage(savedLang);

        // Update dropdown text to reflect the loaded language
        dropdownItems.forEach(item => {
            if (item.getAttribute('href').substring(1) === savedLang) {
                languageDropdown.querySelector('.bi-translate').nextSibling.textContent = ` ${item.textContent}`;
            }
        });
    }
});
