// PROVENLEX EVIDENCE VAULT — the defensibility layer.
//
// Reframes the product from "detector" to "audit insurance": every compliance
// check a fund runs becomes a sealed, timestamped, append-only record. The
// whole vault rolls up into a single SHA-256 Merkle root that is anchorable to
// Bitcoin — so a fund can prove to a regulator EXACTLY what it screened, when,
// and that the record has not been altered since.
//
// This is the client-side reference implementation (localStorage); the
// production system of record is the server-persisted, per-tenant ledger. The
// cryptography (SHA-256 leaf hashing + Merkle root) is identical and real.

import { sha256Hex } from '@/lib/lux-engines'

const VAULT_KEY = 'genesis_evidence_vault_v1'

export interface VaultRecord {
  id: string
  kind: 'prospectus-scan' | 'aifmd-check' | 'eid-preflight' | 'reconciliation' | 'delegation'
  subject: string          // e.g. fund name
  verdict: 'compliant' | 'non-compliant' | 'warning'
  criticalCount: number
  warningCount: number
  summary: string
  leafHash: string         // SHA-256 of the canonical record payload
  recordedAt: string       // ISO timestamp
}

// ── persistence (SSR-safe) ──────────────────────────────────────────────────────

export function getRecords(): VaultRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(VAULT_KEY)
    return raw ? (JSON.parse(raw) as VaultRecord[]) : []
  } catch { return [] }
}

function persist(records: VaultRecord[]) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(VAULT_KEY, JSON.stringify(records)) } catch { /* quota */ }
}

export type VaultMode = 'server' | 'local'

async function buildRecord(input: Omit<VaultRecord, 'id' | 'leafHash' | 'recordedAt'>): Promise<VaultRecord> {
  const recordedAt = new Date().toISOString()
  const id = `gv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const payload = JSON.stringify({ ...input, id, recordedAt }, Object.keys({ ...input, id, recordedAt }).sort())
  const leafHash = await sha256Hex(payload)
  return { ...input, id, recordedAt, leafHash }
}

// Dual-mode: when a Supabase session exists, the record is persisted server-side
// (per-tenant, RLS-isolated, durable). Otherwise it falls back to the anonymous
// localStorage vault so the demo always works.

// Only hit the server vault when actually signed in — avoids a 401/501 console
// error on the anonymous (localStorage) path, which is the default for visitors.
function isSignedIn(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage.getItem('gs_token')
}

export async function addRecord(input: Omit<VaultRecord, 'id' | 'leafHash' | 'recordedAt'>): Promise<{ record: VaultRecord; mode: VaultMode }> {
  const record = await buildRecord(input)
  if (isSignedIn()) {
    try {
      const r = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) })
      if (r.ok) return { record, mode: 'server' }
    } catch { /* offline → fall back to local */ }
  }
  const records = getRecords()
  records.unshift(record)
  persist(records)
  return { record, mode: 'local' }
}

// Load the vault: server records if signed in, else the local fallback.
export async function loadRecords(): Promise<{ records: VaultRecord[]; mode: VaultMode }> {
  if (isSignedIn()) {
    try {
      const r = await fetch('/api/vault', { headers: { accept: 'application/json' } })
      if (r.ok) {
        const d = await r.json()
        return { records: (d.records ?? []) as VaultRecord[], mode: 'server' }
      }
    } catch { /* fall through */ }
  }
  return { records: getRecords(), mode: 'local' }
}

export function clearVault() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(VAULT_KEY)
}

// ── Merkle root over all record leaf hashes ────────────────────────────────────
// Standard binary Merkle tree; an odd node is promoted (duplicated) to the next
// level. Any change to any record changes its leaf and therefore the root.

export async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return '0'.repeat(64)
  let level = [...leaves]
  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]
      const right = i + 1 < level.length ? level[i + 1] : level[i] // promote odd
      next.push(await sha256Hex(left + right))
    }
    level = next
  }
  return level[0]
}

export interface VaultManifest {
  generatedAt: string
  recordCount: number
  merkleRoot: string
  records: VaultRecord[]
  scheme: string
}

export async function buildManifest(records: VaultRecord[] = getRecords()): Promise<VaultManifest> {
  const root = await merkleRoot(records.map(r => r.leafHash))
  return {
    generatedAt: new Date().toISOString(),
    recordCount: records.length,
    merkleRoot: root,
    records,
    scheme: 'SHA-256 leaf + binary Merkle root; anchorable via OpenTimestamps (Bitcoin)',
  }
}

// Re-verify integrity: recompute each leaf and the root from the stored payloads.
export async function verifyVault(records: VaultRecord[] = getRecords()): Promise<{ intact: boolean; brokenId: string | null; root: string }> {
  for (const r of records) {
    const rest: Record<string, unknown> = { ...r }
    delete rest.leafHash
    const payload = JSON.stringify(rest, Object.keys(rest).sort())
    const expected = await sha256Hex(payload)
    if (expected !== r.leafHash) {
      const root = await merkleRoot(records.map(x => x.leafHash))
      return { intact: false, brokenId: r.id, root }
    }
  }
  const root = await merkleRoot(records.map(r => r.leafHash))
  return { intact: true, brokenId: null, root }
}
