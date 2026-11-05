import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { env } from '@/env'

const COOKIE = 'chainline_session'
const MAX_AGE = 60 * 60 * 24 * 365 // een PWA moet niet elke week opnieuw inloggen

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET)
}

export async function createSession(athleteId: number) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(athleteId))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key())
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function getSessionAthleteId(): Promise<number | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    const id = Number(payload.sub)
    return Number.isSafeInteger(id) ? id : null
  } catch {
    return null
  }
}

export async function clearSession() {
  ;(await cookies()).delete(COOKIE)
}
