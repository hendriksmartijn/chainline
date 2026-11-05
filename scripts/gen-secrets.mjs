// Genereert de secrets die Chainline nodig heeft. Plak ze in Vercel env vars en/of .env.local.
// Ze worden alleen in je terminal getoond, nergens opgeslagen.
import { randomBytes } from 'node:crypto'
import webpush from 'web-push'

const vapid = webpush.generateVAPIDKeys()
const out = {
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SESSION_SECRET: randomBytes(48).toString('base64url'),
  CRON_SECRET: randomBytes(32).toString('base64url'),
  STRAVA_WEBHOOK_VERIFY_TOKEN: randomBytes(24).toString('base64url'),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
}
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`)
console.error('\nLet op: TOKEN_ENCRYPTION_KEY later wijzigen maakt opgeslagen Strava-tokens onleesbaar (opnieuw koppelen nodig).')
