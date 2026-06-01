// The Genesis Daily — AI-generated morning briefing.
// Pulls top movers from the Book + fresh vindications + 1 forensic narrative.
// Renders to both HTML (Resend-friendly) and plain text.

import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import { getVindicationsList, type VindicationHit } from '@/lib/vindicate'
import { groqChat } from '@/lib/groqClient'

const GROQ = process.env.GROQ_API_KEY

interface BriefingPayload {
  date: string
  topRiskMovers: typeof BOOK_SNAPSHOT_ENTRIES
  vindications: VindicationHit[]
  forensicNarrative: string
  totalEntries: number
}

export async function buildBriefingPayload(): Promise<BriefingPayload> {
  // Top 5 highest pre_crime_index from current Book
  const topRiskMovers = [...BOOK_SNAPSHOT_ENTRIES]
    .sort((a, b) => b.pre_crime_index - a.pre_crime_index)
    .slice(0, 5)

  const vindications = await getVindicationsList(3)

  let forensicNarrative = ''
  if (GROQ) {
    try {
      const topNames = topRiskMovers.slice(0, 3).map(e => `${e.candidate.name} (Pre-Crime ${e.pre_crime_index})`).join(', ')
      forensicNarrative = await groqChat({
        system: 'You are the Genesis Swarm editor. Write a single-paragraph (4-6 sentences) morning narrative in the style of a Bloomberg morning brief — institutional, terse, analytical. Frame everything as operational-risk indicators, never as factual accusations. No markdown. PLAIN TEXT only.',
        user: `Today is ${new Date().toISOString().slice(0, 10)}. The top 3 Genesis-flagged entities in this morning's Book sweep are: ${topNames}. Write one paragraph for an institutional CIO. End with one concrete monitoring suggestion.`,
        max_tokens: 350,
        temperature: 0.5,
      })
    } catch {
      forensicNarrative = 'The morning sweep highlights elevated operational-risk indicators among institutional structures. The Book of Genesis updates continue across the EU jurisdictional perimeter.'
    }
  } else {
    forensicNarrative = 'AI engine not configured — narrative skipped.'
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    topRiskMovers,
    vindications,
    forensicNarrative,
    totalEntries: BOOK_SNAPSHOT_ENTRIES.length,
  }
}

export function renderBriefingHtml(p: BriefingPayload, origin: string): string {
  const indexColor = (idx: number) => idx >= 70 ? '#ff3366' : idx >= 50 ? '#ff7700' : idx >= 30 ? '#ffaa00' : '#00ff88'

  const movers = p.topRiskMovers.map(e => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #1f1f2e;color:#fff;font-weight:bold;font-family:ui-monospace,monospace;font-size:13px;width:50px;">
        <span style="color:${indexColor(e.pre_crime_index)};font-size:18px;">${e.pre_crime_index}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #1f1f2e;">
        <a href="${origin}/book/${e.prophecy_id}" style="color:#fff;text-decoration:none;font-weight:600;font-size:13px;">${escapeHtml(e.candidate.name)}</a>
        <div style="font-size:10px;color:#888;margin-top:2px;text-transform:uppercase;letter-spacing:.1em;">
          ${escapeHtml(e.candidate.jurisdiction)} · ${escapeHtml(e.candidate.category.replace(/_/g, ' '))}
          ${e.pattern_match ? ` · pattern: <span style="color:#ff3366;">${escapeHtml(e.pattern_match)}</span>` : ''}
        </div>
      </td>
    </tr>
  `).join('')

  const vinds = p.vindications.length > 0 ? p.vindications.map(v => `
    <li style="margin-bottom:10px;color:#fff;font-size:12px;">
      <strong style="color:#ff3366;">${escapeHtml(v.subject)}</strong> — ${escapeHtml(v.headline.slice(0, 100))}…
      <br><span style="color:#888;font-size:10px;">${escapeHtml(v.outlet)} · <a href="${escapeHtml(v.url)}" style="color:#4a9eff;text-decoration:none;">source</a></span>
    </li>
  `).join('') : '<li style="color:#888;font-size:12px;">No new vindications since last brief.</li>'

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>The Genesis Daily — ${escapeHtml(p.date)}</title></head>
<body style="margin:0;padding:0;background:#050508;font-family:Helvetica,Arial,sans-serif;color:#fff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#050508;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#0a0a14;border-radius:16px;border:1px solid #2a2a3e;overflow:hidden;">

        <tr><td style="padding:32px 32px 16px 32px;border-bottom:1px solid #1f1f2e;">
          <div style="font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:#9b6dff;font-weight:bold;margin-bottom:6px;">Genesis Swarm</div>
          <h1 style="margin:0;font-size:28px;font-weight:900;line-height:1.1;color:#fff;">The Genesis Daily</h1>
          <div style="font-size:11px;color:#888;margin-top:6px;font-family:ui-monospace,monospace;letter-spacing:.1em;">${escapeHtml(p.date)} · Book of Genesis · ${p.totalEntries} entities tracked</div>
        </td></tr>

        <tr><td style="padding:24px 32px;">
          <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#9b6dff;font-weight:bold;margin-bottom:14px;">§ 1 · Top operational-risk indicators</div>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">${movers}</table>
        </td></tr>

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f2e;">
          <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#ff3366;font-weight:bold;margin-bottom:14px;">§ 2 · Recent vindications</div>
          <ul style="padding-left:18px;margin:0;">${vinds}</ul>
        </td></tr>

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f2e;">
          <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#4a9eff;font-weight:bold;margin-bottom:14px;">§ 3 · Editor's morning note</div>
          <p style="margin:0;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.8);">${escapeHtml(p.forensicNarrative)}</p>
        </td></tr>

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f2e;text-align:center;">
          <a href="${origin}/book" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#9b6dff 0%,#4a9eff 100%);color:#000;font-weight:900;font-size:11px;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;border-radius:6px;">Read the Book →</a>
        </td></tr>

        <tr><td style="padding:20px 32px;text-align:center;font-size:10px;color:#666;border-top:1px solid #1f1f2e;">
          AI-generated operational-risk analysis · not investment advice · no warranty of accuracy<br>
          <a href="${origin}/legal" style="color:#666;">Terms &amp; right-to-erasure</a> ·
          <a href="${origin}/daily?unsubscribe=1" style="color:#666;">Unsubscribe</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

export function renderBriefingText(p: BriefingPayload, origin: string): string {
  const movers = p.topRiskMovers.map(e =>
    `  ${e.pre_crime_index}  ${e.candidate.name} [${e.candidate.jurisdiction}]${e.pattern_match ? ` · pattern: ${e.pattern_match}` : ''}`
  ).join('\n')

  const vinds = p.vindications.length > 0
    ? p.vindications.map(v => `  - ${v.subject} — ${v.headline.slice(0, 90)}… (${v.outlet})`).join('\n')
    : '  (no new vindications since last brief)'

  return `
THE GENESIS DAILY · ${p.date}
${p.totalEntries} entities tracked · ${origin}/book

§ 1 · TOP OPERATIONAL-RISK INDICATORS
${movers}

§ 2 · RECENT VINDICATIONS
${vinds}

§ 3 · EDITOR'S MORNING NOTE
${p.forensicNarrative}

→ Read the Book: ${origin}/book

—
AI-generated operational-risk analysis. Not investment advice. Terms: ${origin}/legal
`.trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
