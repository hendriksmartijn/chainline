import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { suppressedBy, type NotificationCandidate } from '@/core/notifications'
import { db, schema } from '@/db'
import { env } from '@/env'

let configured = false
function setup() {
  if (configured) return
  const e = env()
  webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY)
  configured = true
}

export interface PushPayload {
  title: string
  body: string
  tag: string
  url: string
  componentId?: string
  /** Toont de "Gewaxt ✓"-actie (Android/desktop). */
  waxAction?: boolean
}

export async function sendPush(athleteId: number, payload: PushPayload): Promise<number> {
  setup()
  const subs = await db().select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.athleteId, athleteId))
  let delivered = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: 'normal' },
        )
        delivered++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404/410: abonnement bestaat niet meer (app verwijderd, permissie ingetrokken).
        if (status === 404 || status === 410) {
          await db().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id))
        } else {
          console.error('push faalde', status)
        }
      }
    }),
  )
  return delivered
}

function payloadFor(c: NotificationCandidate, componentId: string, label: string, waxKm: number, threshold: number): PushPayload {
  const stand = `${Math.round(waxKm)} / ${threshold} wax-km`
  switch (c.kind) {
    case 'wax_due':
      return { title: `${label}: tijd om te waxen`, body: `${stand}. Wax nu om slijtage te voorkomen.`, tag: `wax-${componentId}`, url: `/wax/${componentId}`, componentId, waxAction: true }
    case 'wax_warning':
      return { title: `${label}: bijna tijd om te waxen`, body: `${stand}. Plan je volgende waxbeurt.`, tag: `wax-${componentId}`, url: `/wax/${componentId}`, componentId, waxAction: true }
    case 'wet_ride':
      return { title: 'Na natte rit: check je ketting', body: `Natte rit telt ×3. ${label} staat nu op ${stand}.`, tag: `wet-${componentId}`, url: `/wax/${componentId}`, componentId, waxAction: true }
  }
}

/**
 * Verstuurt kandidaten die nog niet verstuurd zijn. De unique index op
 * (component, kind, cycle) maakt dit veilig bij dubbele webhooks of retries.
 */
export async function deliverNotifications(
  athleteId: number,
  componentId: string,
  label: string,
  candidates: NotificationCandidate[],
  stand: { waxKm: number; threshold: number },
) {
  // Zonder abonnement niets als 'verstuurd' markeren, anders mis je de melding na het aanzetten van push.
  const [sub] = await db().select({ id: schema.pushSubscriptions.id }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.athleteId, athleteId)).limit(1)
  if (!sub) return
  for (const c of candidates) {
    const blockers = suppressedBy(c.kind)
    if (blockers.length) {
      const existing = await db()
        .select({ id: schema.notificationsSent.id })
        .from(schema.notificationsSent)
        .where(and(eq(schema.notificationsSent.componentId, componentId), eq(schema.notificationsSent.cycleKey, c.cycleKey), inArray(schema.notificationsSent.kind, blockers)))
        .limit(1)
      if (existing.length) continue
    }
    const inserted = await db()
      .insert(schema.notificationsSent)
      .values({ athleteId, componentId, kind: c.kind, cycleKey: c.cycleKey })
      .onConflictDoNothing()
      .returning({ id: schema.notificationsSent.id })
    if (inserted.length === 0) continue // al eerder verstuurd
    await sendPush(athleteId, payloadFor(c, componentId, label, stand.waxKm, stand.threshold))
  }
}
