import { describe, expect, it } from 'vitest'
import { waxConfig } from '@/config'
import { deriveChainState } from './chain'
import { classifyActivity } from './classify'
import type { ActivityInput, ComponentEventInput, WaxKmRule } from './types'

const rule: WaxKmRule = { type: 'wax_km', threshold: 400, warningMargin: 100 }
const NOW = new Date('2026-11-05T12:00:00Z')
const d = (s: string) => new Date(s)

let seq = 0
function ride(p: Partial<ActivityInput> & { km: number; at: string }): ActivityInput {
  return {
    id: String(++seq),
    gearId: 'b1',
    startDate: d(p.at),
    distanceM: p.km * 1000,
    sportType: 'Ride',
    trainer: false,
    hasLocation: true,
    precipitationMm: 0,
    ...p,
  }
}

const mounted = (at: string, gearId = 'b1', id = `m-${at}`): ComponentEventInput => ({ id, type: 'mounted', occurredAt: d(at), gearId })
const waxed = (at: string, id = `w-${at}`): ComponentEventInput => ({ id, type: 'waxed', occurredAt: d(at) })

describe('classifyActivity', () => {
  it('droog onder de nat-drempel', () => {
    expect(classifyActivity(ride({ km: 1, at: '2026-11-01T08:00:00Z', precipitationMm: 0.4 }), waxConfig)).toBe('dry')
  })
  it('nat vanaf de drempel (inclusief)', () => {
    expect(classifyActivity(ride({ km: 1, at: '2026-11-01T08:00:00Z', precipitationMm: 0.5 }), waxConfig)).toBe('wet')
  })
  it('VirtualRide is indoor, ook met gear en neerslag', () => {
    expect(classifyActivity(ride({ km: 1, at: '2026-11-01T08:00:00Z', sportType: 'VirtualRide', precipitationMm: 5 }), waxConfig)).toBe('indoor')
  })
  it('trainer-flag is indoor, ongeacht sport type', () => {
    expect(classifyActivity(ride({ km: 1, at: '2026-11-01T08:00:00Z', trainer: true }), waxConfig)).toBe('indoor')
  })
  it('zonder locatie of weer: unknown', () => {
    expect(classifyActivity(ride({ km: 1, at: '2026-11-01T08:00:00Z', hasLocation: false }), waxConfig)).toBe('unknown')
    expect(classifyActivity(ride({ km: 1, at: '2026-11-01T08:00:00Z', precipitationMm: null }), waxConfig)).toBe('unknown')
  })
})

describe('deriveChainState', () => {
  const base = [mounted('2026-10-01T00:00:00Z'), waxed('2026-10-01T00:00:00Z')]

  it('weegt droog ×1, nat ×3, indoor ×0.3', () => {
    const s = deriveChainState(
      base,
      [
        ride({ km: 100, at: '2026-10-02T08:00:00Z' }),
        ride({ km: 50, at: '2026-10-03T08:00:00Z', precipitationMm: 2 }),
        ride({ km: 40, at: '2026-10-04T18:00:00Z', sportType: 'VirtualRide' }),
      ],
      rule,
      waxConfig,
      NOW,
    )
    expect(s.waxKm).toBeCloseTo(100 + 150 + 12)
    expect(s.breakdown.wet).toEqual({ rides: 1, km: 50, waxKm: 150 })
    expect(s.status).toBe('ok')
  })

  it('telt alleen ritten na de laatste wax', () => {
    const s = deriveChainState(
      [...base, waxed('2026-10-10T00:00:00Z')],
      [ride({ km: 300, at: '2026-10-05T08:00:00Z' }), ride({ km: 20, at: '2026-10-11T08:00:00Z' })],
      rule,
      waxConfig,
      NOW,
    )
    expect(s.waxKm).toBe(20)
    expect(s.lastWaxedAt).toEqual(d('2026-10-10T00:00:00Z'))
  })

  it('rit die precies op het wax-moment start telt mee in de nieuwe cyclus', () => {
    const s = deriveChainState(base, [ride({ km: 10, at: '2026-10-01T00:00:00Z' })], rule, waxConfig, NOW)
    expect(s.waxKm).toBe(10)
  })

  it('negeert ritten op een andere fiets en ritten zonder gear', () => {
    const s = deriveChainState(
      base,
      [ride({ km: 50, at: '2026-10-02T08:00:00Z', gearId: 'b2' }), ride({ km: 50, at: '2026-10-02T09:00:00Z', gearId: null })],
      rule,
      waxConfig,
      NOW,
    )
    expect(s.waxKm).toBe(0)
  })

  it('wax-event met terugwerkende kracht herberekent de stand', () => {
    const rides = [ride({ km: 200, at: '2026-10-05T08:00:00Z' }), ride({ km: 150, at: '2026-10-20T08:00:00Z' })]
    expect(deriveChainState(base, rides, rule, waxConfig, NOW).waxKm).toBe(350)
    // Later ingevuld: "ik had op 15 oktober al gewaxt"
    expect(deriveChainState([...base, waxed('2026-10-15T00:00:00Z')], rides, rule, waxConfig, NOW).waxKm).toBe(150)
  })

  it('gear-wissel achteraf in Strava: rit telt mee zodra gear_id klopt', () => {
    const r = ride({ km: 80, at: '2026-10-02T08:00:00Z', gearId: 'b2' })
    expect(deriveChainState(base, [r], rule, waxConfig, NOW).waxKm).toBe(0)
    expect(deriveChainState(base, [{ ...r, gearId: 'b1' }], rule, waxConfig, NOW).waxKm).toBe(80)
  })

  it('andere factoren in config → hele historie opnieuw afgeleid', () => {
    const rides = [ride({ km: 100, at: '2026-10-02T08:00:00Z', precipitationMm: 3 })]
    const custom = { ...waxConfig, factors: { ...waxConfig.factors, wet: 2 } }
    expect(deriveChainState(base, rides, rule, custom, NOW).waxKm).toBe(200)
  })

  it('volgt de ketting over fietsen heen via mount-periodes', () => {
    const events = [
      ...base,
      mounted('2026-10-10T00:00:00Z', 'b2'), // impliciet van b1 af
    ]
    const s = deriveChainState(
      events,
      [
        ride({ km: 10, at: '2026-10-05T08:00:00Z', gearId: 'b1' }), // telt
        ride({ km: 20, at: '2026-10-12T08:00:00Z', gearId: 'b1' }), // ketting zat niet meer op b1
        ride({ km: 30, at: '2026-10-12T09:00:00Z', gearId: 'b2' }), // telt
      ],
      rule,
      waxConfig,
      NOW,
    )
    expect(s.waxKm).toBe(40)
    expect(s.currentGearId).toBe('b2')
    expect(s.mountPeriods).toHaveLength(2)
  })

  it('not_mounted na unmounted', () => {
    const s = deriveChainState([...base, { id: 'u', type: 'unmounted', occurredAt: d('2026-10-10T00:00:00Z') }], [], rule, waxConfig, NOW)
    expect(s.status).toBe('not_mounted')
  })

  it('status warning vanaf drempel − marge, due vanaf drempel', () => {
    const at = '2026-10-02T08:00:00Z'
    expect(deriveChainState(base, [ride({ km: 299.9, at })], rule, waxConfig, NOW).status).toBe('ok')
    expect(deriveChainState(base, [ride({ km: 300, at })], rule, waxConfig, NOW).status).toBe('warning')
    expect(deriveChainState(base, [ride({ km: 400, at })], rule, waxConfig, NOW).status).toBe('due')
  })

  it('nooit gewaxt: telt vanaf eerste montage', () => {
    const s = deriveChainState([mounted('2026-10-01T00:00:00Z')], [ride({ km: 25, at: '2026-10-02T08:00:00Z' })], rule, waxConfig, NOW)
    expect(s.waxKm).toBe(25)
    expect(s.lastWaxedAt).toBeNull()
  })

  it('negeert events en ritten in de toekomst', () => {
    const s = deriveChainState(
      [...base, waxed('2026-12-01T00:00:00Z')],
      [ride({ km: 10, at: '2026-10-02T08:00:00Z' }), ride({ km: 99, at: '2026-12-02T08:00:00Z' })],
      rule,
      waxConfig,
      NOW,
    )
    expect(s.waxKm).toBe(10)
  })
})
