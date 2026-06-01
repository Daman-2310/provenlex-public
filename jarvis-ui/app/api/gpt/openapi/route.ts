// OpenAPI 3.1 spec for the Custom GPT. ChatGPT polls this URL when configuring
// the GPT's Actions, then calls back to our /api/v1/* endpoints on each turn.
export const runtime = 'edge'

const BASE = 'https://genesis-swarm-rgq5.vercel.app'

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Genesis Swarm Compliance API',
    description: 'Live OFAC SDN sanctions screening, GLEIF LEI lookup, ECB FX rates, and AI compliance gap analysis for Luxembourg AIFMs, UCITS, RAIFs and SIFs.',
    version: '1.0.0',
    contact: { name: 'Daman Sharma', email: 'daman.sharma.2310@gmail.com' },
  },
  servers: [{ url: `${BASE}/api/real`, description: 'Production (public, no auth)' }],
  paths: {
    '/sanctions': {
      get: {
        operationId: 'screenSanctions',
        summary: 'Screen entity against US Treasury OFAC SDN list',
        description: 'Returns sanctions matches against 18,976 OFAC SDN entities. Score 0-100 with match level (EXACT/STRONG/PARTIAL/WEAK).',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Entity name to screen (e.g. ROSNEFT, GAZPROM, PUTIN)' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 8, maximum: 25 } },
        ],
        responses: { '200': { description: 'Screening results' } },
      },
    },
    '/gleif': {
      get: {
        operationId: 'lookupLei',
        summary: 'Look up a GLEIF Legal Entity Identifier',
        description: 'Resolve any 20-character LEI to the full legal entity record from the GLEIF registry (2.4M+ entities). Supports fuzzy search by name via ?q=.',
        parameters: [
          { name: 'lei', in: 'query', schema: { type: 'string' }, description: '20-character LEI code' },
          { name: 'q',   in: 'query', schema: { type: 'string' }, description: 'Fuzzy name search if no LEI known' },
        ],
        responses: { '200': { description: 'Legal entity record' } },
      },
    },
    '/fx': {
      get: {
        operationId: 'getFxRates',
        summary: 'Get live ECB FX rates',
        description: 'Returns live EUR exchange rates against 10 major currencies, sourced from the European Central Bank.',
        responses: { '200': { description: 'FX rate object' } },
      },
    },
    '/token-screen': {
      get: {
        operationId: 'screenToken',
        summary: 'Screen a tokenized RWA contract for AIFMD II compliance',
        description: 'Analyzes any EVM smart contract (ERC-20 / ERC-3643 T-REX) for transfer restrictions, identity registry, pause state, OFAC enforcement readiness. Returns compliance score 0-100.',
        parameters: [
          { name: 'address', in: 'query', required: true, schema: { type: 'string' }, description: '0x-prefixed 40-hex contract address' },
          { name: 'chain',   in: 'query', schema: { type: 'string', default: 'ethereum', enum: ['ethereum','polygon','arbitrum','base'] } },
        ],
        responses: { '200': { description: 'Token compliance analysis' } },
      },
    },
  },
}

export async function GET() {
  return Response.json(SPEC, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  })
}
