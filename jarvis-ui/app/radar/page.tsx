'use client'

import { useState, useEffect } from 'react'
import { BASE } from '@/lib/api'
import { Radio, AlertTriangle, Shield, Upload, Clock, ChevronRight } from 'lucide-react'

interface RadarAlert {
  id: string
  source: string
  date: string
  title: string
  summary: string
  affects: string[]
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  deadline: string
  actions: string[]
}

interface RadarResponse {
  fund_type: string
  total_alerts: number
  critical_count: number
  high_count: number
  last_checked: string
  alerts: RadarAlert[]
  next_deadline: string
}

const URGENCY_COLOR: Record<string, string> = {
  CRITICAL: '#ff3366', HIGH: '#ff8800', MEDIUM: '#ffaa00', LOW: '#00ff88',
}

export default function RadarPage() {
  const [fundType, setFundType] = useState('AIF')
  const [data, setData] = useState<RadarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [circularResult, setCircularResult] = useState<any>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${BASE}/api/v1/regulatory/radar?fund_type=${fundType}`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [fundType])

  async function uploadCircular(file: File) {
    setUploading(true); setCircularResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('fund_type', fundType)
    try {
      const res = await fetch(`${BASE}/api/v1/regulatory/analyze-circular?fund_type=${fundType}`, { method: 'POST', body: fd })
      setCircularResult(await res.json())
    } finally { setUploading(false) }
  }

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono select-none">
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]"
        style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <Radio className="w-4 h-4 text-[#ff3366] animate-pulse" />
          <span className="font-bold tracking-[0.2em] text-sm uppercase">CSSF Regulatory Radar</span>
          <span className="text-[8px] tracking-widest text-[rgba(255,255,255,0.3)] hidden sm:block">
            // Live monitoring · CSSF · ESMA · EUR-Lex
          </span>
        </div>
        <div className="flex items-center gap-2">
          {['AIF', 'UCITS', 'RAIF', 'ALL'].map(t => (
            <button key={t} onClick={() => setFundType(t)}
              className="text-[8px] uppercase tracking-wider px-2 py-1 rounded transition-all"
              style={{ background: fundType === t ? 'rgba(0,255,136,0.15)' : 'transparent',
                border: `1px solid ${fundType === t ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: fundType === t ? '#00ff88' : 'rgba(255,255,255,0.4)' }}>
              {t}
            </button>
          ))}
          <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded ml-2">← Back</a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Stats bar */}
        {data && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Alerts', value: data.total_alerts, color: '#00ff88' },
              { label: 'Critical', value: data.critical_count, color: '#ff3366' },
              { label: 'High Priority', value: data.high_count, color: '#ff8800' },
              { label: 'Next Deadline', value: data.next_deadline, color: '#ffaa00' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.3)] mb-1">{label}</div>
                <div className="font-bold text-sm" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Upload circular */}
        <div className="p-4 rounded" style={{ background: 'rgba(0,170,255,0.04)', border: '1px solid rgba(0,170,255,0.15)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[rgba(0,170,255,0.7)]">
              <Upload className="w-3 h-3" />
              <span>Analyse Any CSSF Circular</span>
            </div>
          </div>
          <p className="text-[8px] text-[rgba(255,255,255,0.35)] mb-3">Upload a CSSF or ESMA circular PDF — AI extracts requirements and action items specific to your fund type.</p>
          <label className="flex items-center gap-2 px-4 py-2 rounded text-[10px] uppercase tracking-wider cursor-pointer transition-all w-fit"
            style={{ background: uploading ? 'rgba(0,170,255,0.04)' : 'rgba(0,170,255,0.08)', border: '1px solid rgba(0,170,255,0.35)', color: '#00aaff' }}>
            <Upload className="w-3 h-3" />
            {uploading ? 'Analysing…' : 'Upload Circular PDF'}
            <input type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadCircular(e.target.files[0]) }} />
          </label>
          {circularResult && (
            <div className="mt-3 p-3 rounded space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[rgba(255,255,255,0.8)]">{circularResult.title}</span>
                <span className="text-[8px] px-2 py-0.5 rounded font-bold" style={{ color: URGENCY_COLOR[circularResult.urgency], background: `${URGENCY_COLOR[circularResult.urgency]}15` }}>{circularResult.urgency}</span>
              </div>
              <p className="text-[9px] text-[rgba(255,255,255,0.5)]">{circularResult.summary}</p>
              {circularResult.action_items?.map((a: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-[8px] text-[rgba(255,255,255,0.5)]">
                  <ChevronRight className="w-2.5 h-2.5 text-[#00ff88] mt-0.5 shrink-0" /><span>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alert list */}
        {loading ? (
          <div className="text-[9px] text-[rgba(0,255,136,0.5)] animate-pulse text-center py-8">Scanning CSSF + ESMA feeds…</div>
        ) : (
          <div className="space-y-3">
            {data?.alerts?.map(alert => (
              <div key={alert.id} className="rounded overflow-hidden" style={{ border: `1px solid ${URGENCY_COLOR[alert.urgency]}30` }}>
                <button className="w-full flex items-start justify-between p-4 text-left hover:bg-[rgba(255,255,255,0.02)] transition-all"
                  onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
                  <div className="flex items-start gap-3">
                    <span className="text-[8px] font-bold px-2 py-0.5 rounded mt-0.5 shrink-0"
                      style={{ color: URGENCY_COLOR[alert.urgency], background: `${URGENCY_COLOR[alert.urgency]}15` }}>
                      {alert.urgency}
                    </span>
                    <div>
                      <div className="text-[11px] font-bold text-[rgba(255,255,255,0.85)] mb-0.5">{alert.title}</div>
                      <div className="flex items-center gap-3 text-[8px] text-[rgba(255,255,255,0.3)]">
                        <span>{alert.source}</span>
                        <span>{alert.date}</span>
                        <span className="text-[#ffaa00]">Deadline: {alert.deadline}</span>
                      </div>
                    </div>
                  </div>
                  <Clock className="w-3 h-3 text-[rgba(255,255,255,0.2)] mt-1 shrink-0" />
                </button>
                {expanded === alert.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.05)]">
                    <p className="text-[9px] text-[rgba(255,255,255,0.5)] leading-relaxed pt-3">{alert.summary}</p>
                    <div className="space-y-1.5">
                      <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.5)]">Action Required</div>
                      {alert.actions.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-[9px] text-[rgba(255,255,255,0.6)]">
                          <ChevronRight className="w-2.5 h-2.5 text-[#00ff88] mt-0.5 shrink-0" /><span>{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {data && (
          <div className="text-[7px] text-center text-[rgba(255,255,255,0.15)] uppercase tracking-widest">
            Last checked: {data.last_checked} · Genesis Swarm Regulatory Intelligence
          </div>
        )}
      </div>
    </div>
  )
}
