'use server'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { defaultRules } from '@/config'
import { db, schema } from '@/db'
import { getSessionAthleteId } from '@/lib/session'
import { enqueueJob, processJob } from '@/server/jobs'
import { loadChainStates, oldestRelevantDate } from '@/server/state'
import { syncBikes } from '@/server/sync'
import { recordWaxed } from '@/server/wax'

async function requireAthlete() {
  const id = await getSessionAthleteId()
  if (!id) redirect('/')
  return id
}

const pastDate = z.iso.datetime().transform((s) => new Date(s)).refine((d) => d.getTime() <= Date.now() + 60_000, 'datum in de toekomst')

async function startBackfill(athleteId: number, since: Date) {
  const jobId = await enqueueJob('backfill', athleteId, { afterEpoch: Math.floor(since.getTime() / 1000) - 1, page: 1 })
  after(() => processJob(jobId))
}

/** Onboarding per fiets: "wanneer heb je je ketting laatst gewaxt?" → ketting + regel + events + backfill. */
export async function setupChain(formData: FormData) {
  const athleteId = await requireAthlete()
  const bikeId = z.uuid().parse(formData.get('bikeId'))
  const at = pastDate.parse(formData.get('at'))

  const [bike] = await db().select().from(schema.bikes).where(and(eq(schema.bikes.id, bikeId), eq(schema.bikes.athleteId, athleteId)))
  if (!bike) throw new Error('Fiets niet gevonden')
  const chains = await loadChainStates(athleteId)
  if (chains.some((c) => c.state.currentGearId === bike.gearId)) redirect('/')

  const componentId = randomUUID()
  // Atomair: geen halve ketting zonder regel of events.
  await db().batch([
    db().insert(schema.components).values({ id: componentId, athleteId, type: 'chain', label: 'Ketting', unknownHistory: true }),
    db().insert(schema.rules).values({ componentId, ...defaultRules.chain }),
    db().insert(schema.events).values([
      { athleteId, componentId, type: 'mounted', bikeId, occurredAt: at, source: 'onboarding' },
      { athleteId, componentId, type: 'waxed', occurredAt: at, source: 'onboarding' },
    ]),
  ])
  await startBackfill(athleteId, at)
  revalidatePath('/')
  redirect('/')
}

export async function markWaxed(formData: FormData) {
  const athleteId = await requireAthlete()
  const componentId = z.uuid().parse(formData.get('componentId'))
  const raw = formData.get('at')
  // Zonder datum (of vandaag) = nu; een datum in het verleden = begin van die dag.
  const parsed = typeof raw === 'string' && raw ? pastDate.parse(raw) : new Date()
  const isToday = new Date().getTime() - parsed.getTime() < 86_400_000
  await recordWaxed(athleteId, componentId, isToday ? new Date() : parsed, 'user')
  revalidatePath('/')
  redirect('/?gewaxt=1')
}

/** Vangnet: Strava stuurt geen webhook bij elke gear-wissel. Haalt fietsen en ritten opnieuw op. */
export async function resync() {
  const athleteId = await requireAthlete()
  await syncBikes(athleteId)
  const since = await oldestRelevantDate(athleteId)
  if (since) await startBackfill(athleteId, since)
  revalidatePath('/')
  redirect('/?ververst=1')
}
