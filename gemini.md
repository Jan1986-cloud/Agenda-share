### **Gecorrigeerd Begrip van de Gewenste Logica**

Het doel is een "rimpel-effect" te creëren voor risico's, uitgaande van de bestaande, vaststaande afspraken in de agenda. De onzekerheid van een mislukte reistijdberekening "rimpelt" als het ware door de lege tijdsloten heen.

**Fase 1: Identificatie van de "Ankerpunten"**

*   De enige 100% zekere punten in de planning zijn de **bestaande, reeds ingeplande afspraken**. Dit zijn onze "ankerpunten".
*   De instellingen van de gebruiker bepalen of het **begin van de werkdag** en het **einde van de werkdag** ook als ankerpunten fungeren.
    *   Als de gebruiker aangeeft "ik begin om 9 uur op een vaste locatie", dan is 09:00 een ankerpunt.
    *   Als de gebruiker aangeeft "ik begin om 9 uur op de locatie van de eerste afspraak", dan is 09:00 *geen* ankerpunt; de reistijd moet dan berekend worden. Hetzelfde geldt voor het einde van de dag.

**Fase 2: De Ideale Situatie (API-call slaagt)**

*   Voor elk leeg tijdslot wordt de reistijd berekend.
    *   **Van** het voorgaande ankerpunt (vorige afspraak of start van de dag).
    *   **Naar** het volgende ankerpunt (volgende afspraak of einde van de dag).
*   De code controleert of de som van `reistijd_heen + duur_afspraak + reistijd_terug` past in het gat tussen de twee ankerpunten.
*   Als alles past, worden alle beschikbare slots in dat gat **GROEN**.

**Fase 3: De Realiteit (API-call mislukt)**

Dit is de kern van de logica. Als de reistijdberekening voor een gat tussen twee ankerpunten mislukt, wordt het risico gevisualiseerd met een kleurverloop (de "rimpel").

*   **De bron van de onzekerheid:** De tijdsloten die direct grenzen aan de ankerpunten zijn het meest risicovol. Waarom? Omdat de reistijd van/naar dat ankerpunt onbekend is.
    *   Het **eerste** beschikbare slot direct *na* een bestaande afspraak krijgt de hoogste risicoclassificatie.
    *   Het **laatste** beschikbare slot direct *vóór* een bestaande afspraak krijgt ook de hoogste risicoclassificatie.
*   **De "Rimpel" van Kleuren:**
    *   **ROOD:** De tijdsloten die direct grenzen aan de ankerpunten (de bron van de onzekerheid). Deze zijn alleen veilig als er geen reistijd nodig is.
    *   **ORANJE:** De tijdsloten die direct naast de rode slots liggen. Het risico is hier iets lager, omdat er al één "stap" (bijv. 15 min) extra marge is.
    *   **GEEL:** De tijdsloten die naast de oranje slots liggen. Deze hebben nog meer marge en zijn dus het veiligst binnen dit onzekere scenario.

**Voorbeeld van het Rimpel-effect:**

Stel, er is een afspraak van 11:00 tot 11:30. Het volgende lege slot is om 11:45. De API-call mislukt.

*   `11:45` -> Grenst aan de afspraak -> **ROOD**
*   `12:00` -> Grenst aan het rode slot -> **ORANJE**
*   `12:15` -> Grenst aan het oranje slot -> **GEEL**
*   `12:30` -> Grenst aan het gele slot -> **GEEL** (Geel is de "veiligste" kleur in dit scenario, dus de rimpel stopt hier).

---

### **Analyse van de Applicatie-Functie**

**1. Fundamenteel Probleem**

De applicatie is ontworpen om een fundamenteel en tijdrovend probleem op te lossen voor professionals die op locatie werken: het inplannen van afspraken met klanten. Het traditionele proces van heen-en-weer bellen of mailen om een geschikt tijdstip te vinden is inefficiënt, foutgevoelig en houdt geen rekening met een cruciale, variabele factor: de reistijd tussen afspraken.

**2. Doelgroep**

De primaire doelgroep is elke professional of dienstverlener die meerdere klanten op verschillende locaties bezoekt. Een perfect voorbeeld is een `pvmonteur.nl`: een monteur die van klant A naar klant B reist. De app is echter even nuttig voor adviseurs, vertegenwoordigers, of therapeuten die huisbezoeken afleggen.

**3. Kernfunctionaliteit: Een Geautomatiseerde & Intelligente Planning-Assistent**

De app functioneert als een persoonlijke planning-assistent die de complexiteit van het plannen automatiseert. Dit wordt bereikt via de volgende kernfuncties:

*   **A. Creatie van Deelbare Planningslinks:**
    *   De professional (de "linkdeler") creëert een unieke, gepersonaliseerde weblink. Deze link is de toegangspoort voor klanten om een afspraak te boeken.

*   **B. Configuratie van Beschikbaarheidsregels:**
    *   Aan elke link zijn regels gekoppeld die de beschikbaarheid van de professional definiëren:
        *   **Agenda-integratie:** De app koppelt met de Google Agenda van de professional en behandelt bestaande afspraken als "bezet".
        *   **Tijdsblokken:** De professional stelt zijn algemene werkdagen en -uren in (bijv. ma-vr, 09:00-17:00).
        *   **Afspraakparameters:** De duur van een standaardafspraak en de gewenste buffertijd tussen afspraken worden vastgelegd.
        *   **Reistijd-instellingen:** De professional configureert zijn vaste vertrekadres en hoe de reistijd aan het begin en einde van de dag moet worden behandeld.

*   **C. Dynamische & Contextuele Slotberekening:**
    *   Wanneer een klant (de "linkgebruiker") de link opent en zijn adres invoert, voert de app zijn kerntaak uit: het berekent *real-time* de beschikbare tijdslots.
    *   Dit is geen statische lijst, maar een dynamisch resultaat gebaseerd op:
        1.  De vaste regels van de link (werkuren, duur).
        2.  De *actuele* bezette tijden uit de Google Agenda.
        3.  De *berekende reistijd* van de laatst bekende locatie van de professional naar het adres van de klant.

*   **D. Risico-visualisatie (De Kleurenlogica):**
    *   De app erkent dat reistijdberekeningen kunnen mislukken. In plaats van te falen, communiceert het systeem het risico visueel aan de klant via het groen/geel/oranje/rood-systeem. Dit stelt de klant in staat een geïnformeerde keuze te maken, zelfs bij onvolledige data.

*   **E. Geautomatiseerde Boeking:**
    *   Zodra de klant een tijdslot kiest en zijn gegevens invult, maakt de app automatisch een afspraak aan in de Google Agenda van de professional en stuurt een uitnodiging naar de klant.

**4. Eindresultaat & Waarde**

De applicatie transformeert een handmatig, complex proces in een geautomatiseerde, intelligente handeling. De waarde voor de gebruiker is:
*   **Efficiëntie:** Drastische vermindering van de tijd besteed aan het plannen van afspraken.
*   **Optimalisatie:** Voorkomt dubbele boekingen en onrealistische planningen door reistijd mee te nemen.
*   **Professionaliteit:** Biedt klanten een soepele, moderne en duidelijke manier om een afspraak te maken.
*   **Risicobeheer:** Maakt de onvermijdelijke onzekerheid van reistijden beheersbaar en transparant.

---
### Sessie Overzicht & Applicatie Evolutie

#### Chronologisch Overzicht van Wijzigingen

Dit overzicht is gebaseerd op de belangrijkste functionele blokken die we tijdens onze sessie hebben geïmplementeerd en gecorrigeerd.

| Datum/Tijd (Sessie) | Bestand(en) | Wijzigingen | Omschrijving |
| :--- | :--- | :--- | :--- |
| Start | `utils/availability-logic.js`, `db.js` | 2x `replace` | Interval verhoogd naar 30 min; nieuwe DB-kolommen `request_count` & `window_start_time` toegevoegd. |
| Sessie | `server.js` | 1x `replace` | Implementatie van een "rate limiting" mechanisme op de `/get-availability` route. |
| Sessie | `utils/availability-logic.js`, `server.js`, `public/schedule.html` | 3x `replace`/`write` | Toevoegen van het diagnostische paneel om API-calls te visualiseren. |
| Sessie | `utils/availability-logic.js` | 1x `write_file` | **Grote Refactor:** Vervangen van de "brute-force" engine door de "Gap-Based" engine voor performance. |
| Sessie | `utils/availability-logic.js` | 1x `write_file` | **Optimalisatie:** De "Gap-Based" engine verder verbeterd om reistijd slechts één keer per gat te berekenen. |
| Sessie | `db.js`, `server.js`, `utils/availability-logic.js`, `public/dashboard.html` | 5x `replace` | Implementatie van de flexibele planningshorizon (offset & window dagen). |
| Sessie | `utils/availability-logic.js`, `server.js`, `public/schedule.html` | 3x `write`/`replace` | **Grote Architectuurwijziging:** Implementatie van het "On-Demand" laadmodel. |
| Sessie | `server.js` | 1x `replace` | Bugfix: `getCoordinatesForAddress` robuuster gemaakt tegen `undefined` locaties. |
| Sessie | `server.js` | 1x `replace` | Bugfix: `schedule.html` route gecorrigeerd om 404-fout te voorkomen. |
| Sessie | `db.js` | 1x `write_file` | Bugfix: `SyntaxError` in `db.js` opgelost door migratielogica te verplaatsen. |
| Sessie | `server.js` | 2x `replace` | Bugfix: `getTravelTimeWithCoords` robuuster gemaakt in beide routes. |
| Sessie | `server.js` | 1x `replace` | Bugfix: `timeMin` correct ingesteld voor Google Calendar API call om reeds gestarte afspraken te vinden. |
| Einde | `server.js` | 1x `replace` | Bugfix: `auth` client correct doorgegeven aan `getBusySlots` in de "on-demand" route. |

---

### De Evolutie van de Applicatie

#### 1. Het Originele Plan: De Intelligente Agenda

We zijn gestart met een helder en krachtig doel: een applicatie bouwen die het plannen van afspraken automatiseert. De kernfunctionaliteit was het genereren van een deelbare link. Wanneer een klant deze link opent en zijn adres invoert, zou de applicatie:
1.  De agenda van de professional raadplegen.
2.  De reistijd naar de klant berekenen.
3.  Alleen de tijdsloten tonen die groot genoeg zijn voor de afspraak, inclusief de benodigde reistijd ervoor en erna.

#### 2. De Realiteit en de Routecorrecties

Tijdens de ontwikkeling stuitten we op een aantal fundamentele uitdagingen die ons dwongen de architectuur te herzien en te verbeteren:

*   **Het Performance & Kostenprobleem:** De eerste versie van de reken-engine was "brute-force" en controleerde elke 30 minuten van de dag. Dit resulteerde in een enorm aantal API-calls, wat de applicatie traag en duur maakte.
    *   **Onze Oplossing:** We hebben de motor volledig herbouwd naar een **"Gap-Based" engine**. Deze identificeert eerst de lege "gaten" in de agenda en voert alleen voor die gaten de berekeningen uit. Dit reduceerde het aantal API-calls drastisch.

*   **Het "Blinde Vlek" Probleem:** We ontdekten dat afspraken die al waren begonnen, niet werden meegenomen in de berekening, waardoor er onterecht beschikbaarheid werd getoond.
    *   **Onze Oplossing:** We hebben de manier waarop we Google om data vragen aangepast, door altijd vanaf het begin van de dag te kijken in plaats van vanaf "nu".

*   **Het Robuustheidsprobleem:** De applicatie crashte als er een afspraak in de agenda stond zonder locatie, of als een externe API (zoals de geocoder) een fout gaf.
    *   **Onze Oplossing:** We hebben de code "kogelvrij" gemaakt door overal robuuste foutafhandeling en data-validatie toe te voegen. De applicatie crasht niet meer op ongeldige data, maar handelt de fout correct af.

#### 3. De Huidige Architectuur: Een Robuust "On-Demand" Systeem

De problemen die we onderweg tegenkwamen, hebben geleid tot een veel geavanceerder en slimmer eindproduct dan het originele plan. De huidige architectuur is een **"on-demand" tweetrapsraket**:

1.  **Snelle Eerste Weergave:** Wanneer een klant de link opent, doet de server een zeer snelle, beperkte berekening. Het toont **direct alle mogelijke dagen** waarop een afspraak zou kunnen vallen, maar berekent de daadwerkelijke reistijd en tijdsloten voor **alleen de eerste paar dagen**. Dit geeft de gebruiker onmiddellijk een overzicht en een werkende interface.

2.  **Berekening op Aanvraag:** De overige dagen in de kalender zijn gemarkeerd als "nog niet berekend". Pas wanneer de gebruiker op zo'n latere dag klikt, stuurt de browser een gerichte aanvraag naar de server: "Bereken nu de tijden voor *deze specifieke dag*." De server voert de reistijdberekening uit voor alleen die dag en stuurt de resultaten terug, die vervolgens in de kalender worden getoond.

Dit eindresultaat is superieur aan het originele plan omdat het:
*   **Extreem Snel** is voor de gebruiker.
*   **Zeer Kosten-efficiënt** is door het aantal API-calls te minimaliseren.
*   **Robuust en Veerkrachtig** is en niet crasht door onverwachte data of externe fouten.