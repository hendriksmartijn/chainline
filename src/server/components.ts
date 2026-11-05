import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { RuleDefault } from '@/config'
import { db, schema, type ComponentType } from '@/db'
import { getRuleDefaults } from './settings'

export const COMPONENT_LABELS: Partial<Record<ComponentType, string>> = { chain: 'Ketting', cassette: 'Cassette' }

export async function getOwnedComponent(athleteId: number, componentId: string) {
  const [c] = await db()
    .select()
    .from(schema.components)
    .where(and(eq(schema.components.id, componentId), eq(schema.components.athleteId, athleteId)))
  return c ?? null
}

export async function getOwnedBike(athleteId: number, bikeId: string) {
  const [b] = await db().select().from(schema.bikes).where(and(eq(schema.bikes.id, bikeId), eq(schema.bikes.athleteId, athleteId)))
  return b ?? null
}

/** Nooit in de toekomst. */
export const clampToNow = (d: Date) => (d.getTime() > Date.now() ? new Date() : d)

/**
 * Nieuw onderdeel op een fiets, atomair met regels en events.
 * initialKm = "km bekend"; waxedAt = ketting gewaxt gemonteerd.
 */
export async function createMountedComponent(opts: {
  athleteId: number
  bikeId: string
  type: 'chain' | 'cassette'
  mountedAt: Date
  unknownHistory: boolean
  initialKm?: number
  waxedAt?: Date
  rules?: RuleDefault[]
  source?: 'user' | 'onboarding'
}) {
  const componentId = randomUUID()
  const { athleteId, bikeId, type } = opts
  const rules = opts.rules ?? (await getRuleDefaults(athleteId))[type]
  const mountedAt = clampToNow(opts.mountedAt)
  const source = opts.source ?? 'user'
  const events: (typeof schema.events.$inferInsert)[] = [
    { athleteId, componentId, type: 'mounted', bikeId, occurredAt: mountedAt, value: opts.initialKm ?? null, source },
  ]
  if (opts.waxedAt) events.push({ athleteId, componentId, type: 'waxed', occurredAt: clampToNow(opts.waxedAt), source })

  await db().batch([
    db().insert(schema.components).values({ id: componentId, athleteId, type, label: COMPONENT_LABELS[type] ?? type, unknownHistory: opts.unknownHistory }),
    db().insert(schema.rules).values(rules.map((r) => ({ componentId, ...r }))),
    db().insert(schema.events).values(events),
  ])
  return componentId
}

export async function recordEvent(
  athleteId: number,
  componentId: string,
  type: 'waxed' | 'measured',
  at: Date,
  source: 'user' | 'push',
  value?: number,
) {
  const comp = await getOwnedComponent(athleteId, componentId)
  if (!comp) return false
  await db().insert(schema.events).values({ athleteId, componentId, type, occurredAt: clampToNow(at), source, value: value ?? null })
  return true
}
