import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'
import { merkleRoot, sha256Hex } from '@/lib/merkle'

export const runtime = 'edge'

interface Prophecy {
  id: string
  subject: string
  lei?: string
  sealed_at: string
  reveal_at: string
  pre_crime_index: number
  genesis_score: number
  trajectory: string
  pattern_match?: string
  forecast: string
  signals: { name: string; severity: number; note: string }[]
  merkle_root: string
  signature: string
  status: string
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')?.trim()
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  const p = await kv.get<Prophecy>(`prophecy:${id}`)
  if (!p) return Response.json({ error: 'prophecy not found or expired' }, { status: 404 })

  // Reproduce Merkle root from stored parts to verify on-the-fly
  const merkleParts = [
    `subject::${p.subject}`,
    `lei::${p.lei ?? ''}`,
    `sealed_at::${p.sealed_at}`,
    `reveal_at::${p.reveal_at}`,
    `pre_crime_index::${p.pre_crime_index}`,
    `genesis_score::${p.genesis_score}`,
    `trajectory::${p.trajectory}`,
    `pattern::${p.pattern_match ?? 'none'}`,
    `forecast::${p.forecast}`,
    ...p.signals.map(s => `signal::${s.name}::${s.severity}::${s.note}`),
  ]
  const recomputed = await merkleRoot(merkleParts)
  const verified = recomputed === p.merkle_root

  // Also recompute signature surface hash
  const signatureCheck = await sha256Hex(JSON.stringify({
    pre_crime_index: p.pre_crime_index,
    genesis_score: p.genesis_score,
    trajectory: p.trajectory,
    pattern_match: p.pattern_match && p.pattern_match !== 'none' ? p.pattern_match : 'none',
    forecast: p.forecast,
    signals: p.signals,
  }) + p.sealed_at + p.subject)
  // Note: original signature includes full analysis blob; signatureCheck is a partial reconstruct.
  // Real verification = merkle root, signature is timestamped audit trail.

  return Response.json({
    prophecy: p,
    verification: {
      merkle_verified: verified,
      recomputed_root: recomputed,
      stored_root: p.merkle_root,
      signature_reconstruct: signatureCheck.slice(0, 32) + '…',
      stored_signature: p.signature.slice(0, 32) + '…',
    },
  })
}
