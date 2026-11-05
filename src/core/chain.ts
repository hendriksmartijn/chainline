import type { WaxConfig } from '@/config'
import { waxKmFor } from './classify'
import { isInPeriods, mountPeriods, sortEvents } from './mounts'
import type { ActivityInput, ChainState, ComponentEventInput, RuleStatus, WaxKmRule } from './types'

/**
 * Kern van Chainline: events + ritten → staat. Puur en deterministisch.
 * Er wordt nergens een stand opgeslagen; elke wijziging (rit, gear-wissel,
 * wax met terugwerkende kracht, andere factoren) geeft gewoon een nieuwe afleiding.
 */
export function deriveChainState(
  events: ComponentEventInput[],
  activities: ActivityInput[],
  rule: WaxKmRule,
  config: WaxConfig,
  now: Date = new Date(),
): ChainState {
  const past = sortEvents(events).filter((e) => e.occurredAt.getTime() <= now.getTime())
  const periods = mountPeriods(past)
  const lastWax = [...past].reverse().find((e) => e.type === 'waxed') ?? null
  const since = lastWax?.occurredAt ?? periods[0]?.from ?? null
  const current = periods.at(-1)
  const currentGearId = current && current.to === null ? current.gearId : null

  const breakdown: ChainState['breakdown'] = {
    dry: { rides: 0, km: 0, waxKm: 0 },
    wet: { rides: 0, km: 0, waxKm: 0 },
    indoor: { rides: 0, km: 0, waxKm: 0 },
    unknown: { rides: 0, km: 0, waxKm: 0 },
  }
  const countedActivityIds: string[] = []
  let waxKm = 0

  if (since) {
    for (const a of activities) {
      if (a.startDate.getTime() < since.getTime() || a.startDate.getTime() > now.getTime()) continue
      if (!isInPeriods(a.gearId, a.startDate, periods)) continue
      const r = waxKmFor(a, config)
      waxKm += r.waxKm
      breakdown[r.cls].rides += 1
      breakdown[r.cls].km += r.km
      breakdown[r.cls].waxKm += r.waxKm
      countedActivityIds.push(a.id)
    }
  }

  const warningAt = Math.max(0, rule.threshold - rule.warningMargin)
  let status: RuleStatus = 'ok'
  if (!currentGearId) status = 'not_mounted'
  else if (waxKm >= rule.threshold) status = 'due'
  else if (waxKm >= warningAt) status = 'warning'

  return {
    status,
    waxKm,
    threshold: rule.threshold,
    warningAt,
    lastWaxedAt: lastWax?.occurredAt ?? null,
    lastWaxEventId: lastWax?.id ?? null,
    currentGearId,
    mountPeriods: periods,
    breakdown,
    countedActivityIds,
  }
}
