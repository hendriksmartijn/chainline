import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decrypt, encrypt } from './crypto'

const key = randomBytes(32).toString('base64')

describe('crypto', () => {
  it('round-trips', () => {
    expect(decrypt(encrypt('geheim-token', key), key)).toBe('geheim-token')
  })
  it('gebruikt elke keer een nieuwe IV', () => {
    expect(encrypt('x', key)).not.toBe(encrypt('x', key))
  })
  it('weigert gemanipuleerde ciphertext', () => {
    const parts = encrypt('geheim-token', key).split('.')
    parts[3] = Buffer.from('ander').toString('base64url')
    expect(() => decrypt(parts.join('.'), key)).toThrow()
  })
  it('weigert een verkeerde sleutel', () => {
    expect(() => decrypt(encrypt('x', key), randomBytes(32).toString('base64'))).toThrow()
  })
})
