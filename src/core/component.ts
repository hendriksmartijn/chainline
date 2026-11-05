import type { WaxConfig } from '@/config'
import { waxKmFor } from './classify'
import { isInPeriods, mountPeriods, sortEvents } from './mounts'
import type { ActivityInput, Breakdown, ComponentEventInput, ComponentState, RuleInput, RuleState, RuleStatus } from './types'

const emptyBreakdown = (): Breakdown => ({
  dry: { rides: 0, km: 0, waxKm: 0 },
  wet: { rides: 0, km: 0, waxKm: 0 },
  indoor: { rides: 0, km: 0, waxKm: 0 },
  unknown: { rides: 0, km: 0, waxKm: 0 },
})

function statusFor(value: number | null, threshold: number, warningAt: number): RuleStatus {
  if (value === null) return 'no_data'
  if (value >= threshold) return 'due'
  if (value >= warningAt) return 'warning'
  return 'ok'
}

/**
 * Kern van Chainline: events + ritten → staat per regel. Puur en deterministisch.
 * Er wordt nergens een stand opgeslagen; elke wijziging (rit, gear-wissel,
 * event met terugwerkende kracht, andere factoren) geeft gewoon een nieuwe afleiding.
 *
 * - wax_km: gewogen km (nat/droog/indoor) sinds de laatste reset (wax).
 * - km: echte km sinds de laatste reset, of sinds montage (+ eventuele beginkm).
 * - measurement: de laatste meting in %.
 */
export function deriveComponentState(
  events: ComponentEventInput[],
  activities: ActivityInput[],
  rules: RuleInput[],
  config: WaxConfig,
  now: Date = new Date(),
): ComponentState {
  const past = sortEvents(events).filter((e) => e.occurredAt.getTime() <= now.getTime())
  const periods = mountPeriods(past)
  const firstMount = past.find((e) => e.type === 'mounted') ?? null
  const retired = [...past].reverse().find((e) => e.type === 'replaced') ?? null
  const last = periods.at(-1)
  const currentGearId = last && last.to === null ? last.gearId : null

  const ruleStates = rules.map((rule): RuleState => {
    const warningAt = Math.max(0, rule.threshold - rule.warningMargin)
    const base = { ruleId: rule.id, type: rule.type, resetOn: rule.resetOn, countIndoor: rule.countIndoor !== false, threshold: rule.threshold, warningAt }

    if (rule.type === 'measurement') {
      const m = [...past].reverse().find((e) => e.type === 'measured')
      const value = m && m.type === 'measured' ? m.value : null
      return {
        ...base,
        status: currentGearId ? statusFor(value, rule.threshold, warningAt) : 'not_mounted',
        value,
        since: m?.occurredAt ?? null,
        cycleEventId: m?.id ?? null,
        breakdown: emptyBreakdown(),
        countedActivityIds: [],
      }
    }

    const reset = rule.resetOn ? [...past].reverse().find((e) => e.type === rule.resetOn) ?? null : null
    const since = reset?.occurredAt ?? firstMount?.occurredAt ?? null
    // Beginkm tellen alleen als we nog vanaf de eerste montage tellen (geen reset sindsdien).
    let value = !reset && firstMount?.type === 'mounted' ? firstMount.initialKm ?? 0 : 0
    const breakdown = emptyBreakdown()
    const countedActivityIds: string[] = []

    if (since) {
      for (const a of activities) {
        const t = a.startDate.getTime()
        if (t < since.getTime() || t > now.getTime()) continue
        if (!isInPeriods(a.gearId, a.startDate, periods)) continue
        const r = waxKmFor(a, config)
        if (r.cls === 'indoor' && rule.countIndoor === false) continue
        value += rule.type === 'wax_km' ? r.waxKm : r.km
        breakdown[r.cls].rides += 1
        breakdown[r.cls].km += r.km
        breakdown[r.cls].waxKm += r.waxKm
        countedActivityIds.push(a.id)
      }
    }

    return {
      ...base,
      status: currentGearId ? statusFor(value, rule.threshold, warningAt) : 'not_mounted',
      value,
      since,
      cycleEventId: reset?.id ?? firstMount?.id ?? null,
      breakdown,
      countedActivityIds,
    }
  })

  return {
    currentGearId,
    retiredAt: retired?.occurredAt ?? null,
    mountPeriods: periods,
    firstMountedAt: firstMount?.occurredAt ?? null,
    rules: ruleStates,
  }
}

/** Handig voor UI en meldingen: de regel van een bepaald soort. */
export function findRule(state: ComponentState, type: RuleInput['type'], resetOn?: RuleInput['resetOn']) {
  return state.rules.find((r) => r.type === type && (resetOn === undefined || r.resetOn === resetOn))
}
