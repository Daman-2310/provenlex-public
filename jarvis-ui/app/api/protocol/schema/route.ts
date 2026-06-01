import { NextRequest } from 'next/server'

export const runtime = 'edge'

const SCHEMA = {
  '@context': 'https://genesis-swarm.app/protocol/v1',
  '@type': 'GenesisOperationalRiskAssessment',
  version: 'GENESIS-1',
  status: 'CANDIDATE',
  license: 'Apache-2.0',
  editor: { name: 'Daman Sharma', contact: 'daman.sharma.2310@gmail.com' },
  schema: {
    subject: {
      lei: 'string|null',
      legal_name: 'string',
      jurisdiction: 'string|null',
    },
    scores: {
      pre_crime_index: { type: 'integer', range: [0, 100], danger_threshold: 70 },
      genesis_score: { type: 'integer', range: [0, 100] },
      trajectory: { enum: ['RISING', 'FALLING', 'HOLDING'] },
      risk_level: { enum: ['LOW', 'MODERATE', 'ELEVATED', 'CRITICAL'] },
    },
    signals: {
      type: 'array',
      items: { name: 'string', severity: { range: [0, 100] }, note: 'string', weight: 'number' },
    },
    pattern_match: { enum: ['wirecard', 'archegos', 'ftx', 'greensill', 'madoff', 'none'] },
    seal: {
      merkle_root: 'sha256-hex',
      signature: 'sha256-hex',
      sealed_at: 'iso8601',
      reveal_at: 'iso8601',
    },
    framework_coverage: {
      type: 'array',
      items: { requirement: 'string', status: { enum: ['met', 'partial', 'missing'] }, note: 'string' },
    },
    data_sources: 'array<string>',
    model: 'string',
  },
}

const OPENAPI = {
  openapi: '3.1.0',
  info: { title: 'GENESIS-1 Protocol', version: '1.0', description: 'Open standard for AI-driven operational-risk reporting in regulated financial entities.', license: { name: 'Apache 2.0' } },
  components: {
    schemas: {
      Assessment: {
        type: 'object',
        required: ['subject', 'scores', 'seal'],
        properties: {
          subject: {
            type: 'object',
            properties: {
              lei: { type: ['string', 'null'], pattern: '^[A-Z0-9]{20}$' },
              legal_name: { type: 'string' },
              jurisdiction: { type: ['string', 'null'] },
            },
          },
          scores: {
            type: 'object',
            properties: {
              pre_crime_index: { type: 'integer', minimum: 0, maximum: 100 },
              genesis_score: { type: 'integer', minimum: 0, maximum: 100 },
              trajectory: { type: 'string', enum: ['RISING', 'FALLING', 'HOLDING'] },
              risk_level: { type: 'string', enum: ['LOW', 'MODERATE', 'ELEVATED', 'CRITICAL'] },
            },
          },
          seal: {
            type: 'object',
            properties: {
              merkle_root: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              signature: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              sealed_at: { type: 'string', format: 'date-time' },
              reveal_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
}

export async function GET(req: NextRequest) {
  const format = new URL(req.url).searchParams.get('format')
  if (format === 'openapi') {
    return new Response(JSON.stringify(OPENAPI, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'inline; filename="genesis-1.openapi.json"',
      },
    })
  }
  return new Response(JSON.stringify(SCHEMA, null, 2), {
    headers: {
      'Content-Type': 'application/ld+json',
      'Content-Disposition': 'inline; filename="genesis-1.schema.jsonld"',
    },
  })
}
