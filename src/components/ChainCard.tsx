import type { ChainView } from '@/server/state'
import { markWaxed } from '@/app/actions'

const STATUS_LABEL = { ok: 'Goed', warning: 'Bijna waxen', due: 'Nu waxen', not_mounted: 'Niet gemonteerd' } as const
const fmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })

export function ChainCard({ chain, backfilling }: { chain: ChainView; backfilling: boolean }) {
  const s = chain.state
  const pct = Math.min(100, (s.waxKm / s.threshold) * 100)
  const wet = s.breakdown.wet.rides
  const unknown = s.breakdown.unknown.rides
  return (
    <div>
      <div className="status-line">
        {chain.label}: {Math.round(s.waxKm)} / {s.threshold} wax-km
      </div>
      <div className="bar" aria-hidden>
        <span className={s.status} style={{ width: `${pct}%` }} />
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>{' '}
        {s.lastWaxedAt && <>Gewaxt {fmt.format(s.lastWaxedAt)}</>}
        {wet > 0 && <> · {wet} natte {wet === 1 ? 'rit' : 'ritten'} (×3)</>}
        {s.breakdown.indoor.rides > 0 && <> · {s.breakdown.indoor.rides} indoor (×0,3)</>}
        {unknown > 0 && <> · {unknown} zonder weerdata</>}
        {backfilling && <> · ritten worden opgehaald…</>}
      </p>
      <div className="actions">
        <form action={markWaxed}>
          <input type="hidden" name="componentId" value={chain.componentId} />
          <button type="submit">Gewaxt ✓</button>
        </form>
        <a className="btn secondary" href={`/wax/${chain.componentId}`}>Andere datum</a>
      </div>
    </div>
  )
}
