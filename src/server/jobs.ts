import 'server-only'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { planWebhookAction, stravaWebhookEvent } from '@/core/webhook'
import { db, schema } from '@/db'
import { env } from '@/env'
import {
  getAccessToken,
  getActivity,
  StravaNotFoundError,
  StravaRateLimitError,
  StravaUnauthorizedError,
} from '@/lib/strava'
import { backfill, deleteActivity, deleteAthleteData, evaluateAndNotify, upsertActivity, type BackfillCursor } from './sync'

const MAX_ATTEMPTS = 6
/** Natte-rit-melding alleen voor verse ritten, niet bij een late upload van vorige maand. */
const WET_NOTIFY_MAX_AGE_MS = 24 * 3_600_000

type Job = typeof schema.jobs.$inferSelect

export async function enqueueJob(kind: Job['kind'], athleteId: number, payload: unknown): Promise<string> {
  const [row] = await db().insert(schema.jobs).values({ kind, athleteId, payload }).returning({ id: schema.jobs.id })
  return row!.id
}

async function athleteExists(id: number) {
  const [row] = await db().select({ id: schema.athletes.id }).from(schema.athletes).where(eq(schema.athletes.id, id))
  return !!row
}

async function runWebhookJob(job: Job) {
  const action = planWebhookAction(stravaWebhookEvent.parse(job.payload), env().STRAVA_SUBSCRIPTION_ID)
  if (action.kind === 'ignore') return
  if (!(await athleteExists(action.athleteId))) return

  switch (action.kind) {
    case 'upsert_activity': {
      try {
        const a = await getActivity(action.athleteId, action.activityId)
        const row = await upsertActivity(action.athleteId, a)
        const fresh = Date.now() - row.startDate.getTime() < WET_NOTIFY_MAX_AGE_MS
        await evaluateAndNotify(action.athleteId, action.isNew && fresh ? row : undefined)
      } catch (e) {
        if (!(e instanceof StravaNotFoundError)) throw e
        await deleteActivity(action.athleteId, action.activityId)
        await evaluateAndNotify(action.athleteId)
      }
      return
    }
    case 'delete_activity': {
      // Strava ondertekent webhooks niet: verifieer dat de rit echt weg is voordat we iets verwijderen.
      try {
        await getActivity(action.athleteId, action.activityId)
        return // bestaat nog: vervalst of verouderd event
      } catch (e) {
        if (!(e instanceof StravaNotFoundError)) throw e
      }
      await deleteActivity(action.athleteId, action.activityId)
      await evaluateAndNotify(action.athleteId)
      return
    }
    case 'deauthorize': {
      // Verifieer: na een echte deauth werkt de refresh token niet meer.
      try {
        await db().update(schema.athletes).set({ expiresAt: new Date(0) }).where(eq(schema.athletes.id, action.athleteId))
        await getAccessToken(action.athleteId)
        return // token werkt nog → geen echte deauth
      } catch (e) {
        if (!(e instanceof StravaUnauthorizedError)) throw e
      }
      await deleteAthleteData(action.athleteId)
      return
    }
  }
}

async function runBackfillJob(job: Job) {
  if (!(await athleteExists(job.athleteId))) return
  const cursor = job.payload as BackfillCursor
  const next = await backfill(job.athleteId, cursor)
  if (next) {
    // Pauzeren tot het volgende rate-limit-venster; de cron of een volgende run pakt hem op.
    await db().update(schema.jobs).set({ payload: next, runAfter: new Date(Date.now() + 15 * 60_000) }).where(eq(schema.jobs.id, job.id))
    throw new Paused()
  }
  await evaluateAndNotify(job.athleteId)
}

class Paused extends Error {}

/** Verwerkt één job. Claimt hem eerst atomair, zodat after() en de cron niet dubbel werken. */
export async function processJob(jobId: string) {
  const [job] = await db()
    .update(schema.jobs)
    .set({ attempts: sql`${schema.jobs.attempts} + 1`, runAfter: new Date(Date.now() + 5 * 60_000) })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, 'pending'), lte(schema.jobs.runAfter, new Date())))
    .returning()
  if (!job) return

  try {
    if (job.kind === 'strava_webhook') await runWebhookJob(job)
    else await runBackfillJob(job)
    await db().update(schema.jobs).set({ status: 'done', processedAt: new Date(), lastError: null }).where(eq(schema.jobs.id, job.id))
  } catch (e) {
    if (e instanceof Paused) {
      await db().update(schema.jobs).set({ attempts: 0 }).where(eq(schema.jobs.id, job.id))
      return
    }
    const retryIn = e instanceof StravaRateLimitError ? e.retryAfterSeconds * 1000 : 2 ** job.attempts * 60_000
    const failed = job.attempts >= MAX_ATTEMPTS
    console.error(`job ${job.id} faalde (poging ${job.attempts})`, e instanceof Error ? e.message : e)
    await db()
      .update(schema.jobs)
      .set({
        status: failed ? 'failed' : 'pending',
        lastError: e instanceof Error ? e.message.slice(0, 500) : 'onbekend',
        runAfter: new Date(Date.now() + retryIn),
      })
      .where(eq(schema.jobs.id, job.id))
  }
}

export async function processPendingJobs(limit = 25) {
  const pending = await db()
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, 'pending'), lte(schema.jobs.runAfter, new Date())))
    .orderBy(asc(schema.jobs.createdAt))
    .limit(limit)
  for (const j of pending) await processJob(j.id)
  return pending.length
}
