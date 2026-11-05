import type { ComponentEventInput, MountPeriod } from './types'

/** Montage-events eerst bij gelijke tijd, zodat "gemonteerd en gewaxt op dezelfde dag" klopt. */
const ORDER: Record<ComponentEventInput['type'], number> = {
  unmounted: 0,
  replaced: 0,
  mounted: 1,
  waxed: 3,
  measured: 4,
  sealant_refilled: 5,
}

export function sortEvents(events: ComponentEventInput[]): ComponentEventInput[] {
  return [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || ORDER[a.type] - ORDER[b.type],
  )
}

/**
 * Bouwt de periodes waarin een component op een fiets zat. Een nieuwe mount
 * op een andere fiets sluit de vorige periode impliciet af; replaced sluit hem definitief.
 */
export function mountPeriods(events: ComponentEventInput[]): MountPeriod[] {
  const periods: MountPeriod[] = []
  let open: MountPeriod | null = null
  for (const e of sortEvents(events)) {
    if (e.type === 'mounted') {
      if (open) open.to = e.occurredAt
      open = { gearId: e.gearId, from: e.occurredAt, to: null }
      periods.push(open)
    } else if ((e.type === 'unmounted' || e.type === 'replaced') && open) {
      open.to = e.occurredAt
      open = null
    }
  }
  return periods
}

export function isInPeriods(gearId: string | null, at: Date, periods: MountPeriod[]): boolean {
  if (!gearId) return false
  const t = at.getTime()
  return periods.some((p) => p.gearId === gearId && p.from.getTime() <= t && (p.to === null || t < p.to.getTime()))
}
