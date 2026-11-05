import { describe, expect, it } from 'vitest'
import { sumPrecipitation } from './weather'

const hourly = {
  time: ['2026-10-01T08:00', '2026-10-01T09:00', '2026-10-01T10:00', '2026-10-01T11:00'],
  precipitation: [5, 0.2, 0.3, 4],
}

describe('sumPrecipitation', () => {
  it('telt uren die overlappen met de rit (waarde op T = uur ervoor)', () => {
    // Rit 08:30–10:15 → uren (08,09], (09,10], (10,11]
    expect(sumPrecipitation(hourly, new Date('2026-10-01T08:30:00Z'), new Date('2026-10-01T10:15:00Z'))).toBe(4.5)
  })
  it('rit die precies op het uur begint telt het voorgaande uur niet', () => {
    expect(sumPrecipitation(hourly, new Date('2026-10-01T08:00:00Z'), new Date('2026-10-01T09:00:00Z'))).toBe(0.2)
  })
  it('null als er geen data is', () => {
    expect(sumPrecipitation({ time: [], precipitation: [] }, new Date(), new Date())).toBeNull()
  })
})
