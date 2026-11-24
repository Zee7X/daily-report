import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from './env'
import { sign, verify } from './crypto'

// Driver storage gambar/PDF (FR-16). File selalu privat dan dibaca lewat signed URL (PRD 7, Privasi).

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  signedUrl(key: string, ttlSeconds?: number): Promise<string>
}

const DEFAULT_TTL = 60 * 60 // 1 jam

export function assertSafeKey(key: string) {
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error('Invalid storage key')
  }
}

class LocalStorage implements Storage {
  private root = path.resolve(env.storagePath)

  private file(key: string) {
    assertSafeKey(key)
    const p = path.resolve(this.root, key)
    if (!p.startsWith(this.root + path.sep)) throw new Error('Invalid storage key')
    return p
  }

  async put(key: string, data: Buffer) {
    const p = this.file(key)
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, data)
  }

  async get(key: string) {
    return readFile(this.file(key))
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true })
  }

  async signedUrl(key: string, ttl = DEFAULT_TTL) {
    return appSignedUrl(key, ttl)
  }
}

export function verifyLocalFileSignature(key: string, exp: string | null, sig: string | null) {
  if (!exp || !sig) return false
  if (Number(exp) < Date.now() / 1000) return false
  return verify(`${key}:${exp}`, sig, 'file')
}

class S3Storage implements Storage {
  private clientPromise = (async () => {
    const { S3Client } = await import('@aws-sdk/client-s3')
    return new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint || undefined,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    })
  })()

  async put(key: string, data: Buffer, contentType: string) {
    assertSafeKey(key)
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    await (await this.clientPromise).send(
      new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: data, ContentType: contentType }),
    )
  }

  async get(key: string) {
    assertSafeKey(key)
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const out = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }))
    if (!out.Body) throw new Error('File not found')
    return Buffer.from(await out.Body.transformToByteArray())
  }

  async delete(key: string) {
    assertSafeKey(key)
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }))
  }

  async signedUrl(key: string, ttl = DEFAULT_TTL) {
    assertSafeKey(key)
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    return getSignedUrl(await this.clientPromise, new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), {
      expiresIn: ttl,
    })
  }
}

/**
 * Vercel Blob dengan store privat. File tidak punya URL publik; browser membacanya lewat
 * /api/files dengan signed URL aplikasi, lalu route itu mengambil isinya dari Blob di server.
 * Autentikasi Blob memakai OIDC Vercel (otomatis bila store dihubungkan ke project) atau BLOB_READ_WRITE_TOKEN.
 */
class VercelBlobStorage implements Storage {
  async put(key: string, data: Buffer, contentType: string) {
    assertSafeKey(key)
    const { put } = await import('@vercel/blob')
    await put(key, data, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true })
  }

  async get(key: string) {
    assertSafeKey(key)
    const { get } = await import('@vercel/blob')
    const res = await get(key, { access: 'private' })
    if (!res || res.statusCode !== 200 || !res.stream) throw new Error('File not found')
    return Buffer.from(await new Response(res.stream).arrayBuffer())
  }

  async delete(key: string) {
    assertSafeKey(key)
    const { del } = await import('@vercel/blob')
    await del(key)
  }

  async signedUrl(key: string, ttl = DEFAULT_TTL) {
    return appSignedUrl(key, ttl)
  }
}

function appSignedUrl(key: string, ttl: number) {
  assertSafeKey(key)
  const exp = Math.floor(Date.now() / 1000) + ttl
  return `/api/files/${key}?e=${exp}&s=${sign(`${key}:${exp}`, 'file')}`
}

let instance: Storage | null = null

export function storage(): Storage {
  if (!instance) {
    const d = env.storageDriver
    instance = d === 's3' ? new S3Storage() : d === 'vercel-blob' ? new VercelBlobStorage() : new LocalStorage()
  }
  return instance
}
