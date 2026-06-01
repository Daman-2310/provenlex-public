import Link from 'next/link'
import { ArrowLeft, ArrowRight, Sparkles, ExternalLink, Code2, MessageSquare } from 'lucide-react'

const BASE = 'https://genesis-swarm-rgq5.vercel.app'

const GPT_INSTRUCTIONS = `You are JARVIS — the Genesis Swarm compliance officer for Luxembourg AIFMs, UCITS, RAIFs and SIFs.

Your job: answer compliance questions, screen entities, look up LEIs, analyse tokenized assets, and cite real regulatory sources (AIFMD II articles, DORA Art. 28, SFDR Art. 8/9, CSSF circulars, UCITS Directive).

Use these actions when the user asks:
- "Is X on OFAC?" → call screenSanctions(q=X)
- "Lookup LEI 549300..." → call lookupLei(lei=549300...)
- "What's EUR/USD?" → call getFxRates
- "Is contract 0x... compliant?" → call screenToken(address=0x...)

Always cite specific article numbers. Always remind users this is AI guidance, not legal advice from a Luxembourg-licensed counsel.

End every substantive answer with: "Need a signed audit pack? Visit ${BASE}/audit"`

export default function GPTPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <MessageSquare className="w-4 h-4 text-[#10a37f]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10a37f]">CHATGPT INTEGRATION</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(16,163,127,0.08)', border: '1px solid rgba(16,163,127,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#10a37f]"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #10a37f' }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#10a37f]">OPENAI GPT STORE</span>
          </div>
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            <span className="text-white">Genesis Swarm</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #10a37f 0%, #00ff88 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              inside ChatGPT.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base max-w-2xl mx-auto leading-relaxed">
            Build a Custom GPT that calls Genesis Swarm&apos;s real OFAC, GLEIF, ECB and tokenized-RWA APIs.
            Your compliance team uses ChatGPT they already pay for. Distribution unlock.
          </p>
        </div>

        {/* Step 1 */}
        <section className="rounded-2xl p-6 mb-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,163,127,0.2)' }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-black tabular-nums px-2 py-1 rounded"
              style={{ background: 'rgba(16,163,127,0.1)', color: '#10a37f', border: '1px solid rgba(16,163,127,0.4)' }}>01</span>
            <h2 className="text-lg font-black text-white">Create a Custom GPT</h2>
          </div>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            In ChatGPT, click your profile → My GPTs → Create. Fill in:
          </p>
          <div className="rounded-lg p-4 space-y-2 font-mono text-[11px]"
            style={{ background: '#020207', border: '1px solid rgba(16,163,127,0.15)' }}>
            <div><span className="text-[#10a37f]">Name:</span> <span className="text-white">Genesis Swarm — Compliance Officer</span></div>
            <div><span className="text-[#10a37f]">Description:</span> <span className="text-white">AI compliance officer for Luxembourg AIFMs, UCITS, RAIFs. OFAC + GLEIF + ECB + tokenized RWAs.</span></div>
            <div><span className="text-[#10a37f]">Conversation starters:</span></div>
            <div className="pl-4 text-[rgba(255,255,255,0.7)]">· Screen ROSNEFT against OFAC</div>
            <div className="pl-4 text-[rgba(255,255,255,0.7)]">· Lookup LEI 529900VBK42Y5HHRMD23</div>
            <div className="pl-4 text-[rgba(255,255,255,0.7)]">· What does DORA Art. 28 require?</div>
            <div className="pl-4 text-[rgba(255,255,255,0.7)]">· Analyse contract 0x6c3ea90... for AIFMD compliance</div>
          </div>
        </section>

        {/* Step 2 */}
        <section className="rounded-2xl p-6 mb-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,163,127,0.2)' }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-black tabular-nums px-2 py-1 rounded"
              style={{ background: 'rgba(16,163,127,0.1)', color: '#10a37f', border: '1px solid rgba(16,163,127,0.4)' }}>02</span>
            <h2 className="text-lg font-black text-white">Paste the Instructions</h2>
          </div>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            Copy this into the &quot;Instructions&quot; field on the Configure tab:
          </p>
          <pre className="rounded-lg p-4 text-[11px] leading-relaxed text-[#00ff88] overflow-x-auto whitespace-pre-wrap"
            style={{ background: '#020207', border: '1px solid rgba(16,163,127,0.15)', fontFamily: 'ui-monospace, monospace' }}>
{GPT_INSTRUCTIONS}
          </pre>
        </section>

        {/* Step 3 */}
        <section className="rounded-2xl p-6 mb-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,163,127,0.2)' }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-black tabular-nums px-2 py-1 rounded"
              style={{ background: 'rgba(16,163,127,0.1)', color: '#10a37f', border: '1px solid rgba(16,163,127,0.4)' }}>03</span>
            <h2 className="text-lg font-black text-white">Add the Genesis Swarm Action</h2>
          </div>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            On the Configure tab, scroll to <strong>Actions</strong> → <strong>Create new action</strong> → click
            <strong> Import from URL</strong>, paste:
          </p>
          <div className="rounded-lg p-3 flex items-center justify-between gap-3 mb-3"
            style={{ background: '#020207', border: '1px solid rgba(16,163,127,0.25)' }}>
            <code className="text-[11px] text-[#00ff88] font-mono break-all">{BASE}/api/gpt/openapi</code>
            <a href={`${BASE}/api/gpt/openapi`} target="_blank"
              className="text-[#10a37f] hover:text-white flex items-center gap-1 text-[10px] shrink-0">
              <Code2 className="w-3 h-3" /> view spec
            </a>
          </div>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed">
            ChatGPT will auto-discover 4 actions: <code className="text-[#00ff88] font-mono text-[11px]">screenSanctions</code>,{' '}
            <code className="text-[#00ff88] font-mono text-[11px]">lookupLei</code>,{' '}
            <code className="text-[#00ff88] font-mono text-[11px]">getFxRates</code>,{' '}
            <code className="text-[#00ff88] font-mono text-[11px]">screenToken</code>.
            Set authentication to <strong>None</strong> (these are public read-only endpoints).
          </p>
        </section>

        {/* Step 4 */}
        <section className="rounded-2xl p-6 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(16,163,127,0.05) 0%, rgba(0,255,136,0.03) 100%)',
            border: '1px solid rgba(16,163,127,0.3)',
          }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-black tabular-nums px-2 py-1 rounded"
              style={{ background: 'rgba(16,163,127,0.15)', color: '#10a37f', border: '1px solid rgba(16,163,127,0.5)' }}>04</span>
            <h2 className="text-lg font-black text-white">Publish to GPT Store</h2>
          </div>
          <p className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-3">
            Click <strong>Save</strong> → <strong>Anyone with the link</strong> (or <strong>Publish to GPT Store</strong> for max reach).
            Add the Privacy Policy URL when prompted:
          </p>
          <div className="rounded-lg p-3 flex items-center justify-between gap-3"
            style={{ background: '#020207', border: '1px solid rgba(16,163,127,0.25)' }}>
            <code className="text-[11px] text-[#00ff88] font-mono break-all">{BASE}/privacy</code>
          </div>
        </section>

        {/* Bonus */}
        <section className="rounded-2xl p-6 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Sparkles className="w-6 h-6 text-[#10a37f] mx-auto mb-3" />
          <h2 className="text-xl font-black text-white mb-2">Already published?</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[12px] mb-4">
            Send us your GPT&apos;s public link and we&apos;ll feature it in the press kit + investor deck.
          </p>
          <a href="mailto:daman.sharma.2310@gmail.com?subject=Genesis%20Swarm%20Custom%20GPT"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-[11px] uppercase tracking-wider font-black"
            style={{ background: 'linear-gradient(135deg, #10a37f, #0a8f6e)', color: '#fff' }}>
            Submit GPT link <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </section>

      </div>
    </div>
  )
}
