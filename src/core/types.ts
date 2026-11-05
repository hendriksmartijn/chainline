/**
 * Domeintypes voor de afleidingslogica. Bewust los van de database:
 * de kern krijgt events + ritten binnen en geeft staat terug, zonder I/O.
 */
import type { ResetEvent, WeatherClass } from '@/db/schema'

export type { ResetEvent, WeatherClass }

export interface ActivityInput {
  id: string
  gearId: string | null
  startDate: Date
  distanceM: number
  sportType: string
  trainer: boolean
  hasLocation: boolean
  /** null = weer niet bekend. */
  precipitationMm: number | null
}

export type ComponentEventInput =
  /** initialKm: km die er al op zaten bij montage ("km bekend"). */
  | { id: string; type: 'mounted'; occurredAt: Date; gearId: string; initialKm?: number }
  | { id: string; type: 'unmounted'; occurredAt: Date }
  /** Onderdeel afgedankt en vervangen door een nieuw exemplaar. */
  | { id: string; type: 'replaced'; occurredAt: Date }
  | { id: string; type: 'waxed'; occurredAt: Date }
  | { id: string; type: 'measured'; occurredAt: Date; value: number }
  | { id: string; type: 'sealant_refilled'; occurredAt: Date }

export interface RuleInput {
  id: string
  type: 'wax_km' | 'km' | 'measurement'
  threshold: number
  warningMargin: number
  /** Event dat de teller op 0 zet; null = vanaf (eerste) montage. */
  resetOn: ResetEvent | null
}

/** no_data: meetregel zonder meting. not_mounted: zit nergens op of is vervangen. */
export type RuleStatus = 'ok' | 'warning' | 'due' | 'no_data' | 'not_mounted'

export interface MountPeriod {
  gearId: string
  from: Date
  /** null = zit er nog op. */
  to: Date | null
}

export type Breakdown = Record<WeatherClass, { rides: number; km: number; waxKm: number }>

export interface RuleState {
  ruleId: string
  type: RuleInput['type']
  resetOn: ResetEvent | null
  status: RuleStatus
  /** wax-km, km of % (meting). null = geen meting. */
  value: number | null
  threshold: number
  warningAt: number
  /** Vanaf wanneer geteld wordt (laatste reset of eerste montage); bij metingen: datum van de meting. */
  since: Date | null
  /** Id van het event waar de huidige cyclus mee begon; basis voor dedupe van meldingen. */
  cycleEventId: string | null
  breakdown: Breakdown
  countedActivityIds: string[]
}

export interface ComponentState {
  currentGearId: string | null
  retiredAt: Date | null
  mountPeriods: MountPeriod[]
  firstMountedAt: Date | null
  rules: RuleState[]
}
