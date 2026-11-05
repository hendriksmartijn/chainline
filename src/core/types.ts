/**
 * Domeintypes voor de afleidingslogica. Bewust los van de database:
 * de kern krijgt events + ritten binnen en geeft staat terug, zonder I/O.
 */
import type { WeatherClass } from '@/db/schema'

export type { WeatherClass }

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
  | { id: string; type: 'mounted'; occurredAt: Date; gearId: string }
  | { id: string; type: 'unmounted'; occurredAt: Date }
  | { id: string; type: 'waxed'; occurredAt: Date }
  | { id: string; type: 'measured'; occurredAt: Date; value: number }
  | { id: string; type: 'replaced' | 'sealant_refilled'; occurredAt: Date }

export interface WaxKmRule {
  type: 'wax_km'
  threshold: number
  warningMargin: number
}

export type RuleStatus = 'ok' | 'warning' | 'due' | 'not_mounted'

export interface MountPeriod {
  gearId: string
  from: Date
  /** null = zit er nog op. */
  to: Date | null
}

export interface ChainState {
  status: RuleStatus
  waxKm: number
  threshold: number
  warningAt: number
  /** null = nooit gewaxt geregistreerd; telt dan vanaf de eerste montage. */
  lastWaxedAt: Date | null
  lastWaxEventId: string | null
  currentGearId: string | null
  mountPeriods: MountPeriod[]
  breakdown: Record<WeatherClass, { rides: number; km: number; waxKm: number }>
  countedActivityIds: string[]
}
