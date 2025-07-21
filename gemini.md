### Gecorrigeerde Begrip van de Gewenste Logica

Het doel is een "rimpel-effect" te creëren voor risico's, uitgaande van de bestaande, vaststaande afspraken in de agenda. De onzekerheid van een mislukte reistijdberekening "rimpelt" als het ware door de lege tijdsloten heen.

**Fase 1: Initiële Weergave (Risico-inschatting)**

*   De enige 100% zekere punten zijn de **bestaande afspraken**.
*   De frontend toont alle mogelijke tijdsloten. De kleur van de rand van een tijdslot (`outline`) geeft het **ingeschatte risico** aan op basis van de marge tot de volgende afspraak, zonder dat de reistijd bekend is:
    *   **BLAUW:** Zeer ruime marge (>1 uur). Laagste risico.
    *   **GEEL:** Beperkte marge (30-60 min). Gemiddeld risico.
    *   **ROOD:** Weinig marge (<30 min). Hoogste risico.
*   De kleur van de **dag-knop** reflecteert het beste beschikbare slot van die dag (blauw > geel > rood).
*   Dagen waarop de gebruiker niet werkt, worden **wel getoond** maar zijn kleiner en uitgeschakeld om verwarring te voorkomen.

**Fase 2: Actie & Verificatie**

*   Wanneer een klant op een willekeurig tijdslot klikt, wordt de `POST /verify-slot` API aangeroepen om de **exacte reistijd** te berekenen.

**Fase 3: Resultaat van Verificatie**

Dit is de kern van de logica, die zich in drie scenario's kan ontvouwen:

*   **Scenario A: Verificatie Slaagt & Slot is Mogelijk (`isViable: true`)**
    *   De dag wordt gemarkeerd als "geverifieerd".
    *   Het **geselecteerde** tijdslot wordt **volledig groen** en actief.
    *   Alle **andere** beschikbare tijdsloten op die dag krijgen een **groene rand**.
    *   Het boekingsformulier verschijnt **zonder** waarschuwing.
    *   De reistijdcalculator toont de succesvolle berekening. Deze data wordt gecached voor de sessie.

*   **Scenario B: Verificatie Slaagt & Slot is Onmogelijk (`isViable: false`)**
    *   De reistijd is succesvol berekend, maar past niet in het beschikbare gat.
    *   Het aangeklikte tijdslot wordt **uitgeschakeld** en **volledig rood** gekleurd.
    *   Het boekingsformulier verschijnt **niet**. De klant moet een ander tijdslot kiezen.

*   **Scenario C: Verificatie Mislukt (API-fout)**
    *   De externe API voor reistijd (bv. Google Maps) geeft een fout terug of het adres is onvindbaar.
    *   Het **geselecteerde** tijdslot wordt **volledig gekleurd** in zijn oorspronkelijke risicokleur (rood, geel of blauw).
    *   Het boekingsformulier verschijnt **mét een duidelijke waarschuwen** die het risico uitlegt.
    *   De klant kan de afspraak alsnog boeken en accepteert daarmee bewust het risico.

---
---

### Sessie Overzicht & Applicatie Evolutie (Juli 2025)

#### Analyse van Vorige Notities
De vorige notities (hierboven bewaard) beschrijven accuraat de **kerngedachte** achter de "rimpel-logica" en de analyse van de applicatie als een intelligente planning-assistent. Ze dienden als een uitstekend functioneel startpunt.

Deze notities zijn echter niet meer volledig representatief voor de huidige staat van de applicatie. De reden hiervoor is dat ze een **functioneel concept** beschrijven, terwijl de applicatie in deze sessie is geëvolueerd naar een **visueel en commercieel product**. De abstracte logica is nu verfijnd en geïmplementeerd in een volledig nieuwe, coherente gebruikersinterface. De focus is verschoven van *wat* de app doet naar *hoe* de app dit presenteert aan de gebruiker en diens klanten.

#### Chronologisch Overzicht van Wijzigingen (Huidige Sessie)

| Fase | Bestand(en) | Wijziging | Omschrijving |
| :--- | :--- | :--- | :--- |
| 1. Homepage | `index.html`, `locales/*.json` | `write_file`, `replace` | Volledige visuele en tekstuele redesign van de landingspagina met Bootstrap 5 en commerciële marketingteksten. |
| 2. Dashboard | `dashboard.html`, `locales/*.json` | `write_file`, `replace` | Redesign van het dashboard naar een modernere, kaart-gebaseerde layout met duidelijkere KPI's en link-management. |
| 3. Planning Pagina | `schedule.html`, `locales/*.json` | `write_file`, `replace` | Redesign van de klantgerichte planningspagina naar een stapsgewijze "wizard" en toevoeging van marketing op de bevestigingspagina. |
| 4. Bugfix | `server.js` | `replace` | Kritieke bug opgelost door het ontbrekende `/api/link-details` endpoint aan te maken, waardoor planningslinks weer werken. |
| 5. Bugfix & Copy | `schedule.html`, `locales/*.json` | `replace` | Foutief getoonde link-omschrijving verwijderd en de instructietekst voor het adres commercieel aangescherpt. |
| 6. Kernlogica Herstel | `schedule.html`, `locales/*.json` | `write_file`, `replace` | De over-gesimplificeerde kleurenlogica hersteld naar de originele, intelligente "rimpel-logica" met risico-inschatting. |
| 7. Verfijning | `schedule.html`, `gemini.md` | `write_file`, `replace` | De UI-logica verder verfijnd (caching van reistijd, correcte kleurweergave, intelligente dag-knoppen) en documentatie bijgewerkt. |
| 8. Overige Pagina's | `link-editor.html`, `appointments.html` | `write_file` | De resterende pagina's gerestyled voor een volledig consistente en professionele gebruikerservaring. |

#### De Evolutie van de Applicatie: Van Tool naar Product

1.  **Het Originele Plan: Een Functionele Tool**
    We zijn gestart met een applicatie die functioneel krachtig was, maar visueel en commercieel nog niet volwassen. De gebruikersinterface was een standaard Bootstrap-implementatie zonder een duidelijke merkidentiteit of marketingboodschap.

2.  **De Realiteit en de Routecorrecties: Van MVP naar Robuust Systeem**
    Tijdens de sessie hebben we de applicatie systematisch getransformeerd:
    *   **Visuele Transformatie:** Alle pagina's zijn opnieuw ontworpen met een consistente, moderne en professionele uitstraling. De focus lag op duidelijkheid, witruimte en een intuïtieve gebruikerservaring.
    *   **Commerciële Insteek:** De teksten zijn herschreven van puur functioneel naar commercieel en waardegedreven. De app presenteert zich nu als een oplossing voor een probleem ("stop met plannen, start met werken") in plaats van alleen een tool.
    *   **Bugfixing:** We hebben kritieke bugs geïdentificeerd en opgelost die de kernfunctionaliteit (het maken van een afspraak) belemmerden.
    *   **Herstel van Kernlogica:** De belangrijkste stap was het herstellen en verfijnen van de unieke "rimpel-logica". Een eerdere versimpeling had de intelligentie van de app verminderd. Dit is nu volledig hersteld en verbeterd, waardoor de app zijn unieke waarde weer kan tonen.

3.  **Het Huidige Resultaat: Een Product Klaar voor de Markt**
    De applicatie is nu meer dan een verzameling functies. Het is een coherent product met een duidelijke visuele identiteit, een overtuigende boodschap en een verfijnde, intelligente gebruikerservaring. De basis is gelegd voor toekomstige uitbreidingen, zoals een admin-dashboard voor upselling.

---

### Sessie Log: Backend Professionalisering (21 Juli 2025)

In deze sessie is een reeks fundamentele verbeteringen aan de backend van de applicatie doorgevoerd, gericht op stabiliteit, veiligheid en onderhoudbaarheid.

| Stap | Actie | Technologie/Tool | Omschrijving |
| :--- | :--- | :--- | :--- |
| 1. **DB Migraties** | Formeel migratiesysteem opgezet. | `knex.js` | De ad-hoc tabelcreatie in `db.js` is vervangen door een robuust migratiesysteem. Alle database-queries in de applicatie zijn omgezet naar de Knex query builder, wat SQL-injection voorkomt en de code beter leesbaar maakt. |
| 2. **Input Validatie** | Inkomende API-data gevalideerd. | `express-validator` | Alle API-routes die data ontvangen (`POST`, `PUT`) zijn voorzien van strikte validatie- en sanitatieregels. Dit beschermt de applicatie tegen ongeldige data en XSS-aanvallen. |
| 3. **Logging** | Gestructureerde logging geïmplementeerd. | `winston` | Alle `console.log` en `console.error` aanroepen in de backend zijn vervangen door een gestructureerde JSON-logger. Dit maakt debugging en monitoring in productie aanzienlijk eenvoudiger. |
| 4. **Frontend Refactor** | Basis gelegd voor frontend-migratie. | `react`, `vite` | Een nieuwe `frontend` map is opgezet met React en Vite. De `dashboard.html` pagina is als eerste volledig omgezet naar een modern React-component, inclusief client-side routing en een proxy voor de API. |
| 5. **Foutafhandeling** | Centrale API-foutafhandeling. | `express` middleware | Een centrale "vangnet" middleware is toegevoegd aan `server.js`. Alle onverwachte fouten in de API worden nu op een consistente en veilige manier afgehandeld, wat de frontend-code vereenvoudigt. |

---

### Kernprincipes voor Verdere Ontwikkeling

1.  **Single Source of Truth:**
    *   **API Routes:** Alle API-paden moeten worden gedefinieerd in `shared/apiRoutes.js`. Zowel de frontend als de backend moeten deze definities importeren. Dit voorkomt mismatches en typefouten. **NOOIT** API-URL's hardcoderen.
    *   **Teksten (i18n):** Alle gebruiker-zichtbare teksten moeten in de `locales/*.json` bestanden staan en worden geladen via de i18n-module. **NOOIT** teksten hardcoderen in de HTML of JavaScript.
2.  **SPA Routing:**
    *   **Interne Navigatie:** Binnen de React-applicatie moet alle navigatie tussen "pagina's" (componenten) gebeuren met de `<Link>` component van `react-router-dom`.
    *   **Externe Links:** Standaard `<a href="...">` tags mogen alleen worden gebruikt voor links naar externe websites of voor de "Log uit" functionaliteit.

---

### Overzicht: Van Traditionele Applicatie naar Moderne API & SPA

Het doel van deze refactoring was om de applicatie te transformeren van een verzameling losse bestanden met gemengde logica naar een professionele, veilige en schaalbare architectuur. Dit is gedaan door de backend om te vormen tot een pure, data-gerichte API en de frontend te herbouwen als een moderne Single-Page Application (SPA).

---

### Fase 1: Fundament & Database Professionalisering

De eerste en meest kritieke stap was het vervangen van de ad-hoc database-interacties door een robuust en voorspelbaar systeem.

| Actie | Technologie | Bestanden Gewijzigd / Aangemaakt | Omschrijving |
| :--- | :--- | :--- | :--- |
| **Installatie** | `knex`, `pg` | `package.json` | De benodigde libraries voor database-migraties en query building zijn geïnstalleerd. |
| **Configuratie** | `knex` | `knexfile.cjs` (aangemaakt) | Een centraal configuratiebestand voor de databaseverbindingen (development, production) is opgezet. |
| **Migratiebestand** | `knex` | `migrations/..._initial_schema_setup.cjs` (aangemaakt) | De volledige databasestructuur (alle tabellen, kolommen, relaties) is vastgelegd in een versie-gecontroleerd migratiebestand. |
| **DB Connectie Refactor** | `knex` | `db.js` | De oude `pg` pool is vervangen door een centrale Knex-instantie, die nu de standaard is voor alle database-interacties. |
| **Server Opstartlogica** | `knex` | `server.js` | De oude `createTables()` functie is verwijderd. De server voert nu bij het opstarten automatisch de `knex migrate:latest` uit om de database-structuur te garanderen. |
| **Query Refactoring** | `knex` | Alle bestanden in `routes/`, `services/`, `config/` | **Dit was de grootste wijziging.** Alle handgeschreven SQL-queries (`pool.query(...)`) in de gehele applicatie zijn systematisch vervangen door de veilige en leesbare Knex query builder. |

---

### Fase 2: Beveiliging & Input Validatie

Om de applicatie te beschermen tegen ongeldige data en aanvallen, is een validatielaag toegevoegd.

| Actie | Technologie | Bestanden Gewijzigd | Omschrijving |
| :--- | :--- | :--- | :--- |
| **Installatie** | `express-validator` | `package.json` | De library voor het valideren van inkomende API-verzoeken is geïnstalleerd. |
| **Implementatie** | `express-validator` | `routes/links.js`, `routes/appointments.js`, `routes/api.js` | Alle API-routes die data accepteren zijn voorzien van strikte validatieregels (bv. controleren op UUID's, e-mailadressen, verplichte velden). Een centrale `handleValidationErrors` middleware zorgt voor consistente foutmeldingen. |

---

### Fase 3: Stabiliteit & Gestructureerde Logging

Om debugging en monitoring in productie mogelijk te maken, is de `console.log` vervangen door een professioneel logging-systeem.

| Actie | Technologie | Bestanden Gewijzigd / Aangemaakt | Omschrijving |
| :--- | :--- | :--- | :--- |
| **Installatie** | `winston` | `package.json` | De library voor gestructureerde logging is geïnstalleerd. |
| **Configuratie** | `winston` | `utils/logger.js` (aangemaakt) | Een centrale logger is geconfigureerd om alle output als gestructureerde JSON naar de console te schrijven. |
| **Implementatie** | `winston` | Alle backend-bestanden (`server.js`, `db.js`, `routes/*`, `services/*`, `utils/*`) | Alle `console.log`, `console.error` en `console.warn` aanroepen zijn vervangen door de nieuwe logger, inclusief extra context (bv. `userId`, `linkId`) voor betere traceerbaarheid. |

---

### Fase 4: Frontend Modernisering (React & Vite)

De vanille JavaScript frontend is gemigreerd naar een moderne Single-Page Application architectuur.

| Actie | Technologie | Bestanden Gewijzigd / Aangemaakt | Omschrijving |
| :--- | :--- | :--- | :--- |
| **Project Setup** | `react`, `vite` | `frontend/` (map aangemaakt), `frontend/package.json`, `frontend/vite.config.js` | Een volledig nieuw, opzichzelfstaand frontend-project is opgezet in de `frontend` map. |
| **Basisstructuur** | `react` | `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx` | De basis-entrypoints en het hoofdcomponent voor de React-applicatie zijn aangemaakt. |
| **Dashboard Refactor** | `react` | `frontend/src/Dashboard.jsx` (aangemaakt) | De volledige inhoud en logica van de oude `public/dashboard.html` is omgezet naar een modern, data-gedreven React-component. |
| **Verwijdering Oude Code** | - | `public/` (map verwijderd) | De oude `public` map met alle losse HTML-, CSS- en JS-bestanden is volledig verwijderd. |
| **Server Integratie** | `express` | `server.js` | De Express-server is aangepast om in productie de gebouwde bestanden van de React-app te serveren en alle pagina-verzoeken af te vangen. |

---

### Fase 5 & 6: Foutafhandeling & Deploy-Fixes

De laatste fase bestond uit het robuuster maken van de foutafhandeling en het oplossen van een reeks configuratieproblemen die tijdens de deployment naar Railway aan het licht kwamen.

| Actie | Technologie | Bestanden Gewijzigd | Omschrijving |
| :--- | :--- | :--- | :--- |
| **Centrale Foutafhandeling** | `express` | `server.js`, `routes/*` | Een centrale "vangnet" middleware is toegevoegd. Alle `catch`-blokken in de routes geven fouten nu door aan deze handler (`next(error)`), wat de code vereenvoudigt. |
| **Deployment Fixes** | `npm`, `knex`, `react-router` | `package.json`, `frontend/package.json`, `migrations/*`, `frontend/src/App.jsx`, `frontend/src/Dashboard.jsx`, `server.js` | Een reeks iteratieve fixes is doorgevoerd om de app succesvol te deployen, waaronder: het specificeren van de correcte Node.js versie, het oplossen van module-conflicten (ESM/CJS), het idempotent maken van de database-migraties, het corrigeren van de client-side routing en het repareren van hardgecodeerde API-URL's. |
| **Client-side Navigatie** | `react-router-dom` | `frontend/src/App.jsx`, `frontend/src/Dashboard.jsx`, `frontend/src/Navbar.jsx` (aangemaakt) | De hardgecodeerde `<a>`-tags zijn vervangen door de `<Link>`-component van React Router en er is een herbruikbare `Navbar` gemaakt om correcte, snelle navigatie binnen de SPA mogelijk te maken. |
