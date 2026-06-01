import Link from 'next/link'
import { ArrowLeft, Brain, Code2, Download, BookOpen, Cpu } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import CodexConsole from './CodexConsole'
import CodexWaitlist from './CodexWaitlist'

export const metadata = {
  title: 'Genesis Codex · Open Compliance Intelligence Model · Genesis Swarm',
  description: 'A specialised language model trained on EU compliance, supervisory practice, and operational-risk analysis. API now, self-hostable .gguf in Q4. Free for compliance teams.',
}

const CURL_EXAMPLE = `curl -X POST https://genesis-swarm-rgq5.vercel.app/api/codex/chat \\
  -H "Content-Type: application/json" \\
  -d '{"question":"Summarise the key obligations under AIFMD II Article 24 for sub-threshold AIFMs."}'`

const PY_EXAMPLE = `import httpx

with httpx.stream(
    "POST",
    "https://genesis-swarm-rgq5.vercel.app/api/codex/chat",
    json={"question": "When does CSSF require a depositary special audit under Circular 18/698?"},
    timeout=60,
) as r:
    for line in r.iter_lines():
        if line.startswith("data:"):
            print(line[5:].strip())`

const KNOWLEDGE_AREAS = [
  { area: 'AIFMD I/II', detail: 'EU 2011/61 + EU 2024/927 · Annex IV templates · sub-threshold regime' },
  { area: 'UCITS V',     detail: 'Eligible assets · depositary obligations · risk management' },
  { area: 'MiFID II',    detail: 'Suitability · best execution · product governance · COBS 9A' },
  { area: 'SFDR + Taxonomy', detail: 'Article 6/8/9 disclosure regimes · PAI indicators' },
  { area: 'Solvency II', detail: 'SCR · MCR · own funds · SFCR structure' },
  { area: 'CSSF Practice', detail: 'Luxembourg circulars · Conducting Officer obligations · AML/CFT' },
  { area: 'BaFin Enforcement', detail: 'Public enforcement actions · KMG/WpHG · §44 KWG' },
  { area: 'Historical EU Collapses', detail: 'Wirecard · Greensill · Steinhoff · NMC · Carillion · BES · ABLV · Pilatus' },
]

export default function CodexPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#00d8ff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Brain className="w-4 h-4 text-[#00d8ff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00d8ff]">CODEX</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Compliance intelligence model · API live · .gguf Q4 2026
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,216,255,0.08)', border: '1px solid rgba(0,216,255,0.3)' }}>
            <Cpu className="w-3 h-3 text-[#00d8ff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00d8ff]">
              The open model every compliance team can run locally
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Compliance,</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #00d8ff 0%, #9b6dff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,216,255,0.3))',
            }}>weight-and-biases.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Genesis Codex is a language model specialised on EU and global financial-services
            compliance — AIFMD, UCITS, MiFID II, SFDR, Solvency II, CSSF/BaFin/ESMA practice,
            and historical EU operational-risk failures. API access is live today. Self-hostable
            .gguf release follows in Q4 2026.
          </p>
        </div>

        {/* CONSOLE */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">Ask the model</div>
          <CodexConsole />
        </section>

        {/* KNOWLEDGE AREAS */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">Knowledge surface</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {KNOWLEDGE_AREAS.map(a => (
              <div key={a.area} className="rounded-xl p-4"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,216,255,0.2)', backdropFilter: 'blur(8px)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-3 h-3 text-[#00d8ff]" />
                  <span className="text-[12px] font-bold text-white">{a.area}</span>
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.6)] leading-relaxed">{a.detail}</div>
              </div>
            ))}
          </div>
        </section>

        {/* API EXAMPLES */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">Call from your stack</div>
          <div className="space-y-4">
            <CodeBlock label="bash · curl" code={CURL_EXAMPLE} />
            <CodeBlock label="Python · httpx · SSE" code={PY_EXAMPLE} />
          </div>
          <div className="mt-3 text-[10px] text-[rgba(255,255,255,0.45)] leading-relaxed">
            The endpoint streams Server-Sent Events. Each event is JSON with a <code className="text-[#00d8ff] font-mono">{'{"delta":"..."}'}</code> chunk;
            <code className="text-[#00d8ff] font-mono"> data: [DONE]</code> terminates the stream.
          </div>
        </section>

        {/* WAITLIST */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-4">Self-host the model</div>
          <div className="rounded-2xl p-6"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
            <div className="flex items-start gap-4 mb-4">
              <Download className="w-5 h-5 text-[#00d8ff] mt-1 shrink-0" />
              <div>
                <div className="text-[15px] font-bold text-white mb-1">Genesis Codex v1 · .gguf release</div>
                <div className="text-[12px] text-[rgba(255,255,255,0.65)] leading-relaxed">
                  A quantised .gguf model targeting a 13B parameter Llama-3 derivative,
                  fine-tuned on the corpus described above. Runs locally on consumer hardware
                  via llama.cpp, Ollama, or LM Studio. Distributed under the Llama 3 community
                  license with the compliance-specific adapter under Apache 2.0.
                </div>
              </div>
            </div>
            <div className="text-[11px] text-[rgba(255,255,255,0.55)] mb-4">
              <strong className="text-white">Target release: Q4 2026.</strong> Join the waitlist —
              we&apos;ll email the Hugging Face URL the day the model ships.
            </div>
            <CodexWaitlist />
          </div>
        </section>

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(0,216,255,0.04)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <Brain className="w-5 h-5 text-[#00d8ff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-2">Why we ship the model openly</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Compliance teams cannot send sensitive fund data to GPT-4 or Claude over a public API
            without negotiating data-protection agreements that take six months. They <strong className="text-white">
            need a model that runs locally.</strong> No vendor in EU compliance ships such a model today.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            Open-sourcing Genesis Codex creates the strongest possible developer + practitioner
            adoption flywheel: GitHub stars become marketing, Hugging Face downloads become a
            measurable usage curve, every fork is a free contributor.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: this is the AI-infrastructure positioning a16z and Sequoia look for.
            "We built the open model" is a different category of company than "we built the SaaS."
          </p>
        </section>

      </div>
    </div>
  )
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
      <div className="flex items-center gap-2 px-4 py-2"
        style={{ background: 'rgba(0,216,255,0.06)', borderBottom: '1px solid rgba(0,216,255,0.15)' }}>
        <Code2 className="w-3.5 h-3.5 text-[#00d8ff]" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#00d8ff]">{label}</span>
      </div>
      <pre className="p-4 text-[11px] font-mono text-[rgba(255,255,255,0.88)] overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  )
}
