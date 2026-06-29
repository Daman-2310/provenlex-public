'use client'

import Link from 'next/link'
import type { ScanResult } from '@/lib/scan-engine'

// ── Compliance-opinion result surface ────────────────────────────────────────
// Council verdict (2026-06-28): the output must read like a filable compliance
// opinion, not a SaaS dashboard. Austere, monospace data, hard borders, numbered
// findings each cited to its article, and the REAL SHA-256 seal as a signature
// block. Nothing decorative; nothing fabricated. ("Ugly-useful, not pretty-useless.")

const SEV: Record<string, { label: string; c: string }> = {
  critical: { label: 'CRITICAL', c: '#F2566E' },
  warning:  { label: 'WARNING',  c: '#F5A524' },
  ok:       { label: 'PASS',     c: '#10D982' },
}

// Each finding's statutory source, exactly as the versioned ruleset records it.
function citationFor(code: string): string {
  if (code.startsWith('UCITS')) return 'UCITS · Dir 2009/65/EC, Art. 52'
  if (code.startsWith('OWN_')) return "Fund's own declared cap"
  if (code === 'INSUFFICIENT_DATA') return '—'
  if (code === 'SCAN_COVERAGE_PARTIAL') return 'Coverage notice'
  return 'AIFMD II · Dir 2011/61/EU, Art. 15'
}

export default function ScanVerdict({ result }: { result: ScanResult }) {
  const insufficient = result.findings.some(f => f.code === 'INSUFFICIENT_DATA')

  let verdict = 'NO CRITICAL BREACHES'
  let vColor = '#10D982'
  if (result.criticalCount > 0) { verdict = 'NON-COMPLIANT'; vColor = '#F2566E' }
  else if (insufficient) { verdict = 'INSUFFICIENT DATA'; vColor = '#5B8DEF' }
  else if (result.findings.length === 0) { verdict = 'NO CHECKABLE LIMITS FOUND'; vColor = '#7C8894' }

  const params: [string, string][] = [
    ['Structure', result.doc.structure.replace('_', '-')],
    ['Leverage cap', result.doc.declaredLeverageCapPct != null ? `${result.doc.declaredLeverageCapPct}%` : '—'],
    ['Risk retention', result.doc.declaredRetentionPct != null ? `${result.doc.declaredRetentionPct}%` : '—'],
    ['Concentration', result.doc.declaredConcentrationCapPct != null ? `${result.doc.declaredConcentrationCapPct}%` : '—'],
  ]

  const ts = new Date(result.checkedAt).toISOString().slice(0, 19).replace('T', ' ')
  const border = '1px solid rgba(255,255,255,0.14)'
  const hair = '1px solid rgba(255,255,255,0.07)'

  return (
    <div className="font-mono text-[#C7CDD2]" style={{ border, background: '#0A0C10' }}>
      {/* Document header */}
      <div className="px-5 py-4" style={{ borderBottom: border }}>
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.22em] text-[#7C8894]">
          <span>Compliance Findings · AIFMD II / UCITS</span>
          <span>Ruleset v{result.rulesetVersion}</span>
        </div>
        <div className="mt-3 font-sans text-[17px] font-bold tracking-tight text-white">
          {result.doc.fundName ?? 'Unnamed fund'}
        </div>
        <div className="mt-1 text-[10px] text-[#7C8894]">
          {result.doc.structure.replace('_', '-')} · scanned {ts} UTC
        </div>
      </div>

      {/* Determination */}
      <div className="px-5 py-4 flex items-baseline gap-3" style={{ borderBottom: border, borderLeft: `3px solid ${vColor}` }}>
        <span className="text-[9px] uppercase tracking-[0.22em] text-[#7C8894]">Determination</span>
        <span className="text-[17px] font-bold tracking-tight" style={{ color: vColor }}>{verdict}</span>
        <span className="text-[11px] text-[#93A1AD] ml-auto whitespace-nowrap">{result.criticalCount} critical · {result.warningCount} warning</span>
      </div>

      {/* Parameters read from the document */}
      <div className="px-5 py-4" style={{ borderBottom: border }}>
        <div className="text-[9px] uppercase tracking-[0.22em] text-[#7C8894] mb-2">Parameters read from the document</div>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {params.map(([k, v]) => (
            <div key={k} className="py-2 pr-3" style={{ borderTop: hair }}>
              <div className="text-[8px] uppercase tracking-wider text-[#7C8894]">{k}</div>
              <div className="text-[14px] font-bold tabular-nums text-white">{v}</div>
            </div>
          ))}
        </div>
        {result.doc.holdings.length > 0 && (
          <div className="text-[9px] text-[#7C8894] mt-2 pt-2" style={{ borderTop: hair }}>
            {result.doc.holdings.length} holding{result.doc.holdings.length === 1 ? '' : 's'} extracted
          </div>
        )}
      </div>

      {/* Findings — numbered, cited */}
      <div className="px-5 py-4">
        <div className="text-[9px] uppercase tracking-[0.22em] text-[#7C8894] mb-1">Findings</div>
        {result.findings.length === 0 && (
          <div className="text-[11px] text-[#7C8894] py-2">No checkable limits were found in the text.</div>
        )}
        <ol>
          {result.findings.map((f, i) => {
            const sev = SEV[f.severity] ?? SEV.ok
            return (
              <li key={i} className="py-3 flex gap-3" style={{ borderTop: hair, borderLeft: `3px solid ${sev.c}`, paddingLeft: 12 }}>
                <span className="text-[10px] tabular-nums text-[#7C8894] pt-0.5 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[8.5px] font-bold tracking-[0.14em] px-1.5 py-0.5" style={{ color: sev.c, border: `1px solid ${sev.c}55` }}>{sev.label}</span>
                    <span className="font-sans text-[12.5px] font-bold text-white">{f.title}</span>
                  </div>
                  <div className="font-sans text-[11px] leading-snug text-[#A7AFB8] mt-1.5">{f.detail}</div>
                  <div className="text-[9px] text-[#7C8894] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>§ {citationFor(f.code)}</span>
                    {f.limit > 0 && <span>observed {f.observed}% · limit {f.limit}%</span>}
                    <span className="text-[#5A646E]">{f.code}</span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Insufficient-data honesty note */}
      {insufficient && (
        <div className="px-5 py-3 font-sans text-[10px] leading-snug text-[#A7AFB8]" style={{ borderTop: border, background: 'rgba(91,141,239,0.05)' }}>
          <span className="font-bold text-white">Not a guess — by design.</span> Where a document can&apos;t be read cleanly, ProvenLex returns &ldquo;insufficient data&rdquo; rather than fabricate a verdict.{' '}
          <Link href="/research/note-02-extraction-is-the-hard-part" className="underline" style={{ color: '#5B8DEF' }}>Why this matters →</Link>
        </div>
      )}

    </div>
  )
}
