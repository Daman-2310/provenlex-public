// Public API key system. Keys are stored hashed in KV; the plaintext is shown
// to the user ONCE on creation, never again. Lookup is O(1) by hash.
import crypto from 'crypto'
import { kv } from './kv'

export interface ApiKeyRecord {
  id: string            // public, short identifier
  email: string         // owner
  name: string          // user-supplied label
  prefix: string        // first 8 chars of plaintext for display (e.g. "gs_live_abc12345")
  hash: string          // sha256(plaintext)
  scopes: string[]      // ['screen', 'lei', 'fx', 'opinion', 'audit', 'analyze']
  rateLimit: number     // requests per hour
  createdAt: number
  lastUsedAt?: number
  revoked?: boolean
}

export function generateApiKey(): { plaintext: string; prefix: string; hash: string; id: string } {
  const id = crypto.randomBytes(6).toString('hex')
  const secret = crypto.randomBytes(24).toString('base64url')
  const plaintext = `gs_live_${secret}`
  const prefix = plaintext.slice(0, 16)
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex')
  return { plaintext, prefix, hash, id }
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

const keyByHash = (hash: string) => `apikey:by-hash:${hash}`
const keysByUser = (email: string) => `apikey:user:${email}`
const usageKey  = (hash: string, hourBucket: number) => `apikey:usage:${hash}:${hourBucket}`

export async function saveApiKey(record: ApiKeyRecord): Promise<void> {
  await kv.set(keyByHash(record.hash), record)
  await kv.lpush(keysByUser(record.email), record.id)
  await kv.set(`apikey:by-id:${record.id}`, record.hash)
}

export async function listUserKeys(email: string): Promise<ApiKeyRecord[]> {
  const ids = await kv.lrange<string>(keysByUser(email), 0, 49)
  const keys: ApiKeyRecord[] = []
  for (const id of ids) {
    const hash = await kv.get<string>(`apikey:by-id:${id}`)
    if (!hash) continue
    const rec = await kv.get<ApiKeyRecord>(keyByHash(hash))
    if (rec && !rec.revoked) keys.push(rec)
  }
  return keys
}

export async function revokeApiKey(email: string, id: string): Promise<boolean> {
  const hash = await kv.get<string>(`apikey:by-id:${id}`)
  if (!hash) return false
  const rec = await kv.get<ApiKeyRecord>(keyByHash(hash))
  if (!rec || rec.email !== email) return false
  rec.revoked = true
  await kv.set(keyByHash(hash), rec)
  return true
}

export async function authenticateApiKey(authHeader: string | null): Promise<ApiKeyRecord | null> {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(gs_live_\S+)$/)
  if (!m) return null
  const hash = hashApiKey(m[1])
  const rec = await kv.get<ApiKeyRecord>(keyByHash(hash))
  if (!rec || rec.revoked) return null
  // Touch lastUsedAt async (fire-and-forget)
  rec.lastUsedAt = Date.now()
  await kv.set(keyByHash(hash), rec)
  return rec
}

// Per-key sliding-hour rate limit. Returns { ok, remaining }
export async function checkRateLimit(rec: ApiKeyRecord): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const used = (await kv.get<number>(usageKey(rec.hash, bucket))) ?? 0
  if (used >= rec.rateLimit) {
    return { ok: false, remaining: 0, resetAt: (bucket + 1) * 3600_000 }
  }
  await kv.set(usageKey(rec.hash, bucket), used + 1, { ex: 3700 })
  return { ok: true, remaining: rec.rateLimit - used - 1, resetAt: (bucket + 1) * 3600_000 }
}
