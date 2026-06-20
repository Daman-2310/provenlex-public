// lib/audit-pdf.ts
//
// Renders an AuditPack into a clean, board-ready PDF — entirely client-side via
// pdf-lib (no server, nothing uploaded), matching the engine's "nothing leaves
// the browser" guarantee. This is the artifact a compliance officer can hand to
// their board: every finding, its regulatory basis, and the tamper-evident
// SHA-256 chain root that lets anyone re-verify the pack independently.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { AuditPack, AuditEntry } from '@/lib/audit-pack'

const A4 = { w: 595.28, h: 841.89 }
const M = 48 // page margin
const CW = A4.w - M * 2 // content width

const INK = rgb(0.09, 0.1, 0.13)
const MUTED = rgb(0.42, 0.46, 0.52)
const FAINT = rgb(0.62, 0.66, 0.72)
const LINE = rgb(0.88, 0.89, 0.92)
const ACCENT = rgb(0.486, 0.514, 1) // #7c83ff
const GREEN = rgb(0.0, 0.62, 0.4)
const RED = rgb(0.85, 0.13, 0.3)
const AMBER = rgb(0.8, 0.55, 0.0)
const PANEL = rgb(0.97, 0.975, 0.985)
const DOT = '·' // middle dot — WinAnsi-safe separator

const sevColor = (s: AuditEntry['severity']) => (s === 'critical' ? RED : s === 'warning' ? AMBER : GREEN)

// Standard PDF fonts are WinAnsi-encoded and throw on glyphs they can't encode
// (math/typography symbols). Map the common ones to ASCII and keep Latin-1 (so
// accented Luxembourg fund names survive), dropping anything else. All-escape
// source so there are no ambiguous literals.
function san(s: string): string {
  return String(s)
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/÷/g, '/').replace(/×/g, 'x')
    .replace(/[−–—]/g, '-').replace(/Σ/g, 'sum').replace(/→/g, '->').replace(/≈/g, '~')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/•/g, '-')
    .replace(/[\u2000-\u206F]/g, " ")
    .replace(/[^\x09\x0A\x20-\xFF]/g, '')
    .replace(/[\x80-\x9F]/g, '')
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const rawLine of san(text).split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean)
    if (!words.length) { out.push(''); continue }
    let line = ''
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(test, size) <= maxWidth || !line) line = test
      else { out.push(line); line = w }
    }
    if (line) out.push(line)
  }
  return out
}

export async function auditPackToPdf(pack: AuditPack): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`AIFMD II Audit Pack — ${pack.fundName ?? 'Compliance'}`)
  pdf.setAuthor('ProvenLex')
  pdf.setSubject('Deterministic AIFMD II compliance audit pack')
  pdf.setProducer('ProvenLex — deterministic, client-side')
  pdf.setCreationDate(new Date(pack.generatedAt))

  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)

  let page = pdf.addPage([A4.w, A4.h])
  let y = A4.h - M

  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M }
  const room = (needed: number) => { if (y - needed < M + 30) newPage() }

  // wrapped paragraph at the current cursor; advances y
  const para = (
    text: string,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number; lh?: number } = {},
  ) => {
    const font = o.font ?? reg
    const size = o.size ?? 10
    const color = o.color ?? INK
    const x = o.x ?? M
    const width = o.width ?? CW
    const lh = o.lh ?? size * 1.35
    for (const ln of wrap(text, font, size, width)) {
      room(lh)
      if (ln) page.drawText(ln, { x, y: y - size, size, font, color })
      y -= lh
    }
    if (o.gap) y -= o.gap
  }

  // ── Header band ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: A4.h - 92, width: A4.w, height: 92, color: rgb(0.055, 0.06, 0.09) })
  page.drawRectangle({ x: 0, y: A4.h - 92, width: 4, height: 92, color: ACCENT })
  page.drawText('PROVENLEX', { x: M, y: A4.h - 40, size: 13, font: bold, color: rgb(1, 1, 1) })
  page.drawText(`AIFMD II  ${DOT}  Audit Readiness Pack`, { x: M, y: A4.h - 58, size: 10, font: reg, color: rgb(0.78, 0.8, 0.92) })
  page.drawText(`Deterministic  ${DOT}  no LLM in the decision path  ${DOT}  computed client-side`, {
    x: M, y: A4.h - 74, size: 8, font: reg, color: rgb(0.55, 0.58, 0.72),
  })
  y = A4.h - 92 - 26

  // ── Fund + meta ──────────────────────────────────────────────────────────
  para(pack.fundName ?? 'Compliance Audit Pack', { font: bold, size: 16, gap: 2 })
  para(`Structure: ${pack.structure}     Generated: ${new Date(pack.generatedAt).toUTCString()}`, {
    size: 9, color: MUTED, gap: 12,
  })

  // ── Verdict banner ───────────────────────────────────────────────────────
  const ok = pack.verdict === 'compliant'
  const vColor = ok ? GREEN : RED
  const bannerH = 46
  room(bannerH + 12)
  page.drawRectangle({
    x: M, y: y - bannerH, width: CW, height: bannerH,
    color: ok ? rgb(0.93, 0.98, 0.95) : rgb(0.99, 0.93, 0.94), borderColor: vColor, borderWidth: 1,
  })
  page.drawText(ok ? 'COMPLIANT' : 'NON-COMPLIANT', { x: M + 14, y: y - 28, size: 18, font: bold, color: vColor })
  page.drawText(`${pack.criticalCount} critical  ${DOT}  ${pack.warningCount} warning  ${DOT}  ${pack.entries.length} checks`, {
    x: M + 14, y: y - 40, size: 9, font: reg, color: MUTED,
  })
  const vn = 'Independently re-verifiable'
  page.drawText(vn, { x: M + CW - 14 - reg.widthOfTextAtSize(vn, 9), y: y - 22, size: 9, font: bold, color: ACCENT })
  const rsx = `root ${pack.chainRootSha256.slice(0, 16)}...`
  page.drawText(rsx, { x: M + CW - 14 - mono.widthOfTextAtSize(rsx, 8), y: y - 36, size: 8, font: mono, color: FAINT })
  y -= bannerH + 18

  // ── Findings ─────────────────────────────────────────────────────────────
  para('FINDINGS', { font: bold, size: 10, color: ACCENT, gap: 6 })

  pack.entries.forEach((e, i) => {
    room(64)
    if (i > 0) page.drawLine({ start: { x: M, y: y + 7 }, end: { x: M + CW, y: y + 7 }, thickness: 0.5, color: LINE })
    const sc = sevColor(e.severity)
    const titleX = M + 12
    const chip = `${e.observed}% / ${e.limit}%`
    const chipW = mono.widthOfTextAtSize(chip, 9)
    page.drawRectangle({ x: M, y: y - 11, width: 3, height: 13, color: sc })
    page.drawText(chip, { x: M + CW - chipW, y: y - 9, size: 9, font: mono, color: sc })
    for (const tl of wrap(`#${e.index}  ${e.title}`, bold, 11, CW - 12 - chipW - 14)) {
      room(15)
      page.drawText(tl, { x: titleX, y: y - 9, size: 11, font: bold, color: INK })
      y -= 15
    }
    y -= 1
    para(e.detail, { x: titleX, width: CW - 12, size: 9.5, color: rgb(0.25, 0.28, 0.33), gap: 3 })
    if (e.citation) {
      para(e.citation.framework, { x: titleX, width: CW - 12, size: 8.5, font: bold, color: ACCENT })
      para(e.citation.basis, { x: titleX, width: CW - 12, size: 8.5, color: MUTED })
      para(`formula: ${e.citation.formula}`, { x: titleX, width: CW - 12, size: 8, font: mono, color: FAINT })
      para(`source: ${e.citation.source}`, { x: titleX, width: CW - 12, size: 8, font: mono, color: FAINT, gap: 2 })
    } else {
      para(`basis: ${e.basis === 'own-prospectus' ? "the fund's own declared limits (internal consistency)" : 'EU statutory cap'}`, {
        x: titleX, width: CW - 12, size: 8, font: mono, color: FAINT, gap: 2,
      })
    }
    para(`sha256: ${e.entryHash}`, { x: titleX, width: CW - 12, size: 7.5, font: mono, color: rgb(0.7, 0.73, 0.78), gap: 8 })
  })

  // ── Tamper-evident seal ──────────────────────────────────────────────────
  room(72)
  y -= 4
  const sealH = 58
  page.drawRectangle({ x: M, y: y - sealH, width: CW, height: sealH, color: PANEL, borderColor: LINE, borderWidth: 1 })
  page.drawText('TAMPER-EVIDENT SEAL', { x: M + 12, y: y - 16, size: 8, font: bold, color: ACCENT })
  page.drawText(`Hash chain (${san(pack.hashAlgo)})`, { x: M + 12, y: y - 30, size: 8.5, font: reg, color: MUTED })
  let ry = y - 42
  for (const rl of wrap(pack.chainRootSha256, mono, 8, CW - 24)) {
    page.drawText(rl, { x: M + 12, y: ry, size: 8, font: mono, color: INK })
    ry -= 10
  }
  y -= sealH + 10

  // ── Footer on every page ─────────────────────────────────────────────────
  const pages = pdf.getPages()
  pages.forEach((p, idx) => {
    p.drawLine({ start: { x: M, y: M - 8 }, end: { x: A4.w - M, y: M - 8 }, thickness: 0.5, color: LINE })
    p.drawText('Generated client-side by ProvenLex - nothing left the browser. Re-verify the chain root to confirm integrity.', {
      x: M, y: M - 20, size: 7.5, font: reg, color: FAINT,
    })
    const pp = `Page ${idx + 1} of ${pages.length}`
    p.drawText(pp, { x: A4.w - M - reg.widthOfTextAtSize(pp, 7.5), y: M - 20, size: 7.5, font: reg, color: FAINT })
  })

  return await pdf.save()
}
