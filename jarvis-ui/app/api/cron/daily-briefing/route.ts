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

// Deterministic morning briefing — assembled only from the subscriber's own
// saved data and the real regulatory news feed. No LLM: nothing is sent to any
// third party, and the text is fully reproducible from its inputs.
function generateBriefing(email: string, funds: SavedAnalysis[], news: NewsItem[]): string {
  const worst = [...funds].sort((a, b) => a.complianceScore - b.complianceScore)[0]
  const fundLine = funds.length
    ? `You are tracking ${funds.length} saved fund${funds.length === 1 ? '' : 's'}${worst ? `. The lowest compliance score is ${worst.fundName} at ${worst.complianceScore}/100` : ''}.`
    : 'No saved funds yet — run a prospectus through /scan to start tracking compliance scores.'
  const newsLine = news.length
    ? `Overnight regulatory updates (${news.length}): ${news.slice(0, 3).map(n => `${n.source} — ${n.title}`).join(' · ')}.`
    : 'No new regulatory headlines overnight.'
  const action = worst && worst.complianceScore < 80
    ? `Action: review ${worst.fundName} (${worst.complianceScore}/100) and re-scan after remediation.`
    : 'Action: keep every tracked fund above 80/100; re-scan after any prospectus change.'
  return `ProvenLex morning briefing for ${email}\n\n${fundLine}\n\n${newsLine}\n\n${action}`
}

function brieingHtml(briefing: string, funds: SavedAnalysis[], news: NewsItem[], dashboardUrl: string): string {
  const paragraphs = briefing.split('\n\n').map(p => `<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#222">${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#f7f7f9;color:#111">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:24px;height:24px;background:linear-gradient(135deg,#00ff88,#00aa55);border-radius:6px"></div>
      <strong style="font-size:13px;letter-spacing:.1em;color:#00aa55">PROVENLEX</strong>
    </div>
    <h1 style="font-size:22px;font-weight:900;margin:0 0 4px;color:#111">Your morning compliance briefing</h1>
    <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.1em;margin-bottom:24px">${new Date().toDateString()} · ${funds.length} funds tracked · ${news.length} regulatory updates</div>
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 22px;background:#00cc6a;color:#000;text-decoration:none;border-radius:6px;font-weight:900;font-size:12px;letter-spacing:.05em">OPEN DASHBOARD →</a>
  </div>
  <div style="text-align:center;font-size:10px;color:#aaa;margin-top:18px;letter-spacing:.1em;text-transform:uppercase">ProvenLex RegTech AI · Luxembourg · <a href="${dashboardUrl}" style="color:#aaa">manage email preferences</a></div>
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
      `ProvenLex · Morning briefing · ${new Date().toDateString()}`,
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
