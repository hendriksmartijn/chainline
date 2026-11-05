import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM. Formaat: v1.<iv>.<tag>.<ciphertext> (base64url).
 * De sleutel is 32 bytes, base64-gecodeerd, en staat alleen in env.
 */
export function encrypt(plaintext: string, keyB64: string): string {
  const key = parseKey(keyB64)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

export function decrypt(payload: string, keyB64: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split('.')
  if (version !== 'v1' || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error('Onbekend versleutelingsformaat')
  }
  const decipher = createDecipheriv('aes-256-gcm', parseKey(keyB64), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8')
}

function parseKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY moet 32 bytes (base64) zijn')
  return key
}
