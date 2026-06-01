'use client'
import { useState, useEffect } from 'react'
import { Bell, Mail, Shield, AlertTriangle, CheckCircle, Save } from 'lucide-react'

const NOTIF_GROUPS = [
  {
    group: 'Compliance alerts',
    icon: Shield,
    items: [
      { key: 'dora_deadline', label: 'DORA deadline reminders', desc: '30/7/1 day before ICT reporting deadlines' },
      { key: 'cssf_update', label: 'CSSF regulatory updates', desc: 'New circulars, guidance notes, enforcement actions' },
      { key: 'sfdr_changes', label: 'SFDR & ESG changes', desc: 'ESMA updates to SFDR RTS and PAI indicators' },
      { key: 'aifmd_news', label: 'AIFMD II implementation news', desc: 'Transposition updates, ESMA Q&A, national guidance' },
    ],
  },
  {
    group: 'Risk & monitoring',
    icon: AlertTriangle,
    items: [
      { key: 'bot_alert', label: 'Bot alerts (critical only)', desc: 'When any Genesis bot triggers a CRITICAL flag' },
      { key: 'consensus_failure', label: 'Consensus failures', desc: 'PBFT quorum lost or Byzantine fault detected' },
      { key: 'fear_index_spike', label: 'Fear index spikes', desc: 'Market fear index crosses 80 threshold' },
      { key: 'sanctions_hit', label: 'Sanctions screening hits', desc: 'Any entity returns HIGH risk on screening' },
    ],
  },
  {
    group: 'Reports & certificates',
    icon: Mail,
    items: [
      { key: 'weekly_report', label: 'Weekly compliance digest', desc: 'Every Monday: portfolio grades, open gaps, news' },
      { key: 'board_report', label: 'Board report ready', desc: 'Email when AI board report generation completes' },
      { key: 'cert_expiry', label: 'Certificate expiry', desc: '30 days before compliance certificate expires' },
      { key: 'audit_reminder', label: 'Audit readiness reminder', desc: 'Quarterly: reminder to run CSSF audit simulator' },
    ],
  },
]

type Prefs = Record<string, boolean>

const DEFAULT: Prefs = {
  dora_deadline: true, cssf_update: true, sfdr_changes: false, aifmd_news: false,
  bot_alert: true, consensus_failure: true, fear_index_spike: false, sanctions_hit: true,
  weekly_report: true, board_report: false, cert_expiry: true, audit_reminder: false,
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT)
  const [email, setEmail] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('gs_notif_prefs')
      if (stored) setPrefs(JSON.parse(stored))
      const storedEmail = localStorage.getItem('gs_notif_email')
      if (storedEmail) setEmail(storedEmail)
    } catch {}
  }, [])

  const toggle = (k: string) => { setSaved(false); setPrefs(p => ({ ...p, [k]: !p[k] })) }

  async function save() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    try {
      localStorage.setItem('gs_notif_prefs', JSON.stringify(prefs))
      localStorage.setItem('gs_notif_email', email)
    } catch {}
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const enabledCount = Object.values(prefs).filter(Boolean).length

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// Notification Settings</span>
        </div>
        <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)] mb-2">Preferences · {enabledCount} active</div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
          <p className="text-[rgba(255,255,255,0.4)] text-sm mt-2">Control which compliance alerts, risk signals, and reports you receive by email.</p>
        </div>

        {/* Email input */}
        <div className="p-4 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.18)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-[#00ff88]" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Notification email</span>
          </div>
          <input
            type="email"
            placeholder="you@yourfund.lu"
            value={email}
            onChange={e => { setEmail(e.target.value); setSaved(false) }}
            className="w-full bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2.5 text-[#00ff88] text-sm font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.5)] transition-all"
          />
        </div>

        {/* Notification groups */}
        {NOTIF_GROUPS.map(({ group, icon: Icon, items }) => (
          <div key={group} className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-[rgba(0,255,136,0.6)]" />
              <span className="text-[9px] uppercase tracking-widest font-bold text-[rgba(0,255,136,0.6)]">{group}</span>
            </div>
            {items.map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between p-3.5 rounded cursor-pointer transition-all"
                style={{ background: prefs[key] ? 'rgba(0,255,136,0.04)' : 'rgba(0,255,136,0.01)', border: `1px solid ${prefs[key] ? 'rgba(0,255,136,0.25)' : 'rgba(0,255,136,0.1)'}` }}
                onClick={() => toggle(key)}>
                <div className="flex-1 mr-4">
                  <div className="text-sm text-white font-medium">{label}</div>
                  <div className="text-[9px] text-[rgba(255,255,255,0.35)] mt-0.5">{desc}</div>
                </div>
                <div className="relative shrink-0">
                  <div className="w-10 h-5 rounded-full transition-all duration-200" style={{ background: prefs[key] ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)', border: `1px solid ${prefs[key] ? 'rgba(0,255,136,0.7)' : 'rgba(255,255,255,0.15)'}` }} />
                  <div className="absolute top-0.5 transition-all duration-200 w-4 h-4 rounded-full" style={{ left: prefs[key] ? '22px' : '2px', background: prefs[key] ? '#00ff88' : 'rgba(255,255,255,0.4)' }} />
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Save */}
        <div className="flex items-center gap-4 pt-2">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-8 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88', boxShadow: '0 0 20px rgba(0,255,136,0.12)' }}>
            {saving ? <><Save className="w-4 h-4 animate-pulse" /> Saving…</> : saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save preferences</>}
          </button>
          {saved && <span className="text-[9px] text-[#00ff88] uppercase tracking-wider">Preferences saved locally.</span>}
        </div>

        <div className="text-[7px] text-[rgba(255,255,255,0.15)] leading-relaxed p-3 rounded" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
          <Bell className="w-3 h-3 inline mr-1 opacity-50" />
          Preferences are stored locally. Email delivery requires your pilot account to be active. Contact the founding team to configure server-side delivery.
        </div>
      </div>
    </div>
  )
}
