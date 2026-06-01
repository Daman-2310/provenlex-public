import { NextRequest } from 'next/server'

export const runtime = 'edge'

interface GleifRecord { lei?: string; legalName?: string; jurisdiction?: string }
interface FundScore { score?: number; grade?: string; verdict?: string }

function html(s: TemplateStringsArray, ...values: unknown[]): string {
  let out = ''
  s.forEach((part, i) => { out += part; if (i < values.length) out += String(values[i]) })
  return out
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lei: string }> }) {
  const { lei: rawLei } = await params
  const lei = rawLei.toUpperCase()
  const sp = new URL(req.url).searchParams
  const theme = sp.get('theme') === 'light' ? 'light' : 'dark'
  const size = sp.get('size') === 'lg' ? 'lg' : sp.get('size') === 'sm' ? 'sm' : 'md'
  const link = sp.get('link') !== 'false'
  const origin = new URL(req.url).origin

  if (!/^[A-Z0-9]{20}$/.test(lei)) {
    return new Response(errorHtml(theme, 'Invalid LEI'), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'ALLOWALL' },
    })
  }

  let gleif: GleifRecord | null = null
  let score: FundScore | null = null
  try {
    const gleifRes = await fetch(`${origin}/api/real/gleif?lei=${encodeURIComponent(lei)}`, { next: { revalidate: 86400 } })
    if (gleifRes.ok) gleif = await gleifRes.json() as GleifRecord
  } catch { /* */ }

  if (!gleif?.legalName) {
    return new Response(errorHtml(theme, 'Entity not found'), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'ALLOWALL' },
    })
  }

  try {
    const scoreRes = await fetch(`${origin}/api/fund-score?fund_name=${encodeURIComponent(gleif.legalName)}`, { next: { revalidate: 3600 } })
    if (scoreRes.ok) score = await scoreRes.json() as FundScore
  } catch { /* */ }

  const body = renderBadge({ lei, gleif, score, theme, size, link, origin })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      // Crucially: allow embedding cross-origin
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
    },
  })
}

function renderBadge({
  lei, gleif, score, theme, size, link, origin,
}: {
  lei: string
  gleif: GleifRecord
  score: FundScore | null
  theme: 'light' | 'dark'
  size: 'sm' | 'md' | 'lg'
  link: boolean
  origin: string
}): string {
  const s = score?.score ?? null
  const grade = score?.grade ?? '—'
  const color = s === null ? '#888' : s >= 80 ? '#00ff88' : s >= 60 ? '#ffaa00' : '#ff3366'
  const gradeColors: Record<string, string> = { A: '#00ff88', B: '#4a9eff', C: '#ffaa00', D: '#ff3366' }
  const gradeColor = gradeColors[grade] ?? '#888'

  const sizes = {
    sm: { pad: '12px 16px', sc: '32px', maxW: '260px', titleSize: '11px' },
    md: { pad: '16px 20px', sc: '44px', maxW: '320px', titleSize: '12px' },
    lg: { pad: '20px 24px', sc: '56px', maxW: '400px', titleSize: '14px' },
  }[size]

  const bgA = theme === 'light' ? '#fafafa' : '#0a0a14'
  const bgB = theme === 'light' ? '#ffffff' : '#101019'
  const textA = theme === 'light' ? '#0a0a14' : '#ffffff'
  const textB = theme === 'light' ? '#666' : 'rgba(255,255,255,0.55)'
  const border = theme === 'light' ? '#e5e5e5' : 'rgba(255,255,255,0.08)'
  const shadow = theme === 'light'
    ? '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
    : `0 0 0 1px ${color}30, 0 0 24px ${color}15`

  const href = `${origin}/funds/${lei}`
  const wrapOpen = link ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">` : ''
  const wrapClose = link ? `</a>` : ''

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Genesis Score · ${esc(gleif.legalName ?? lei)}</title>
<style>
*,*:before,*:after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 4px; }
a { text-decoration: none; display: block; }
.badge {
  width: 100%; max-width: ${sizes.maxW};
  padding: ${sizes.pad};
  background: linear-gradient(135deg, ${bgA} 0%, ${bgB} 100%);
  border-radius: 12px;
  border: 1px solid ${border};
  box-shadow: ${shadow};
  color: ${textA};
  display: flex; align-items: center; gap: 16px;
  transition: transform 0.2s;
}
a:hover .badge { transform: scale(1.02); }
.score-col { flex-shrink: 0; text-align: center; min-width: 70px; }
.score-num {
  font-size: ${sizes.sc}; font-weight: 900; line-height: 0.95;
  color: ${color};
  ${theme === 'dark' ? `text-shadow: 0 0 16px ${color}80;` : ''}
  font-variant-numeric: tabular-nums;
}
.score-denom { font-size: 8px; text-transform: uppercase; letter-spacing: 0.15em; color: ${textB}; margin-top: 2px; }
.grade-pill {
  display: inline-block; margin-top: 6px;
  padding: 2px 8px; border-radius: 999px;
  background: ${gradeColor}15;
  border: 1px solid ${gradeColor}50;
  color: ${gradeColor};
  font-size: 10px; font-weight: 900; letter-spacing: 0.1em;
}
.info-col { flex: 1; min-width: 0; }
.kicker { font-size: 8px; text-transform: uppercase; letter-spacing: 0.18em; color: ${textB}; font-weight: 700; margin-bottom: 2px; }
.name { font-size: ${sizes.titleSize}; font-weight: 800; color: ${textA}; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { font-size: 9px; color: ${textB}; margin-bottom: 6px; }
.attr { font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: ${textB}; opacity: 0.7; }
</style>
</head>
<body>
${wrapOpen}<div class="badge">
  <div class="score-col">
    <div class="score-num">${s ?? '—'}</div>
    <div class="score-denom">/ 100</div>
    ${grade !== '—' ? `<div class="grade-pill">GRADE ${esc(grade)}</div>` : ''}
  </div>
  <div class="info-col">
    <div class="kicker">Genesis Score</div>
    <div class="name">${esc(gleif.legalName ?? lei)}</div>
    <div class="meta">LEI ${esc(lei)}${gleif.jurisdiction ? ` · ${esc(gleif.jurisdiction)}` : ''}</div>
    <div class="attr">Verified by Genesis Swarm</div>
  </div>
</div>${wrapClose}
</body>
</html>`
}

function errorHtml(theme: 'light' | 'dark', message: string): string {
  const bg = theme === 'light' ? '#fafafa' : '#0a0a14'
  const text = theme === 'light' ? '#666' : 'rgba(255,255,255,0.5)'
  return html`<!doctype html><html><head><style>html,body{background:transparent;margin:0;padding:0;font-family:ui-monospace,monospace;}</style></head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="padding:14px 18px;border-radius:10px;background:${bg};border:1px solid rgba(255,255,255,0.08);font-size:11px;color:${text};">Genesis Swarm · ${esc(message)}</div>
</body></html>`
}
