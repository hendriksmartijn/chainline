import { redirect } from 'next/navigation'
import { getSessionAthleteId } from '@/lib/session'
import { getRuleDefaults, ruleKey } from '@/server/settings'
import { saveSettings } from './actions'
import { fieldName, SETTING_FIELDS } from './fields'

export const dynamic = 'force-dynamic'

export default async function Settings({ searchParams }: PageProps<'/instellingen'>) {
  const athleteId = await getSessionAthleteId()
  if (!athleteId) redirect('/')
  const sp = await searchParams
  const defaults = await getRuleDefaults(athleteId)
  const kept = Number(sp.eigen ?? 0)
  const groups = [
    { title: 'Ketting', type: 'chain' as const },
    { title: 'Cassette', type: 'cassette' as const },
  ]

  return (
    <main className="stack">
      <div>
        <p className="eyebrow">Drempels</p>
        <h1>Instellingen</h1>
      </div>

      {typeof sp.fout === 'string' && <div className="notice">Controleer &ldquo;{sp.fout}&rdquo;: de waarschuwing moet kleiner zijn dan de drempel.</div>}
      {sp.opgeslagen && (
        <div className="notice">
          Opgeslagen en opnieuw berekend.
          {kept > 0 && ` ${kept} ${kept === 1 ? 'onderdeel houdt zijn' : 'onderdelen houden hun'} eigen drempel.`}
        </div>
      )}

      <form action={saveSettings} className="stack" style={{ gap: 24 }}>
        {groups.map((g) => (
          <div key={g.type} className="group">
            <p className="group-title">{g.title}</p>
            <div className="list">
              {SETTING_FIELDS.filter((f) => f.componentType === g.type).flatMap((f) => {
                const rule = defaults[f.componentType].find((r) => ruleKey(r) === ruleKey(f))
                if (!rule) return []
                const rows = [
                  <label key={fieldName(f, 'threshold')} className="list-row" style={{ color: 'var(--text)', display: 'flex' }}>
                    <span className="label">{f.title}</span>
                    <input type="number" name={fieldName(f, 'threshold')} defaultValue={rule.threshold} step={f.step} min="0" max={f.max} required inputMode="decimal" aria-label={`${f.title}: ${f.thresholdLabel}`} />
                    <span className="unit">{f.unit}</span>
                  </label>,
                ]
                if (f.marginLabel) {
                  rows.push(
                    <label key={fieldName(f, 'margin')} className="list-row" style={{ color: 'var(--text)', display: 'flex' }}>
                      <span className="label muted" style={{ fontSize: 17 }}>Waarschuwing</span>
                      <input type="number" name={fieldName(f, 'margin')} defaultValue={rule.warningMargin} step={f.step} min="0" max={f.max} required inputMode="decimal" aria-label={`${f.title}: ${f.marginLabel}`} />
                      <span className="unit">{f.unit}</span>
                    </label>,
                  )
                }
                return rows
              })}
            </div>
            <p className="group-foot">
              {SETTING_FIELDS.filter((f) => f.componentType === g.type).map((f) => f.help).join(' ')}
            </p>
          </div>
        ))}
        <button type="submit">Opslaan</button>
        <p className="group-foot" style={{ marginTop: -12 }}>Geldt voor al je fietsen en nieuwe onderdelen. Een eigen drempel per onderdeel blijft staan.</p>
      </form>

      <div className="group">
        <p className="group-title">Account</p>
        <div className="list">
          <form action="/api/auth/logout" method="post" className="list-row">
            <span className="label">Strava gekoppeld</span>
            <button type="submit" className="ghost" style={{ color: 'var(--due)' }}>Uitloggen</button>
          </form>
        </div>
      </div>
    </main>
  )
}
