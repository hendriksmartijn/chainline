# Chainline

## Wat dit is
**Chainline** is een PWA die fietsers meldingen geeft over onderhoud van hun fiets, gevoed door Strava. Start met kettingwax, groeit naar slijtage van ketting, cassette, banden en sealant. Gebruikers: ikzelf en een handvol vrienden (max 10, binnen Strava's athlete-limiet zonder review).

Bestaande apps (ProBikeGarage, Chain Wax App, intervals.icu) doen "component + km-interval + melding". Wij onderscheiden ons op:
1. **Wax-km**: kilometers gewogen naar omstandigheden (nat, droog, indoor).
2. **Meten i.p.v. gokken**: kettingmeter-metingen bepalen de slijtagesnelheid en voorspellen het einde van de levensduur.
3. **Afhankelijkheden**: kettingvervanging beschermt de cassette; de cassette telt mee in aantal kettingen.
4. **Alles datum-gebaseerd en met terugwerkende kracht te corrigeren.**

## Naam & terminologie
- App-naam: **Chainline**. Gebruik deze naam consequent in code, manifest (`name`/`short_name`), titels en push-meldingen.
- **wax-km** is onze eigen eenheid en de signature-feature. Schrijf het altijd zo (kleine letters, met koppelteken) in UI en copy.
- Gebruik "Strava" niet in de appnaam of het icoon. Volg Strava's brand guidelines (o.a. "Connect with Strava"-knop, "Powered by Strava").

## Domein & URL's
- Productie: `https://chainline.cc` (gehost op Vercel; DNS bij Vercel).
- Strava "Authorization Callback Domain": `chainline.cc`.
- OAuth redirect: `https://chainline.cc/api/auth/strava/callback`
- Webhook callback: `https://chainline.cc/api/strava/webhook`
- Lokaal ontwikkelen: OAuth via `localhost`. Webhooks testen via een tunnel (bijv. `ngrok` of `cloudflared`) of tegen een Vercel preview-deployment. Alle URL's in env/config, nooit hardcoded.

## Harde randvoorwaarden
- **Strava API-terms**: geen Strava-data naar een LLM/AI (ook niet afgeleid). Alle logica is deterministisch.
- **Deauthorization-webhook is verplicht.** Bij deauth: tokens en data van die atleet verwijderen.
- **Strava base-URL in config** (er komt een nieuwe base-URL per jan 2027: `https://api-v3.strava.com`).
- **Webhooks i.p.v. polling.** Respecteer de rate limits (lees de `X-RateLimit-*` headers, backoff bij 429).
- **Tokens versleuteld opslaan**, refresh tokens netjes afhandelen.
- Volgorde van prioriteit: veiligheid → productiviteit → UX.

## Stack (gekozen)
- **Next.js (App Router, TypeScript)** op **Vercel**. API-routes (Route Handlers) voor OAuth, de Strava-webhook en de app-API.
- **Postgres via Neon** (Vercel Marketplace). ORM: Drizzle (lichtgewicht, goede TS-types, migraties in de repo).
- **Vercel Cron** voor de wekelijkse garage-check (Hobby-plan: houd cron simpel en laag-frequent).
- **Web Push** met VAPID via de Node-library `web-push` (Node runtime, niet edge, voor push- en webhook-routes).
- **PWA**: manifest + service worker (push-handler, notification actions, offline statusscherm). Geen zware PWA-framework-plugin nodig.
- **Weer**: Open-Meteo historical/archive API (gratis, geen key) op basis van starttijd en startlocatie van de rit.
- **Webhook-verwerking**: de Strava-webhook moet binnen 2 s een 200 teruggeven. Ack direct en verwerk daarna asynchroon (bijv. `after()` uit Next.js, of een simpele jobs-tabel die door een route/cron wordt verwerkt).
- Secrets (Strava client secret, VAPID private key, encryptiesleutel voor tokens, DB-URL) alleen in Vercel env vars.

## Domeinmodel: event-sourced
Sla **nooit** een "huidige km-stand" op als bron van waarheid. De huidige staat is altijd afgeleid van:

- **Bike**: gekoppeld aan Strava `gear_id`.
- **Component**: type (`chain`, `cassette`, `tyre_front`, `tyre_rear`, `wheelset`, `chainring`, ...), zelfstandig bestaand, kan van fiets wisselen.
- **Event**: `mounted`, `unmounted`, `waxed`, `measured` (waarde in %), `sealant_refilled`, `replaced`. Elk event heeft een `occurred_at`, die ook in het verleden mag liggen.
- **Activity cache**: minimale velden per rit (id, gear_id, start_date, distance, moving_time, type/sport_type, trainer-flag, start_latlng, weer-classificatie).
- **Rule**: per component een drempel + type (`km`, `wax_km`, `days`, `hours`, `measurement`) + een vroege-waarschuwingsmarge (standaard 100 km of equivalent).

Een rit-update of gear-wissel in Strava (update-webhook) → herbereken. Wijzigt de wax-km-formule → herbereken de hele historie. Er zijn geen migraties van standen nodig.

## Wax-km (v1, simpel en configureerbaar)
- Droog buiten: ×1.0
- Nat (neerslag tijdens de rit boven een drempel): ×3.0, en een melding "na natte rit: check je ketting"
- Indoor (`VirtualRide` of trainer-flag): ×0.3, **ongeacht gekoppelde gear**
- Factoren staan in config, niet hardcoded.

## Onboarding
1. Strava koppelen → fietsen verschijnen automatisch.
2. Per fiets een template kiezen ("Racefiets gewaxt", "Gravel tubeless", ...). Het template maakt de componenten en regels aan.
3. Per component alleen de **montagedatum** invullen (standaard). Alternatieven: "km bekend" of "geen idee" (start op 0, gelabeld als onbekende historie).
4. Backfill: haal de ritten op sinds de oudste montagedatum (activity list, 200 per pagina).

Doel: binnen 2 minuten van installatie naar de eerste zinvolle status.

## Notificaties
- **Directe push** alleen bij "actie nodig": wax-drempel, vroege wax-waarschuwing, ketting over de slijtagedrempel ("nu vervangen, anders gaat je cassette mee").
- **Al het andere** gaat in één wekelijkse garage-check (Cron).
- Notificatie-actie "Gewaxt ✓" maakt direct een `waxed`-event aan (Android). Op iOS is een fallback nodig: deep link naar een één-tap-scherm.
- iOS: push werkt alleen als de PWA aan het beginscherm is toegevoegd. Bouw daar een duidelijke install-flow voor.

## Fasering
**Fase 1 (MVP, alleen ikzelf):** Strava OAuth + webhook (create, update, deauth), fietsen ophalen, één component (ketting) met wax-km-regel, `waxed`-event, push-melding, simpel statusscherm per fiets.
**Fase 2:** templates, meerdere componenten, montagedatum-backfill, wekelijkse garage-check, regeltypes `days` en `hours`.
**Fase 3:** kettingmetingen → slijtagesnelheid per wax-km → voorspelling van het einde van de levensduur; cassette telt kettingen; vrienden onboarden (athlete capacity naar 10).
**Later:** wisselen van wielsets en kettingen tussen fietsen (standaardconfiguratie plus uitzonderingen, eventueel een "wat zat erop?"-prompt na de rit).

## Werkwijze
- Begin met een plan en stel eerst vragen over onduidelijkheden. Bouw daarna fase 1 end-to-end voordat je verbreedt.
- Schrijf tests voor de afleidingslogica (events + ritten → staat). Dat is de kern van de app.
- UI: Nederlands, mobile-first, minimaal. De status moet in één oogopslag te lezen zijn (bijvoorbeeld "Ketting: 212 / 300 wax-km").
