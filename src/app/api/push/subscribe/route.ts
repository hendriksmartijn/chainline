import { and, eq } from 'drizzle-orm'
import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, schema } from '@/db'
import { isSameOrigin } from '@/lib/request'
import { getSessionAthleteId } from '@/lib/session'
import { evaluateAndNotify } from '@/server/sync'

export const runtime = 'nodejs'

const body = z.object({
  endpoint: z.url().refine((u) => u.startsWith('https://'), 'https vereist'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
})

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const athleteId = await getSessionAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ongeldig' }, { status: 400 })

  const { endpoint, keys } = parsed.data
  await db()
    .insert(schema.pushSubscriptions)
    .values({ athleteId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { athleteId, p256dh: keys.p256dh, auth: keys.auth } })

  // Staat je ketting al op waarschuwing? Dan krijg je die nu meteen.
  after(() => evaluateAndNotify(athleteId))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const athleteId = await getSessionAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = z.object({ endpoint: z.string() }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ongeldig' }, { status: 400 })
  await db()
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint), eq(schema.pushSubscriptions.athleteId, athleteId)))
  return NextResponse.json({ ok: true })
}
