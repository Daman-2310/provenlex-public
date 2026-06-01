'use client'

import { useState } from 'react'
import { Copy, Download, CheckCircle2 } from 'lucide-react'

interface Props {
  receipt: string
  hash: string
  calendar: string
  submittedAt: string
}

export default function AnchorClient({ receipt, hash, calendar, submittedAt }: Props) {
  const [copied, setCopied] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)

  function copyReceipt() {
    navigator.clipboard.writeText(receipt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadReceipt() {
    // The receipt as stored is base64 of the binary OTS proof.
    // Decode and download as a .ots file the OpenTimestamps CLI can verify.
    const bin = atob(receipt)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `genesis-book-${hash.slice(0, 12)}.ots`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-xl p-4 mt-3" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(74,158,255,0.2)' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-[#4a9eff] mb-1">OpenTimestamps Receipt</div>
          <div className="text-[10px] text-[rgba(255,255,255,0.55)]">
            Calendar: <a href={calendar} target="_blank" rel="noopener noreferrer" className="text-[#4a9eff] hover:underline font-mono">{calendar}</a>
            {submittedAt && <span className="ml-2">· Submitted {new Date(submittedAt).toLocaleString('en-GB')}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadReceipt}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all"
            style={{ background: 'rgba(74,158,255,0.12)', border: '1px solid rgba(74,158,255,0.4)', color: '#4a9eff' }}>
            <Download className="w-3 h-3" /> Download .ots
          </button>
          <button onClick={copyReceipt}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all"
            style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.2)', color: '#4a9eff' }}>
            {copied ? <><CheckCircle2 className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy base64</>}
          </button>
          <button onClick={() => setShowReceipt(s => !s)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
            {showReceipt ? 'Hide' : 'Show'} raw
          </button>
        </div>
      </div>

      {showReceipt && (
        <pre className="font-mono text-[9px] text-[rgba(255,255,255,0.55)] leading-relaxed break-all whitespace-pre-wrap max-h-40 overflow-y-auto p-2 rounded"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          {receipt}
        </pre>
      )}
    </div>
  )
}
