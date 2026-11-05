import type { NotificationKind } from '@/db/schema'
import type { ComponentState, WeatherClass } from './types'

export interface NotificationCandidate {
  kind: NotificationKind
  ruleId: string
  /** Samen met componentId + kind uniek: zo krijg je per cyclus maar één melding. */
  cycleKey: string
}

/**
 * Welke directe pushes zijn nu terecht? Alleen bij "actie nodig" (zie CLAUDE.md):
 * wax-drempel, vroege wax-waarschuwing, natte rit, en ketting over de slijtagegrens.
 * Meetherinneringen en levensduur-km gaan naar de (latere) wekelijkse garage-check.
 * Dedupe gebeurt in de database, dus dit mag idempotent herhaald worden.
 */
export function decideNotifications(
  state: ComponentState,
  trigger?: { activityId: string; cls: WeatherClass },
): NotificationCandidate[] {
  const out: NotificationCandidate[] = []
  for (const r of state.rules) {
    if (r.status === 'not_mounted') continue
    const cycle = r.cycleEventId ?? 'none'

    if (r.type === 'wax_km') {
      // Alleen de zwaarste: sprong je in één rit van ok naar due, dan geen losse waarschuwing meer.
      if (r.status === 'due') out.push({ kind: 'wax_due', ruleId: r.ruleId, cycleKey: cycle })
      else if (r.status === 'warning') out.push({ kind: 'wax_warning', ruleId: r.ruleId, cycleKey: cycle })
      if (trigger?.cls === 'wet' && r.countedActivityIds.includes(trigger.activityId)) {
        out.push({ kind: 'wet_ride', ruleId: r.ruleId, cycleKey: `activity:${trigger.activityId}` })
      }
    }

    if (r.type === 'measurement' && r.status === 'due') {
      out.push({ kind: 'chain_worn', ruleId: r.ruleId, cycleKey: cycle })
    }
  }
  return out
}

/** Een eerder verstuurde 'due' maakt een 'warning' in dezelfde cyclus overbodig. */
export function suppressedBy(kind: NotificationKind): NotificationKind[] {
  return kind === 'wax_warning' ? ['wax_due'] : []
}
