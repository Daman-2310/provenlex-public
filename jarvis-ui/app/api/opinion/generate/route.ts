// AI Legal Opinion Generator. Replaces €3K manual legal opinions with €99
// AI-generated ones. Mandatory watermark + disclaimer + Merkle proof.
import { NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import crypto from 'crypto'
import { getSession } from '@/lib/auth'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'
export const maxDuration = 60

const GROQ = process.env.GROQ_API_KEY

interface OpinionResponse {
  questionFraming: string
  applicableLaw: { framework: string; citation: string; provision: string }[]
  factualBackground: string
  legalAnalysis: string
  qualifications: string[]
  conclusion: string
  confidenceLevel: 'high' | 'moderate' | 'low'
  estimatedReviewHours: number
}

const SYSTEM = `You are a senior Luxembourg financial law counsel drafting a structured legal memorandum. Output ONLY valid JSON. Cite specific articles, regulations, CSSF circulars, ECJ rulings where applicable. Be rigorous but concise. Always include qualifications and limitations.`

function buildPrompt(question: string, fundContext?: string): string {
  return `Draft a legal opinion on:

QUESTION: ${question}

${fundContext ? `FUND CONTEXT: ${fundContext}\n` : ''}
Return this exact JSON structure:
{
  "questionFraming": "<2-3 sentence formal re-statement of the legal question>",
  "applicableLaw": [
    {"framework": "AIFMD II", "citation": "Directive (EU) 2024/...", "provision": "Article 24"}
  ],
  "factualBackground": "<3-4 sentence neutral statement of facts as understood>",
  "legalAnalysis": "<4-6 sentence analysis: principle, application, counter-positions where relevant, with article-level citations inline>",
  "qualifications": ["<formal qualification 1>", "<qualification 2>", "<qualification 3>"],
  "conclusion": "<1-2 sentence formal conclusion>",
  "confidenceLevel": "high|moderate|low",
  "estimatedReviewHours": <integer 2-12 for human review needed>
}

Style: formal legal memo tone, third-person, no "I" or "we". 4-6 applicableLaw entries minimum. 3-5 qualifications. Cite real regulation numbers and Luxembourg-specific CSSF circulars where appropriate.`
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

function merkleRoot(parts: string[]): string {
  let layer = parts.map(sha256)
  while (layer.length > 1) {
    const next: string[] = []
    for (let i = 0; i < layer.length; i += 2) {
      next.push(sha256(layer[i] + (layer[i + 1] ?? layer[i])))
    }
    layer = next
  }
  return layer[0]
}

async function generatePdf(opts: { email: string; question: string; data: OpinionResponse; merkle: string; signature: string }): Promise<Uint8Array> {
  const { email, question, data, merkle, signature } = opts
  const pdf = await PDFDocument.create()
  pdf.setTitle('Genesis Swarm Legal Opinion - AI Assisted')
  pdf.setSubject('AI-generated legal memorandum on Luxembourg financial law')
  pdf.setProducer('Genesis Swarm v0.4')

  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helvItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const mono = await pdf.embedFont(StandardFonts.Courier)

  const C = {
    text: rgb(0.08, 0.08, 0.1),
    dim: rgb(0.45, 0.45, 0.5),
    accent: rgb(0.0, 0.55, 0.35),
    rule: rgb(0.85, 0.86, 0.88),
    watermark: rgb(0.9, 0.9, 0.93),
    warn: rgb(0.95, 0.6, 0.0),
  }

  const margin = 60
  const wrap = (t: string, font: typeof helv, size: number, w: number): string[] => {
    const words = t.split(' '); const out: string[] = []; let cur = ''
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word
      if (font.widthOfTextAtSize(test, size) > w) { if (cur) out.push(cur); cur = word }
      else cur = test
    }
    if (cur) out.push(cur)
    return out
  }

  let page = pdf.addPage([595, 842])
  const { width, height } = page.getSize()

  // Watermark diagonal — every page
  const drawWatermark = (p: typeof page) => {
    const text = 'AI-ASSISTED OPINION - NOT LEGAL ADVICE'
    const fontSize = 48
    const w = helvBold.widthOfTextAtSize(text, fontSize)
    p.drawText(text, {
      x: (width - w * 0.7) / 2,
      y: height / 2,
      size: fontSize,
      font: helvBold,
      color: C.watermark,
      rotate: degrees(-30),
      opacity: 0.35,
    })
  }
  drawWatermark(page)

  let y = height - margin

  // Letterhead
  page.drawText('GENESIS SWARM', { x: margin, y: y - 5, size: 16, font: helvBold, color: C.text })
  page.drawText('AI Legal Memorandum - RegTech Advisory', { x: margin, y: y - 22, size: 9, font: helv, color: C.dim })
  page.drawText('LEGAL MEMORANDUM', { x: width - margin - 130, y: y - 5, size: 9, font: helvBold, color: C.accent })
  page.drawText(`Issued: ${new Date().toISOString().slice(0, 10)}`, {
    x: width - margin - 130, y: y - 18, size: 8, font: mono, color: C.dim,
  })
  page.drawText(`To: ${email}`, { x: width - margin - 130, y: y - 30, size: 8, font: mono, color: C.dim })

  y -= 56
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, color: C.rule, thickness: 0.5 })

  const heading = (title: string) => {
    y -= 22
    page.drawText(title, { x: margin, y, size: 9, font: helvBold, color: C.accent })
    y -= 14
  }
  const paragraph = (text: string, opts?: { font?: typeof helv; size?: number; color?: ReturnType<typeof rgb> }) => {
    const f = opts?.font ?? helv
    const s = opts?.size ?? 10
    const col = opts?.color ?? C.text
    for (const line of wrap(text, f, s, width - 2 * margin)) {
      if (y < 130) {
        page = pdf.addPage([595, 842])
        drawWatermark(page)
        y = height - margin
      }
      page.drawText(line, { x: margin, y, size: s, font: f, color: col })
      y -= s + 3
    }
  }

  heading('I. QUESTION PRESENTED')
  paragraph(question, { font: helvItalic })

  heading('II. QUESTION AS FRAMED')
  paragraph(data.questionFraming)

  heading('III. APPLICABLE LAW')
  for (const law of data.applicableLaw.slice(0, 6)) {
    y -= 4
    if (y < 130) { page = pdf.addPage([595, 842]); drawWatermark(page); y = height - margin }
    page.drawText(`${law.framework} - ${law.provision}`, { x: margin, y, size: 10, font: helvBold, color: C.text })
    y -= 12
    page.drawText(law.citation, { x: margin, y, size: 9, font: mono, color: C.dim })
    y -= 11
  }

  heading('IV. FACTUAL BACKGROUND')
  paragraph(data.factualBackground)

  heading('V. LEGAL ANALYSIS')
  paragraph(data.legalAnalysis)

  heading('VI. QUALIFICATIONS')
  for (let i = 0; i < data.qualifications.slice(0, 5).length; i++) {
    paragraph(`(${i + 1}) ${data.qualifications[i]}`, { size: 9, color: C.dim })
    y -= 3
  }

  heading('VII. CONCLUSION')
  paragraph(data.conclusion, { font: helvBold })

  y -= 12
  const cl = data.confidenceLevel === 'high' ? C.accent : data.confidenceLevel === 'moderate' ? C.warn : rgb(0.85, 0.15, 0.3)
  page.drawText('AI CONFIDENCE: ' + data.confidenceLevel.toUpperCase(), { x: margin, y, size: 9, font: helvBold, color: cl })
  page.drawText(`Estimated human review: ${data.estimatedReviewHours} hours`, {
    x: width - margin - 200, y, size: 9, font: helv, color: C.dim,
  })

  // Footer on every page
  for (const p of pdf.getPages()) {
    const pw = p.getSize().width
    p.drawLine({ start: { x: margin, y: 100 }, end: { x: pw - margin, y: 100 }, color: C.accent, thickness: 0.5 })
    p.drawText('IMPORTANT - AI-ASSISTED OUTPUT', { x: margin, y: 86, size: 7, font: helvBold, color: C.warn })
    p.drawText('This memorandum is generated by AI on the basis of public regulatory sources. It is NOT a substitute', {
      x: margin, y: 76, size: 7, font: helv, color: C.dim,
    })
    p.drawText('for advice from a qualified Luxembourg-licensed lawyer. Estimated human review hours are indicative.', {
      x: margin, y: 67, size: 7, font: helv, color: C.dim,
    })
    p.drawText('MERKLE:', { x: margin, y: 50, size: 6, font: helvBold, color: C.dim })
    p.drawText('0x' + merkle.slice(0, 60), { x: margin + 38, y: 50, size: 6, font: mono, color: C.accent })
    p.drawText('SIG:', { x: margin, y: 40, size: 6, font: helvBold, color: C.dim })
    p.drawText('0x' + signature.slice(0, 60), { x: margin + 38, y: 40, size: 6, font: mono, color: C.accent })
    p.drawText('Genesis Swarm RegTech AI - Luxembourg', { x: margin, y: 22, size: 6, font: helv, color: C.dim })
    p.drawText('genesis-swarm-rgq5.vercel.app/opinion', { x: pw - margin - 160, y: 22, size: 6, font: mono, color: C.dim })
  }

  return await pdf.save()
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  // Allow anonymous for the demo — but logged-in users get history
  let body: { question?: string; fundContext?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const question = (body.question ?? '').trim()
  if (!question || question.length < 16) return Response.json({ error: 'question must be at least 16 chars' }, { status: 400 })

  if (!GROQ) return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 503 })

  let analysis: OpinionResponse
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(question, body.fundContext) },
        ],
        max_tokens: 2000,
        temperature: 0.18,
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

  const merkleParts = [
    session.email ?? 'anonymous',
    question,
    body.fundContext ?? '',
    analysis.questionFraming,
    JSON.stringify(analysis.applicableLaw),
    analysis.legalAnalysis,
    analysis.conclusion,
    new Date().toISOString(),
  ]
  const merkle = merkleRoot(merkleParts)
  const signature = sha256(JSON.stringify(analysis) + (session.email ?? '') + Date.now())

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generatePdf({
      email: session.email ?? 'anonymous@guest',
      question, data: analysis, merkle, signature,
    })
  } catch (e) {
    return Response.json({ error: 'PDF generation failed', detail: String(e) }, { status: 500 })
  }

  // Persist for signed-in users
  if (session.email) {
    const id = crypto.randomBytes(8).toString('hex')
    await kv.lpush(`user:${session.email}:opinions`, {
      id, question,
      summary: analysis.conclusion.slice(0, 240),
      confidence: analysis.confidenceLevel,
      reviewHours: analysis.estimatedReviewHours,
      merkle, signature,
      generatedAt: Date.now(),
    })
  }

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="genesis-swarm-opinion-${Date.now()}.pdf"`,
      'X-Merkle-Root': merkle,
      'X-Signature': signature,
      'X-Confidence': analysis.confidenceLevel,
    },
  })
}
