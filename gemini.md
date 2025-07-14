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
