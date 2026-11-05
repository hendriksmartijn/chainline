import 'server-only'
import { eq } from 'drizzle-orm'
import { stravaConfig } from '@/config'
import { db, schema } from '@/db'
import { env } from '@/env'
import { decrypt, encrypt } from './crypto'

// ---- Types (alleen de velden die we gebruiken) ----

export interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id: number; firstname?: string }
}

export interface StravaGear {
  id: string
  name: string
  retired?: boolean
}

export interface StravaAthlete {
  id: number
  firstname?: string
  bikes?: StravaGear[]
}

export interface StravaActivity {
  id: number
  athlete: { id: number }
  gear_id: string | null
  start_date: string
  distance: number
  moving_time: number
  elapsed_time: number
  sport_type: string
  trainer: boolean
  start_latlng: [number, number] | [] | null
}

export interface RateLimitUsage {
  shortUsage: number
  shortLimit: number
  dailyUsage: number
  dailyLimit: number
}

export class StravaRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Strava rate limit bereikt, opnieuw over ${retryAfterSeconds}s`)
  }
}

export class StravaNotFoundError extends Error {}
export class StravaUnauthorizedError extends Error {}

let lastUsage: RateLimitUsage | null = null
export const getLastRateLimitUsage = () => lastUsage

/** Strava rapporteert "15-min,dag" in X-RateLimit-Limit / X-RateLimit-Usage (en ReadRateLimit-varianten). */
export function parseRateLimit(headers: Headers): RateLimitUsage | null {
  const limit = headers.get('x-readratelimit-limit') ?? headers.get('x-ratelimit-limit')
  const usage = headers.get('x-readratelimit-usage') ?? headers.get('x-ratelimit-usage')
  if (!limit || !usage) return null
  const [shortLimit, dailyLimit] = limit.split(',').map(Number)
  const [shortUsage, dailyUsage] = usage.split(',').map(Number)
  if ([shortLimit, dailyLimit, shortUsage, dailyUsage].some((n) => n === undefined || Number.isNaN(n))) return null
  return { shortLimit: shortLimit!, dailyLimit: dailyLimit!, shortUsage: shortUsage!, dailyUsage: dailyUsage! }
}

/** Seconden tot het volgende kwartier (Strava reset op :00, :15, :30, :45). */
export function secondsToNextQuarter(now = new Date()): number {
  const s = now.getUTCMinutes() * 60 + now.getUTCSeconds()
  return 900 - (s % 900)
}

// ---- OAuth ----

export function authorizeUrl(state: string): string {
  const e = env()
  const url = new URL(`${e.STRAVA_OAUTH_BASE_URL}/authorize`)
  url.searchParams.set('client_id', e.STRAVA_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${e.APP_URL}/api/auth/strava/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', stravaConfig.scope)
  url.searchParams.set('state', state)
  return url.toString()
}

async function tokenRequest(params: Record<string, string>): Promise<StravaTokenResponse> {
  const e = env()
  const res = await fetch(`${e.STRAVA_OAUTH_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: e.STRAVA_CLIENT_ID, client_secret: e.STRAVA_CLIENT_SECRET, ...params }),
    cache: 'no-store',
  })
  if (res.status === 400 || res.status === 401) throw new StravaUnauthorizedError(`Token request geweigerd (${res.status})`)
  if (!res.ok) throw new Error(`Strava token request faalde: ${res.status}`)
  return (await res.json()) as StravaTokenResponse
}

export const exchangeCode = (code: string) => tokenRequest({ code, grant_type: 'authorization_code' })

export async function storeTokens(athleteId: number, t: StravaTokenResponse, extra: { scope?: string; firstname?: string } = {}) {
  const key = env().TOKEN_ENCRYPTION_KEY
  const values = {
    accessTokenEnc: encrypt(t.access_token, key),
    refreshTokenEnc: encrypt(t.refresh_token, key),
    expiresAt: new Date(t.expires_at * 1000),
  }
  await db()
    .insert(schema.athletes)
    .values({ id: athleteId, scope: extra.scope ?? '', firstname: extra.firstname ?? null, ...values })
    .onConflictDoUpdate({
      target: schema.athletes.id,
      set: { ...values, ...(extra.scope ? { scope: extra.scope } : {}), ...(extra.firstname ? { firstname: extra.firstname } : {}) },
    })
}

/** Geeft een geldig access token; ververst en slaat op als het bijna verloopt. */
export async function getAccessToken(athleteId: number): Promise<string> {
  const [row] = await db().select().from(schema.athletes).where(eq(schema.athletes.id, athleteId))
  if (!row) throw new StravaUnauthorizedError('Atleet niet gevonden')
  const key = env().TOKEN_ENCRYPTION_KEY
  if (row.expiresAt.getTime() - Date.now() > stravaConfig.refreshMarginSeconds * 1000) {
    return decrypt(row.accessTokenEnc, key)
  }
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(row.refreshTokenEnc, key) })
  await storeTokens(athleteId, t)
  return t.access_token
}

// ---- API ----

export async function stravaGet<T>(athleteId: number, path: string, query?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${env().STRAVA_API_BASE_URL}${path}`)
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v))
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${await getAccessToken(athleteId)}` },
    cache: 'no-store',
  })
  lastUsage = parseRateLimit(res.headers) ?? lastUsage
  if (res.status === 429) throw new StravaRateLimitError(secondsToNextQuarter())
  if (res.status === 404) throw new StravaNotFoundError(path)
  if (res.status === 401) throw new StravaUnauthorizedError(path)
  if (!res.ok) throw new Error(`Strava ${path} faalde: ${res.status}`)
  return (await res.json()) as T
}

export const getAthlete = (athleteId: number) => stravaGet<StravaAthlete>(athleteId, '/athlete')
export const getActivity = (athleteId: number, id: number) => stravaGet<StravaActivity>(athleteId, `/activities/${id}`)
export const listActivities = (athleteId: number, afterEpoch: number, page: number) =>
  stravaGet<StravaActivity[]>(athleteId, '/athlete/activities', { after: afterEpoch, page, per_page: stravaConfig.perPage })

/** Bijna aan de 15-minutenlimiet? Dan stoppen we met niet-dringend werk zoals backfill. */
export function nearRateLimit(): boolean {
  if (!lastUsage) return false
  return lastUsage.shortUsage >= lastUsage.shortLimit * stravaConfig.backfillUsageCeiling ||
    lastUsage.dailyUsage >= lastUsage.dailyLimit * stravaConfig.backfillUsageCeiling
}

// ---- Webhook-subscription (app-niveau, met client credentials) ----

export interface StravaSubscription {
  id: number
  callback_url: string
  created_at?: string
}

function clientCreds() {
  const e = env()
  return { client_id: e.STRAVA_CLIENT_ID, client_secret: e.STRAVA_CLIENT_SECRET }
}

export async function listSubscriptions(): Promise<StravaSubscription[]> {
  const res = await fetch(`${env().STRAVA_API_BASE_URL}/push_subscriptions?${new URLSearchParams(clientCreds())}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Subscriptions ophalen faalde: ${res.status}`)
  return (await res.json()) as StravaSubscription[]
}

/** Strava valideert de callback meteen met een GET naar onze webhook; die moet dus live zijn. */
export async function createSubscription(): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const e = env()
  const res = await fetch(`${e.STRAVA_API_BASE_URL}/push_subscriptions`, {
    method: 'POST',
    body: new URLSearchParams({ ...clientCreds(), callback_url: `${e.APP_URL}/api/strava/webhook`, verify_token: e.STRAVA_WEBHOOK_VERIFY_TOKEN }),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` }
  return { ok: true, id: (JSON.parse(text) as { id: number }).id }
}
