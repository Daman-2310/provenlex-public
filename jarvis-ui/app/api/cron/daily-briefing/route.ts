// Daily AI Briefing — runs at 07:00 UTC. Generates personalized regulatory
// summary per subscriber, sends via Resend.
import { NextRequest } from 'next/server'
import { authorizeCron, getActiveSubscribers, sendEmail } from '@/lib/cron'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'
export const maxDuration = 60

interface AlertPreferences { email: string; dailyBriefing: boolean }
interface SavedAnalysis { fundName: string; complianceScore: number; verdict: string; fundType?: string }
interface NewsItem { source: string; title: string; link: string; frameworks?: string[]; summary?: string }

const GROQ = process.env.GROQ_API_KEY
const SYSTEM = `You are a Luxembourg financial compliance analyst writing the morning briefing. Be concise, authoritative, written for an institutional CIO. Output PLAIN TEXT (no markdown, no bullets). 3 short paragraphs maximum.`

async function generateBriefing(email: string, funds: SavedAnalysis[], news: NewsItem[]): Promise<string> {
  if (!GROQ) {
    return `Genesis Swarm morning briefing for ${email}\n\nTracking ${funds.length} saved fund${funds.length === 1 ? '' : 's'}. ${news.length} regulatory updates overnight.\n\nFunds: ${funds.slice(0, 5).map(f => `${f.fundName} (${f.complianceScore}/100)`).join(', ') || 'none yet'}.\n\nKey updates: ${news.slice(0, 3).map(n => `${n.source}: ${n.title}`).join(' / ') || 'none'}.`
  }
  const prompt = `Generate a 3-paragraph morning compliance briefing for ${email}.

Their tracked funds (${funds.length} total):
${funds.slice(0, 8).map(f => `- ${f.fundName} (${f.fundType ?? 'fund'}) compliance score ${f.complianceScore}/100`).join('\n') || 'none yet'}

Latest regulatory headlines (last 24h):
${news.slice(0, 10).map(n => `- [${n.source}] ${n.title}${n.frameworks?.length ? ` (${n.frameworks.join(', ')})` : ''}`).join('\n') || 'none'}

Write: paragraph 1 = portfolio status (worst-scoring fund + any AIFMD/DORA/SFDR risks), paragraph 2 = what changed in regulation overnight that matters to them, paragraph 3 = single concrete action item for today.`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return `Briefing generation failed (Groq ${res.status}).`
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content?.trim() ?? 'No briefing available.'
  } catch (e) {
    return `Briefing generation error: ${String(e)}`
  }
}

function brieingHtml(briefing: string, funds: SavedAnalysis[], news: NewsItem[], dashboardUrl: string): string {
  const paragraphs = briefing.split('\n\n').map(p => `<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#222">${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f7f7f9;color:#111">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:24px;height:24px;background:linear-gradient(135deg,#00ff88,#00aa55);border-radius:6px"></div>
      <strong style="font-size:13px;letter-spacing:.1em;color:#00aa55">GENESIS SWARM</strong>
    </div>
    <h1 style="font-size:22px;font-weight:900;margin:0 0 4px;color:#111">Your morning compliance briefing</h1>
    <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:24px">${new Date().toDateString()} · ${funds.length} funds tracked · ${news.length} regulatory updates</div>
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 22px;background:#00cc6a;color:#000;text-decoration:none;border-radius:6px;font-weight:900;font-size:12px;letter-spacing:.05em">OPEN DASHBOARD →</a>
  </div>
  <div style="text-align:center;font-size:10px;color:#aaa;margin-top:18px;letter-spacing:.1em;text-transform:uppercase">Genesis Swarm RegTech AI · Luxembourg · <a href="${dashboardUrl}" style="color:#aaa">manage email preferences</a></div>
</div>`
}

export async function GET(req: NextRequest) {
  if (!(await authorizeCron(req))) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const origin = new URL(req.url).origin

  const emails = await getActiveSubscribers()
  const news = await kv.lrange<NewsItem>('news:items', 0, 19) // latest 20

  const results: Array<{ email: string; ok: boolean; reason?: string }> = []
  for (const email of emails) {
    const prefs = await kv.get<AlertPreferences>(`user:${email}:alert-prefs`)
    if (!prefs?.dailyBriefing) { results.push({ email, ok: false, reason: 'opted out' }); continue }
    const funds = await kv.lrange<SavedAnalysis>(`user:${email}:analyses`, 0, 49)

    const briefing = await generateBriefing(email, funds, news)
    const dashboardUrl = `${origin}/dashboard`
    const sent = await sendEmail(
      email,
      `Genesis Swarm · Morning briefing · ${new Date().toDateString()}`,
      brieingHtml(briefing, funds, news, dashboardUrl),
      briefing,
    )
    results.push({ email, ok: sent })
  }

  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    subscribersProcessed: results.length,
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  })
}
