import { timingSafeEqual } from 'node:crypto'
import { after, NextResponse, type NextRequest } from 'next/server'
import { stravaWebhookEvent } from '@/core/webhook'
import { env } from '@/env'
import { enqueueJob, processJob } from '@/server/jobs'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Subscription-validatie door Strava (eenmalig bij `pnpm strava:subscribe`). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const token = p.get('hub.verify_token') ?? ''
  const expected = env().STRAVA_WEBHOOK_VERIFY_TOKEN
  const ok =
    p.get('hub.mode') === 'subscribe' &&
    token.length === expected.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return NextResponse.json({ 'hub.challenge': p.get('hub.challenge') })
}

/**
 * Strava wil binnen 2 s een 200. We slaan het event op als job, antwoorden direct
 * en verwerken daarna via after(). Mislukt dat, dan pakt de cron de job later op.
 */
export async function POST(req: NextRequest) {
  const parsed = stravaWebhookEvent.safeParse(await req.json().catch(() => null))
  // Ook bij rommel 200: anders blijft Strava opnieuw proberen. We doen er alleen niets mee.
  if (!parsed.success) return NextResponse.json({ ok: true })

  const jobId = await enqueueJob('strava_webhook', parsed.data.owner_id, parsed.data)
  after(() => processJob(jobId))
  return NextResponse.json({ ok: true })
}
