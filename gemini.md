# Sessie Log: Architectuurherstel & Authenticatie Debugging (maandag 21 juli 2025)

**Doel:** Oplossen van een opstartprobleem na een migratie naar een Vite-gebaseerde Single Page Application (SPA). De applicatie bleef steken op een "uitgelogd"-scherm en de login-functionaliteit was onbereikbaar.

---

### Fase 1: Initiële Diagnose - De Mismatch tussen Frontend en Backend

*   **Probleem:** De frontend (draaiend op `localhost:5173`) kon geen API-calls maken naar de backend (op `localhost:3000`). Dit veroorzaakte de initiële "uitgelogd"-pagina, omdat de status-check van de gebruiker faalde.
*   **Analyse:** De `vite.config.js` proxy-configuratie was niet correct afgestemd op de backend-routes in `server.js`. De backend-routes waren inconsistent gedefinieerd (sommige op `/`, andere op `/api`, `/links`, etc.).
*   **Oplossing:** Een grootschalige refactor werd uitgevoerd om dit structureel op te lossen:
    1.  **Centralisatie:** `shared/apiRoutes.js` werd de "single source of truth" voor alle API-paden.
    2.  **Standaardisatie:** Alle backend-routes werden programmatisch onder een consistente `/api` prefix geplaatst.
    3.  **Vereenvoudiging:** De Vite-proxy werd opgeschoond en hoefde nu alleen nog maar `/api` door te sturen.
    4.  **Bugfix:** Een naamconflict (`apiRoutes` variabele) in `server.js` dat door de refactor was ontstaan, werd opgelost.

---

### Fase 2: De Hardnekkige Login-Loop - Een Diepe Duik in Cookies

*   **Probleem:** Ondanks de correcte API-paden, belandde de gebruiker na een succesvolle Google-login steeds weer op het inlogscherm. Dit duidde op een falende sessie-overdracht.
*   **Analyse & Iteraties:**
    1.  **Workaround 1 (Mislukt):** Een poging werd gedaan om de redirect-loop te doorbreken met een "popup-gebaseerde" login-flow. Dit was een foute aanname en maskeerde het echte probleem.
    2.  **Workaround 2 (Mislukt):** De `credentials: 'include'` optie werd toegevoegd aan `fetch`-calls. Hoewel correct, was dit niet de enige oorzaak.
    3.  **Diepgaande Analyse (Doorbraak):** De kern van het probleem werd geïdentificeerd in de `express-session` configuratie in `server.js`. De `sameSite: 'lax'` cookie policy, een standaard beveiligingsmaatregel, blokkeerde de cross-origin cookie-overdracht tussen `localhost:3000` en `localhost:5173`.
*   **Oplossing:** Een omgevingsspecifieke cookie-policy werd geïmplementeerd:
    *   **Lokaal (Development):** De policy werd versoepeld naar `sameSite: 'lax'` en `secure: false` om de cookie-overdracht via HTTP mogelijk te maken.
    *   **Productie:** De policy werd ingesteld op `sameSite: 'none'` en `secure: true`, wat vereist is voor cross-origin requests over HTTPS. De `trust proxy` instelling werd behouden om dit correct te laten werken achter de Railway-proxy.

---

### Fase 3: De Mappenstructuur Refactor (Tussentijdse Opdracht)

*   **Opdracht:** De volledige backend-code werd door de gebruiker verplaatst naar een nieuwe `/backend` sub-directory.
*   **Probleem:** Alle relatieve import-paden in de backend-bestanden waren hierdoor incorrect geworden.
*   **Oplossing:** Een project-brede zoek-en-vervang-operatie werd uitgevoerd om alle `import`-statements (`../`, `./`) systematisch te corrigeren, waardoor de applicatie weer functioneel werd binnen de nieuwe structuur.

---

### Fase 4: De Productie-Timeout - Het Laatste Obstakel

*   **Probleem:** Na het oplossen van de lokale loop, resulteerde een login-poging in de productie-omgeving in een `400 Bad Request` of een 5 minuten durende timeout.
*   **Analyse:**
    1.  De `400 Bad Request` werd veroorzaakt doordat de `GOOGLE_REDIRECT_URI` in de Google Cloud Console niet overeenkwam met het nieuwe, gestandaardiseerde `/api/auth/google/callback` pad in de code.
    2.  De timeout werd veroorzaakt door een falende database-connectie die pas optrad tijdens een live request. De `ssl: { rejectUnauthorized: false }` instelling in `knexfile.cjs` bleek onvoldoende robuust voor de productie-omgeving.
*   **Oplossing:**
    1.  De gebruiker werd geïnstrueerd om de `redirect_uri` in de Google Cloud Console te corrigeren.
    2.  De SSL-configuratie in `knexfile.cjs` werd aangepast naar `ssl: { require: true }` voor een veiligere en stabielere verbinding.

---

**Huidige Status:** De applicatie is architecturaal gezond, maar de login-loop in productie persisteert. De volgende stap is het analyseren van de live-logs van de productie-omgeving om de laatste fout te identificeren.
