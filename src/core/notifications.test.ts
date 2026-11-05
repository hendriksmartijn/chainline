import { describe, expect, it } from 'vitest'
import { waxConfig } from '@/config'
import { deriveChainState } from './chain'
import { decideNotifications } from './notifications'
import type { ActivityInput, ComponentEventInput } from './types'

const rule = { type: 'wax_km' as const, threshold: 400, warningMargin: 100 }
const events: ComponentEventInput[] = [
  { id: 'm', type: 'mounted', occurredAt: new Date('2026-10-01T00:00:00Z'), gearId: 'b1' },
  { id: 'w1', type: 'waxed', occurredAt: new Date('2026-10-01T00:00:00Z') },
]
const r = (id: string, km: number, mm = 0): ActivityInput => ({
  id, gearId: 'b1', startDate: new Date('2026-10-02T08:00:00Z'), distanceM: km * 1000,
  sportType: 'Ride', trainer: false, hasLocation: true, precipitationMm: mm,
})
const state = (rides: ActivityInput[]) => deriveChainState(events, rides, rule, waxConfig, new Date('2026-11-01T00:00:00Z'))

describe('decideNotifications', () => {
  it('niets bij ok', () => {
    expect(decideNotifications(state([r('1', 100)]))).toEqual([])
  })
  it('warning met de wax-cyclus als key', () => {
    expect(decideNotifications(state([r('1', 320)]))).toEqual([{ kind: 'wax_warning', cycleKey: 'w1' }])
  })
  it('alleen due bij sprong over beide drempels', () => {
    expect(decideNotifications(state([r('1', 450)]))).toEqual([{ kind: 'wax_due', cycleKey: 'w1' }])
  })
  it('natte rit geeft een check-melding per rit', () => {
    expect(decideNotifications(state([r('7', 10, 3)]), { activityId: '7', cls: 'wet' })).toEqual([
      { kind: 'wet_ride', cycleKey: 'activity:7' },
    ])
  })
  it('geen natte-rit-melding als de rit niet op deze ketting telt', () => {
    expect(decideNotifications(state([]), { activityId: '7', cls: 'wet' })).toEqual([])
  })
})
