import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()

/** Strava athlete. Tokens altijd versleuteld (zie src/lib/crypto.ts). */
export const athletes = pgTable('athletes', {
  id: bigint('id', { mode: 'number' }).primaryKey(), // Strava athlete id
  firstname: text('firstname'),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  expiresAt: ts('expires_at').notNull(),
  scope: text('scope').notNull(),
  createdAt: createdAt(),
})

export const bikes = pgTable(
  'bikes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: bigint('athlete_id', { mode: 'number' })
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    gearId: text('gear_id').notNull(),
    name: text('name').notNull(),
    retired: boolean('retired').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('bikes_athlete_gear').on(t.athleteId, t.gearId)],
)

export const componentTypes = ['chain', 'cassette', 'tyre_front', 'tyre_rear', 'wheelset', 'chainring'] as const
export type ComponentType = (typeof componentTypes)[number]

/** Bestaat zelfstandig; welke fiets hij op zit volgt uit mounted/unmounted-events. */
export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  athleteId: bigint('athlete_id', { mode: 'number' })
    .notNull()
    .references(() => athletes.id, { onDelete: 'cascade' }),
  type: text('type').$type<ComponentType>().notNull(),
  label: text('label').notNull(),
  /** Historie vóór de eerste mount is onbekend (gebruiker koos "geen idee"/laatste wax-datum). */
  unknownHistory: boolean('unknown_history').notNull().default(false),
  createdAt: createdAt(),
})

export const eventTypes = ['mounted', 'unmounted', 'waxed', 'measured', 'sealant_refilled', 'replaced'] as const
export type EventType = (typeof eventTypes)[number]

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: bigint('athlete_id', { mode: 'number' })
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    type: text('type').$type<EventType>().notNull(),
    /** Alleen bij mounted. */
    bikeId: uuid('bike_id').references(() => bikes.id, { onDelete: 'set null' }),
    /** Mag in het verleden liggen: alles is met terugwerkende kracht te corrigeren. */
    occurredAt: ts('occurred_at').notNull(),
    /** Slijtage in % bij measured; km die er al op zaten bij mounted ("km bekend"). */
    value: real('value'),
    source: text('source').$type<'user' | 'push' | 'onboarding'>().notNull().default('user'),
    createdAt: createdAt(),
  },
  (t) => [index('events_component').on(t.componentId, t.occurredAt)],
)

export const ruleTypes = ['km', 'wax_km', 'days', 'hours', 'measurement'] as const
export type RuleType = (typeof ruleTypes)[number]

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  componentId: uuid('component_id')
    .notNull()
    .references(() => components.id, { onDelete: 'cascade' }),
  type: text('type').$type<RuleType>().notNull(),
  threshold: real('threshold').notNull(),
  warningMargin: real('warning_margin').notNull(),
  /**
   * Welk event de teller op 0 zet: 'waxed' voor wax-km, 'measured' voor de meetherinnering.
   * null = telt vanaf montage (levensduur van het onderdeel).
   */
  resetOn: text('reset_on').$type<ResetEvent>(),
})

export type ResetEvent = 'waxed' | 'measured' | 'sealant_refilled'

export type WeatherClass = 'dry' | 'wet' | 'indoor' | 'unknown'

/** Minimale cache van Strava-ritten. */
export const activities = pgTable(
  'activities',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(), // Strava activity id
    athleteId: bigint('athlete_id', { mode: 'number' })
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    gearId: text('gear_id'),
    startDate: ts('start_date').notNull(),
    distanceM: real('distance_m').notNull(),
    movingTimeS: integer('moving_time_s').notNull(),
    elapsedTimeS: integer('elapsed_time_s').notNull(),
    sportType: text('sport_type').notNull(),
    trainer: boolean('trainer').notNull().default(false),
    startLat: real('start_lat'),
    startLng: real('start_lng'),
    /** null = (nog) niet opgehaald. */
    precipitationMm: real('precipitation_mm'),
    weatherFetchedAt: ts('weather_fetched_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('activities_athlete_start').on(t.athleteId, t.startDate)],
)

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  athleteId: bigint('athlete_id', { mode: 'number' })
    .notNull()
    .references(() => athletes.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: createdAt(),
})

export type NotificationKind = 'wax_warning' | 'wax_due' | 'wet_ride' | 'chain_worn'

/** Dedupe van pushes: één per component + soort + cyclus (laatste wax-event, of rit-id). */
export const notificationsSent = pgTable(
  'notifications_sent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: bigint('athlete_id', { mode: 'number' })
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    cycleKey: text('cycle_key').notNull(),
    sentAt: ts('sent_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notifications_dedupe').on(t.componentId, t.kind, t.cycleKey)],
)

export type JobKind = 'strava_webhook' | 'backfill'

/** Vangnet voor asynchrone verwerking: wat after() niet afmaakt, pakt de cron op. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<JobKind>().notNull(),
    // Geen FK: een deauth-job moet blijven bestaan terwijl de atleet verwijderd wordt.
    athleteId: bigint('athlete_id', { mode: 'number' }).notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').$type<'pending' | 'done' | 'failed'>().notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    runAfter: ts('run_after').notNull().default(sql`now()`),
    createdAt: createdAt(),
    processedAt: ts('processed_at'),
  },
  (t) => [index('jobs_pending').on(t.status, t.runAfter)],
)
