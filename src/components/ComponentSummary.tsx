import { markWaxed } from '@/app/actions'
import { findRule } from '@/core/component'
import type { RuleState } from '@/core/types'
import { fmtDate, nl } from '@/lib/format'
import type { ComponentView } from '@/server/state'

function Bar({ rule }: { rule: RuleState }) {
  const pct = rule.value === null ? 0 : Math.min(100, (rule.value / rule.threshold) * 100)
  return (
    <div className="bar" aria-hidden>
      <span className={rule.status} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Eén regel per onderdeel, leesbaar in één oogopslag. Details op /onderdeel/[id]. */
export function ComponentSummary({ comp, backfilling }: { comp: ComponentView; backfilling: boolean }) {
  return comp.type === 'chain' ? <ChainSummary comp={comp} backfilling={backfilling} /> : <KmSummary comp={comp} />
}

function ChainSummary({ comp, backfilling }: { comp: ComponentView; backfilling: boolean }) {
  const wax = findRule(comp.state, 'wax_km')
  const wear = findRule(comp.state, 'measurement')
  const measureDue = findRule(comp.state, 'km', 'measured')
  return (
    <div className="component">
      {wax && (
        <>
          <div className="row">
            <a href={`/onderdeel/${comp.id}`} className="status-line">
              {comp.label}: {nl(wax.value ?? 0)} / {nl(wax.threshold)} wax-km
            </a>
            <span className={`pill ${wax.status}`}>{wax.status === 'due' ? 'Waxen' : wax.status === 'warning' ? 'Bijna waxen' : 'Goed'}</span>
          </div>
          <Bar rule={wax} />
          <p className="muted small">
            {wax.since && <>Gewaxt {fmtDate(wax.since)}</>}
            {wax.breakdown.wet.rides > 0 && <> · {wax.breakdown.wet.rides} nat (×3)</>}
            {wax.breakdown.indoor.rides > 0 && <> · {wax.breakdown.indoor.rides} indoor (×0,3)</>}
            {wax.breakdown.unknown.rides > 0 && <> · {wax.breakdown.unknown.rides} zonder weerdata</>}
            {backfilling && <> · ritten worden opgehaald…</>}
          </p>
        </>
      )}
      {wear && (
        <p className="small wear">
          <span className={`dot ${wear.status}`} />
          Slijtage: {wear.value === null ? 'nog niet gemeten' : `${nl(wear.value, 2)}% (${fmtDate(wear.since!)})`}
          {wear.status === 'due' && <strong> · nu vervangen</strong>}
          {measureDue && (measureDue.status === 'due' || wear.value === null) ? (
            <a href={`/onderdeel/${comp.id}#meten`}> · meten</a>
          ) : measureDue ? (
            <span className="muted"> · meten over {nl(Math.max(0, measureDue.threshold - (measureDue.value ?? 0)))} km</span>
          ) : null}
        </p>
      )}
      <div className="actions">
        <form action={markWaxed}>
          <input type="hidden" name="componentId" value={comp.id} />
          <button type="submit">Gewaxt ✓</button>
        </form>
        <a className="btn secondary" href={`/onderdeel/${comp.id}`}>Details</a>
      </div>
    </div>
  )
}

function KmSummary({ comp }: { comp: ComponentView }) {
  const life = findRule(comp.state, 'km', null)
  if (!life) return null
  return (
    <div className="component">
      <div className="row">
        <a href={`/onderdeel/${comp.id}`} className="status-line small-line">
          {comp.label}: {nl(life.value ?? 0)} / {nl(life.threshold)} km
        </a>
        <span className={`pill ${life.status}`}>{life.status === 'due' ? 'Vervangen' : life.status === 'warning' ? 'Bijna' : 'Goed'}</span>
      </div>
      <Bar rule={life} />
      <p className="muted small">
        {comp.unknownHistory ? 'Historie onbekend' : comp.state.firstMountedAt && <>Sinds {fmtDate(comp.state.firstMountedAt)}</>}
        {comp.chainsOnCassette !== undefined && <> · {comp.chainsOnCassette} {comp.chainsOnCassette === 1 ? 'ketting' : 'kettingen'}</>}
      </p>
    </div>
  )
}
