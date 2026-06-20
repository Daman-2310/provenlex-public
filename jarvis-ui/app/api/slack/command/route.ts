// Slack slash command endpoint: /compliance <question>
// Verifies the Slack signing secret, then returns a deterministic, honest
// response. ProvenLex makes NO LLM calls — this bot does not send the
// question to any third-party model. It points the user at the deterministic
// scanner and the relevant regulation references.
import { NextRequest } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 30

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET
const BASE = 'https://provenlex.vercel.app'

function verifySlackSignature(body: string, sig: string | null, ts: string | null): boolean {
  if (!SLACK_SIGNING_SECRET || !sig || !ts) return false
  // Reject replays older than 5min
  const tsNum = parseInt(ts, 10)
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false
  const base = `v0:${ts}:${body}`
  const expected = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(base).digest('hex')
  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// Deterministic routing — no model, no generated prose. Points at the right
// regulation reference page based on simple keyword matching.
function route(question: string): string {
  const q = question.toLowerCase()
  const refs: string[] = []
  if (/\bdora\b|operational resilience|ict/.test(q)) refs.push(`• DORA → ${BASE}/dora`)
  if (/aifmd|leverage|aifm/.test(q)) refs.push(`• AIFMD II → ${BASE}/aifmd`)
  if (/sfdr|article 8|article 9|esg|sustainab/.test(q)) refs.push(`• SFDR → ${BASE}/sfdr`)
  if (/sanction|ofac|screen|sdn/.test(q)) refs.push(`• Sanctions screening → ${BASE}/screening`)
  if (refs.length === 0) refs.push(`• Regulation references → ${BASE}/aifmd, ${BASE}/dora, ${BASE}/sfdr`)
  return [
    `ProvenLex is *deterministic* — it does not use an AI/LLM, so it won't generate a free-text answer here.`,
    ``,
    `To check a prospectus against AIFMD II / UCITS reproducibly, paste it into the client-side scanner (nothing is uploaded): ${BASE}/scan`,
    ``,
    `Relevant references for *"${question.slice(0, 160)}"*:`,
    ...refs,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('x-slack-signature')
  const ts = req.headers.get('x-slack-request-timestamp')

  // Verify signature in production
  if (SLACK_SIGNING_SECRET && !verifySlackSignature(body, sig, ts)) {
    return Response.json({ error: 'invalid signature' }, { status: 401 })
  }

  // Parse Slack form-urlencoded payload
  const params = new URLSearchParams(body)
  const text = params.get('text')?.trim() ?? ''
  const userName = params.get('user_name') ?? 'colleague'
  const command = params.get('command') ?? '/compliance'

  // Handle help cases
  if (!text || text === 'help') {
    return Response.json({
      response_type: 'ephemeral',
      text: `*ProvenLex Compliance Bot*\n\nProvenLex is deterministic — no AI/LLM. This bot points you at the right tool and references.\n\nUsage: \`${command} <topic>\`\n\nExamples:\n• \`${command} DORA Art. 28 sub-threshold AIFM\`\n• \`${command} SFDR Art. 8 disclosure\`\n• \`${command} screen ROSNEFT\`\n\nRun a prospectus check (nothing uploaded): ${BASE}/scan`,
    })
  }

  const answer = route(text)

  return Response.json({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'ProvenLex Compliance', emoji: true },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `*${userName}* asked: _"${text.slice(0, 200)}"_` }],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: answer.slice(0, 2900) },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Run a scan' }, url: `${BASE}/scan`, style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Open Dashboard' }, url: `${BASE}/dashboard` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_ProvenLex · deterministic compliance tooling · no LLM, nothing uploaded · information only, not legal advice._' }],
      },
    ],
  })
}
