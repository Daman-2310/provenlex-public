// Genesis Oracle — on-chain Pre-Crime Index feed.
//
// Returns a signed, machine-readable risk score for any Book entity.
// Designed to be consumed by:
//   - Chainlink Functions
//   - any EVM smart contract via an off-chain relayer
//   - DeFi lending protocols evaluating collateral counterparty risk
//   - on-chain insurance underwriters
//
// V1: HMAC-SHA256 signatures (off-chain verification, simplest to integrate).
// V2 (planned): ECDSA secp256k1 — verifiable directly in Solidity via `ecrecover`.
//
// Free, no API key, public. Rate-limited at the edge.

import { NextRequest } from 'next/server'
import { BOOK_SNAPSHOT_ENTRIES, BOOK_SNAPSHOT_MANIFEST } from '@/lib/book-snapshot'
import { enforceRateLimit } from '@/lib/ratelimit'

export const runtime = 'edge'

const ORACLE_VERSION = 'GENESIS-ORACLE-V1'

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function findEntity(entityOrId: string | null) {
  if (!entityOrId) return null
  const q = entityOrId.toLowerCase().trim()
  return BOOK_SNAPSHOT_ENTRIES.find(e =>
    e.prophecy_id.toLowerCase() === q ||
    e.candidate.name.toLowerCase() === q ||
    e.candidate.name.toLowerCase().includes(q)
  ) ?? null
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function GET(req: NextRequest) {
  // 120 req/min per IP — generous for legit consumers, blocks scrapers
  const limited = await enforceRateLimit(req, { route: 'oracle', limit: 120 })
  if (limited) return limited

  const url = new URL(req.url)
  const entityParam = url.searchParams.get('entity') ?? url.searchParams.get('prophecy_id')
  const secret = process.env.ORACLE_SIGNING_SECRET ?? 'genesis-oracle-v1-public-demo-key'

  // Manifest endpoint when no query param
  if (!entityParam) {
    const manifest = {
      version: ORACLE_VERSION,
      total_entities: BOOK_SNAPSHOT_ENTRIES.length,
      sealed_at: BOOK_SNAPSHOT_MANIFEST.sealed_at,
      book_merkle_root: BOOK_SNAPSHOT_MANIFEST.merkle_root,
      ots_status: BOOK_SNAPSHOT_MANIFEST.ots_status,
      endpoint: 'https://genesis-swarm-rgq5.vercel.app/api/oracle',
      query_params: ['entity', 'prophecy_id'],
      signature_alg: 'HMAC-SHA256',
      example: `${url.origin}/api/oracle?entity=Deutsche+Bank`,
      notes: 'V1 uses HMAC-SHA256. V2 (ECDSA secp256k1) coming for direct on-chain verification.',
    }
    return Response.json(manifest, {
      headers: { 'Cache-Control': 'public, max-age=60', ...corsHeaders() },
    })
  }

  const entity = findEntity(entityParam)
  if (!entity) {
    return Response.json(
      {
        error: 'entity_not_found',
        query: entityParam,
        hint: 'Try a Book entity name (e.g. "Deutsche Bank") or prophecy_id. List entities at /api/oracle.',
      },
      { status: 404, headers: corsHeaders() },
    )
  }

  const servedAt = new Date().toISOString()

  // Canonical message: prophecy_id|pci|trajectory|merkle_root|sealed_at|served_at
  // This is what gets signed. Consumers reconstruct it from the returned fields.
  const canonical = [
    entity.prophecy_id,
    entity.pre_crime_index.toString(),
    entity.trajectory,
    entity.merkle_root,
    BOOK_SNAPSHOT_MANIFEST.sealed_at,
    servedAt,
  ].join('|')

  const signature = await hmacSha256(secret, canonical)

  return Response.json(
    {
      version: ORACLE_VERSION,
      entity: entity.candidate.name,
      prophecy_id: entity.prophecy_id,
      jurisdiction: entity.candidate.jurisdiction,
      category: entity.candidate.category,
      pre_crime_index: entity.pre_crime_index,
      genesis_score: entity.genesis_score,
      trajectory: entity.trajectory,
      pattern_match: entity.pattern_match ?? null,
      merkle_root: entity.merkle_root,
      book_merkle_root: BOOK_SNAPSHOT_MANIFEST.merkle_root,
      sealed_at: BOOK_SNAPSHOT_MANIFEST.sealed_at,
      served_at: servedAt,
      signature_alg: 'HMAC-SHA256',
      signature,
      canonical_message: canonical,
      docs: 'https://genesis-swarm-rgq5.vercel.app/oracle',
    },
    { headers: { 'Cache-Control': 'public, max-age=30', ...corsHeaders() } },
  )
}
