import { describe, expect, it } from 'vitest'
import { waxConfig } from '@/config'
import { deriveComponentState } from './component'
import { decideNotifications } from './notifications'
import type { ActivityInput, ComponentEventInput, RuleInput } from './types'

const rules: RuleInput[] = [
  { id: 'wax', type: 'wax_km', threshold: 400, warningMargin: 100, resetOn: 'waxed' },
  { id: 'wear', type: 'measurement', threshold: 0.5, warningMargin: 0.1, resetOn: null },
  { id: 'meet', type: 'km', threshold: 1000, warningMargin: 100, resetOn: 'measured' },
]
const base: ComponentEventInput[] = [
  { id: 'm', type: 'mounted', occurredAt: new Date('2026-10-01T00:00:00Z'), gearId: 'b1' },
  { id: 'w1', type: 'waxed', occurredAt: new Date('2026-10-01T00:00:00Z') },
]
const r = (id: string, km: number, mm = 0): ActivityInput => ({
  id, gearId: 'b1', startDate: new Date('2026-10-02T08:00:00Z'), distanceM: km * 1000,
  sportType: 'Ride', trainer: false, hasLocation: true, precipitationMm: mm,
})
const state = (rides: ActivityInput[], extra: ComponentEventInput[] = []) =>
  deriveComponentState([...base, ...extra], rides, rules, waxConfig, new Date('2026-11-01T00:00:00Z'))

describe('decideNotifications', () => {
  it('niets bij ok', () => {
    expect(decideNotifications(state([r('1', 100)]))).toEqual([])
  })
  it('wax-warning met de wax-cyclus als key', () => {
    expect(decideNotifications(state([r('1', 320)]))).toEqual([{ kind: 'wax_warning', ruleId: 'wax', cycleKey: 'w1' }])
  })
  it('alleen wax_due bij sprong over beide drempels', () => {
    expect(decideNotifications(state([r('1', 450)]))).toEqual([{ kind: 'wax_due', ruleId: 'wax', cycleKey: 'w1' }])
  })
  it('natte rit geeft een check-melding per rit', () => {
    expect(decideNotifications(state([r('7', 10, 3)]), { activityId: '7', cls: 'wet' })).toEqual([
      { kind: 'wet_ride', ruleId: 'wax', cycleKey: 'activity:7' },
    ])
  })
  it('geen natte-rit-melding als de rit niet op dit onderdeel telt', () => {
    expect(decideNotifications(state([]), { activityId: '7', cls: 'wet' })).toEqual([])
  })
  it('ketting over de slijtagegrens: push per meting', () => {
    const extra: ComponentEventInput[] = [{ id: 'ms1', type: 'measured', occurredAt: new Date('2026-10-20T00:00:00Z'), value: 0.55 }]
    expect(decideNotifications(state([], extra))).toEqual([{ kind: 'chain_worn', ruleId: 'wear', cycleKey: 'ms1' }])
  })
  it('meetherinnering en waarschuwing-slijtage geven geen push (garage-check)', () => {
    const extra: ComponentEventInput[] = [{ id: 'ms1', type: 'measured', occurredAt: new Date('2026-10-01T00:00:00Z'), value: 0.45 }]
    const s = state([r('1', 1200)], [...extra, { id: 'w2', type: 'waxed', occurredAt: new Date('2026-10-30T00:00:00Z') }])
    expect(s.rules.find((x) => x.ruleId === 'meet')!.status).toBe('due')
    expect(decideNotifications(s)).toEqual([])
  })
})
