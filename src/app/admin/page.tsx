import { notFound } from 'next/navigation'
import { env } from '@/env'
import { listSubscriptions, type StravaSubscription } from '@/lib/strava'
import { getAdminAthleteId } from '@/server/admin'
import { subscribeWebhook } from './actions'

export const dynamic = 'force-dynamic'

/** Beheer zonder lokale tooling: webhook-status en aanmelden. */
export default async function Admin({ searchParams }: PageProps<'/admin'>) {
  if (!(await getAdminAthleteId())) notFound()
  const sp = await searchParams
  const e = env()
  const expected = `${e.APP_URL}/api/strava/webhook`

  let subs: StravaSubscription[] = []
  let loadError: string | null = null
  try {
    subs = await listSubscriptions()
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'onbekend'
  }
  const current = subs[0]

  return (
    <main className="stack">
      <h1>Beheer</h1>
      {typeof sp.fout === 'string' && <div className="notice">Aanmelden mislukt: {sp.fout}</div>}
      {typeof sp.aangemeld === 'string' && <div className="notice">Webhook aangemeld (id {sp.aangemeld}).</div>}

      <section className="card stack">
        <h2>Strava-webhook</h2>
        {loadError && <p className="muted">Status ophalen faalde: {loadError}</p>}
        {current ? (
          <>
            <p>
              Actief, id <strong>{current.id}</strong>
              <br />
              <span className="muted">{current.callback_url}</span>
            </p>
            {current.callback_url !== expected && (
              <p className="notice">Let op: de callback wijkt af van {expected}. Verwijder de oude subscription bij Strava en meld opnieuw aan.</p>
            )}
            {e.STRAVA_SUBSCRIPTION_ID !== String(current.id) && (
              <p className="muted">
                Zet <code>STRAVA_SUBSCRIPTION_ID={current.id}</code> in Vercel en redeploy, dan worden events van andere subscriptions genegeerd.
              </p>
            )}
          </>
        ) : (
          !loadError && (
            <form action={subscribeWebhook} className="stack">
              <p className="muted">Nog geen webhook. Aanmelden voor {expected}.</p>
              <button type="submit">Webhook aanmelden</button>
            </form>
          )
        )}
      </section>

      <a href="/" className="muted">← Terug naar garage</a>
    </main>
  )
}
