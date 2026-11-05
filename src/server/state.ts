import 'server-only'
import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { defaultRules, waxConfig } from '@/config'
import { deriveChainState } from '@/core/chain'
import type { ActivityInput, ChainState, ComponentEventInput } from '@/core/types'
import { db, schema } from '@/db'

type Activity = typeof schema.activities.$inferSelect
type Event = typeof schema.events.$inferSelect

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
      return gearId ? { id: e.id, type: 'mounted', occurredAt: e.occurredAt, gearId } : null
    }
    case 'measured':
      return { id: e.id, type: 'measured', occurredAt: e.occurredAt, value: e.value ?? 0 }
    default:
      return { id: e.id, type: e.type, occurredAt: e.occurredAt }
  }
}

export interface ChainView {
  componentId: string
  label: string
  unknownHistory: boolean
  state: ChainState
}

/** Laadt alle kettingen van een atleet en leidt hun staat af. */
export async function loadChainStates(athleteId: number, now = new Date()): Promise<ChainView[]> {
  const d = db()
  const [bikes, comps] = await Promise.all([
    d.select().from(schema.bikes).where(eq(schema.bikes.athleteId, athleteId)),
    d.select().from(schema.components).where(and(eq(schema.components.athleteId, athleteId), eq(schema.components.type, 'chain'))),
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

  return comps.map((c) => {
    const rule = rules.find((r) => r.componentId === c.id && r.type === 'wax_km')
    const evs = events
      .filter((e) => e.componentId === c.id)
      .map((e) => toEventInput(e, gearByBikeId))
      .filter((e): e is ComponentEventInput => e !== null)
    return {
      componentId: c.id,
      label: c.label,
      unknownHistory: c.unknownHistory,
      state: deriveChainState(
        evs,
        activityInputs,
        rule
          ? { type: 'wax_km', threshold: rule.threshold, warningMargin: rule.warningMargin }
          : defaultRules.chain,
        waxConfig,
        now,
      ),
    }
  })
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
