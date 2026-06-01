'use client'

import { useEffect, useState } from 'react'
import { Shield, Zap, Activity, FileText, Radio, MessageSquare, TrendingUp, Printer, ArrowRight } from 'lucide-react'

const FEATURES = [
  { icon: Shield, label: 'DORA ICT Register', desc: 'EBA RTS 2024 mandatory columns, gap-flagged in real time. CSSF-format CSV export.' },
  { icon: FileText, label: 'SFDR Disclosure Generator', desc: 'Article 6/8/9 pre-contractual disclosures generated in seconds. EN/FR support.' },
  { icon: Zap, label: 'AIFMD II Self-Assessment', desc: 'Full gap report covering delegation, leverage, LMT, depositary. Instant.' },
  { icon: Activity, label: 'Real-Time Threat Detection', desc: '12-agent PBFT swarm. Live OFAC, EU, UN sanctions. 340ms detection vs 48h manual.' },
  { icon: Radio, label: 'CSSF Regulatory Radar', desc: 'Live CSSF circulars, FAQ updates, EU directive tracking. Never miss a deadline.' },
  { icon: MessageSquare, label: 'Compliance AI Chat', desc: 'Ask any AIFMD II, DORA, SFDR question. Groq-powered, Luxembourg law context.' },
  { icon: TrendingUp, label: 'Fund Health Score', desc: 'A-F grade across DORA, AIFMD II, SFDR, UCITS. Board-ready compliance scorecard.' },
  { icon: FileText, label: 'Onboarding Wizard', desc: '4-step fund profiler. Instant regulatory gap report across all applicable frameworks.' },
]

const COMPLIANCE = [
  { reg: 'DORA', ref: 'EU 2022/2554', desc: 'ICT risk, vendor register, incident reporting', deadline: 'Jan 2027' },
  { reg: 'AIFMD II', ref: 'EU 2024/927', desc: 'Delegation, leverage, LMT, depositary', deadline: 'Apr 2026' },
  { reg: 'SFDR', ref: 'EU 2019/2088', desc: 'Art. 6/8/9 pre-contractual disclosures, PAI', deadline: 'Ongoing' },
  { reg: 'UCITS V', ref: 'EU 2014/91/EU', desc: 'Depositary, remuneration, sanctions', deadline: 'Ongoing' },
  { reg: 'CSSF', ref: 'Luxembourg', desc: 'Cross-border, AML, CSSF circular compliance', deadline: 'Ongoing' },
]

export default function OnePagerPage() {
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }))
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans" id="onepager">
      {/* Print button — hidden in print */}
      <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-700 transition-colors">
          <Printer className="w-4 h-4" /> Save as PDF
        </button>
        <a href="/trial" className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors">
          <ArrowRight className="w-4 h-4" /> Request trial
        </a>
      </div>

      {/* Page content — optimized for A4 print */}
      <div className="max-w-[210mm] mx-auto px-8 py-10 print:px-6 print:py-6">

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="font-black text-xl tracking-[0.1em] uppercase">Genesis Swarm</span>
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-widest">AI-Native RegTech Platform · Luxembourg</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wider">{today}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mt-0.5">Confidential</div>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-black leading-tight mb-3 text-gray-900">
            The compliance platform built for<br />
            Luxembourg alternative investment funds.
          </h1>
          <p className="text-gray-600 text-sm leading-relaxed max-w-2xl">
            Genesis Swarm replaces manual compliance workflows with an AI swarm that monitors OFAC/EU/UN sanctions in real time,
            generates SFDR disclosures, builds your DORA ICT register, and flags AIFMD II gaps — all from a single dashboard.
            Detection in <strong>340ms</strong>. Cost reduction of <strong>77×</strong> vs traditional compliance.
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-5 gap-0 border border-gray-200 rounded mb-8 overflow-hidden">
          {[
            { label: 'AUM Monitored', value: '€14.78B' },
            { label: 'Detection Speed', value: '340ms' },
            { label: 'Cost vs Traditional', value: '77× cheaper' },
            { label: 'Frameworks Covered', value: '5 regs' },
            { label: 'Consensus Algorithm', value: 'PBFT 11-node' },
          ].map(({ label, value }, i) => (
            <div key={label} className={`p-3 text-center ${i > 0 ? 'border-l border-gray-200' : ''}`}>
              <div className="font-black text-lg text-gray-900 leading-none">{value}</div>
              <div className="text-[9px] text-gray-400 uppercase tracking-wider mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Features grid */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-4">Platform capabilities</h2>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-3 border border-gray-100 rounded bg-gray-50">
                <div className="w-6 h-6 rounded bg-gray-900 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3 h-3 text-white" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-gray-900 uppercase tracking-wide">{label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regulatory coverage table */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">Regulatory coverage</h2>
          <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider">Framework</th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider">Reference</th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider">Coverage</th>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider">Key deadline</th>
              </tr>
            </thead>
            <tbody>
              {COMPLIANCE.map(({ reg, ref, desc, deadline }, i) => (
                <tr key={reg} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 font-bold text-gray-900">{reg}</td>
                  <td className="px-3 py-2 text-gray-500">{ref}</td>
                  <td className="px-3 py-2 text-gray-600">{desc}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{deadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Traditional vs Genesis */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">Why Genesis Swarm vs traditional compliance</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-red-100 rounded p-4 bg-red-50">
              <div className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">Traditional approach</div>
              {['48–72h to detect anomaly', '€18.5M/year average compliance cost', 'Manual spreadsheet-based registers', 'No real-time regulatory monitoring', 'Wirecard passed 10 consecutive audits'].map(t => (
                <div key={t} className="flex items-start gap-2 text-[10px] text-gray-600 mb-1.5">
                  <span className="text-red-400 shrink-0"></span> {t}
                </div>
              ))}
            </div>
            <div className="border border-green-200 rounded p-4 bg-green-50">
              <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-3">Genesis Swarm</div>
              {['340ms anomaly detection (508,000× faster)', '€240K/year — 77× cheaper', 'Auto-built DORA register, EBA RTS compliant', 'Live CSSF circulars + regulatory deadline tracking', 'PBFT consensus — no single point of failure'].map(t => (
                <div key={t} className="flex items-start gap-2 text-[10px] text-gray-700 mb-1.5">
                  <span className="text-green-600 shrink-0"></span> {t}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">Pricing</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { tier: 'Starter', price: '€2,500/mo', aum: 'Up to €500M AUM', features: ['DORA ICT Register', 'SFDR Generator', 'AIFMD II Assessment', 'Compliance AI Chat'] },
              { tier: 'Professional', price: '€5,000/mo', aum: '€500M – €2B AUM', features: ['Everything in Starter', 'Real-time bot monitoring', 'CSSF Regulatory Radar', 'Fund Health Score', 'Priority support'], highlight: true },
              { tier: 'Enterprise', price: 'Custom', aum: '€2B+ AUM', features: ['Everything in Professional', 'Dedicated instance', 'Custom integrations', 'SLA guarantee', 'Dedicated CSM'] },
            ].map(({ tier, price, aum, features, highlight }) => (
              <div key={tier} className={`border rounded p-4 ${highlight ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${highlight ? 'text-green-400' : 'text-gray-400'}`}>{tier}</div>
                <div className={`text-xl font-black mb-0.5 ${highlight ? 'text-white' : 'text-gray-900'}`}>{price}</div>
                <div className={`text-[9px] mb-3 ${highlight ? 'text-gray-400' : 'text-gray-400'}`}>{aum}</div>
                {features.map(f => (
                  <div key={f} className={`flex items-center gap-1.5 text-[9px] mb-1 ${highlight ? 'text-gray-300' : 'text-gray-600'}`}>
                    <span className={highlight ? 'text-green-400' : 'text-green-600'}></span> {f}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="border-t-2 border-gray-900 pt-6 flex items-center justify-between">
          <div>
            <div className="font-black text-gray-900 text-sm uppercase tracking-wider mb-1">Ready to start your pilot?</div>
            <div className="text-xs text-gray-500">90-day free trial · No credit card · We reply within 24 hours</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-gray-900">genesis-swarm-rgq5.vercel.app/trial</div>
            <div className="text-xs text-gray-400 mt-0.5">daman.sharma.2310@gmail.com</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
