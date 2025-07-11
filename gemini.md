# Gemini Development Log

Dit document beschrijft de stappen die zijn ondernomen door de Gemini-assistent om de interactieve planningsapplicatie te ontwikkelen en te deployen.

## Project Initialisatie
1.  **Dependency Installatie**: De benodigde `npm` packages (`express`, `googleapis`, `dotenv`, `body-parser`, `uuid`, `simple-json-db`) werden geïnstalleerd.
2.  **`.gitignore` Creatie**: Een `.gitignore`-bestand werd aangemaakt om `node_modules` en het `.env`-bestand uit te sluiten van versiebeheer.
3.  **`.env` Setup**: Een `.env`-bestand werd aangemaakt voor het lokaal opslaan van de Google API-credentials.

## Frontend Ontwikkeling
1.  **Public Directory**: Een `public` map werd aangemaakt voor de statische frontend bestanden.
2.  **Homepage (`index.html`)**: De landingspagina werd gecreëerd waar gebruikers het authenticatieproces kunnen starten.
3.  **Deelpagina (`share.html`)**: Een pagina werd ontwikkeld waar gebruikers, na authenticatie, een afspraaktype kunnen definiëren (titel, duur) en een unieke, deelbare link kunnen genereren.
4.  **Planningspagina (`schedule.html`)**: De publieke pagina werd gebouwd waar ontvangers van een link de beschikbaarheid kunnen zien en een afspraak kunnen inplannen.

## Backend Ontwikkeling (`server.js`)
1.  **Express Server**: Een basis Express-server werd opgezet om de applicatie te draaien en de statische bestanden te serveren.
2.  **Google OAuth 2.0 Authenticatie**:
    - De `/auth` route werd geïmplementeerd om de gebruiker naar de Google-consentpagina te sturen.
    - De `/oauth2callback` route werd geïmplementeerd om de autorisatiecode van Google af te handelen, tokens op te halen en deze veilig op te slaan.
3.  **Link Generatie**:
    - Het `/generate-link` endpoint werd gecreëerd om de details van een afspraaktype op te slaan en een unieke link-ID te genereren.
4.  **Beschikbaarheid en Boeking**:
    - Het `/get-availability` endpoint werd ontwikkeld om, op basis van een link-ID, de Google Calendar van de gebruiker te raadplegen en vrije tijdslots te berekenen.
    - Het `/book-appointment` endpoint werd geïmplementeerd om een nieuwe afspraak aan te maken in de agenda van de gebruiker met de details die door de planner zijn ingevuld.
5.  **Dataopslag**: `simple-json-db` werd gebruikt om gebruikers-tokens en link-informatie op te slaan in een `db.json`-bestand, wat compatibel is met het bestandssysteem van Railway.

## Deployment
1.  **Railway Deployment**: De applicatie werd gedeployed naar Railway met het `railway up` commando.
2.  **Domein Configuratie**: Een publiek domein werd gegenereerd voor de applicatie.
3.  **Instructies**: Gedetailleerde instructies werden verstrekt voor het configureren van de benodigde environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`) in de Railway-omgeving.
