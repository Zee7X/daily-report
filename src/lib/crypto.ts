import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, hkdfSync } from 'node:crypto'
import { env } from './env'

// AES-256-GCM untuk token dan secret (PRD bagian 7, Keamanan). Kunci dari ENCRYPTION_KEY.

function masterKey(): Buffer {
  const raw = env.encryptionKey
  if (!raw) throw new Error('ENCRYPTION_KEY is not set. Run `npm run gen:key` and save it in .env')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY harus 32 byte dalam base64')
  return key
}

function subKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey(), Buffer.alloc(0), purpose, 32))
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', subKey('token-encryption'), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split('.')
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unknown ciphertext format')
  const decipher = createDecipheriv('aes-256-gcm', subKey('token-encryption'), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}

export function sign(value: string, purpose: string): string {
  return createHmac('sha256', subKey(`sign:${purpose}`)).update(value).digest('base64url')
}

export function verify(value: string, signature: string, purpose: string): boolean {
  const expected = Buffer.from(sign(value, purpose))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}
