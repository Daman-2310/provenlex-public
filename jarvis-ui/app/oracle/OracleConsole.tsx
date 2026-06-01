'use client'

import { useState } from 'react'
import { Loader2, Play, AlertCircle } from 'lucide-react'

const SAMPLE = ['Deutsche Bank', 'UBS Europe SE', 'BNP Paribas', 'BlackRock', 'Amundi']

export default function OracleConsole() {
  const [entity, setEntity] = useState('Deutsche Bank')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function query() {
    if (!entity.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch(`/api/oracle?entity=${encodeURIComponent(entity)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(`HTTP ${res.status} · ${json.error ?? 'unknown'}`)
      }
      setResult(JSON.stringify(json, null, 2))
    } catch (e) {
      setError(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,216,255,0.3)', backdropFilter: 'blur(10px)' }}>

      <div className="px-4 py-3 flex items-center gap-3 flex-wrap"
        style={{ background: 'rgba(0,216,255,0.04)', borderBottom: '1px solid rgba(0,216,255,0.15)' }}>
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#00d8ff] shrink-0">GET</span>
        <span className="text-[10px] font-mono text-[rgba(255,255,255,0.55)] shrink-0">/api/oracle?entity=</span>
        <input
          type="text"
          value={entity}
          onChange={e => setEntity(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && query()}
          className="flex-1 min-w-[200px] bg-black/40 outline-none text-white text-[12px] px-3 py-1.5 rounded font-mono border border-[rgba(0,216,255,0.2)] focus:border-[rgba(0,216,255,0.6)]"
        />
        <button onClick={query} disabled={loading}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all disabled:opacity-50"
          style={{ background: 'rgba(0,216,255,0.15)', border: '1px solid rgba(0,216,255,0.5)', color: '#00d8ff' }}>
          {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Fetching</> : <><Play className="w-3 h-3" /> Call</>}
        </button>
      </div>

      <div className="px-4 py-2 flex items-center gap-2 flex-wrap text-[9px]"
        style={{ background: 'rgba(0,0,0,0.3)' }}>
        <span className="uppercase tracking-wider text-[rgba(255,255,255,0.35)]">try</span>
        {SAMPLE.map(s => (
          <button key={s} onClick={() => { setEntity(s); setTimeout(query, 0) }}
            className="px-2 py-0.5 rounded font-mono text-[#00d8ff] hover:bg-[rgba(0,216,255,0.08)] transition-all">
            {s}
          </button>
        ))}
      </div>

      <div className="relative">
        {error && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded"
            style={{ background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}
        <pre className="p-4 text-[11px] font-mono text-[rgba(255,255,255,0.88)] overflow-x-auto leading-relaxed min-h-[200px] max-h-[400px] overflow-y-auto">
          {result ?? '// Press Call to query the oracle, or click a sample chip above.'}
        </pre>
      </div>
    </div>
  )
}
