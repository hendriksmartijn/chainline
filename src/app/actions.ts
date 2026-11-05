'use server'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { db, schema } from '@/db'
import { getSessionAthleteId } from '@/lib/session'
import { createMountedComponent, getOwnedBike, getOwnedComponent, recordEvent } from '@/server/components'
import { enqueueJob, processJob } from '@/server/jobs'
import { componentsOnGear, loadComponentStates, oldestRelevantDate } from '@/server/state'
import { evaluateAndNotify, syncBikes } from '@/server/sync'

async function requireAthlete() {
  const id = await getSessionAthleteId()
  if (!id) redirect('/')
  return id
}

const pastDate = z.iso.datetime().transform((s) => new Date(s)).refine((d) => d.getTime() <= Date.now() + 60_000, 'datum in de toekomst')
const optionalPastDate = z.union([z.literal(''), z.null(), pastDate]).transform((v) => (v instanceof Date ? v : null))
const uuid = z.uuid()

/** Datum van vandaag (of niets) = nu; een datum in het verleden = begin van die dag. */
function eventTime(d: Date | null): Date {
  if (!d) return new Date()
  return Date.now() - d.getTime() < 86_400_000 ? new Date() : d
}

/** Haalt ritten op vanaf `since`, maar alleen als die ouder is dan wat we al hadden. */
async function backfillIfOlder(athleteId: number, since: Date, previousOldest: Date | null) {
  if (previousOldest && previousOldest.getTime() <= since.getTime()) return
  const jobId = await enqueueJob('backfill', athleteId, { afterEpoch: Math.floor(since.getTime() / 1000) - 1, page: 1 })
  after(() => processJob(jobId))
}

async function hasCurrent(athleteId: number, gearId: string, type: 'chain' | 'cassette') {
  return componentsOnGear(await loadComponentStates(athleteId), gearId).some((c) => c.type === type)
}

/** Onboarding ketting: "wanneer heb je je ketting laatst gewaxt?" → ketting + regels + events + backfill. */
export async function setupChain(formData: FormData) {
  const athleteId = await requireAthlete()
  const bike = await getOwnedBike(athleteId, uuid.parse(formData.get('bikeId')))
  if (!bike) throw new Error('Fiets niet gevonden')
  const at = pastDate.parse(formData.get('at'))
  if (await hasCurrent(athleteId, bike.gearId, 'chain')) redirect('/')

  const previousOldest = await oldestRelevantDate(athleteId)
  await createMountedComponent({ athleteId, bikeId: bike.id, type: 'chain', mountedAt: at, waxedAt: at, unknownHistory: true, source: 'onboarding' })
  await backfillIfOlder(athleteId, at, previousOldest)
  revalidatePath('/')
  redirect('/')
}

/** Cassette toevoegen: montagedatum (standaard), "km bekend" of "geen idee". */
export async function addCassette(formData: FormData) {
  const athleteId = await requireAthlete()
  const bike = await getOwnedBike(athleteId, uuid.parse(formData.get('bikeId')))
  if (!bike) throw new Error('Fiets niet gevonden')
  const mode = z.enum(['date', 'km', 'unknown']).parse(formData.get('mode'))
  if (await hasCurrent(athleteId, bike.gearId, 'cassette')) redirect('/')

  const previousOldest = await oldestRelevantDate(athleteId)
  if (mode === 'date') {
    const at = pastDate.parse(formData.get('at'))
    await createMountedComponent({ athleteId, bikeId: bike.id, type: 'cassette', mountedAt: at, unknownHistory: false, source: 'onboarding' })
    await backfillIfOlder(athleteId, at, previousOldest)
  } else {
    const initialKm = mode === 'km' ? z.coerce.number().min(0).max(200_000).parse(formData.get('km')) : undefined
    await createMountedComponent({ athleteId, bikeId: bike.id, type: 'cassette', mountedAt: new Date(), initialKm, unknownHistory: mode === 'unknown', source: 'onboarding' })
  }
  revalidatePath('/')
  redirect('/')
}

export async function markWaxed(formData: FormData) {
  const athleteId = await requireAthlete()
  const componentId = uuid.parse(formData.get('componentId'))
  await recordEvent(athleteId, componentId, 'waxed', eventTime(optionalPastDate.parse(formData.get('at'))), 'user')
  revalidatePath('/')
  redirect('/?gewaxt=1')
}

/** Kettingmeting in %. Over de grens → push via evaluateAndNotify. */
export async function recordMeasurement(formData: FormData) {
  const athleteId = await requireAthlete()
  const componentId = uuid.parse(formData.get('componentId'))
  const value = z.coerce.number().min(0).max(2).parse(String(formData.get('value') ?? '').replace(',', '.'))
  await recordEvent(athleteId, componentId, 'measured', eventTime(optionalPastDate.parse(formData.get('at'))), 'user', value)
  after(() => evaluateAndNotify(athleteId))
  revalidatePath('/')
  redirect(`/onderdeel/${componentId}?gemeten=1`)
}

/**
 * Onderdeel vervangen: het oude krijgt een replaced-event (afgedankt, historie blijft),
 * het nieuwe wordt op dezelfde fiets gemonteerd met dezelfde drempels.
 */
export async function replaceComponent(formData: FormData) {
  const athleteId = await requireAthlete()
  const componentId = uuid.parse(formData.get('componentId'))
  const old = await getOwnedComponent(athleteId, componentId)
  if (!old || (old.type !== 'chain' && old.type !== 'cassette')) throw new Error('Onderdeel niet gevonden')
  const at = eventTime(optionalPastDate.parse(formData.get('at')))
  const prewaxed = formData.get('prewaxed') === 'on'

  const view = (await loadComponentStates(athleteId)).find((c) => c.id === componentId)
  const gearId = view?.state.currentGearId
  if (!gearId) throw new Error('Onderdeel zit niet op een fiets')
  const [bike] = await db().select().from(schema.bikes).where(and(eq(schema.bikes.athleteId, athleteId), eq(schema.bikes.gearId, gearId)))
  if (!bike) throw new Error('Fiets niet gevonden')

  const oldRules = await db().select().from(schema.rules).where(eq(schema.rules.componentId, componentId))
  await db().insert(schema.events).values({ athleteId, componentId, type: 'replaced', occurredAt: at, source: 'user' })
  const newId = await createMountedComponent({
    athleteId,
    bikeId: bike.id,
    type: old.type,
    mountedAt: at,
    unknownHistory: false,
    waxedAt: old.type === 'chain' && prewaxed ? at : undefined,
    rules: oldRules.map((r) => ({ type: r.type as 'wax_km' | 'km' | 'measurement', threshold: r.threshold, warningMargin: r.warningMargin, resetOn: r.resetOn as 'waxed' | 'measured' | null, countIndoor: r.countIndoor })),
  })
  revalidatePath('/')
  redirect(`/onderdeel/${newId}?vervangen=1`)
}

/** Drempel en marge per regel aanpassen. Alles wordt direct opnieuw afgeleid. */
export async function updateRule(formData: FormData) {
  const athleteId = await requireAthlete()
  const ruleId = uuid.parse(formData.get('ruleId'))
  const num = (k: string) => z.coerce.number().positive().max(1_000_000).parse(String(formData.get(k) ?? '').replace(',', '.'))
  const threshold = num('threshold')
  const warningMargin = Math.min(num('warningMargin'), threshold)

  const [rule] = await db().select().from(schema.rules).where(eq(schema.rules.id, ruleId))
  if (!rule || !(await getOwnedComponent(athleteId, rule.componentId))) throw new Error('Regel niet gevonden')
  await db().update(schema.rules).set({ threshold, warningMargin }).where(eq(schema.rules.id, ruleId))
  after(() => evaluateAndNotify(athleteId))
  revalidatePath('/')
  redirect(`/onderdeel/${rule.componentId}?opgeslagen=1`)
}

/** Vangnet: Strava stuurt geen webhook bij elke gear-wissel. Haalt fietsen en ritten opnieuw op. */
export async function resync() {
  const athleteId = await requireAthlete()
  await syncBikes(athleteId)
  const since = await oldestRelevantDate(athleteId)
  if (since) {
    const jobId = await enqueueJob('backfill', athleteId, { afterEpoch: Math.floor(since.getTime() / 1000) - 1, page: 1 })
    after(() => processJob(jobId))
  }
  revalidatePath('/')
  redirect('/?ververst=1')
}
