import 'server-only'
import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { waxConfig } from '@/config'
import { deriveComponentState } from '@/core/component'
import type { ActivityInput, ComponentEventInput, ComponentState, RuleInput } from '@/core/types'
import { db, schema, type ComponentType } from '@/db'

type Activity = typeof schema.activities.$inferSelect
type Event = typeof schema.events.$inferSelect
type Rule = typeof schema.rules.$inferSelect

export function toActivityInput(a: Activity): ActivityInput {
  return {
    id: String(a.id),
    gearId: a.gearId,
    startDate: a.startDate,
    distanceM: a.distanceM,
    sportType: a.sportType,
    trainer: a.trainer,
    hasLocation: a.startLat !== null && a.startLng !== null,
    precipitationMm: a.precipitationMm,
  }
}

export function toEventInput(e: Event, gearByBikeId: Map<string, string>): ComponentEventInput | null {
  switch (e.type) {
    case 'mounted': {
      const gearId = e.bikeId ? gearByBikeId.get(e.bikeId) : undefined
      return gearId ? { id: e.id, type: 'mounted', occurredAt: e.occurredAt, gearId, initialKm: e.value ?? undefined } : null
    }
    case 'measured':
      return { id: e.id, type: 'measured', occurredAt: e.occurredAt, value: e.value ?? 0 }
    default:
      return { id: e.id, type: e.type, occurredAt: e.occurredAt }
  }
}

function toRuleInput(r: Rule): RuleInput | null {
  if (r.type !== 'wax_km' && r.type !== 'km' && r.type !== 'measurement') return null
  return { id: r.id, type: r.type, threshold: r.threshold, warningMargin: r.warningMargin, resetOn: r.resetOn }
}

export interface ComponentView {
  id: string
  type: ComponentType
  label: string
  unknownHistory: boolean
  state: ComponentState
  /** Alleen cassettes: aantal kettingen dat sinds de huidige montage op deze fiets zat (informatief). */
  chainsOnCassette?: number
}

/** Laadt alle onderdelen van een atleet en leidt hun staat af. Afgedankte onderdelen tellen mee voor historie. */
export async function loadComponentStates(athleteId: number, now = new Date()): Promise<ComponentView[]> {
  const d = db()
  const [bikes, comps] = await Promise.all([
    d.select().from(schema.bikes).where(eq(schema.bikes.athleteId, athleteId)),
    d.select().from(schema.components).where(eq(schema.components.athleteId, athleteId)),
  ])
  if (comps.length === 0) return []
  const ids = comps.map((c) => c.id)
  const [events, rules] = await Promise.all([
    d.select().from(schema.events).where(inArray(schema.events.componentId, ids)).orderBy(asc(schema.events.occurredAt)),
    d.select().from(schema.rules).where(inArray(schema.rules.componentId, ids)),
  ])
  const oldest = events.reduce<Date | null>((min, e) => (!min || e.occurredAt < min ? e.occurredAt : min), null)
  const acts = oldest
    ? await d.select().from(schema.activities).where(and(eq(schema.activities.athleteId, athleteId), gte(schema.activities.startDate, oldest)))
    : []
  const gearByBikeId = new Map(bikes.map((b) => [b.id, b.gearId]))
  const activityInputs = acts.map(toActivityInput)

  const views: ComponentView[] = comps.map((c) => {
    const evs = events
      .filter((e) => e.componentId === c.id)
      .map((e) => toEventInput(e, gearByBikeId))
      .filter((e): e is ComponentEventInput => e !== null)
    const ruleInputs = rules
      .filter((r) => r.componentId === c.id)
      .map(toRuleInput)
      .filter((r): r is RuleInput => r !== null)
    return {
      id: c.id,
      type: c.type,
      label: c.label,
      unknownHistory: c.unknownHistory,
      state: deriveComponentState(evs, activityInputs, ruleInputs, waxConfig, now),
    }
  })

  // Kettingen per cassette: ketting-periodes op dezelfde fiets die overlappen met de huidige cassette-periode.
  for (const v of views) {
    if (v.type !== 'cassette' || !v.state.currentGearId) continue
    const period = v.state.mountPeriods.at(-1)!
    v.chainsOnCassette = views.filter(
      (c) =>
        c.type === 'chain' &&
        c.state.mountPeriods.some(
          (p) => p.gearId === period.gearId && (p.to === null || p.to.getTime() > period.from.getTime()),
        ),
    ).length
  }
  return views
}

/** Huidige onderdelen per gear_id, in vaste volgorde voor de UI. */
export function componentsOnGear(views: ComponentView[], gearId: string): ComponentView[] {
  const order: ComponentType[] = ['chain', 'cassette', 'chainring', 'wheelset', 'tyre_front', 'tyre_rear']
  return views
    .filter((v) => v.state.currentGearId === gearId)
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
}

/** Oudste moment waarvoor ritten nodig zijn (voor backfill). */
export async function oldestRelevantDate(athleteId: number): Promise<Date | null> {
  const [row] = await db()
    .select({ occurredAt: schema.events.occurredAt })
    .from(schema.events)
    .where(eq(schema.events.athleteId, athleteId))
    .orderBy(asc(schema.events.occurredAt))
    .limit(1)
  return row?.occurredAt ?? null
}
