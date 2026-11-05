import { describe, expect, it } from 'vitest'
import { planWebhookAction, stravaWebhookEvent } from './webhook'

const ev = (o: Record<string, unknown>) =>
  stravaWebhookEvent.parse({ object_type: 'activity', object_id: 9, aspect_type: 'create', owner_id: 1, subscription_id: 5, event_time: 1, ...o })

describe('planWebhookAction', () => {
  it('create → upsert als nieuw', () => {
    expect(planWebhookAction(ev({}))).toEqual({ kind: 'upsert_activity', athleteId: 1, activityId: 9, isNew: true })
  })
  it('update → upsert, niet nieuw', () => {
    expect(planWebhookAction(ev({ aspect_type: 'update', updates: { title: 'x' } }))).toMatchObject({ kind: 'upsert_activity', isNew: false })
  })
  it('delete → delete', () => {
    expect(planWebhookAction(ev({ aspect_type: 'delete' }))).toEqual({ kind: 'delete_activity', athleteId: 1, activityId: 9 })
  })
  it('athlete authorized=false → deauthorize', () => {
    expect(planWebhookAction(ev({ object_type: 'athlete', aspect_type: 'update', object_id: 1, updates: { authorized: 'false' } }))).toEqual({ kind: 'deauthorize', athleteId: 1 })
  })
  it('negeert andere subscriptions', () => {
    expect(planWebhookAction(ev({}), '6').kind).toBe('ignore')
  })
  it('weigert onvolledige payloads', () => {
    expect(stravaWebhookEvent.safeParse({ object_type: 'activity' }).success).toBe(false)
  })
})
