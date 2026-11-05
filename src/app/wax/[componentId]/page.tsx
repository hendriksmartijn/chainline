import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { markWaxed } from '@/app/actions'
import { LocalDateInput } from '@/components/LocalDateInput'
import { db, schema } from '@/db'
import { getSessionAthleteId } from '@/lib/session'
import { findRule } from '@/core/component'
import { nl } from '@/lib/format'
import { loadComponentStates } from '@/server/state'

export const dynamic = 'force-dynamic'

/** Eén-tap-scherm. Ook de iOS-fallback voor de notificatie-actie "Gewaxt ✓". */
export default async function WaxPage({ params }: PageProps<'/wax/[componentId]'>) {
  const { componentId } = await params
  if (!z.uuid().safeParse(componentId).success) notFound()
  const athleteId = await getSessionAthleteId()
  if (!athleteId) redirect('/')

  const [comp] = await db()
    .select()
    .from(schema.components)
    .where(and(eq(schema.components.id, componentId), eq(schema.components.athleteId, athleteId)))
  if (!comp) notFound()
  const chain = (await loadComponentStates(athleteId)).find((c) => c.id === componentId)
  const wax = chain && findRule(chain.state, 'wax_km')
  const [bike] = chain?.state.currentGearId
    ? await db().select().from(schema.bikes).where(and(eq(schema.bikes.athleteId, athleteId), eq(schema.bikes.gearId, chain.state.currentGearId)))
    : []

  return (
    <main className="stack">
      <a href="/" className="back">‹ Garage</a>
      <div>
        <h1>{comp.label}{bike ? ` · ${bike.name}` : ''}</h1>
        {wax && <p className="muted">Nu {nl(wax.value ?? 0)} / {nl(wax.threshold)} wax-km</p>}
      </div>

      <form action={markWaxed}>
        <input type="hidden" name="componentId" value={componentId} />
        <button className="big" type="submit">Gewaxt ✓</button>
      </form>

      <details className="card">
        <summary>Eerder gewaxt?</summary>
        <form action={markWaxed} className="stack" style={{ marginTop: 12 }}>
          <input type="hidden" name="componentId" value={componentId} />
          <LocalDateInput label="Datum" defaultToday={false} />
          <p className="muted">Ritten vanaf die dag tellen mee in de nieuwe cyclus.</p>
          <button type="submit" className="secondary">Opslaan</button>
        </form>
      </details>
    </main>
  )
}
