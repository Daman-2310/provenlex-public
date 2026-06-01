import { describe, it, expect } from 'vitest'
import {
  paillierKeygen, paillierEncrypt, paillierDecrypt, homAdd, homAddPlain,
  evaluateEncryptedWeights, evaluateEscrow, verifyRing,
} from '@/lib/clearing-engines'

describe('Clearing Layer 3 — real Paillier homomorphism', () => {
  const key = paillierKeygen(256)

  it('encrypt → decrypt round-trips', () => {
    expect(paillierDecrypt(key, paillierEncrypt(key, 12345n))).toBe(12345n)
  })

  it('D(E(a)·E(b)) == a + b without decrypting intermediates', () => {
    const ca = paillierEncrypt(key, 4200n)
    const cb = paillierEncrypt(key, 1337n)
    expect(paillierDecrypt(key, homAdd(key, ca, cb))).toBe(5537n)
  })

  it('homomorphic plaintext add subtracts correctly', () => {
    const c = paillierEncrypt(key, 10200n)
    const minus = homAddPlain(key, c, -10000n)
    const raw = paillierDecrypt(key, minus)
    const signed = raw > key.n / 2n ? raw - key.n : raw
    expect(signed).toBe(200n)
  })

  it('sums 5 encrypted weights and flags over-allocation', () => {
    const weights = [3000n, 2500n, 2000n, 1500n, 1200n]
    const cts = weights.map(w => paillierEncrypt(key, w))
    const r = evaluateEncryptedWeights(key, cts)
    expect(r.total).toBe(10200n)
    expect(r.overAllocated).toBe(true)
    expect(r.excessBps).toBe(200n)
  })

  it('ciphertext differs from plaintext (actually encrypted)', () => {
    const ct = paillierEncrypt(key, 500n)
    expect(ct).not.toBe(500n)
    expect(ct > key.n).toBe(true)
  })
})

describe('Clearing Layer 1 — escrow circuit breaker', () => {
  const base = { sender: '0xabc', beneficiary: '0xdef', amountEur: 500_000, addsExposureEur: 200_000, structure: 'open_ended' as const, navEur: 10_000_000, grossExposureEur: 5_000_000 }
  it('releases a clean transfer', () => {
    expect(evaluateEscrow(base).action).toBe('released')
  })
  it('locks a sanctioned counterparty', () => {
    const r = evaluateEscrow({ ...base, beneficiary: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })
    expect(r.action).toBe('locked')
    expect(r.breaches.map(b => b.code)).toContain('SANCTIONS_HIT')
  })
  it('locks an over-leverage transfer', () => {
    const r = evaluateEscrow({ ...base, addsExposureEur: 14_000_000 })
    expect(r.action).toBe('locked')
    expect(r.breaches.map(b => b.code)).toContain('LEVERAGE_CAP_BREACH')
  })
})

describe('Clearing Layer 2 — proof-of-substance ring', () => {
  const ok = { directorId: 'DIR-7', lat: 49.61, lon: 6.13, deviceHwid: 'HWID-AABBCCDD11223344', eidasSignature: 'S'.repeat(80) }
  it('finalizes a valid Luxembourg proof', () => {
    const r = verifyRing(ok)
    expect(r.finalized).toBe(true)
    expect(r.fraudulent).toBe(false)
    expect(r.anchored).toBe(true)
  })
  it('rejects an out-of-bounds (Paris) proof as fraudulent', () => {
    const r = verifyRing({ ...ok, lat: 48.86, lon: 2.35 })
    expect(r.finalized).toBe(false)
    expect(r.fraudulent).toBe(true)
    expect(r.attestations.every(a => !a.passed)).toBe(true)
  })
})
