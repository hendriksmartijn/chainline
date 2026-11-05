import { markWaxed } from '@/app/actions'
import { findRule } from '@/core/component'
import type { RuleStatus } from '@/core/types'
import { fmtDate, nl } from '@/lib/format'
import type { ComponentView } from '@/server/state'
import { Ring } from './Ring'

function MiniBar({ value, threshold, status }: { value: number | null | undefined; threshold: number; status: RuleStatus }) {
  const pct = value == null ? 0 : Math.min(100, (value / threshold) * 100)
  return (
    <div className="bar" aria-hidden>
      <span className={status} style={{ width: `${pct}%` }} />
    </div>
  )
}

const RANK: Record<RuleStatus, number> = { due: 3, warning: 2, ok: 1, no_data: 0, not_mounted: 0 }

/** Zwaarste status van alle regels op de fiets: bepaalt de kleur van de strip. */
export function worstStatus(comps: ComponentView[]): RuleStatus {
  let worst: RuleStatus = 'ok'
  for (const c of comps) for (const r of c.state.rules) if (RANK[r.status] > RANK[worst]) worst = r.status
  return worst
}

const WAX_LABEL = { ok: 'Goed', warning: 'Bijna waxen', due: 'Nu waxen', no_data: '', not_mounted: '' } as const

/**
 * Eén kaart per fiets, in één oogopslag: ring + groot getal voor de wax,
 * daaronder drie stats (slijtage, meten, cassette) en de hoofdactie.
 */
export function BikeCard({ name, comps, backfilling, children }: { name: string; comps: ComponentView[]; backfilling: boolean; children?: React.ReactNode }) {
  const chain = comps.find((c) => c.type === 'chain')
  const cassette = comps.find((c) => c.type === 'cassette')
  const wax = chain && findRule(chain.state, 'wax_km')
  const wear = chain && findRule(chain.state, 'measurement')
  const measure = chain && findRule(chain.state, 'km', 'measured')
  const life = cassette && findRule(cassette.state, 'km', null)

  return (
    <section className="bike-card">
      <div className="bike-head">
        <div>
          <h2>{name}</h2>
          <p className="sub">
            {wax?.since ? `Gewaxt ${fmtDate(wax.since)}` : 'Nog niet ingesteld'}
            {backfilling && ' · ritten ophalen…'}
          </p>
        </div>
        {chain && (
          <a className="chev" href={`/onderdeel/${chain.id}`} aria-label={`Details ${name}`}>
            ›
          </a>
        )}
      </div>

      {chain && wax && (
        <>
          <a className="hero" href={`/onderdeel/${chain.id}`}>
            <Ring pct={((wax.value ?? 0) / wax.threshold) * 100} status={wax.status} />
            <div>
              <div className="hero-label">Kettingwax</div>
              <div className="big">
                {nl(wax.value ?? 0)}
                <small>/ {nl(wax.threshold)} wax-km</small>
              </div>
              {wax.status !== 'ok' && <span className={`pill ${wax.status}`}>{WAX_LABEL[wax.status]}</span>}
            </div>
          </a>

          <div className="stats">
            <a className="stat" href={`/onderdeel/${chain.id}#meten`}>
              <div className="stat-label">Slijtage</div>
              <div className={`stat-value ${wear?.status === 'warning' || wear?.status === 'due' ? wear.status : ''}`}>{wear?.value != null ? `${nl(wear.value, 2)}%` : 'Meten'}</div>
              {wear && <MiniBar value={wear.value} threshold={wear.threshold} status={wear.status} />}
            </a>
            <a className="stat" href={`/onderdeel/${chain.id}#meten`}>
              <div className="stat-label">Meten over</div>
              <div className={`stat-value ${measure?.status === 'due' ? 'warning' : ''}`}>
                {measure ? (measure.status === 'due' || wear?.value == null ? 'Nu' : <>{nl(Math.max(0, measure.threshold - (measure.value ?? 0)))}<small>km</small></>) : '—'}
              </div>
              {measure && <MiniBar value={measure.value} threshold={measure.threshold} status={measure.status} />}
            </a>
            {cassette && life ? (
              <a className="stat" href={`/onderdeel/${cassette.id}`}>
                <div className="stat-label">Cassette</div>
                <div className={`stat-value ${life.status === 'warning' || life.status === 'due' ? life.status : ''}`}>{nl(life.value ?? 0)}<small>km</small></div>
                <MiniBar value={life.value} threshold={life.threshold} status={life.status} />
              </a>
            ) : (
              <div className="stat">
                <div className="stat-label">Cassette</div>
                <div className="stat-value muted">—</div>
              </div>
            )}
          </div>

          {wax.breakdown.wet.rides + wax.breakdown.indoor.rides + wax.breakdown.unknown.rides > 0 && (
            <p className="meta">
              {[
                wax.breakdown.wet.rides > 0 && `${wax.breakdown.wet.rides} nat ×3`,
                wax.breakdown.indoor.rides > 0 && `${wax.breakdown.indoor.rides} indoor ×0,3`,
                wax.breakdown.unknown.rides > 0 && `${wax.breakdown.unknown.rides} zonder weerdata`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div className="actions">
            <form action={markWaxed}>
              <input type="hidden" name="componentId" value={chain.id} />
              <button type="submit">Gewaxt ✓</button>
            </form>
            <a className="btn secondary" href={`/onderdeel/${chain.id}`}>Details</a>
          </div>
        </>
      )}

      {children}
    </section>
  )
}
