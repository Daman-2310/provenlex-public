// ProvenLex MCP server — Model Context Protocol endpoint (JSON-RPC 2.0 / POST).
//
// SCOPE-LIMITED 2026-06-12: this server previously broadcast operational-risk
// scores, a "pre-crime index", and forecasts on NAMED REAL ENTITIES to LLM
// clients (ChatGPT, Claude, Cursor) — an uncontrolled defamation/liability
// surface. Those entity-level tools (genesis.score.get, genesis.prophecy.list,
// genesis.vindication.list, genesis.entity.search) have been removed. Only the
// aggregate, non-entity manifest remains.

import { NextRequest } from 'next/server'
import { BOOK_SNAPSHOT_MANIFEST } from '@/lib/book-snapshot'

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
    name: 'genesis.manifest.get',
    description: 'Get the aggregate ProvenLex manifest — totals and Merkle root only. No per-entity data.',
    parameters: { type: 'object', properties: {} },
  },
]

const RETIRED_TOOLS = ['genesis.score.get', 'genesis.prophecy.list', 'genesis.vindication.list', 'genesis.entity.search']

export async function GET() {
  return Response.json({
    name: 'ProvenLex MCP Server',
    version: '2.0.0',
    protocol: 'json-rpc-2.0',
    transport: 'http-post',
    endpoint: '/api/mcp',
    tools: TOOLS,
    note: 'Entity-level risk tools were retired 2026-06-12; this server exposes only aggregate data.',
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

  if (method === 'tools/list' || method === 'mcp.tools.list') {
    return rpcSuccess(id, { tools: TOOLS })
  }

  const toolName = method === 'tools/call' ? (params.name as string) : method

  if (toolName === 'genesis.manifest.get') {
    return rpcSuccess(id, BOOK_SNAPSHOT_MANIFEST ?? null)
  }

  if (RETIRED_TOOLS.includes(toolName)) {
    return rpcError(id, -32601, `Method retired: ${toolName} — entity-level risk data is no longer served.`)
  }

  return rpcError(id, -32601, `Method not found: ${toolName}`)
}
