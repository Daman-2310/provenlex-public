'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, Plus, Trash2, Download, Shield, AlertTriangle, CheckCircle, Info } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://damansh-genesis-swarm.hf.space'

interface Vendor {
  id: string
  name: string
  service_type: string
  country: string
  criticality: 'low' | 'medium' | 'high' | 'critical'
  contract_start: string
  has_audit_rights: boolean
  has_exit_strategy: boolean
  sub_contractors: string
}

const NEW_VENDOR = (): Vendor => ({
  id: Math.random().toString(36).slice(2),
  name: '', service_type: 'ICT Services', country: 'Luxembourg',
  criticality: 'medium', contract_start: '2024-01-01',
  has_audit_rights: false, has_exit_strategy: false, sub_contractors: '',
})

const SERVICE_TYPES = [
  'Cloud Infrastructure (IaaS)', 'Cloud Platform (PaaS)',
  'Market Data / Financial Data', 'Portfolio Management System',
  'Order Management System', 'Risk Management Platform',
  'Cybersecurity Services', 'IT Support / Managed Services',
  'Productivity / Communication', 'Database / Storage',
  'Network / Connectivity', 'Regulatory Reporting',
  'Transfer Agent / Fund Administration', 'Other ICT Services',
]

const COUNTRIES = [
  'Luxembourg', 'Ireland', 'Germany', 'France', 'Netherlands',
  'United States', 'United Kingdom', 'Switzerland', 'Sweden',
  'Belgium', 'Denmark', 'Other',
]

const CRITICALITY_COLORS = {
  low: '#00aaff', medium: '#ffaa00', high: '#ff6b35', critical: '#ff3366',
}

function VendorRow({ vendor, onChange, onRemove }: {
  vendor: Vendor
  onChange: (v: Vendor) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const cc = CRITICALITY_COLORS[vendor.criticality]
  const gaps = []
  if (!vendor.has_audit_rights)  gaps.push('Audit rights missing')
  if (!vendor.has_exit_strategy) gaps.push('Exit strategy missing')
  if (vendor.criticality === 'critical' && !vendor.sub_contractors) gaps.push('Sub-contractors not declared')

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: cc + '33' }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(e => !e)}
        style={{ background: cc + '08' }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cc }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{vendor.name || 'New ICT Provider'}</div>
          <div className="text-[10px] text-[rgba(255,255,255,0.4)]">{vendor.service_type} · {vendor.country} · {vendor.criticality.toUpperCase()}</div>
        </div>
        {gaps.length > 0 && (
          <div className="flex items-center gap-1 text-[#ffaa00] text-[9px]">
            <AlertTriangle className="w-3 h-3" /> {gaps.length} gap{gaps.length > 1 ? 's' : ''}
          </div>
        )}
        {gaps.length === 0 && vendor.name && (
          <div className="flex items-center gap-1 text-[#00ff88] text-[9px]">
            <CheckCircle className="w-3 h-3" /> Clean
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onRemove() }}
          className="p-1 text-[rgba(255,51,102,0.5)] hover:text-[#ff3366] transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 py-4 border-t border-[rgba(255,255,255,0.06)] grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">ICT Provider Name *</label>
            <input value={vendor.name} onChange={e => onChange({...vendor, name: e.target.value})}
              placeholder="e.g. Amazon Web Services EMEA SARL"
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white placeholder-[rgba(255,255,255,0.25)] focus:outline-none focus:border-[rgba(0,170,255,0.4)]" />
          </div>

          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Service Type</label>
            <select value={vendor.service_type} onChange={e => onChange({...vendor, service_type: e.target.value})}
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgba(0,170,255,0.4)]">
              {SERVICE_TYPES.map(s => <option key={s} value={s} className="bg-[#0a0f14]">{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Data / Service Location</label>
            <select value={vendor.country} onChange={e => onChange({...vendor, country: e.target.value})}
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgba(0,170,255,0.4)]">
              {COUNTRIES.map(c => <option key={c} value={c} className="bg-[#0a0f14]">{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Criticality (DORA Art. 28)</label>
            <select value={vendor.criticality} onChange={e => onChange({...vendor, criticality: e.target.value as Vendor['criticality']})}
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgba(0,170,255,0.4)]">
              <option value="low" className="bg-[#0a0f14]">Low</option>
              <option value="medium" className="bg-[#0a0f14]">Medium</option>
              <option value="high" className="bg-[#0a0f14]">High</option>
              <option value="critical" className="bg-[#0a0f14]">Critical (CSSF notification required)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Contract Start Date</label>
            <input type="date" value={vendor.contract_start} onChange={e => onChange({...vendor, contract_start: e.target.value})}
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[rgba(0,170,255,0.4)]" />
          </div>

          <div className="col-span-2 flex gap-3">
            {[
              { key: 'has_audit_rights', label: 'Audit Rights Clause (Art. 28(4)(c))' },
              { key: 'has_exit_strategy', label: 'Exit Strategy Documented (Art. 28(4)(g))' },
            ].map(opt => {
              const val = vendor[opt.key as keyof Vendor] as boolean
              return (
                <button key={opt.key} type="button" onClick={() => onChange({...vendor, [opt.key]: !val})}
                  className={`flex items-center gap-2 px-3 py-2 rounded border text-xs flex-1 transition-colors ${val ? 'border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.06)] text-[#00ff88]' : 'border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.04)] text-[#ff6b35]'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${val ? 'bg-[#00ff88]' : 'bg-[#ff6b35]'}`} />
                  {opt.label}
                </button>
              )
            })}
          </div>

          {(vendor.criticality === 'high' || vendor.criticality === 'critical') && (
            <div className="col-span-2">
              <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Sub-Contractors (Art. 28(4)(f))</label>
              <input value={vendor.sub_contractors} onChange={e => onChange({...vendor, sub_contractors: e.target.value})}
                placeholder="e.g. Equinix (data centre), Lumen Technologies (network)"
                className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white placeholder-[rgba(255,255,255,0.25)] focus:outline-none focus:border-[rgba(0,170,255,0.4)]" />
            </div>
          )}

          {gaps.length > 0 && (
            <div className="col-span-2 flex gap-2 flex-wrap">
              {gaps.map(g => (
                <span key={g} className="text-[9px] px-2 py-0.5 border border-[rgba(255,170,0,0.3)] text-[#ffaa00] rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" /> {g}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DoraRegisterPage() {
  const [fundName, setFundName] = useState('')
  const [aifmName, setAifmName] = useState('')
  const [vendors, setVendors] = useState<Vendor[]>([NEW_VENDOR()])
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addVendor = () => setVendors(v => [...v, NEW_VENDOR()])
  const updateVendor = (id: string, v: Vendor) => setVendors(list => list.map(x => x.id === id ? v : x))
  const removeVendor = (id: string) => setVendors(list => list.filter(x => x.id !== id))

  const downloadRegister = useCallback(async () => {
    if (!fundName.trim()) { setError('Fund name is required'); return }
    const namedVendors = vendors.filter(v => v.name.trim())
    if (namedVendors.length === 0) { setError('Add at least one ICT provider'); return }
    setDownloading(true); setError(null)
    try {
      const body = {
        fund_name: fundName,
        aifm_name: aifmName || `${fundName} Management S.A.`,
        vendors: namedVendors,
        include_gaps: true,
      }
      const res = await fetch(`${API}/api/v1/dora/ict-register/build`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `DORA_ICT_Register_${fundName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally { setDownloading(false) }
  }, [fundName, aifmName, vendors])

  const totalGaps = vendors.reduce((n, v) => n + (!v.has_audit_rights ? 1 : 0) + (!v.has_exit_strategy ? 1 : 0), 0)
  const criticalCount = vendors.filter(v => v.criticality === 'critical').length

  return (
    <div className="min-h-screen bg-[#050a0e] text-white font-mono">
      <div className="border-b border-[rgba(0,255,136,0.1)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dora" className="text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> DORA</a>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#00aaff]" />
            <span className="text-sm font-bold tracking-widest text-[#00aaff]">DORA ICT REGISTER BUILDER</span>
          </div>
        </div>
        <div className="text-[9px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">DORA Art. 28 · EBA RTS · CSSF Format</div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 border border-[rgba(0,170,255,0.2)] bg-[rgba(0,170,255,0.03)] rounded-lg text-xs text-[rgba(255,255,255,0.5)]">
          <Info className="w-4 h-4 text-[#00aaff] flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-[#00aaff] font-bold">DORA Register of Information</span> — Article 28 requires all AIFMs to maintain and submit this register to CSSF. 
            Add all ICT third-party providers below. The export will flag gaps per EBA RTS 2024 mandatory columns.
          </div>
        </div>

        {/* Fund details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">Fund Name *</label>
            <input value={fundName} onChange={e => setFundName(e.target.value)} placeholder="e.g. Acme Capital Luxembourg AIF"
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white placeholder-[rgba(255,255,255,0.25)] focus:outline-none focus:border-[rgba(0,170,255,0.5)]" />
          </div>
          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">AIFM / Manager Name</label>
            <input value={aifmName} onChange={e => setAifmName(e.target.value)} placeholder="e.g. Acme Asset Management S.A."
              className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] rounded px-3 py-2 text-sm text-white placeholder-[rgba(255,255,255,0.25)] focus:outline-none focus:border-[rgba(0,170,255,0.5)]" />
          </div>
        </div>

        {/* Stats */}
        {vendors.some(v => v.name) && (
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              {label:'ICT Providers', value: vendors.filter(v=>v.name).length, color:'#00aaff'},
              {label:'Critical', value: criticalCount, color: criticalCount > 0 ? '#ff3366' : '#00ff88'},
              {label:'Gaps to Fix', value: totalGaps, color: totalGaps > 0 ? '#ffaa00' : '#00ff88'},
            ].map(s => (
              <div key={s.label} className="border border-[rgba(255,255,255,0.07)] rounded p-3">
                <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px] text-[rgba(255,255,255,0.4)]">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Vendor list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[rgba(255,255,255,0.7)] uppercase tracking-wider">ICT Providers</h2>
            <button onClick={addVendor}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded text-xs hover:bg-[rgba(0,255,136,0.06)] transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Provider
            </button>
          </div>
          {vendors.map(v => (
            <VendorRow key={v.id} vendor={v}
              onChange={nv => updateVendor(v.id, nv)}
              onRemove={() => removeVendor(v.id)} />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.05)] rounded text-sm text-[#ff3366]">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Export */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={downloadRegister} disabled={downloading}
            className="flex items-center gap-2 px-5 py-3 bg-[rgba(0,170,255,0.1)] border border-[rgba(0,170,255,0.5)] text-[#00aaff] rounded font-bold hover:bg-[rgba(0,170,255,0.15)] disabled:opacity-40 transition-colors">
            {downloading ? 'Building register…' : <><Download className="w-4 h-4" /> Export CSSF Register CSV</>}
          </button>
          <a href="/onboard"
            className="flex items-center gap-2 px-4 py-3 border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)] rounded text-sm hover:border-[rgba(255,255,255,0.2)] transition-colors">
            ← Fund Gap Assessment
          </a>
        </div>

        <p className="text-[10px] text-[rgba(255,255,255,0.25)]">
          Export generates a CSV in CSSF submission format per DORA Article 28 and EBA Final Report on RTS under DORA (JC 2023 83). 
          Annual review due date auto-calculated. Verify against CSSF portal before submission.
        </p>
      </div>
    </div>
  )
}
