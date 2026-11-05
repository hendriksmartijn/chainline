import { redirect } from 'next/navigation'
import { nl } from '@/lib/format'
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

  return (
    <main className="stack">
      <div>
        <h1>Instellingen</h1>
        <p className="muted">Je drempels gelden voor al je fietsen en voor nieuwe onderdelen. Alles wordt direct opnieuw berekend.</p>
      </div>

      {typeof sp.fout === 'string' && <div className="notice">Controleer &ldquo;{sp.fout}&rdquo;: de waarschuwing moet kleiner zijn dan de drempel.</div>}
      {sp.opgeslagen && (
        <div className="notice">
          Opgeslagen.{' '}
          {kept > 0 && <>{kept} {kept === 1 ? 'onderdeel heeft' : 'onderdelen hebben'} een eigen drempel en {kept === 1 ? 'is' : 'zijn'} niet aangepast (zie de onderdeelpagina).</>}
        </div>
      )}

      <form action={saveSettings} className="stack">
        {SETTING_FIELDS.map((f) => {
          const rule = defaults[f.componentType].find((r) => ruleKey(r) === ruleKey(f))
          if (!rule) return null
          return (
            <section key={fieldName(f, 'threshold')} className="card stack">
              <div>
                <h2>{f.title}</h2>
                <p className="muted small">{f.help}</p>
              </div>
              <div className={f.marginLabel ? 'two-col' : ''}>
                <label>
                  {f.thresholdLabel} ({f.unit})
                  <input type="number" name={fieldName(f, 'threshold')} defaultValue={rule.threshold} step={f.step} min="0" max={f.max} required inputMode="decimal" />
                </label>
                {f.marginLabel && (
                  <label>
                    {f.marginLabel} ({f.unit})
                    <input type="number" name={fieldName(f, 'margin')} defaultValue={rule.warningMargin} step={f.step} min="0" max={f.max} required inputMode="decimal" />
                  </label>
                )}
              </div>
              {f.marginLabel && (
                <p className="muted small">Waarschuwing vanaf {nl(rule.threshold - rule.warningMargin, f.unit === '%' ? 2 : 0)} {f.unit}.</p>
              )}
            </section>
          )
        })}
        <button type="submit">Opslaan</button>
      </form>

      <section className="card stack">
        <h2>Account</h2>
        <form action="/api/auth/logout" method="post">
          <button className="secondary" type="submit">Uitloggen</button>
        </form>
      </section>
    </main>
  )
}
