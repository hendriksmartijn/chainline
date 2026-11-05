import { z } from 'zod'

/**
 * Lazy gevalideerd: de build hoeft geen secrets te hebben, maar zodra code een
 * secret nodig heeft en die ontbreekt, faalt hij hard met een duidelijke melding.
 */
const schema = z.object({
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_API_BASE_URL: z.url().default('https://www.strava.com/api/v3'),
  STRAVA_OAUTH_BASE_URL: z.url().default('https://www.strava.com/oauth'),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(16),
  STRAVA_SUBSCRIPTION_ID: z.string().optional(),
  ALLOWED_ATHLETE_IDS: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

export function env(): Env {
  if (cached) return cached
  const raw = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
  )
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Ongeldige of ontbrekende env vars: ${missing}`)
  }
  cached = parsed.data
  return cached
}

export function allowedAthleteIds(): Set<string> | null {
  const list = env().ALLOWED_ATHLETE_IDS
  if (!list) return null
  return new Set(list.split(',').map((s) => s.trim()).filter(Boolean))
}
