# Chainline — plan fase 1 (MVP, alleen jij)

Doel: Strava koppelen → laatste wax-datum invullen → binnen 2 minuten "Ketting: 212 / 400 wax-km" per fiets, plus push bij actie nodig.

## Gekozen uitgangspunten (uit je antwoorden)
- Wax-drempel ketting: **400 wax-km**, vroege waarschuwing bij **300** (drempel − 100).
- Nat = **≥ 0,5 mm neerslag** opgeteld over de uren waarin de rit liep. Drempel in config.
- Startpunt: **laatste wax-datum + backfill** van ritten sinds die datum.
- Package manager: pnpm. Tests: Vitest. Repo: lokaal `git init`, pushen naar jouw GitHub-repo zodra je de URL geeft.

## 1. Fundament
- Next.js (App Router, TS) + Drizzle + Neon serverless driver. CLAUDE.md in de repo-root.
- `src/config.ts`: Strava base-URL, wax-factoren (1.0 / 3.0 / 0.3), nat-drempel, standaardregel. Alles uit env of config, niets hardcoded.
- Env-validatie bij opstarten (zod): ontbreekt een secret, dan faalt de app hard in plaats van stil.

## 2. Datamodel (event-sourced)
| Tabel | Inhoud |
|---|---|
| `athletes` | Strava athlete-id, **versleutelde** access/refresh tokens (AES-256-GCM, sleutel uit env), `expires_at`, scopes |
| `bikes` | `gear_id`, naam, retired-flag |
| `components` | type (`chain` in fase 1), label |
| `events` | `mounted`, `unmounted`, `waxed`, … met `occurred_at` (mag in het verleden), `bike_id`, bron |
| `rules` | per component: type `wax_km`, drempel 400, marge 100 |
| `activities` | minimale cache + weerclassificatie (`dry` / `wet` / `indoor` / `unknown`) |
| `push_subscriptions` | Web Push-endpoints per atleet |
| `notifications_sent` | dedupe: per component + wax-cyclus + soort, zodat je niet elke rit opnieuw een melding krijgt |
| `jobs` | webhook-events om asynchroon te verwerken (vangnet als `after()` faalt) |

Geen opgeslagen km-stand. Staat = `derive(events, activities, config)`.

## 3. Afleidingskern (pure functies, volledig getest)
- `classifyActivity(activity, weather)` → `indoor` als `VirtualRide` of trainer-flag (**ongeacht gear**), anders `wet`/`dry` op basis van neerslag, `unknown` zonder startlocatie (telt als ×1.0, gelabeld).
- `deriveChainState(events, activities, rule, config)` → wax-km sinds laatste `waxed` binnen de periodes dat de ketting op de fiets zat (`mounted`…`unmounted`), status `ok` / `warning` / `due`.
- `decideNotifications(prevState, nextState, sent)` → welke pushes nu nodig zijn.
- Tests o.a.: indoor op racefiets-gear, rit precies op wax-moment, gear-wissel achteraf, wax-event met terugwerkende kracht, formulewijziging → hele historie opnieuw.

## 4. Strava-integratie
- OAuth (`/api/auth/strava/login` + `/callback`), scope `read,activity:read_all,profile:read_all`. Sessie = ondertekende httpOnly-cookie.
- Strava-client: base-URL uit config, token refresh als hij binnen 5 min verloopt, leest `X-RateLimit-*`, backoff bij 429.
- Webhook `/api/strava/webhook` (Node runtime):
  - GET: verify-token check + `hub.challenge` terug.
  - POST: event in `jobs`, **direct 200**, verwerken via `after()`.
  - `activity create/update` → rit ophalen, weer erbij, opslaan, staat herberekenen, eventueel push. `delete` → rit weg, herberekenen.
  - `athlete` met `authorized=false` → **alle tokens en data van die atleet verwijderen**.
- Eenmalig script `pnpm strava:subscribe` om de webhook-subscriptie aan te maken.

## 5. Weer (Open-Meteo)
Let op: de archive-API loopt een paar dagen achter. Daarom: ritten van de afgelopen ~2 maanden via de forecast-API (met `start_date`/`end_date`, die levert vrijwel direct historische uurwaarden), oudere ritten via archive. Uurlijkse neerslag op starttijd + startlocatie, opgeteld over de rituren.

## 6. Push + PWA
- Manifest (`Chainline`), service worker met push-handler en notification action **"Gewaxt ✓"** → maakt direct een `waxed`-event.
- iOS-fallback: tik op de melding opent `/wax/[componentId]`, een één-tap-scherm.
- Install-flow: herkent iOS Safari zonder standalone-modus en legt "Zet op beginscherm" uit voordat push aangezet kan worden.
- Directe pushes: vroege waarschuwing (300), drempel (400), "na natte rit: check je ketting".

## 7. UI (Nederlands, mobile-first)
- `/`: niet gekoppeld → "Connect with Strava"-knop (officieel asset). Gekoppeld → lijst fietsen met per fiets één regel "Ketting: 212 / 400 wax-km" + balk + status.
- Eerste keer per fiets: "Wanneer heb je je ketting laatst gewaxt?" (datum) → `mounted` + `waxed` op die datum (gelabeld als onbekende historie ervoor) → backfill.
- Knop "Gewaxt ✓" op het statusscherm (met optionele datum in het verleden).
- "Powered by Strava" in de footer.

## 8. Wat jij moet regelen (ik kan geen accounts aanmaken of secrets invoeren)
1. Strava-app op strava.com/settings/api, callback domain `chainline.cc` (localhost werkt standaard voor lokaal).
2. Vercel-project, `chainline.cc` koppelen, Neon via Marketplace toevoegen.
3. Env vars in Vercel: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DATABASE_URL`. Ik lever een `pnpm gen:secrets`-script dat de sleutels lokaal voor je genereert; jij plakt ze in Vercel.

## Buiten fase 1
Templates, meerdere componenten, `days`/`hours`-regels, wekelijkse garage-check (cron), metingen en voorspelling, vrienden onboarden.

## Aannames om te checken
- Ritten zonder `gear_id` tellen niet mee en verschijnen als "ongekoppelde ritten". Klopt dat, of wil je een standaardfiets?
- Een indoor-rit telt ×0,3 op de fiets van zijn `gear_id` (dus je racefiets op de trainer telt wel, maar licht).

---

# Fase 2a — ketting en cassette (gebouwd)
- **Regels generiek**: elke regel heeft een type (`wax_km`, `km`, `measurement`) en een `reset_on`-event. Wax-km reset op `waxed`, de meetherinnering op `measured`; levensduur (`reset_on = null`) telt vanaf montage.
- **Ketting**: wax 400 wax-km · meetherinnering elke 1.000 km (echte km) · slijtage via kettingmeter, waarschuwing 0,4%, vervangen 0,5% (directe push).
- **Cassette**: alleen km (keuze gebruiker, wijkt af van CLAUDE.md "telt in kettingen"), standaard 20.000 km. Aantal kettingen op de cassette wordt informatief getoond.
- **Slijtage in echte km**; metingen in fase 3 kalibreren de slijtage per wax-km.
- **Vervangen** = `replaced`-event op het oude exemplaar + nieuw exemplaar met dezelfde drempels.
- **Onboarding cassette**: montagedatum (met backfill) · km bekend (beginkm op het mounted-event) · geen idee (start op 0, gelabeld).
- Nog niet: banden, sealant, templates, wekelijkse garage-check (daar horen meetherinnering en cassette-melding thuis).
