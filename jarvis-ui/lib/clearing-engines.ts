// In-browser TypeScript mirror of the three Clearing-Matrix layers.
//
// Layer 3 here is a REAL Paillier additively-homomorphic implementation in
// native BigInt — a VC watches encrypted numbers sum without decryption, live.
// Layers 1 + 2 mirror the production Python controllers' decision logic.
// (256-bit primes for instant in-browser keygen; production uses 2048-bit + KMS.)

// ─────────────────────────────────────────────────────────────────────────────
// BigInt modular arithmetic helpers
// ─────────────────────────────────────────────────────────────────────────────

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return result
}

function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n]
  const [g, x, y] = egcd(b, a % b)
  return [g, y, x - (a / b) * y]
}

function modInv(a: bigint, m: bigint): bigint {
  const [g, x] = egcd(((a % m) + m) % m, m)
  if (g !== 1n) throw new Error('no modular inverse')
  return ((x % m) + m) % m
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) { [a, b] = [b, a % b] }
  return a < 0n ? -a : a
}

function lcm(a: bigint, b: bigint): bigint { return (a / gcd(a, b)) * b }

function randBits(bits: number): bigint {
  const bytes = Math.ceil(bits / 8)
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  let n = 0n
  for (const b of arr) n = (n << 8n) | BigInt(b)
  n |= 1n << BigInt(bits - 1) // ensure high bit
  n |= 1n                     // ensure odd
  return n
}

function randBelow(n: bigint): bigint {
  const bits = n.toString(2).length
  let r: bigint
  do { r = randBits(bits) % n } while (r < 1n)
  return r
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]

function isProbablePrime(n: bigint, rounds = 24): boolean {
  if (n < 2n) return false
  for (const p of SMALL_PRIMES) { if (n % p === 0n) return n === p }
  let d = n - 1n, r = 0n
  while (d % 2n === 0n) { d /= 2n; r++ }
  for (let i = 0; i < rounds; i++) {
    const a = 2n + randBelow(n - 3n)
    let x = modPow(a, d, n)
    if (x === 1n || x === n - 1n) continue
    let composite = true
    for (let j = 0n; j < r - 1n; j++) {
      x = (x * x) % n
      if (x === n - 1n) { composite = false; break }
    }
    if (composite) return false
  }
  return true
}

function genPrime(bits: number): bigint {
  for (;;) { const c = randBits(bits); if (isProbablePrime(c)) return c }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — real Paillier
// ─────────────────────────────────────────────────────────────────────────────

export interface PaillierKey { n: bigint; nSq: bigint; g: bigint; lambda: bigint; mu: bigint; bits: number }

export function paillierKeygen(bits = 256): PaillierKey {
  const half = Math.floor(bits / 2)
  const p = genPrime(half)
  let q = genPrime(half)
  while (q === p) q = genPrime(half)
  const n = p * q
  const nSq = n * n
  const g = n + 1n
  const lambda = lcm(p - 1n, q - 1n)
  const L = (x: bigint) => (x - 1n) / n
  const mu = modInv(L(modPow(g, lambda, nSq)), n)
  return { n, nSq, g, lambda, mu, bits }
}

export function paillierEncrypt(key: PaillierKey, m: bigint): bigint {
  const mMod = ((m % key.n) + key.n) % key.n
  let r: bigint
  do { r = randBelow(key.n) } while (gcd(r, key.n) !== 1n)
  const gm = (1n + mMod * key.n) % key.nSq // g = n+1 optimization
  return (gm * modPow(r, key.n, key.nSq)) % key.nSq
}

export function paillierDecrypt(key: PaillierKey, c: bigint): bigint {
  const L = (x: bigint) => (x - 1n) / key.n
  return (L(modPow(c, key.lambda, key.nSq)) * key.mu) % key.n
}

// Homomorphic ops — NO decryption.
export function homAdd(key: PaillierKey, c1: bigint, c2: bigint): bigint { return (c1 * c2) % key.nSq }
export function homAddPlain(key: PaillierKey, c: bigint, k: bigint): bigint {
  const kMod = ((k % key.n) + key.n) % key.n
  return (c * modPow(key.g, kMod, key.nSq)) % key.nSq
}

export interface DarkPoolResult {
  total: bigint            // decrypted only to PROVE correctness in the demo
  encryptedTotal: bigint   // the ciphertext the server actually holds
  excessBps: bigint
  overAllocated: boolean
}

// Server-side: fold encrypted weights into a running ciphertext sum, never
// decrypting. Returns the ciphertext + (for demo proof) the decrypted total.
export function evaluateEncryptedWeights(key: PaillierKey, ciphertexts: bigint[]): DarkPoolResult {
  let acc = paillierEncrypt(key, 0n)
  for (const ct of ciphertexts) acc = homAdd(key, acc, ct)
  const breach = homAddPlain(key, acc, -10000n)
  const total = paillierDecrypt(key, acc)
  const excessRaw = paillierDecrypt(key, breach)
  const excess = excessRaw > key.n / 2n ? excessRaw - key.n : excessRaw
  return { total, encryptedTotal: acc, excessBps: excess, overAllocated: excess > 0n }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — escrow circuit-breaker decision logic
// ─────────────────────────────────────────────────────────────────────────────

const LEVERAGE_CAP_CLOSED = 3.0
const LEVERAGE_CAP_OPEN = 1.75
const SANCTIONS_BLOCKLIST = new Set([
  '0x0000000000000000000000000000000000000bad',
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
])

export interface EscrowInput {
  sender: string
  beneficiary: string
  amountEur: number
  addsExposureEur: number
  structure: 'open_ended' | 'closed_ended'
  navEur: number
  grossExposureEur: number
}

export interface EscrowBreach { code: string; detail: string }
export interface EscrowDecision { action: 'released' | 'locked'; breaches: EscrowBreach[] }

export function evaluateEscrow(inp: EscrowInput): EscrowDecision {
  const breaches: EscrowBreach[] = []
  for (const [role, addr] of [['sender', inp.sender], ['beneficiary', inp.beneficiary]] as const) {
    if (SANCTIONS_BLOCKLIST.has(addr.toLowerCase())) {
      breaches.push({ code: 'SANCTIONS_HIT', detail: `${role} ${addr} on sanctions blocklist.` })
    }
  }
  const cap = inp.structure === 'closed_ended' ? LEVERAGE_CAP_CLOSED : LEVERAGE_CAP_OPEN
  const postGross = inp.grossExposureEur + inp.addsExposureEur
  const postLev = postGross / inp.navEur
  if (postLev > cap + 1e-9) {
    breaches.push({ code: 'LEVERAGE_CAP_BREACH', detail: `Post-transfer leverage ${(postLev * 100).toFixed(2)}% exceeds ${inp.structure} cap ${(cap * 100).toFixed(0)}%.` })
  }
  if (inp.amountEur > inp.navEur) {
    breaches.push({ code: 'NOTIONAL_EXCEEDS_NAV', detail: `Transfer €${inp.amountEur.toLocaleString()} exceeds NAV €${inp.navEur.toLocaleString()}.` })
  }
  return { action: breaches.length === 0 ? 'released' : 'locked', breaches }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — proof-of-substance validator ring
// ─────────────────────────────────────────────────────────────────────────────

const LU_BBOX = { latMin: 49.448, latMax: 50.1827, lonMin: 5.7357, lonMax: 6.5316 }

export interface SubstanceProofInput {
  directorId: string
  lat: number
  lon: number
  deviceHwid: string
  eidasSignature: string
}

export interface Attestation { role: string; passed: boolean; reason: string }
export interface RingResult { finalized: boolean; fraudulent: boolean; attestations: Attestation[]; anchored: boolean }

export function verifyRing(p: SubstanceProofInput): RingResult {
  const inLux = p.lat >= LU_BBOX.latMin && p.lat <= LU_BBOX.latMax && p.lon >= LU_BBOX.lonMin && p.lon <= LU_BBOX.lonMax
  const attestations: Attestation[] = [
    { role: 'custodian_bank', passed: inLux && p.deviceHwid.length >= 16, reason: !inLux ? 'geo out of bounds' : p.deviceHwid.length >= 16 ? 'OK' : 'HWID below entropy threshold' },
    { role: 'fund_administrator', passed: inLux && p.directorId.startsWith('DIR-'), reason: !inLux ? 'geo out of bounds' : p.directorId.startsWith('DIR-') ? 'OK' : 'director not on mandate roster' },
    { role: 'auditor', passed: inLux && p.eidasSignature.length >= 64, reason: !inLux ? 'geo out of bounds' : p.eidasSignature.length >= 64 ? 'OK' : 'eIDAS signature missing/malformed' },
  ]
  const allPass = attestations.every(a => a.passed)
  return { finalized: allPass, fraudulent: !allPass, attestations, anchored: allPass }
}
