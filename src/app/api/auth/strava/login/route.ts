import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authorizeUrl } from '@/lib/strava'

export const runtime = 'nodejs'

export async function GET() {
  // CSRF-bescherming voor de OAuth-flow.
  const state = randomBytes(16).toString('base64url')
  ;(await cookies()).set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/strava',
    maxAge: 600,
  })
  return NextResponse.redirect(authorizeUrl(state))
}
