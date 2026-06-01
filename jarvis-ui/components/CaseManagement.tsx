'use client'

import { useState, useCallback, useEffect } from 'react'
import { fetchCases, createCase, updateCase, deleteCase, type ComplianceCase } from '@/lib/api'
import { FolderOpen, Plus, CheckCircle, Search, Trash2 } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  OPEN:          'text-[#ff3366] border-[rgba(255,51,102,0.4)]',
  INVESTIGATING: 'text-[#ffaa00] border-[rgba(255,170,0,0.4)]',
  CLOSED:        'text-[rgba(0,255,136,0.5)] border-[rgba(0,255,136,0.2)]',
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function CaseManagement() {
  const [allCases, setAllCases] = useState<ComplianceCase[]>([])
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'INVESTIGATING' | 'CLOSED'>('ALL')
  const [selected, setSelected] = useState<ComplianceCase | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    const data = await fetchCases()
    if (data) setAllCases(data)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const filtered = filter === 'ALL' ? allCases : allCases.filter(c => c.status === filter)
  const openCount = allCases.filter(c => c.status === 'OPEN').length

  const handleSelect = useCallback((c: ComplianceCase) => {
    setSelected(c)
    setNotes(c.notes ?? '')
  }, [])

  const handleSave = useCallback(async (newStatus: string) => {
    if (!selected) return
    setSaving(true)
    await updateCase(selected.id, newStatus, notes)
    setSaving(false)
    setSelected(null)
    refresh?.()
  }, [selected, notes, refresh])

  const handleDelete = useCallback(async (id: string) => {
    await deleteCase(id)
    if (selected?.id === id) setSelected(null)
    refresh?.()
  }, [selected, refresh])

  const handleCreateDemo = useCallback(async () => {
    await createCase('NAV_DETECTOR', 88.4, 'Potential NAV manipulation — requires investigation')
    refresh?.()
  }, [refresh])

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.2)] rounded p-4 font-mono h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-[#00ff88]" />
          <span className="text-[#00ff88] tracking-widest font-bold text-xs uppercase">
            Case Management
          </span>
          {openCount > 0 && (
            <span className="bg-[rgba(255,51,102,0.15)] border border-[rgba(255,51,102,0.4)] text-[#ff3366] text-[9px] px-1.5 py-0.5 rounded uppercase">
              {openCount} OPEN
            </span>
          )}
        </div>
        <button
          onClick={handleCreateDemo}
          className="flex items-center gap-1 text-[9px] text-[rgba(0,255,136,0.6)] border border-[rgba(0,255,136,0.2)] px-2 py-1 rounded hover:border-[rgba(0,255,136,0.5)] transition-colors uppercase"
        >
          <Plus className="w-3 h-3" /> New Case
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {(['ALL','OPEN','INVESTIGATING','CLOSED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[9px] uppercase px-2 py-0.5 rounded border transition-colors ${
              filter === f
                ? 'border-[rgba(0,255,136,0.5)] text-[#00ff88] bg-[rgba(0,255,136,0.08)]'
                : 'border-[rgba(0,255,136,0.1)] text-[rgba(0,255,136,0.4)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Case list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {filtered.length === 0 && (
          <div className="text-center text-[rgba(0,255,136,0.3)] py-8 text-[10px] uppercase tracking-widest">
            No cases found
          </div>
        )}
        {filtered.map(c => (
          <div
            key={c.id}
            onClick={() => handleSelect(c)}
            className={`flex items-start justify-between px-3 py-2 rounded border cursor-pointer transition-all
              ${selected?.id === c.id
                ? 'border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.06)]'
                : 'border-[rgba(0,255,136,0.08)] bg-[rgba(0,255,136,0.02)] hover:border-[rgba(0,255,136,0.2)]'
              }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[rgba(0,255,136,0.5)] text-[9px]">#{c.id}</span>
                <span className="text-[#00ff88] text-[10px] font-bold">{c.bot_type.replace(/_/g,' ')}</span>
                <span className={`text-[9px] border px-1 rounded uppercase ${STATUS_COLORS[c.status]}`}>
                  {c.status}
                </span>
              </div>
              <div className="text-[9px] text-[rgba(0,255,136,0.5)] truncate">{c.summary || '—'}</div>
              <div className="text-[9px] text-[rgba(0,255,136,0.3)] mt-0.5">{fmtTime(c.created_at)}</div>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <span className={`text-xs font-bold ${c.score >= 75 ? 'text-[#ff3366]' : 'text-[#ffaa00]'}`}>
                {c.score.toFixed(1)}
              </span>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(c.id) }}
                className="text-[rgba(255,51,102,0.3)] hover:text-[#ff3366] transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit panel */}
      {selected && (
        <div className="mt-3 pt-3 border-t border-[rgba(0,255,136,0.1)] space-y-2">
          <div className="text-[9px] text-[rgba(0,255,136,0.5)] uppercase">
            Case #{selected.id} — {selected.bot_type}
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add investigation notes..."
            rows={2}
            className="w-full bg-[#050508] border border-[rgba(0,255,136,0.2)] rounded px-2 py-1.5
                       text-[#00ff88] text-[9px] resize-none focus:outline-none focus:border-[rgba(0,255,136,0.5)]
                       placeholder:text-[rgba(0,255,136,0.2)]"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => handleSave('INVESTIGATING')}
              disabled={saving}
              className="flex-1 text-[9px] uppercase py-1 border border-[rgba(255,170,0,0.4)] text-[#ffaa00] rounded hover:bg-[rgba(255,170,0,0.06)] transition-colors"
            >
              <Search className="w-2.5 h-2.5 inline mr-1" />Investigate
            </button>
            <button
              onClick={() => handleSave('CLOSED')}
              disabled={saving}
              className="flex-1 text-[9px] uppercase py-1 border border-[rgba(0,255,136,0.4)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.06)] transition-colors"
            >
              <CheckCircle className="w-2.5 h-2.5 inline mr-1" />Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
