# Instructies voor Verdere Ontwikkeling

Dit document bevat aanbevelingen en instructies voor de verdere ontwikkeling van de planningsapplicatie.

## 1. Verbeteren van Beschikbaarheidslogica

De huidige logica voor het bepalen van beschikbaarheid is functioneel, maar kan op een aantal punten worden uitgebreid:

- **Werktijden per gebruiker**: Sta gebruikers toe om hun eigen werkdagen en -tijden in te stellen in plaats van de vaste 9-tot-5-logica. Dit kan worden opgeslagen in `db.json` bij de gebruikersgegevens.
- **Pauzes**: Geef gebruikers de mogelijkheid om vaste pauzes (bv. lunch) in te stellen die uit de beschikbare slots worden gefilterd.
- **Buffertijd**: Voeg een optie toe om automatisch een buffer (bv. 15 minuten) voor en/of na elke afspraak in te plannen.
- **Meerdere Agenda's**: Geef gebruikers de optie om meerdere agenda's te selecteren waarop de beschikbaarheid moet worden gecontroleerd.

## 2. Authenticatie en Beveiliging

- **Refresh Tokens**: De huidige implementatie slaat de tokens op, maar de logica voor het proactief verversen van een `access_token` met een `refresh_token` kan explicieter worden gemaakt. Google's `googleapis` library handelt dit vaak automatisch af, maar het is goed om dit te verifiëren en eventueel te loggen.
- **Gebruikerssessies**: In plaats van de `userId` in de URL mee te geven, kan een veiliger sessiebeheer met cookies worden geïmplementeerd (bv. met `express-session`).
- **Database**: Voor een grotere schaal is het aan te raden om over te stappen van `simple-json-db` naar een robuustere database zoals PostgreSQL of MongoDB, die beide als service beschikbaar zijn op Railway.

## 3. Frontend Verbeteringen

- **UI/UX**: De huidige interface is minimalistisch. Het gebruik van een CSS-framework zoals Bootstrap of Tailwind CSS kan de gebruikerservaring aanzienlijk verbeteren.
- **Kalender-interface**: Vervang de lijst met tijdslots door een visuele week- of dagkalender (bv. met een bibliotheek als `FullCalendar`) waarin de gebruiker direct kan klikken.
- **Feedback**: Geef duidelijkere feedback aan de gebruiker, bijvoorbeeld met toasts of modals in plaats van `alert()`.

## 4. Lokaal Testen

Om de applicatie lokaal te testen, volg je deze stappen:

1.  **Installeer dependencies**:
    ```bash
    npm install
    ```
2.  **Maak een `.env`-bestand aan**: Kopieer de inhoud van `.env.example` (indien aanwezig) of maak een nieuw `.env`-bestand aan met de volgende inhoud:

    ```
    GOOGLE_CLIENT_ID=jouw_lokale_client_id
    GOOGLE_CLIENT_SECRET=jouw_lokale_client_secret
    GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
    ```

    _Let op: Voor lokaal testen moet je een aparte OAuth Client ID aanmaken in de Google Cloud Console met `http://localhost:3000/oauth2callback` als redirect URI._

3.  **Start de server**:
    ```bash
    npm start
    ```
4.  Open je browser en navigeer naar `http://localhost:3000`.
