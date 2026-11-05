import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: () => { throw new Error('no db in tests') }, schema: {} }))
const { parseRateLimit, secondsToNextQuarter } = await import('./strava')

describe('parseRateLimit', () => {
  it('leest 15-min en dag-waarden', () => {
    const h = new Headers({ 'x-ratelimit-limit': '200,2000', 'x-ratelimit-usage': '34,500' })
    expect(parseRateLimit(h)).toEqual({ shortLimit: 200, dailyLimit: 2000, shortUsage: 34, dailyUsage: 500 })
  })
  it('geeft voorrang aan de read-limiet', () => {
    const h = new Headers({ 'x-ratelimit-limit': '200,2000', 'x-ratelimit-usage': '1,1', 'x-readratelimit-limit': '100,1000', 'x-readratelimit-usage': '99,10' })
    expect(parseRateLimit(h)?.shortUsage).toBe(99)
  })
  it('null zonder headers', () => {
    expect(parseRateLimit(new Headers())).toBeNull()
  })
})

describe('secondsToNextQuarter', () => {
  it('rekent tot het volgende kwartier', () => {
    expect(secondsToNextQuarter(new Date('2026-11-05T10:14:30Z'))).toBe(30)
    expect(secondsToNextQuarter(new Date('2026-11-05T10:15:00Z'))).toBe(900)
  })
})
