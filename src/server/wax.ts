import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'

/** Registreert een waxbeurt. Controleert eigenaarschap; datum mag in het verleden, niet in de toekomst. */
export async function recordWaxed(athleteId: number, componentId: string, at: Date, source: 'user' | 'push') {
  const [comp] = await db()
    .select({ id: schema.components.id })
    .from(schema.components)
    .where(and(eq(schema.components.id, componentId), eq(schema.components.athleteId, athleteId)))
  if (!comp) return false
  const occurredAt = at.getTime() > Date.now() ? new Date() : at
  await db().insert(schema.events).values({ athleteId, componentId, type: 'waxed', occurredAt, source })
  return true
}
