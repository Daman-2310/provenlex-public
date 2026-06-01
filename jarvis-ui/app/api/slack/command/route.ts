// Slack slash command endpoint: /compliance <question>
// Verifies Slack signing secret, parses the command, calls Groq, returns a
// Slack-formatted response with regulatory citations.
import { NextRequest } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 30

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET
const GROQ = process.env.GROQ_API_KEY

const SYSTEM = `You are JARVIS, the Genesis Swarm compliance AI deployed via Slack. Answer concisely (3 short paragraphs maximum) for a Luxembourg fund manager. Cite specific regulation articles (DORA Art. X, AIFMD II Art. Y, SFDR Art. Z, CSSF Circular NN/NNN, ECJ rulings). End with a single concrete action item. Format for Slack: use *bold*, no markdown bullets, plain line breaks.`

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

async function askGroq(question: string): Promise<string> {
  if (!GROQ) return 'Genesis Swarm AI is currently offline. Please contact daman.sharma.2310@gmail.com'
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: question }],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return `AI engine returned ${res.status}. Please try again in a moment.`
    type GroqOut = { choices?: Array<{ message?: { content?: string } }> }
    const groq = (await res.json()) as GroqOut
    return groq.choices?.[0]?.message?.content?.trim() ?? 'No response generated.'
  } catch (e) {
    return `Genesis Swarm error: ${String(e).slice(0, 200)}`
  }
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
      text: `*Genesis Swarm Compliance Bot*\n\nUsage: \`${command} <your compliance question>\`\n\nExamples:\n• \`${command} Does DORA Art. 28 apply to a sub-threshold AIFM?\`\n• \`${command} What are SFDR Art. 8 disclosure obligations?\`\n• \`${command} Screen ROSNEFT against OFAC\`\n\nFull dashboard: https://genesis-swarm-rgq5.vercel.app`,
    })
  }

  // Send a 200 immediately and respond async via response_url? For now, sync (Slack times out at 3s)
  // Groq usually responds in 1-2s for short prompts
  const answer = await askGroq(text)

  return Response.json({
    response_type: 'in_channel',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Genesis Swarm Compliance', emoji: true },
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
          { type: 'button', text: { type: 'plain_text', text: 'Open Dashboard' }, url: 'https://genesis-swarm-rgq5.vercel.app/dashboard', style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Get full audit pack' }, url: 'https://genesis-swarm-rgq5.vercel.app/audit' },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_Powered by Genesis Swarm RegTech AI · Groq llama-3.3-70b · cite-your-sources mode · This is AI guidance, not legal advice._' }],
      },
    ],
  })
}
