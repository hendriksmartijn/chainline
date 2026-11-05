import 'server-only'
import { and, eq } from 'drizzle-orm'
import { waxConfig } from '@/config'
import { classifyActivity } from '@/core/classify'
import { decideNotifications } from '@/core/notifications'
import { db, schema } from '@/db'
import { getAthlete, listActivities, nearRateLimit, type StravaActivity } from '@/lib/strava'
import { fetchRidePrecipitation } from '@/lib/weather'
import { deliverNotifications } from './push'
import { loadChainStates, toActivityInput } from './state'

/** Fietsen uit Strava overnemen (nieuw → toevoegen, naam/retired bijwerken). */
export async function syncBikes(athleteId: number) {
  const athlete = await getAthlete(athleteId)
  for (const b of athlete.bikes ?? []) {
    await db()
      .insert(schema.bikes)
      .values({ athleteId, gearId: b.id, name: b.name, retired: b.retired ?? false })
      .onConflictDoUpdate({
        target: [schema.bikes.athleteId, schema.bikes.gearId],
        set: { name: b.name, retired: b.retired ?? false },
      })
  }
  return athlete
}

function latLng(a: StravaActivity): [number, number] | null {
  return Array.isArray(a.start_latlng) && a.start_latlng.length === 2 ? [a.start_latlng[0], a.start_latlng[1]] : null
}

/** Rit in de cache zetten, inclusief neerslag. Weer wordt alleen opnieuw opgehaald als tijd of plek wijzigt. */
export async function upsertActivity(athleteId: number, a: StravaActivity) {
  const ll = latLng(a)
  const startDate = new Date(a.start_date)
  const [existing] = await db().select().from(schema.activities).where(eq(schema.activities.id, a.id))

  const sameWeatherInputs =
    existing &&
    existing.weatherFetchedAt &&
    existing.precipitationMm !== null &&
    existing.startDate.getTime() === startDate.getTime() &&
    existing.startLat === (ll?.[0] ?? null) &&
    existing.startLng === (ll?.[1] ?? null)

  const isIndoor = a.trainer || waxConfig.indoorSportTypes.includes(a.sport_type)
  let precipitationMm = sameWeatherInputs ? existing.precipitationMm : null
  let weatherFetchedAt = sameWeatherInputs ? existing.weatherFetchedAt : null
  if (!sameWeatherInputs && ll && !isIndoor) {
    const end = new Date(startDate.getTime() + a.elapsed_time * 1000)
    precipitationMm = await fetchRidePrecipitation(ll[0], ll[1], startDate, end)
    weatherFetchedAt = precipitationMm === null ? null : new Date()
  }

  const values = {
    athleteId,
    gearId: a.gear_id,
    startDate,
    distanceM: a.distance,
    movingTimeS: a.moving_time,
    elapsedTimeS: a.elapsed_time,
    sportType: a.sport_type,
    trainer: a.trainer,
    startLat: ll?.[0] ?? null,
    startLng: ll?.[1] ?? null,
    precipitationMm,
    weatherFetchedAt,
    updatedAt: new Date(),
  }
  const [row] = await db()
    .insert(schema.activities)
    .values({ id: a.id, ...values })
    .onConflictDoUpdate({ target: schema.activities.id, set: values })
    .returning()
  return row!
}

export async function deleteActivity(athleteId: number, activityId: number) {
  await db().delete(schema.activities).where(and(eq(schema.activities.id, activityId), eq(schema.activities.athleteId, athleteId)))
}

/**
 * Staat opnieuw afleiden en terechte pushes versturen.
 * `trigger` = een net binnengekomen rit (voor de natte-rit-melding).
 */
export async function evaluateAndNotify(athleteId: number, trigger?: typeof schema.activities.$inferSelect) {
  const chains = await loadChainStates(athleteId)
  const t = trigger ? { activityId: String(trigger.id), cls: classifyActivity(toActivityInput(trigger), waxConfig) } : undefined
  for (const c of chains) {
    const candidates = decideNotifications(c.state, t)
    await deliverNotifications(athleteId, c.componentId, c.label, candidates, c.state)
  }
}

export interface BackfillCursor {
  afterEpoch: number
  page: number
}

/**
 * Haalt ritten op sinds `afterEpoch`, pagina voor pagina.
 * Geeft een cursor terug als hij moet pauzeren (rate limit), anders null.
 */
export async function backfill(athleteId: number, cursor: BackfillCursor): Promise<BackfillCursor | null> {
  let page = cursor.page
  for (;;) {
    if (nearRateLimit()) return { afterEpoch: cursor.afterEpoch, page }
    const batch = await listActivities(athleteId, cursor.afterEpoch, page)
    // Weer parallel, maar beperkt, om Open-Meteo niet te bestoken.
    for (let i = 0; i < batch.length; i += 5) {
      await Promise.all(batch.slice(i, i + 5).map((a) => upsertActivity(athleteId, a)))
    }
    if (batch.length < 200) return null
    page++
  }
}

/** Deauthorisatie: alles van deze atleet weg (cascade op alle tabellen). */
export async function deleteAthleteData(athleteId: number) {
  await db().delete(schema.athletes).where(eq(schema.athletes.id, athleteId))
  await db().delete(schema.jobs).where(eq(schema.jobs.athleteId, athleteId))
}
