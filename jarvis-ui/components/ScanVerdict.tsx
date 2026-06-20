'use client'

import {
  ShieldCheck, ShieldAlert, AlertTriangle, Landmark, FileText, Building2,
} from 'lucide-react'
import Link from 'next/link'
import type { ScanResult } from '@/lib/scan-engine'

// ── Institutional Emerald verdict surface ────────────────────────────────────
// The product's money moment: verdict banner → extracted facts → findings.
// Board-ready and restrained — one emerald accent, semantic red/amber for
// verdicts only. All data is the live, deterministic ScanResult; nothing here
// is decorative.

const SEV = {
  critical: { c: '#F2566E', Icon: ShieldAlert,    label: 'Critical' },
  warning:  { c: '#F5A524', Icon: AlertTriangle,  label: 'Warning' },
  ok:       { c: '#10D982', Icon: ShieldCheck,     label: 'Pass' },
} as const

function BasisBadge({ basis }: { basis: 'own-prospectus' | 'eu-statutory' }) {
  const isStat = basis === 'eu-statutory'
  const c = isStat ? '#5B8DEF' : '#93A1AD'
  const Icon = isStat ? Landmark : FileText
  return (
    <span className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded"
      style={{ color: c, background: `${c}14`, border: `1px solid ${c}44` }}>
      <Icon className="w-2.5 h-2.5" /> {isStat ? 'AIFMD II statute' : 'own prospectus'}
    </span>
  )
}

export default function ScanVerdict({ result }: { result: ScanResult }) {
  const pass = result.compliant
  const accent = pass ? '#10D982' : '#F2566E'
  const insufficient = result.findings.some(f => f.code === 'INSUFFICIENT_DATA')
  const facts: [string, string][] = [
    ['Structure', result.doc.structure.replace('_', '-')],
    ['Leverage cap', result.doc.declaredLeverageCapPct != null ? `${result.doc.declaredLeverageCapPct}%` : 'not stated'],
    ['Risk retention', result.doc.declaredRetentionPct != null ? `${result.doc.declaredRetentionPct}%` : 'not stated'],
    ['Concentration cap', result.doc.declaredConcentrationCapPct != null ? `${result.doc.declaredConcentrationCapPct}%` : 'not stated'],
  ]

  return (
    <div className="space-y-5">
      {/* ── Verdict banner ─────────────────────────────────────────────── */}
      <div className="relative rounded-2xl p-5 flex items-center gap-4 overflow-hidden"
        style={{
          background: pass
            ? 'linear-gradient(100deg, rgba(16,217,130,0.10) 0%, rgba(16,217,130,0.02) 60%)'
            : 'linear-gradient(100deg, rgba(242,86,110,0.12) 0%, rgba(242,86,110,0.02) 60%)',
          border: `1px solid ${accent}55`,
          boxShadow: `inset 0 1px 0 ${accent}22`,
        }}>
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
        <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}1a`, border: `1px solid ${accent}55` }}>
          {pass
            ? <ShieldCheck className="w-6 h-6" style={{ color: accent }} />
            : <ShieldAlert className="w-6 h-6" style={{ color: accent }} />}
        </div>
        <div className="min-w-0">
          <div className="text-lg font-black tracking-tight leading-tight" style={{ color: accent }}>
            {pass
              ? 'No critical breaches detected'
              : `${result.criticalCount} critical ${result.criticalCount === 1 ? 'breach' : 'breaches'} detected`}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: '#93A1AD' }}>
            <span style={{ color: '#E7ECEF' }}>{result.doc.fundName ?? 'Unnamed fund'}</span>
            {' · '}{result.doc.structure.replace('_', '-')}
            {' · '}{result.warningCount} warning{result.warningCount === 1 ? '' : 's'}
            {' · '}scanned {new Date(result.checkedAt).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* ── Extracted facts ────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(14,16,20,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-[10px] uppercase tracking-[0.2em] font-black mb-3" style={{ color: '#10D982' }}>
          What the scanner read from the document
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <div className="text-[8px] uppercase tracking-wider" style={{ color: '#93A1AD' }}>{k}</div>
              <div className="font-mono font-bold tabular-nums" style={{ color: '#E7ECEF' }}>{v}</div>
            </div>
          ))}
        </div>
        {result.doc.holdings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
            <div className="text-[8px] uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: '#93A1AD' }}>
              <Building2 className="w-2.5 h-2.5" /> {result.doc.holdings.length} holdings extracted
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.doc.holdings.map((h, i) => {
                const over = h.weightPct > 20
                return (
                  <span key={i} className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded"
                    style={{
                      background: over ? 'rgba(242,86,110,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${over ? 'rgba(242,86,110,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: over ? '#F2566E' : '#93A1AD',
                    }}>
                    {h.name} {h.weightPct}%
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Findings ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color: '#10D982' }}>Findings</div>
        {result.findings.length === 0 && (
          <div className="text-[11px]" style={{ color: '#93A1AD' }}>
            No checkable limits were found in the text. Paste a document that states leverage / retention / concentration
            limits, or load the sample.
          </div>
        )}
        {result.findings.map((f, i) => {
          const sev = SEV[f.severity as keyof typeof SEV] ?? SEV.ok
          const { c, Icon } = sev
          return (
            <div key={i} className="relative rounded-xl p-3.5 pl-4 overflow-hidden"
              style={{ background: `${c}0c`, border: `1px solid ${c}33` }}>
              <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c }} />
              <div className="flex items-start gap-2.5">
                <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[12px] font-bold" style={{ color: c }}>{f.title}</span>
                    <BasisBadge basis={f.basis} />
                  </div>
                  <div className="text-[11px] leading-snug" style={{ color: '#C7CDD2' }}>{f.detail}</div>
                  <div className="text-[9px] font-mono tabular-nums mt-1" style={{ color: '#93A1AD' }}>
                    observed {f.observed}% · limit {f.limit}% · {f.code}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Honesty badge: frame INSUFFICIENT_DATA as a deliberate architectural choice. */}
      {insufficient && (
        <div className="rounded-xl p-3.5 flex items-start gap-2.5"
          style={{ background: 'rgba(91,141,239,0.08)', border: '1px solid rgba(91,141,239,0.3)' }}>
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#5B8DEF' }} />
          <div className="text-[11px] leading-snug" style={{ color: '#C7CDD2' }}>
            <span className="font-bold text-white">This is not a guess — it&apos;s by design.</span> When a document&apos;s
            structure can&apos;t be read cleanly (tables and footnotes flatten on extraction), ProvenLex returns
            &ldquo;insufficient data&rdquo; instead of fabricating a verdict — no LLM, no hallucinated number.{' '}
            <Link href="/research/note-02-extraction-is-the-hard-part" className="font-bold hover:underline" style={{ color: '#5B8DEF' }}>
              Why this is a deliberate architectural choice →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
