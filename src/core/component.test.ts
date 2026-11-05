import { describe, expect, it } from 'vitest'
import { waxConfig } from '@/config'
import { classifyActivity } from './classify'
import { deriveComponentState } from './component'
import type { ActivityInput, ComponentEventInput, RuleInput } from './types'

const NOW = new Date('2026-11-05T12:00:00Z')
const d = (s: string) => new Date(s)

const wax: RuleInput = { id: 'r-wax', type: 'wax_km', threshold: 400, warningMargin: 100, resetOn: 'waxed' }
const wear: RuleInput = { id: 'r-wear', type: 'measurement', threshold: 0.5, warningMargin: 0.1, resetOn: null }
const measureEvery: RuleInput = { id: 'r-meet', type: 'km', threshold: 1000, warningMargin: 100, resetOn: 'measured' }
const lifetime: RuleInput = { id: 'r-life', type: 'km', threshold: 20000, warningMargin: 2000, resetOn: null }

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

const mounted = (at: string, gearId = 'b1', initialKm?: number): ComponentEventInput => ({ id: `m-${at}-${gearId}`, type: 'mounted', occurredAt: d(at), gearId, initialKm })
const waxed = (at: string): ComponentEventInput => ({ id: `w-${at}`, type: 'waxed', occurredAt: d(at) })
const measured = (at: string, value: number): ComponentEventInput => ({ id: `ms-${at}`, type: 'measured', occurredAt: d(at), value })

/** Helper: waarde en status van één regel. */
function rule(events: ComponentEventInput[], rides: ActivityInput[], r: RuleInput, config = waxConfig) {
  return deriveComponentState(events, rides, [r], config, NOW).rules[0]!
}

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

describe('wax_km-regel', () => {
  const base = [mounted('2026-10-01T00:00:00Z'), waxed('2026-10-01T00:00:00Z')]

  it('weegt droog ×1, nat ×3, indoor ×0.3', () => {
    const s = rule(
      base,
      [
        ride({ km: 100, at: '2026-10-02T08:00:00Z' }),
        ride({ km: 50, at: '2026-10-03T08:00:00Z', precipitationMm: 2 }),
        ride({ km: 40, at: '2026-10-04T18:00:00Z', sportType: 'VirtualRide' }),
      ],
      wax,
    )
    expect(s.value).toBeCloseTo(100 + 150 + 12)
    expect(s.breakdown.wet).toEqual({ rides: 1, km: 50, waxKm: 150 })
    expect(s.status).toBe('ok')
  })

  it('telt alleen ritten na de laatste wax', () => {
    const s = rule([...base, waxed('2026-10-10T00:00:00Z')], [ride({ km: 300, at: '2026-10-05T08:00:00Z' }), ride({ km: 20, at: '2026-10-11T08:00:00Z' })], wax)
    expect(s.value).toBe(20)
    expect(s.since).toEqual(d('2026-10-10T00:00:00Z'))
    expect(s.cycleEventId).toBe('w-2026-10-10T00:00:00Z')
  })

  it('rit die precies op het wax-moment start telt mee in de nieuwe cyclus', () => {
    expect(rule(base, [ride({ km: 10, at: '2026-10-01T00:00:00Z' })], wax).value).toBe(10)
  })

  it('negeert ritten op een andere fiets en ritten zonder gear', () => {
    const s = rule(base, [ride({ km: 50, at: '2026-10-02T08:00:00Z', gearId: 'b2' }), ride({ km: 50, at: '2026-10-02T09:00:00Z', gearId: null })], wax)
    expect(s.value).toBe(0)
  })

  it('wax-event met terugwerkende kracht herberekent de stand', () => {
    const rides = [ride({ km: 200, at: '2026-10-05T08:00:00Z' }), ride({ km: 150, at: '2026-10-20T08:00:00Z' })]
    expect(rule(base, rides, wax).value).toBe(350)
    expect(rule([...base, waxed('2026-10-15T00:00:00Z')], rides, wax).value).toBe(150)
  })

  it('gear-wissel achteraf in Strava: rit telt mee zodra gear_id klopt', () => {
    const r = ride({ km: 80, at: '2026-10-02T08:00:00Z', gearId: 'b2' })
    expect(rule(base, [r], wax).value).toBe(0)
    expect(rule(base, [{ ...r, gearId: 'b1' }], wax).value).toBe(80)
  })

  it('andere factoren in config → hele historie opnieuw afgeleid', () => {
    const custom = { ...waxConfig, factors: { ...waxConfig.factors, wet: 2 } }
    expect(rule(base, [ride({ km: 100, at: '2026-10-02T08:00:00Z', precipitationMm: 3 })], wax, custom).value).toBe(200)
  })

  it('status warning vanaf drempel − marge, due vanaf drempel', () => {
    const at = '2026-10-02T08:00:00Z'
    expect(rule(base, [ride({ km: 299.9, at })], wax).status).toBe('ok')
    expect(rule(base, [ride({ km: 300, at })], wax).status).toBe('warning')
    expect(rule(base, [ride({ km: 400, at })], wax).status).toBe('due')
  })

  it('nooit gewaxt: telt vanaf eerste montage', () => {
    const s = rule([mounted('2026-10-01T00:00:00Z')], [ride({ km: 25, at: '2026-10-02T08:00:00Z' })], wax)
    expect(s.value).toBe(25)
    expect(s.since).toEqual(d('2026-10-01T00:00:00Z'))
  })

  it('negeert events en ritten in de toekomst', () => {
    const s = rule([...base, waxed('2026-12-01T00:00:00Z')], [ride({ km: 10, at: '2026-10-02T08:00:00Z' }), ride({ km: 99, at: '2026-12-02T08:00:00Z' })], wax)
    expect(s.value).toBe(10)
  })
})

describe('montage', () => {
  it('volgt een onderdeel over fietsen heen via mount-periodes', () => {
    const s = deriveComponentState(
      [mounted('2026-10-01T00:00:00Z'), waxed('2026-10-01T00:00:00Z'), mounted('2026-10-10T00:00:00Z', 'b2')],
      [
        ride({ km: 10, at: '2026-10-05T08:00:00Z', gearId: 'b1' }),
        ride({ km: 20, at: '2026-10-12T08:00:00Z', gearId: 'b1' }),
        ride({ km: 30, at: '2026-10-12T09:00:00Z', gearId: 'b2' }),
      ],
      [wax],
      waxConfig,
      NOW,
    )
    expect(s.rules[0]!.value).toBe(40)
    expect(s.currentGearId).toBe('b2')
    expect(s.mountPeriods).toHaveLength(2)
  })

  it('not_mounted na unmounted', () => {
    const s = rule([mounted('2026-10-01T00:00:00Z'), { id: 'u', type: 'unmounted', occurredAt: d('2026-10-10T00:00:00Z') }], [], wax)
    expect(s.status).toBe('not_mounted')
  })

  it('replaced: afgedankt, telt daarna niets meer', () => {
    const s = deriveComponentState(
      [mounted('2026-10-01T00:00:00Z'), { id: 'x', type: 'replaced', occurredAt: d('2026-10-10T00:00:00Z') }],
      [ride({ km: 10, at: '2026-10-05T08:00:00Z' }), ride({ km: 99, at: '2026-10-11T08:00:00Z' })],
      [lifetime],
      waxConfig,
      NOW,
    )
    expect(s.retiredAt).toEqual(d('2026-10-10T00:00:00Z'))
    expect(s.currentGearId).toBeNull()
    expect(s.rules[0]!.value).toBe(10)
    expect(s.rules[0]!.status).toBe('not_mounted')
  })
})

describe('km-regel (echte km)', () => {
  it('levensduur: echte km sinds montage, nat en indoor ongewogen', () => {
    const s = rule(
      [mounted('2026-10-01T00:00:00Z')],
      [ride({ km: 100, at: '2026-10-02T08:00:00Z', precipitationMm: 5 }), ride({ km: 40, at: '2026-10-03T08:00:00Z', sportType: 'VirtualRide' })],
      lifetime,
    )
    expect(s.value).toBe(140)
  })

  it('"km bekend": beginkm tellen mee', () => {
    expect(rule([mounted('2026-10-01T00:00:00Z', 'b1', 12000)], [ride({ km: 100, at: '2026-10-02T08:00:00Z' })], lifetime).value).toBe(12100)
  })

  it('levensduur wordt niet gereset door wax', () => {
    const s = rule([mounted('2026-10-01T00:00:00Z'), waxed('2026-10-10T00:00:00Z')], [ride({ km: 100, at: '2026-10-02T08:00:00Z' }), ride({ km: 50, at: '2026-10-12T08:00:00Z' })], lifetime)
    expect(s.value).toBe(150)
  })

  it('meetherinnering: km sinds laatste meting', () => {
    const events = [mounted('2026-10-01T00:00:00Z'), measured('2026-10-10T00:00:00Z', 0.2)]
    const s = rule(events, [ride({ km: 700, at: '2026-10-05T08:00:00Z' }), ride({ km: 950, at: '2026-10-12T08:00:00Z' })], measureEvery)
    expect(s.value).toBe(950)
    expect(s.status).toBe('warning')
  })

  it('meetherinnering zonder meting telt vanaf montage, beginkm niet na reset', () => {
    const events = [mounted('2026-10-01T00:00:00Z', 'b1', 3000)]
    expect(rule(events, [ride({ km: 10, at: '2026-10-02T08:00:00Z' })], measureEvery).value).toBe(3010)
    expect(rule([...events, measured('2026-10-03T00:00:00Z', 0.3)], [ride({ km: 10, at: '2026-10-04T08:00:00Z' })], measureEvery).value).toBe(10)
  })
})

describe('measurement-regel', () => {
  const base = [mounted('2026-10-01T00:00:00Z')]

  it('no_data zonder meting', () => {
    expect(rule(base, [], wear).status).toBe('no_data')
  })
  it('laatste meting bepaalt de status', () => {
    expect(rule([...base, measured('2026-10-05T00:00:00Z', 0.3)], [], wear).status).toBe('ok')
    expect(rule([...base, measured('2026-10-05T00:00:00Z', 0.42)], [], wear).status).toBe('warning')
    const s = rule([...base, measured('2026-10-05T00:00:00Z', 0.3), measured('2026-10-20T00:00:00Z', 0.55)], [], wear)
    expect(s.status).toBe('due')
    expect(s.value).toBe(0.55)
    expect(s.cycleEventId).toBe('ms-2026-10-20T00:00:00Z')
  })
  it('meting achteraf ingevoerd met eerdere datum telt niet als laatste', () => {
    const s = rule([...base, measured('2026-10-20T00:00:00Z', 0.35), measured('2026-10-05T00:00:00Z', 0.6)], [], wear)
    expect(s.value).toBe(0.35)
  })
})
