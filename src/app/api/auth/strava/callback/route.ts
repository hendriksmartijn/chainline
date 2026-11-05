import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { allowedAthleteIds, env } from '@/env'
import { createSession } from '@/lib/session'
import { exchangeCode, storeTokens } from '@/lib/strava'
import { syncBikes } from '@/server/sync'

export const runtime = 'nodejs'

const REQUIRED_SCOPES = ['activity:read_all', 'profile:read_all']

function fail(reason: string) {
  return NextResponse.redirect(new URL(`/?fout=${encodeURIComponent(reason)}`, env().APP_URL))
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const jar = await cookies()
  const expected = jar.get('oauth_state')?.value
  jar.delete({ name: 'oauth_state', path: '/api/auth/strava' })

  const state = params.get('state')
  if (!expected || !state || !safeEqual(expected, state)) return fail('sessie')
  if (params.get('error')) return fail('geweigerd')

  // Strava laat gebruikers scopes uitvinken; zonder deze werkt Chainline niet.
  const granted = (params.get('scope') ?? '').split(',')
  if (!REQUIRED_SCOPES.every((s) => granted.includes(s))) return fail('scope')

  const code = params.get('code')
  if (!code) return fail('code')

  const tokens = await exchangeCode(code)
  const athleteId = tokens.athlete?.id
  if (!athleteId) return fail('atleet')

  const allowed = allowedAthleteIds()
  if (allowed && !allowed.has(String(athleteId))) return fail('niet-toegestaan')

  await storeTokens(athleteId, tokens, { scope: granted.join(','), firstname: tokens.athlete?.firstname })
  await syncBikes(athleteId)
  await createSession(athleteId)
  return NextResponse.redirect(new URL('/', env().APP_URL))
}
