// Genesis Swarm MCP server — Model Context Protocol endpoint.
// Exposes Genesis as a tool that LLM clients (ChatGPT, Claude, Cursor, etc.) can query natively.
//
// Implements JSON-RPC 2.0 method dispatch over POST.
// Tools available:
//   - genesis.score.get          { lei | entity_name }
//   - genesis.prophecy.list      { limit?: number }
//   - genesis.vindication.list   { limit?: number }
//   - genesis.entity.search      { query: string }
//   - genesis.manifest.get       {}

import { NextRequest } from 'next/server'
import { BOOK_SNAPSHOT_MANIFEST, BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import { getVindicationsList } from '@/lib/vindicate'
import { explainScore } from '@/lib/explainability'

export const runtime = 'nodejs'

interface JsonRpcRequest {
  jsonrpc?: '2.0'
  id?: string | number
  method?: string
  params?: Record<string, unknown>
}

function rpcSuccess(id: string | number | undefined, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, result })
}

function rpcError(id: string | number | undefined, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status: code === -32601 ? 404 : 400 })
}

const TOOLS = [
  {
    name: 'genesis.score.get',
    description: 'Get the current Genesis operational-risk score for a named entity or LEI.',
    parameters: {
      type: 'object',
      properties: {
        entity_name: { type: 'string', description: 'Full or partial legal entity name (fuzzy match)' },
        lei: { type: 'string', description: '20-character GLEIF LEI (preferred if known)' },
        explain: { type: 'boolean', description: 'Include 11-bot signal breakdown (default false)' },
      },
    },
  },
  {
    name: 'genesis.prophecy.list',
    description: 'List sealed prophecies from the Book of Genesis, ranked by Pre-Crime Index.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        min_pre_crime: { type: 'integer', minimum: 0, maximum: 100, default: 0 },
      },
    },
  },
  {
    name: 'genesis.vindication.list',
    description: 'List recent vindications — Book prophecies confirmed by external press.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
    },
  },
  {
    name: 'genesis.entity.search',
    description: 'Search Genesis-tracked entities by name fragment.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name fragment to match' } },
      required: ['query'],
    },
  },
  {
    name: 'genesis.manifest.get',
    description: 'Get the Book of Genesis manifest — total prophecies, Merkle root, Bitcoin anchor status.',
    parameters: { type: 'object', properties: {} },
  },
]

function findEntity(entityName?: string, lei?: string) {
  if (lei) {
    const ent = BOOK_SNAPSHOT_ENTRIES.find(e => e.candidate.lei?.toUpperCase() === lei.toUpperCase())
    if (ent) return ent
  }
  if (entityName) {
    const lower = entityName.toLowerCase()
    return BOOK_SNAPSHOT_ENTRIES.find(e => e.candidate.name.toLowerCase().includes(lower)) ?? null
  }
  return null
}

export async function GET() {
  return Response.json({
    name: 'Genesis Swarm MCP Server',
    version: '1.0.0',
    protocol: 'json-rpc-2.0',
    transport: 'http-post',
    endpoint: '/api/mcp',
    tools: TOOLS,
    discovery_url: '/api/mcp',
    docs: 'https://genesis-swarm-rgq5.vercel.app/mcp',
  })
}

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest
  try { body = await req.json() as JsonRpcRequest }
  catch { return rpcError(undefined, -32700, 'Parse error') }

  const id = body.id
  const method = body.method
  const params = body.params ?? {}

  if (!method) return rpcError(id, -32600, 'Invalid request — missing method')

  // Standard MCP discovery
  if (method === 'tools/list' || method === 'mcp.tools.list') {
    return rpcSuccess(id, { tools: TOOLS })
  }

  // Tool dispatch
  if (method === 'genesis.score.get' || method === 'tools/call') {
    const callParams = method === 'tools/call'
      ? (params.arguments ?? {}) as Record<string, unknown>
      : params
    const toolName = method === 'tools/call' ? (params.name as string) : 'genesis.score.get'

    if (toolName === 'genesis.score.get') {
      const ent = findEntity(callParams.entity_name as string | undefined, callParams.lei as string | undefined)
      if (!ent) return rpcSuccess(id, { found: false, message: 'no Genesis-tracked entity matches' })
      const result: Record<string, unknown> = {
        found: true,
        entity: ent.candidate.name,
        lei: ent.candidate.lei,
        jurisdiction: ent.candidate.jurisdiction,
        category: ent.candidate.category,
        pre_crime_index: ent.pre_crime_index,
        genesis_score: ent.genesis_score,
        trajectory: ent.trajectory,
        pattern_match: ent.pattern_match,
        forecast: ent.forecast,
        prophecy_id: ent.prophecy_id,
        permalink: `https://genesis-swarm-rgq5.vercel.app/book/${ent.prophecy_id}`,
      }
      if (callParams.explain) {
        const breakdown = await explainScore({
          prophecy_id: ent.prophecy_id,
          entity: ent.candidate.name,
          jurisdiction: ent.candidate.jurisdiction,
          category: ent.candidate.category,
          total_score: ent.pre_crime_index,
        })
        result.breakdown = breakdown
      }
      return rpcSuccess(id, result)
    }

    if (toolName === 'genesis.prophecy.list') {
      const limit = Math.min(100, Math.max(1, (callParams.limit as number) ?? 20))
      const minPC = Math.min(100, Math.max(0, (callParams.min_pre_crime as number) ?? 0))
      const sorted = [...BOOK_SNAPSHOT_ENTRIES]
        .filter(e => e.pre_crime_index >= minPC)
        .sort((a, b) => b.pre_crime_index - a.pre_crime_index)
        .slice(0, limit)
      return rpcSuccess(id, {
        count: sorted.length,
        prophecies: sorted.map(e => ({
          rank: e.rank,
          entity: e.candidate.name,
          lei: e.candidate.lei,
          jurisdiction: e.candidate.jurisdiction,
          pre_crime_index: e.pre_crime_index,
          genesis_score: e.genesis_score,
          trajectory: e.trajectory,
          pattern_match: e.pattern_match,
          permalink: `https://genesis-swarm-rgq5.vercel.app/book/${e.prophecy_id}`,
        })),
      })
    }

    if (toolName === 'genesis.vindication.list') {
      const limit = Math.min(50, Math.max(1, (callParams.limit as number) ?? 10))
      const hits = await getVindicationsList(limit)
      return rpcSuccess(id, { count: hits.length, vindications: hits })
    }

    if (toolName === 'genesis.entity.search') {
      const q = ((callParams.query as string) ?? '').toLowerCase()
      if (!q) return rpcError(id, -32602, 'query required')
      const matches = BOOK_SNAPSHOT_ENTRIES.filter(e => e.candidate.name.toLowerCase().includes(q))
        .slice(0, 20)
        .map(e => ({
          entity: e.candidate.name,
          lei: e.candidate.lei,
          jurisdiction: e.candidate.jurisdiction,
          pre_crime_index: e.pre_crime_index,
          permalink: `https://genesis-swarm-rgq5.vercel.app/book/${e.prophecy_id}`,
        }))
      return rpcSuccess(id, { count: matches.length, matches })
    }

    if (toolName === 'genesis.manifest.get') {
      return rpcSuccess(id, BOOK_SNAPSHOT_MANIFEST ?? null)
    }

    return rpcError(id, -32601, `Method not found: ${toolName}`)
  }

  // Direct method dispatch (non-tools/call)
  if (method === 'genesis.prophecy.list') {
    const limit = Math.min(100, Math.max(1, (params.limit as number) ?? 20))
    const sorted = [...BOOK_SNAPSHOT_ENTRIES].sort((a, b) => b.pre_crime_index - a.pre_crime_index).slice(0, limit)
    return rpcSuccess(id, { count: sorted.length, prophecies: sorted })
  }

  if (method === 'genesis.manifest.get') {
    return rpcSuccess(id, BOOK_SNAPSHOT_MANIFEST ?? null)
  }

  if (method === 'genesis.vindication.list') {
    const limit = Math.min(50, Math.max(1, (params.limit as number) ?? 10))
    const hits = await getVindicationsList(limit)
    return rpcSuccess(id, { count: hits.length, vindications: hits })
  }

  return rpcError(id, -32601, `Method not found: ${method}`)
}
