import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { markWaxed, recordMeasurement, replaceComponent, updateRule } from '@/app/actions'
import { LocalDateInput } from '@/components/LocalDateInput'
import { findRule } from '@/core/component'
import type { RuleState } from '@/core/types'
import { db, schema } from '@/db'
import { fmtDate, nl } from '@/lib/format'
import { getSessionAthleteId } from '@/lib/session'
import { loadComponentStates } from '@/server/state'

export const dynamic = 'force-dynamic'

function ruleMeta(r: RuleState) {
  if (r.type === 'wax_km') return { title: 'Kettingwax', unit: 'wax-km', digits: 0 }
  if (r.type === 'measurement') return { title: 'Slijtage', unit: '%', digits: 2 }
  if (r.resetOn === 'measured') return { title: 'Meten', unit: 'km sinds meting', digits: 0 }
  return { title: 'Levensduur', unit: 'km', digits: 0 }
}

const STATUS_TEXT: Record<RuleState['status'], string> = { ok: 'Goed', warning: 'Bijna', due: 'Actie nodig', no_data: 'Nog niet gemeten', not_mounted: '—' }

export default async function ComponentPage({ params, searchParams }: PageProps<'/onderdeel/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  if (!z.uuid().safeParse(id).success) notFound()
  const athleteId = await getSessionAthleteId()
  if (!athleteId) redirect('/')

  const comp = (await loadComponentStates(athleteId)).find((c) => c.id === id)
  if (!comp) notFound()
  const [bike] = comp.state.currentGearId
    ? await db().select().from(schema.bikes).where(and(eq(schema.bikes.athleteId, athleteId), eq(schema.bikes.gearId, comp.state.currentGearId)))
    : []
  const history = await db().select().from(schema.events).where(eq(schema.events.componentId, id))
  history.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  const retired = comp.state.retiredAt !== null

  // De belangrijkste regel als blikvanger: wax voor de ketting, levensduur voor de cassette.
  const main = comp.type === 'chain' ? findRule(comp.state, 'wax_km') : findRule(comp.state, 'km', null)
  const mainMeta = main && ruleMeta(main)
  const others = comp.state.rules.filter((r) => r !== main)

  return (
    <main className="stack">
      <a href="/" className="back" aria-label="Terug naar garage">Garage</a>
      <div>
        <p className="eyebrow">{bike?.name ?? (retired ? 'Afgedankt' : 'Niet gemonteerd')}</p>
        <h1>{comp.label}</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {retired ? `Vervangen op ${fmtDate(comp.state.retiredAt!)}` : comp.unknownHistory ? 'Historie vóór de eerste registratie onbekend' : comp.state.firstMountedAt ? `Gemonteerd ${fmtDate(comp.state.firstMountedAt)}` : ''}
          {comp.chainsOnCassette !== undefined && ` · ${comp.chainsOnCassette} ${comp.chainsOnCassette === 1 ? 'ketting' : 'kettingen'}`}
        </p>
      </div>

      {sp.gemeten && <div className="notice">Meting opgeslagen.</div>}
      {sp.vervangen && <div className="notice">Nieuw exemplaar gemonteerd. De tellers starten opnieuw.</div>}
      {sp.opgeslagen && <div className="notice">Drempel opgeslagen. Alles is opnieuw berekend.</div>}

      {main && mainMeta && (
        <section className="big-card">
          <div className="row">
            <span className="hero-label">{mainMeta.title}</span>
            {main.status !== 'ok' && <span className={`pill ${main.status}`}>{STATUS_TEXT[main.status]}</span>}
          </div>
          <div className="big">{nl(main.value ?? 0, mainMeta.digits)}</div>
          <p className="of">
            van {nl(main.threshold, mainMeta.digits)} {mainMeta.unit}
            {main.since && ` · sinds ${fmtDate(main.since)}`}
            {main.type === 'km' && !main.countIndoor && ' · indoor telt niet mee'}
          </p>
          <div className="bar" aria-hidden>
            <span className={main.status} style={{ width: `${Math.min(100, ((main.value ?? 0) / main.threshold) * 100)}%` }} />
          </div>
          {!retired && comp.type === 'chain' && (
            <form action={markWaxed} style={{ marginTop: 18 }}>
              <input type="hidden" name="componentId" value={comp.id} />
              <button type="submit">Gewaxt ✓</button>
            </form>
          )}
        </section>
      )}

      {others.length > 0 && (
        <div className="group">
          <p className="group-title">Status</p>
          <div className="list">
            {others.map((r) => {
              const m = ruleMeta(r)
              return (
                <div key={r.ruleId} className="list-row">
                  <span className="label">{m.title}</span>
                  <span className={`value ${r.status}`}>
                    {r.value === null ? STATUS_TEXT[r.status] : `${nl(r.value, m.digits)} / ${nl(r.threshold, m.digits)} ${m.unit === '%' ? '%' : 'km'}`}
                  </span>
                </div>
              )
            })}
          </div>
          {comp.type === 'chain' && <p className="group-foot">Vanaf {nl(findRule(comp.state, 'measurement')?.threshold ?? 0.5, 2)}% vervangen, anders slijt je cassette mee.</p>}
        </div>
      )}

      {!retired && comp.type === 'chain' && (
        <div className="group" id="meten">
          <p className="group-title">Meting invoeren</p>
          <form action={recordMeasurement} className="card stack">
            <input type="hidden" name="componentId" value={comp.id} />
            <label>
              Rek volgens kettingmeter (%)
              <input type="text" name="value" inputMode="decimal" placeholder="0,25" pattern="[0-9]+([.,][0-9]+)?" required />
            </label>
            <LocalDateInput label="Datum" />
            <button type="submit">Meting opslaan</button>
          </form>
        </div>
      )}

      {!retired && (
        <div className="group">
          <p className="group-title">Beheer</p>
          <div className="list">
            <details>
              <summary><span className="label">{comp.label} vervangen</span></summary>
              <form action={replaceComponent} className="list-body stack">
                <input type="hidden" name="componentId" value={comp.id} />
                <LocalDateInput label="Datum" />
                {comp.type === 'chain' && (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text)' }}>
                    <input type="checkbox" name="prewaxed" defaultChecked /> Nieuwe ketting gewaxt gemonteerd
                  </label>
                )}
                <p className="muted small" style={{ margin: 0 }}>Het oude exemplaar blijft in de historie; het nieuwe krijgt dezelfde drempels.</p>
                <button type="submit" className="secondary">Vervangen</button>
              </form>
            </details>
            {comp.state.rules.map((r) => {
              const m = ruleMeta(r)
              return (
                <details key={r.ruleId}>
                  <summary>
                    <span className="label">Drempel {m.title.toLowerCase()}</span>
                    <span className="value">{nl(r.threshold, m.digits)} {m.unit === '%' ? '%' : 'km'}</span>
                  </summary>
                  <form action={updateRule} className="list-body rule-form">
                    <input type="hidden" name="ruleId" value={r.ruleId} />
                    <label>
                      Drempel
                      <input type="number" name="threshold" step="any" min="0" defaultValue={r.threshold} required inputMode="decimal" />
                    </label>
                    <label>
                      Waarschuwing vooraf
                      <input type="number" name="warningMargin" step="any" min="0" defaultValue={r.threshold - r.warningAt} required inputMode="decimal" />
                    </label>
                    <button type="submit" className="secondary">Alleen voor dit onderdeel opslaan</button>
                  </form>
                </details>
              )
            })}
          </div>
          <p className="group-foot">
            Voor al je fietsen tegelijk: <a href="/instellingen">Instellingen</a>.
          </p>
        </div>
      )}

      <div className="group">
        <p className="group-title">Historie</p>
        <div className="list">
          {history.map((e) => (
            <div key={e.id} className="list-row">
              <span className="label">
                {{ mounted: 'Gemonteerd', unmounted: 'Gedemonteerd', waxed: 'Gewaxt', measured: `Gemeten ${nl(e.value ?? 0, 2)}%`, replaced: 'Vervangen', sealant_refilled: 'Sealant bijgevuld' }[e.type]}
                {e.type === 'mounted' && e.value ? ` · ${nl(e.value)} km al gereden` : ''}
              </span>
              <span className="value">{fmtDate(e.occurredAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
