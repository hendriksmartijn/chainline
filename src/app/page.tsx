import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { setupChain, resync } from '@/app/actions'
import { CassetteSetupForm } from '@/components/CassetteSetupForm'
import { BikeCard } from '@/components/BikeCard'
import { LocalDateInput } from '@/components/LocalDateInput'
import { PushSetup } from '@/components/PushSetup'
import { db, schema } from '@/db'
import { env } from '@/env'
import { getSessionAthleteId } from '@/lib/session'
import { componentsOnGear, loadComponentStates, oldestRelevantDate } from '@/server/state'

export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  sessie: 'De koppeling is verlopen. Probeer het opnieuw.',
  geweigerd: 'Je hebt de koppeling met Strava geannuleerd.',
  scope: 'Chainline heeft toegang nodig tot je ritten (ook privé) en je fietsen. Vink die rechten aan bij het koppelen.',
  'niet-toegestaan': 'Dit Strava-account heeft (nog) geen toegang tot Chainline.',
  code: 'Er ging iets mis bij het koppelen. Probeer het opnieuw.',
  atleet: 'Er ging iets mis bij het koppelen. Probeer het opnieuw.',
}

function Footer(_: { loggedIn: boolean }) {
  return (
    <footer className="muted">
      <span>Powered by Strava</span>
    </footer>
  )
}

export default async function Home({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams
  const athleteId = await getSessionAthleteId()
  const error = typeof sp.fout === 'string' ? ERRORS[sp.fout] : undefined

  if (!athleteId) {
    return (
      <main className="stack">
        <div>
          <h1>Chainline</h1>
          <p className="muted">Weet wanneer je ketting gewaxt moet worden, op basis van je echte ritten. Natte ritten tellen zwaarder, indoor lichter.</p>
        </div>
        {error && <div className="notice">{error}</div>}
        <div>
          {/* Vervang door de officiële "Connect with Strava"-knop uit Strava's brand guidelines (zie README). */}
          <a className="strava-btn" href="/api/auth/strava/login">Connect with Strava</a>
        </div>
        <Footer loggedIn={false} />
      </main>
    )
  }

  const d = db()
  const [athlete] = await d.select().from(schema.athletes).where(eq(schema.athletes.id, athleteId))
  if (!athlete) {
    // Sessie van een verwijderde atleet (bijv. na deauth).
    return (
      <main className="stack">
        <h1>Chainline</h1>
        <p>Je Strava-koppeling is verbroken.</p>
        <a className="strava-btn" href="/api/auth/strava/login">Connect with Strava</a>
        <Footer loggedIn />
      </main>
    )
  }

  const [bikes, comps, pendingBackfill, since] = await Promise.all([
    d.select().from(schema.bikes).where(eq(schema.bikes.athleteId, athleteId)).orderBy(schema.bikes.name),
    loadComponentStates(athleteId),
    d
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.athleteId, athleteId), eq(schema.jobs.kind, 'backfill'), eq(schema.jobs.status, 'pending'))),
    oldestRelevantDate(athleteId),
  ])
  const backfilling = (pendingBackfill[0]?.n ?? 0) > 0
  const [unassigned] = since
    ? await d
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.activities)
        .where(and(eq(schema.activities.athleteId, athleteId), isNull(schema.activities.gearId), gte(schema.activities.startDate, since)))
    : [{ n: 0 }]

  const visibleBikes = bikes.filter((b) => !b.retired || componentsOnGear(comps, b.gearId).length > 0)

  return (
    <main className="stack">
      <header className="page-head">
        <div className="avatar" aria-hidden>{(athlete.firstname ?? 'C').slice(0, 1).toUpperCase()}</div>
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date())}</p>
          <h1>Garage</h1>
        </div>
      </header>

      {sp.gewaxt && <div className="notice">Gewaxt ✓ De teller begint weer bij 0.</div>}
      {sp.ververst && <div className="notice">Fietsen en ritten worden opnieuw opgehaald.</div>}

      <PushSetup vapidPublicKey={env().VAPID_PUBLIC_KEY} />

      {visibleBikes.length === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>Geen fietsen gevonden in je Strava-account. Voeg een fiets toe in Strava en ververs daarna.</p>
        </div>
      )}

      {visibleBikes.map((bike) => {
        const onBike = componentsOnGear(comps, bike.gearId)
        const hasChain = onBike.some((c) => c.type === 'chain')
        const hasCassette = onBike.some((c) => c.type === 'cassette')
        return (
          <BikeCard key={bike.id} name={bike.name} comps={onBike} backfilling={backfilling}>
            {!hasChain && (
              <form action={setupChain} className="stack" style={{ marginTop: 16 }}>
                <input type="hidden" name="bikeId" value={bike.id} />
                <LocalDateInput label="Wanneer heb je je ketting laatst gewaxt?" />
                <button type="submit">Start met tellen</button>
              </form>
            )}
            {hasChain && !hasCassette && (
              <details style={{ marginTop: 12 }}>
                <summary className="muted">Cassette toevoegen</summary>
                <div style={{ marginTop: 8 }}>
                  <CassetteSetupForm bikeId={bike.id} />
                </div>
              </details>
            )}
          </BikeCard>
        )
      })}

      {unassigned && unassigned.n > 0 && (
        <p className="muted">
          {unassigned.n} {unassigned.n === 1 ? 'rit heeft' : 'ritten hebben'} geen fiets in Strava en {unassigned.n === 1 ? 'telt' : 'tellen'} niet mee.
        </p>
      )}

      <form action={resync}>
        <button className="ghost" type="submit" style={{ width: '100%' }}>Ververs vanuit Strava</button>
      </form>

      <Footer loggedIn />
    </main>
  )
}
