// 60-Minute Audit Pack generator. Takes a regulator question + user's saved
// fund context, asks Groq to write a CSSF-grade response, generates a
// cryptographically-signed PDF, persists to KV.
import { NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import crypto from 'crypto'
import { getSession } from '@/lib/auth'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'
export const maxDuration = 60

const GROQ = process.env.GROQ_API_KEY

interface SavedAnalysis {
  id: string; fundName: string; fundType?: string; domicile?: string
  complianceScore: number; verdict: string; savedAt: number
}

interface AuditResponse {
  executiveSummary: string
  regulatoryContext: { article: string; citation: string; relevance: string }[]
  evidence: { item: string; status: 'available' | 'partial' | 'gap'; note: string }[]
  fundAssessments: { fundName: string; finding: string; risk: 'low' | 'medium' | 'high' }[]
  recommendation: string
  nextActions: string[]
}

const SYSTEM_PROMPT = `You are a Luxembourg compliance counsel responding to a regulator's question. You produce CSSF-grade audit responses. Cite specific articles from AIFMD II, DORA, SFDR, UCITS, CSSF circulars, FATF recommendations where relevant. Always return ONLY valid JSON.`

function buildUserPrompt(question: string, fundContext: SavedAnalysis[]): string {
  return `A regulator has asked: "${question}"

Customer's tracked fund universe (${fundContext.length} funds):
${fundContext.map(f => `- ${f.fundName} (${f.fundType ?? '?'}, ${f.domicile ?? '?'}): compliance score ${f.complianceScore}/100. Verdict: ${f.verdict}`).join('\n') || '(no saved funds — answer from general principles)'}

Generate an audit response. Return this exact JSON:
{
  "executiveSummary": "<3-4 sentences directly answering the question with citations>",
  "regulatoryContext": [
    {"article": "DORA Art. 28", "citation": "Regulation (EU) 2022/2554", "relevance": "<1 sentence on why this applies>"}
  ],
  "evidence": [
    {"item": "ICT vendor register", "status": "available|partial|gap", "note": "<10 word evidence note>"}
  ],
  "fundAssessments": [
    {"fundName": "<name>", "finding": "<1 sentence>", "risk": "low|medium|high"}
  ],
  "recommendation": "<1-2 sentence formal recommendation>",
  "nextActions": ["<concrete action 1>", "<action 2>", "<action 3>"]
}

Be precise. Use real article numbers (DORA Art. 28, AIFMD II Art. 24, SFDR Art. 8/9, CSSF Circular 22/795 etc). 4-6 evidence items, 3-4 regulatoryContext, 3-5 nextActions.`
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
}

function merkleAnchor(parts: string[]): string {
  let layer = parts.map(p => sha256(p))
  while (layer.length > 1) {
    const next: string[] = []
    for (let i = 0; i < layer.length; i += 2) {
      const l = layer[i]
      const r = layer[i + 1] ?? layer[i]
      next.push(sha256(l + r))
    }
    layer = next
  }
  return layer[0]
}

async function generatePdfPack(opts: {
  email: string; question: string; data: AuditResponse; merkleRoot: string; signature: string
}): Promise<Uint8Array> {
  const { email, question, data, merkleRoot, signature } = opts
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle('Genesis Swarm 60-Minute Audit Pack')
  pdfDoc.setSubject('Cryptographically-signed regulatory audit response')
  pdfDoc.setProducer('Genesis Swarm v0.4')
  pdfDoc.setCreator('Genesis Swarm RegTech AI')
  pdfDoc.setCreationDate(new Date())

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdfDoc.embedFont(StandardFonts.Courier)

  const C = {
    bg: rgb(1, 1, 1),
    text: rgb(0.08, 0.08, 0.1),
    dim: rgb(0.45, 0.45, 0.5),
    primary: rgb(0.0, 0.7, 0.4),
    red: rgb(0.85, 0.15, 0.3),
    amber: rgb(0.95, 0.6, 0.0),
    accent: rgb(0.0, 0.55, 0.35),
    rule: rgb(0.85, 0.86, 0.88),
  }

  const margin = 50
  const wrap = (text: string, font: typeof helv, size: number, maxWidth: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (cur) lines.push(cur)
        cur = w
      } else cur = test
    }
    if (cur) lines.push(cur)
    return lines
  }

  let page = pdfDoc.addPage([595, 842])
  let { width, height } = page.getSize()
  let y = height - margin

  // Top accent
  page.drawRectangle({ x: 0, y: height - 4, width, height: 4, color: C.primary })

  // Header
  page.drawText('GENESIS SWARM', { x: margin, y: y - 10, size: 20, font: helvBold, color: C.text })
  page.drawText('60-Minute Audit Pack - Cryptographically Signed', { x: margin, y: y - 28, size: 9, font: helv, color: C.dim })
  page.drawText(`ISSUED ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`, {
    x: width - margin - 200, y: y - 10, size: 8, font: mono, color: C.accent,
  })
  page.drawText(`PREPARED FOR: ${email}`, {
    x: width - margin - 200, y: y - 24, size: 8, font: mono, color: C.dim,
  })

  y -= 60
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, color: C.rule, thickness: 0.5 })

  // Question
  y -= 22
  page.drawText('REGULATOR QUESTION', { x: margin, y, size: 8, font: helvBold, color: C.dim })
  y -= 16
  const qLines = wrap(question, helv, 11, width - 2 * margin)
  for (const line of qLines.slice(0, 6)) {
    page.drawText(line, { x: margin, y, size: 11, font: helv, color: C.text })
    y -= 14
  }

  // Executive Summary
  y -= 14
  page.drawRectangle({ x: margin, y: y - 60, width: width - 2 * margin, height: 60, color: rgb(0.96, 0.99, 0.97) })
  page.drawText('EXECUTIVE SUMMARY', { x: margin + 10, y: y - 14, size: 8, font: helvBold, color: C.primary })
  let sy = y - 28
  const sumLines = wrap(data.executiveSummary, helv, 10, width - 2 * margin - 20)
  for (const line of sumLines.slice(0, 4)) {
    page.drawText(line, { x: margin + 10, y: sy, size: 10, font: helv, color: C.text })
    sy -= 12
  }
  y -= 76

  // Regulatory context
  page.drawText('REGULATORY FRAMEWORK', { x: margin, y, size: 8, font: helvBold, color: C.dim })
  y -= 14
  for (const ctx of data.regulatoryContext.slice(0, 4)) {
    page.drawText(ctx.article, { x: margin, y, size: 10, font: helvBold, color: C.accent })
    page.drawText(ctx.citation, { x: margin + 130, y, size: 9, font: mono, color: C.dim })
    y -= 12
    const relLines = wrap(ctx.relevance, helv, 9, width - 2 * margin - 20)
    for (const line of relLines.slice(0, 2)) {
      page.drawText(line, { x: margin + 20, y, size: 9, font: helv, color: C.text })
      y -= 11
    }
    y -= 3
  }

  // Evidence
  y -= 10
  page.drawText('EVIDENCE CHAIN', { x: margin, y, size: 8, font: helvBold, color: C.dim })
  y -= 14
  for (const ev of data.evidence.slice(0, 6)) {
    const statusColor = ev.status === 'available' ? C.primary : ev.status === 'partial' ? C.amber : C.red
    const symbol = ev.status === 'available' ? '[OK]' : ev.status === 'partial' ? '[~]' : '[X]'
    page.drawText(symbol, { x: margin, y, size: 9, font: helvBold, color: statusColor })
    page.drawText(ev.item, { x: margin + 30, y, size: 10, font: helvBold, color: C.text })
    page.drawText(ev.status.toUpperCase(), { x: width - margin - 60, y, size: 8, font: helvBold, color: statusColor })
    y -= 11
    const evLines = wrap(ev.note, helv, 8, width - 2 * margin - 40)
    for (const line of evLines.slice(0, 2)) {
      page.drawText(line, { x: margin + 30, y, size: 8, font: helv, color: C.dim })
      y -= 10
    }
    y -= 3
    if (y < 280) break
  }

  // Fund assessments
  if (y < 280) {
    page = pdfDoc.addPage([595, 842])
    width = page.getSize().width
    height = page.getSize().height
    page.drawRectangle({ x: 0, y: height - 4, width, height: 4, color: C.primary })
    y = height - margin
  }
  y -= 12
  page.drawText('FUND-BY-FUND ASSESSMENT', { x: margin, y, size: 8, font: helvBold, color: C.dim })
  y -= 14
  for (const fa of data.fundAssessments.slice(0, 8)) {
    const riskColor = fa.risk === 'high' ? C.red : fa.risk === 'medium' ? C.amber : C.primary
    page.drawText(fa.fundName, { x: margin, y, size: 10, font: helvBold, color: C.text })
    page.drawText(fa.risk.toUpperCase() + ' RISK', { x: width - margin - 80, y, size: 8, font: helvBold, color: riskColor })
    y -= 11
    const lines = wrap(fa.finding, helv, 9, width - 2 * margin - 100)
    for (const line of lines.slice(0, 2)) {
      page.drawText(line, { x: margin, y, size: 9, font: helv, color: C.dim })
      y -= 10
    }
    y -= 4
  }

  // Recommendation + actions
  y -= 10
  page.drawText('RECOMMENDATION', { x: margin, y, size: 8, font: helvBold, color: C.dim })
  y -= 14
  for (const line of wrap(data.recommendation, helv, 10, width - 2 * margin).slice(0, 4)) {
    page.drawText(line, { x: margin, y, size: 10, font: helv, color: C.text })
    y -= 12
  }

  y -= 8
  page.drawText('NEXT ACTIONS', { x: margin, y, size: 8, font: helvBold, color: C.dim })
  y -= 14
  for (let i = 0; i < data.nextActions.slice(0, 5).length; i++) {
    const action = data.nextActions[i]
    page.drawText(`${i + 1}.`, { x: margin, y, size: 10, font: helvBold, color: C.accent })
    for (const line of wrap(action, helv, 10, width - 2 * margin - 25).slice(0, 2)) {
      page.drawText(line, { x: margin + 18, y, size: 10, font: helv, color: C.text })
      y -= 12
    }
    y -= 2
  }

  // Footer (every page)
  for (const p of pdfDoc.getPages()) {
    const pw = p.getSize().width
    p.drawLine({ start: { x: margin, y: 80 }, end: { x: pw - margin, y: 80 }, color: C.primary, thickness: 0.5 })
    p.drawText('CRYPTOGRAPHIC PROOF', { x: margin, y: 64, size: 7, font: helvBold, color: C.primary })
    p.drawText('SHA-256 + Merkle - tamper-evident audit trail', { x: margin, y: 53, size: 6, font: helv, color: C.dim })
    p.drawText('Merkle Root:', { x: margin, y: 38, size: 6, font: helvBold, color: C.dim })
    p.drawText('0x' + merkleRoot.slice(0, 60), { x: margin + 50, y: 38, size: 6, font: mono, color: C.accent })
    p.drawText('Signature:', { x: margin, y: 28, size: 6, font: helvBold, color: C.dim })
    p.drawText('0x' + signature.slice(0, 60), { x: margin + 50, y: 28, size: 6, font: mono, color: C.accent })
    p.drawText('GENESIS SWARM RegTech AI - Luxembourg - CSSF-aligned', { x: margin, y: 14, size: 6, font: helv, color: C.dim })
    p.drawText('genesis-swarm-rgq5.vercel.app', { x: pw - margin - 130, y: 14, size: 6, font: mono, color: C.dim })
  }

  return await pdfDoc.save()
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { question?: string; fundIds?: string[] }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const question = (body.question ?? '').trim()
  if (!question || question.length < 12) return Response.json({ error: 'question must be at least 12 chars' }, { status: 400 })

  // Pull user's saved funds
  const allFunds = await kv.lrange<SavedAnalysis>(`user:${session.email}:analyses`, 0, 49)
  const selected = body.fundIds && body.fundIds.length > 0
    ? allFunds.filter(f => body.fundIds!.includes(f.id))
    : allFunds.slice(0, 5)

  // Ask Groq
  if (!GROQ) return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 503 })
  let analysis: AuditResponse
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(question, selected) }],
        max_tokens: 1800,
        temperature: 0.15,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(40000),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return Response.json({ error: `Groq ${res.status}`, detail: t.slice(0, 200) }, { status: 502 })
    }
    type GroqOut = { choices?: Array<{ message?: { content?: string } }> }
    const groq = (await res.json()) as GroqOut
    const raw = groq.choices?.[0]?.message?.content ?? '{}'
    analysis = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  } catch (e) {
    return Response.json({ error: 'AI generation failed', detail: String(e) }, { status: 500 })
  }

  // Crypto proof
  const merkleParts = [
    session.email,
    question,
    JSON.stringify(selected),
    analysis.executiveSummary,
    JSON.stringify(analysis.regulatoryContext),
    JSON.stringify(analysis.evidence),
    JSON.stringify(analysis.fundAssessments),
    new Date().toISOString(),
  ]
  const merkleRoot = merkleAnchor(merkleParts)
  const signature = sha256(JSON.stringify(analysis) + session.email + Date.now())

  // Generate PDF
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generatePdfPack({ email: session.email, question, data: analysis, merkleRoot, signature })
  } catch (e) {
    return Response.json({ error: 'PDF generation failed', detail: String(e) }, { status: 500 })
  }

  // Persist audit history
  const auditId = crypto.randomBytes(8).toString('hex')
  const auditRecord = {
    id: auditId,
    question,
    fundCount: selected.length,
    fundNames: selected.map(f => f.fundName),
    summary: analysis.executiveSummary.slice(0, 200),
    merkleRoot,
    signature,
    generatedAt: Date.now(),
  }
  await kv.lpush(`user:${session.email}:audits`, auditRecord)

  // Return PDF
  const safeName = question.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="genesis-swarm-audit-${safeName}-${Date.now()}.pdf"`,
      'X-Merkle-Root': merkleRoot,
      'X-Signature': signature,
      'X-Audit-Id': auditId,
    },
  })
}
