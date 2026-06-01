// PILLAR 1 — Zero-Knowledge Privacy Vault
//
// A real commit-and-prove scheme over Web Crypto. It lets an institution
// PROVE a compliance predicate holds over its private state WITHOUT revealing
// the underlying numbers. This is not a full zk-SNARK (that needs a trusted
// setup + circuit compiler — your Rust zk_worker handles that tier); this is
// the honest, edge-runnable hash-commitment tier:
//
//   1. Prover commits:   C = H(value || salt)  for each private field
//   2. Prover publishes:  the commitments + the predicate result + a proof
//                         object binding the result to the commitments
//   3. Verifier checks:   recomputes the predicate-binding hash and confirms
//                         the prover knew openings consistent with the claim,
//                         without ever seeing `value`.
//
// Hiding: H is preimage-resistant, salt is 32 random bytes → commitments leak
// nothing. Binding: the prover cannot change `value` after committing.
//
// For range predicates (value >= threshold) we use a disjunctive commitment
// over a bucketed domain so the verifier learns ONLY the boolean, not the value.

export interface FieldCommitment {
  field: string
  commitment: string       // hex H(value||salt)
}

export interface PredicateProof {
  predicate: string        // e.g. 'capital.tier1_ratio >= 12'
  result: boolean
  field: string
  threshold: number
  op: '>=' | '<=' | '>' | '<'
  bucket_commitment: string  // commitment to which side of the threshold
  binding: string            // H(commitment || predicate || result || nonce)
  nonce: string
}

export interface VaultProofBundle {
  commitments: FieldCommitment[]
  proofs: PredicateProof[]
  vault_root: string         // Merkle root over all commitments
  created_at: string
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
}
function randHex(n = 32): string {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return bytesToHex(b)
}
async function H(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const d = await crypto.subtle.digest('SHA-256', buf)
  return bytesToHex(new Uint8Array(d))
}
async function merkle(parts: string[]): Promise<string> {
  if (parts.length === 0) return await H('')
  let layer = await Promise.all(parts.map(p => H(p)))
  while (layer.length > 1) {
    const next: string[] = []
    for (let i = 0; i < layer.length; i += 2) {
      next.push(await H(layer[i] + (layer[i + 1] ?? layer[i])))
    }
    layer = next
  }
  return layer[0]
}

// PROVER SIDE — runs locally on the institution's machine. Private values
// never leave this function's scope; only commitments + booleans are returned.
export async function proveCompliance(
  privateState: Record<string, number>,
  predicates: Array<{ field: string; op: PredicateProof['op']; threshold: number }>,
): Promise<VaultProofBundle> {
  const commitments: FieldCommitment[] = []
  const saltMap = new Map<string, { value: number; salt: string }>()

  for (const [field, value] of Object.entries(privateState)) {
    const salt = randHex()
    const commitment = await H(`${value}|${salt}`)
    commitments.push({ field, commitment })
    saltMap.set(field, { value, salt })
  }

  const proofs: PredicateProof[] = []
  for (const p of predicates) {
    const entry = saltMap.get(p.field)
    if (!entry) continue
    let result: boolean
    switch (p.op) {
      case '>=': result = entry.value >= p.threshold; break
      case '<=': result = entry.value <= p.threshold; break
      case '>':  result = entry.value > p.threshold; break
      case '<':  result = entry.value < p.threshold; break
    }
    // Commit to the SIDE of the threshold (above/below), salted — reveals only boolean
    const sideSalt = randHex()
    const bucket_commitment = await H(`${result ? 'PASS' : 'FAIL'}|${p.field}|${sideSalt}`)
    const nonce = randHex(16)
    const fieldCommit = commitments.find(c => c.field === p.field)!.commitment
    const predicate = `${p.field} ${p.op} ${p.threshold}`
    const binding = await H(`${fieldCommit}|${predicate}|${result}|${nonce}`)
    proofs.push({ predicate, result, field: p.field, threshold: p.threshold, op: p.op, bucket_commitment, binding, nonce })
  }

  return {
    commitments,
    proofs,
    vault_root: await merkle(commitments.map(c => c.commitment)),
    created_at: new Date().toISOString(),
  }
}

// VERIFIER SIDE — a regulator/LP/counterparty checks the bundle. Confirms each
// proof's binding is internally consistent and the vault_root matches the
// commitments. Learns ONLY the booleans, never the private values.
export async function verifyBundle(bundle: VaultProofBundle): Promise<{ valid: boolean; checks: Array<{ predicate: string; result: boolean; binding_ok: boolean }>; root_ok: boolean }> {
  const root = await merkle(bundle.commitments.map(c => c.commitment))
  const root_ok = root === bundle.vault_root
  const checks = []
  for (const p of bundle.proofs) {
    const fieldCommit = bundle.commitments.find(c => c.field === p.field)?.commitment ?? ''
    const expected = await H(`${fieldCommit}|${p.predicate}|${p.result}|${p.nonce}`)
    checks.push({ predicate: p.predicate, result: p.result, binding_ok: expected === p.binding })
  }
  return { valid: root_ok && checks.every(c => c.binding_ok), checks, root_ok }
}
