import { z } from 'zod'

/** Strava push-event. Strava ondertekent niets, dus we vertrouwen alleen de vorm en verifiëren daarna bij de API. */
export const stravaWebhookEvent = z.object({
  object_type: z.enum(['activity', 'athlete']),
  object_id: z.number().int(),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.number().int(),
  subscription_id: z.number().int(),
  event_time: z.number().int(),
  updates: z.record(z.string(), z.unknown()).optional().default({}),
})

export type StravaWebhookEvent = z.infer<typeof stravaWebhookEvent>

export type WebhookAction =
  | { kind: 'upsert_activity'; athleteId: number; activityId: number; isNew: boolean }
  | { kind: 'delete_activity'; athleteId: number; activityId: number }
  | { kind: 'deauthorize'; athleteId: number }
  | { kind: 'ignore'; reason: string }

export function planWebhookAction(e: StravaWebhookEvent, expectedSubscriptionId?: string): WebhookAction {
  if (expectedSubscriptionId && String(e.subscription_id) !== expectedSubscriptionId) {
    return { kind: 'ignore', reason: 'onbekende subscription' }
  }
  if (e.object_type === 'athlete') {
    const authorized = e.updates.authorized
    if (e.aspect_type === 'update' && (authorized === 'false' || authorized === false)) {
      return { kind: 'deauthorize', athleteId: e.owner_id }
    }
    return { kind: 'ignore', reason: 'athlete-update zonder deauth' }
  }
  if (e.aspect_type === 'delete') return { kind: 'delete_activity', athleteId: e.owner_id, activityId: e.object_id }
  return { kind: 'upsert_activity', athleteId: e.owner_id, activityId: e.object_id, isNew: e.aspect_type === 'create' }
}
