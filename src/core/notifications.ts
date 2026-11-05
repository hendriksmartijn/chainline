import type { NotificationKind } from '@/db/schema'
import type { ChainState, WeatherClass } from './types'

export interface NotificationCandidate {
  kind: NotificationKind
  /** Samen met componentId + kind uniek: zo krijg je per wax-cyclus maar één waarschuwing. */
  cycleKey: string
}

/**
 * Welke directe pushes zijn nu terecht? Dedupe gebeurt in de database
 * (unique op component + kind + cycleKey), dus dit mag idempotent herhaald worden.
 */
export function decideNotifications(
  state: ChainState,
  trigger?: { activityId: string; cls: WeatherClass },
): NotificationCandidate[] {
  if (state.status === 'not_mounted') return []
  const cycle = state.lastWaxEventId ?? 'never-waxed'
  const out: NotificationCandidate[] = []

  // Alleen de zwaarste: sprong je in één rit van ok naar due, dan geen losse waarschuwing meer.
  if (state.status === 'due') out.push({ kind: 'wax_due', cycleKey: cycle })
  else if (state.status === 'warning') out.push({ kind: 'wax_warning', cycleKey: cycle })

  if (trigger?.cls === 'wet' && state.countedActivityIds.includes(trigger.activityId)) {
    out.push({ kind: 'wet_ride', cycleKey: `activity:${trigger.activityId}` })
  }
  return out
}

/** Een eerder verstuurde 'due' maakt een 'warning' in dezelfde cyclus overbodig. */
export function suppressedBy(kind: NotificationKind): NotificationKind[] {
  return kind === 'wax_warning' ? ['wax_due'] : []
}
