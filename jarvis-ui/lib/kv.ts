// Vercel KV (Upstash Redis) wrapper with in-memory fallback for local/no-creds runs.
// Use for user-scoped data: saved fund analyses, alert webhooks, plan tier.

import { Redis } from '@upstash/redis'

const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

let redis: Redis | null = null
if (KV_URL && KV_TOKEN) {
  redis = new Redis({ url: KV_URL, token: KV_TOKEN })
}

// Fallback in-memory store (survives within a single edge instance lifetime only)
const memory = new Map<string, { v: unknown; exp?: number }>()

function isExpired(entry: { exp?: number }): boolean {
  return entry.exp !== undefined && Date.now() > entry.exp
}

export const kv = {
  async get<T = unknown>(key: string): Promise<T | null> {
    if (redis) return (await redis.get<T>(key)) ?? null
    const e = memory.get(key)
    if (!e) return null
    if (isExpired(e)) { memory.delete(key); return null }
    return e.v as T
  },

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    if (redis) {
      if (opts?.ex) await redis.set(key, value, { ex: opts.ex })
      else await redis.set(key, value)
      return
    }
    memory.set(key, { v: value, exp: opts?.ex ? Date.now() + opts.ex * 1000 : undefined })
  },

  async del(key: string): Promise<void> {
    if (redis) { await redis.del(key); return }
    memory.delete(key)
  },

  async lpush(key: string, value: unknown): Promise<number> {
    if (redis) return await redis.lpush(key, JSON.stringify(value))
    const list = (memory.get(key)?.v as unknown[] | undefined) ?? []
    list.unshift(value)
    memory.set(key, { v: list })
    return list.length
  },

  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    if (redis) {
      const raw = await redis.lrange<string>(key, start, stop)
      return raw.map(s => {
        try { return JSON.parse(s) as T } catch { return s as unknown as T }
      })
    }
    const list = (memory.get(key)?.v as T[] | undefined) ?? []
    const len = list.length
    const s = start < 0 ? Math.max(0, len + start) : start
    const e = stop < 0 ? len + stop + 1 : Math.min(len, stop + 1)
    return list.slice(s, e)
  },

  async lrem(key: string, count: number, value: unknown): Promise<number> {
    if (redis) return await redis.lrem(key, count, JSON.stringify(value))
    const list = (memory.get(key)?.v as unknown[] | undefined) ?? []
    const matches = (v: unknown) => JSON.stringify(v) === JSON.stringify(value)
    const idx = list.findIndex(matches)
    if (idx === -1) return 0
    list.splice(idx, 1)
    memory.set(key, { v: list })
    return 1
  },

  isPersistent(): boolean {
    return !!redis
  },
}

export const kvMode = redis ? 'upstash' : 'memory'
