import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { markWaxed, recordMeasurement, replaceComponent, updateRule } from '@/app/actions'
import { LocalDateInput } from '@/components/LocalDateInput'
import type { RuleState } from '@/core/types'
import { db, schema } from '@/db'
import { fmtDate, nl } from '@/lib/format'
import { getSessionAthleteId } from '@/lib/session'
import { loadComponentStates } from '@/server/state'

export const dynamic = 'force-dynamic'

function ruleTitle(r: RuleState) {
  if (r.type === 'wax_km') return { title: 'Wax', unit: 'wax-km', digits: 0 }
  if (r.type === 'measurement') return { title: 'Slijtage (kettingmeter)', unit: '%', digits: 2 }
  if (r.resetOn === 'measured') return { title: 'Meetherinnering', unit: 'km sinds meting', digits: 0 }
  return { title: 'Levensduur', unit: 'km', digits: 0 }
}

export default async function ComponentPage({ params, searchParams }: PageProps<'/onderdeel/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  if (!z.uuid().safeParse(id).success) notFound()
  const athleteId = await getSessionAthleteId()
  if (!athleteId) redirect('/')

  const views = await loadComponentStates(athleteId)
  const comp = views.find((c) => c.id === id)
  if (!comp) notFound()
  const [bike] = comp.state.currentGearId
    ? await db().select().from(schema.bikes).where(and(eq(schema.bikes.athleteId, athleteId), eq(schema.bikes.gearId, comp.state.currentGearId)))
    : []
  const history = await db()
    .select()
    .from(schema.events)
    .where(eq(schema.events.componentId, id))
  history.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  const retired = comp.state.retiredAt !== null

  return (
    <main className="stack">
      <div>
        <h1>{comp.label}{bike ? ` · ${bike.name}` : ''}</h1>
        <p className="muted">
          {retired ? `Vervangen op ${fmtDate(comp.state.retiredAt!)}` : comp.unknownHistory ? 'Historie vóór de eerste registratie onbekend' : comp.state.firstMountedAt ? `Gemonteerd ${fmtDate(comp.state.firstMountedAt)}` : ''}
          {comp.chainsOnCassette !== undefined && ` · ${comp.chainsOnCassette} ${comp.chainsOnCassette === 1 ? 'ketting' : 'kettingen'} op deze cassette`}
        </p>
      </div>

      {sp.gemeten && <div className="notice">Meting opgeslagen.</div>}
      {sp.vervangen && <div className="notice">Nieuw exemplaar gemonteerd. De tellers starten opnieuw.</div>}
      {sp.opgeslagen && <div className="notice">Drempel opgeslagen. Alles is opnieuw berekend.</div>}

      {comp.state.rules.map((r) => {
        const t = ruleTitle(r)
        return (
          <section key={r.ruleId} className="card">
            <div className="row">
              <h2>{t.title}</h2>
              <span className={`pill ${r.status}`}>{r.status === 'no_data' ? 'Nog niet gemeten' : r.status === 'due' ? 'Actie nodig' : r.status === 'warning' ? 'Bijna' : r.status === 'not_mounted' ? '—' : 'Goed'}</span>
            </div>
            <p className="status-line">
              {r.value === null ? '—' : nl(r.value, t.digits)} / {nl(r.threshold, t.digits)} {t.unit}
            </p>
            {r.since && <p className="muted small">{r.type === 'measurement' ? `Gemeten ${fmtDate(r.since)}` : `Geteld vanaf ${fmtDate(r.since)}`}</p>}
            {!retired && (
              <details style={{ marginTop: 12 }}>
                <summary className="muted small">Drempel aanpassen</summary>
                <form action={updateRule} className="rule-form" style={{ marginTop: 8 }}>
                  <input type="hidden" name="ruleId" value={r.ruleId} />
                  <label>
                    Drempel
                    <input type="number" name="threshold" step="any" min="0" defaultValue={r.threshold} required />
                  </label>
                  <label>
                    Waarschuwing vooraf
                    <input type="number" name="warningMargin" step="any" min="0" defaultValue={r.threshold - r.warningAt} required />
                  </label>
                  <button type="submit" className="secondary">Opslaan</button>
                </form>
              </details>
            )}
          </section>
        )
      })}

      {!retired && comp.type === 'chain' && (
        <>
          <section className="card stack">
            <h2>Gewaxt</h2>
            <form action={markWaxed}>
              <input type="hidden" name="componentId" value={comp.id} />
              <button type="submit">Gewaxt ✓ (nu)</button>
            </form>
          </section>

          <section className="card stack" id="meten">
            <h2>Meting invoeren</h2>
            <form action={recordMeasurement} className="stack">
              <input type="hidden" name="componentId" value={comp.id} />
              <label>
                Rek volgens kettingmeter (%)
                <input type="text" name="value" inputMode="decimal" placeholder="bijv. 0,25" pattern="[0-9]+([.,][0-9]+)?" required />
              </label>
              <LocalDateInput label="Datum" />
              <p className="muted small">Vanaf 0,5% vervangen: daarna slijt je cassette mee.</p>
              <button type="submit">Opslaan</button>
            </form>
          </section>
        </>
      )}

      {!retired && (
        <section className="card stack">
          <h2>{comp.label} vervangen</h2>
          <form action={replaceComponent} className="stack">
            <input type="hidden" name="componentId" value={comp.id} />
            <LocalDateInput label="Datum" />
            {comp.type === 'chain' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" name="prewaxed" defaultChecked /> Nieuwe ketting gewaxt gemonteerd
              </label>
            )}
            <p className="muted small">Het oude exemplaar blijft in de historie; het nieuwe krijgt dezelfde drempels.</p>
            <button type="submit" className="secondary">Vervangen</button>
          </form>
        </section>
      )}

      <section className="card">
        <h2>Historie</h2>
        <ul className="muted small" style={{ paddingLeft: 18, margin: '8px 0 0' }}>
          {history.map((e) => (
            <li key={e.id}>
              {fmtDate(e.occurredAt)}: {{ mounted: 'gemonteerd', unmounted: 'gedemonteerd', waxed: 'gewaxt', measured: `gemeten ${nl(e.value ?? 0, 2)}%`, replaced: 'vervangen', sealant_refilled: 'sealant bijgevuld' }[e.type]}
              {e.type === 'mounted' && e.value ? ` (${nl(e.value)} km al gereden)` : ''}
            </li>
          ))}
        </ul>
      </section>

      <a href="/" className="muted">← Terug naar garage</a>
    </main>
  )
}
