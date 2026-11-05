# Chainline

PWA die je vertelt wanneer je ketting gewaxt moet worden, op basis van je Strava-ritten, gewogen naar omstandigheden (**wax-km**). Zie [CLAUDE.md](CLAUDE.md) voor het productkader en [PLAN.md](PLAN.md) voor fase 1.

## Hoe het werkt
- `src/core/`: pure afleidingslogica (events + ritten → staat). Geen I/O, volledig getest (`pnpm test`).
- `src/server/`: laden uit de DB, Strava-sync, jobs, push.
- `src/app/api/`: OAuth, Strava-webhook, cron-vangnet, push-subscriptions, "Gewaxt ✓" vanuit de notificatie.
- Wax-factoren en drempels: `src/config.ts`. Wijzigen = alles opnieuw afgeleid, geen migratie van standen.

## Eenmalige setup
1. **Strava-app** op <https://www.strava.com/settings/api>. Authorization Callback Domain: `chainline.cc` (localhost werkt standaard).
2. **Vercel-project** aanmaken, repo koppelen, domein `chainline.cc` toevoegen.
3. **Neon** via Vercel Marketplace (Storage → Neon). Dat zet `DATABASE_URL`.
4. **Secrets genereren**: `pnpm gen:secrets` en de output in Vercel env vars zetten (Production + Preview), samen met `APP_URL=https://chainline.cc`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `VAPID_SUBJECT=mailto:<jouw mail>` en `ALLOWED_ATHLETE_IDS=<jouw Strava athlete-id>`.
5. **Database**: migraties draaien automatisch tijdens elke productie-deploy (`scripts/migrate-on-deploy.mjs`, via `DATABASE_URL_UNPOOLED`). Preview- en lokale builds slaan dit over.
6. **Webhook aanmelden**: log in op `https://chainline.cc`, ga naar `/admin` (alleen voor atleten op `ALLOWED_ATHLETE_IDS`) en klik op *Webhook aanmelden*. Zet het getoonde id als `STRAVA_SUBSCRIPTION_ID` in Vercel en redeploy. (Lokaal alternatief: `pnpm strava:subscribe create`.)
7. **Strava-knop**: download de officiële "Connect with Strava"-knop en het "Powered by Strava"-logo van <https://developers.strava.com/guidelines/> en vervang de tijdelijke knop/tekst in `src/app/page.tsx`.

## Lokaal
```
cp .env.example .env.local   # vul in
pnpm dev
```
Push lokaal testen: `pnpm dev --experimental-https`. Webhooks lokaal: tunnel (`cloudflared tunnel --url http://localhost:3000`) en een aparte Strava-app of tijdelijk de subscription naar de tunnel-URL.

## Bekende beperkingen fase 1
- Strava stuurt geen webhook bij elke gear-wissel. Knop **Ververs vanuit Strava** haalt alles sinds de oudste montage opnieuw op.
- Ritten zonder fiets in Strava tellen niet mee (de app meldt hoeveel het er zijn).
- Vercel Hobby-cron draait dagelijks (04:00 UTC) als vangnet voor jobs; normaal verwerkt `after()` webhooks direct.
