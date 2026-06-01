import Link from 'next/link'
import { ArrowLeft, Cpu, Lock, Swords, Code2, Scale, Network as NetIcon, Brain, Zap, GitBranch } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import LoopConsole from './LoopConsole'

export const metadata = {
  title: 'The Genesis Engine · 7-Pillar Architecture · Genesis Swarm',
  description: 'Law as deterministic, verifier-gated software. Code-to-Law synthesis, ZK privacy vaults, autonomous red-teaming, synthetic precedent, topological loophole mapping, institutional enforcement twins, kinetic compliance — one control loop.',
}

const PILLARS = [
  { n: 1, icon: Lock,    name: 'Zero-Knowledge Privacy Vault', color: '#00ff88',
    real: 'Hash-commitment predicate proofs (Web Crypto)',
    body: 'Prove a compliance predicate holds over private state without revealing the numbers. Commit C = H(value‖salt); publish commitments + boolean + binding hash; verifier confirms consistency, learns only the boolean. The full zk-SNARK tier runs in the Rust zk-worker; this is the edge-runnable commitment tier.' },
  { n: 2, icon: Swords,  name: 'Autonomous Red-Teaming', color: '#ff3366',
    real: 'Bounded adversarial binary-search over rule thresholds',
    body: 'Continuously attacks the rulebook: binary-searches the minimal perturbation of each field that flips the verdict, reporting how close the institution is to breach and via which field. Outputs ranked attack vectors + auto-generated buffer-band hardening.' },
  { n: 3, icon: Code2,   name: 'Code-to-Law Synthesis', color: '#9b6dff',
    real: 'Deterministic obligation-DSL → pure predicate compiler',
    body: 'A typed rule DSL compiles to pure boolean predicates over a company state vector. No LLM in the hot path — same (rule, state) → same verdict, every time, with a machine-checkable evaluation trace and citations. This is "law as software," literally.' },
  { n: 4, icon: Scale,   name: 'Synthetic Precedent Engine', color: '#ffaa00',
    real: 'Monte Carlo over published enforcement base rates',
    body: 'Rolls 10,000 synthetic enforcement trajectories per obligation under a jurisdiction\'s posture parameters → probability distribution over outcomes (no action → fine → licence action), expected cost, P95 worst case, median lag. A calibrated prior, not an oracle.' },
  { n: 5, icon: NetIcon, name: 'Topological Law Mapping', color: '#4a9eff',
    real: 'Brandes betweenness + Tarjan bridges + structural holes',
    body: 'Treats regulation as a graph and computes real topology: betweenness centrality (load-bearing obligations), articulation points + bridges (removable links between regimes = loopholes), Betti-1 (circular dependency count), and Burt structural holes (under-cross-checked gaps).' },
  { n: 6, icon: Brain,   name: 'Regulatory Twin (Institutional)', color: '#00d8ff',
    real: 'Enforcement-posture model of INSTITUTIONS — never individuals',
    body: 'Models the published enforcement posture of supervisors (CSSF, BaFin, FCA, AMF, AFM) — aggression, speed, transparency, fine propensity, thematic priorities — to read enforcement risk + likely instrument for a breach profile. By hard design it models institutions, not identifiable humans (GDPR Art. 9/22).' },
  { n: 7, icon: Zap,     name: 'Kinetic Compliance', color: '#ff7a00',
    real: 'Event-driven, signed, human-gated remediation intents',
    body: 'Turns a verdict + red-team report into a queue of HMAC-signed remediation intents (raise capital buffer, trim exposure, freeze counterparty, file disclosure, escalate to board). Autonomy is in detection + proposal; every intent carries a required-approval gate. Never auto-moves money.' },
]

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent="#9b6dff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Cpu className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">THE GENESIS ENGINE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            7 pillars · one verifier-gated loop
          </span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <GitBranch className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">Law as deterministic software infrastructure</span>
          </div>
          <h1 className="font-black tracking-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 6vw, 4.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Not an LLM wrapper.</span><br />
            <span style={{ background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 24px rgba(155,109,255,0.3))' }}>
              A compliance kernel.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.65)] text-base max-w-3xl mx-auto leading-relaxed">
            Most RegTech is a chatbot over a PDF. The Genesis Engine treats regulation as a typed,
            content-addressed obligation graph and compliance as a continuously-evaluated predicate.
            Seven pillars, one control loop, verifier-gated so the model never decides compliance —
            it only proposes, and a solver or a human ratifies. Everything below is{' '}
            <strong className="text-white">running code you can call right now.</strong>
          </p>
        </div>

        {/* LIVE LOOP CONSOLE */}
        <section className="mb-14">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">Run the loop · live</div>
          <LoopConsole />
        </section>

        {/* PILLARS */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">The seven pillars</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PILLARS.map(p => (
              <div key={p.n} className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.45)', border: `1px solid ${p.color}30`, backdropFilter: 'blur(10px)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${p.color}15`, border: `1px solid ${p.color}40` }}>
                    <p.icon className="w-4 h-4" style={{ color: p.color }} />
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider font-mono" style={{ color: p.color }}>Pillar {p.n}</div>
                    <div className="text-[15px] font-black text-white leading-tight">{p.name}</div>
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: p.color }}>{p.real}</div>
                <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* THE LOOP DIAGRAM */}
        <section className="rounded-2xl p-6 mb-12" style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">The foundational loop</div>
          <pre className="text-[10px] sm:text-[11px] font-mono text-[rgba(255,255,255,0.75)] overflow-x-auto leading-relaxed">{`state + rulebook
   │
   ├─[3] compile obligation DSL → pure predicates → VERDICT (deterministic, traced)
   │
   ├─[2] red-team: binary-search minimal breach perturbation → ATTACK VECTORS
   │
   ├─[1] ZK-prove verdict over private state → PROOF BUNDLE (verifier learns only booleans)
   │
   ├─[4] Monte-Carlo enforcement on worst failure → PRIOR (P(action), expected fine, P95)
   │
   ├─[6] institutional twin read for jurisdiction → POSTURE (instrument + lag)
   │
   └─[7] derive signed, human-gated remediation → INTENT QUEUE
            │
   [5] topology over the rulebook graph → BRIDGES · STRUCTURAL HOLES · LOOPHOLES
            │
            ▼
   AUDIT LEDGER (append-only · Bitcoin-anchored)`}</pre>
        </section>

        {/* INVARIANTS */}
        <section className="rounded-2xl p-6" style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-3">Three invariants that make it verifier-gated, not hallucination-prone</div>
          <ol className="space-y-2 text-[13px] text-[rgba(255,255,255,0.78)] leading-relaxed list-decimal pl-5">
            <li>Every obligation carries a machine-checkable predicate. LLMs may <em>propose</em> predicates; a solver or human <em>ratifies</em> before activation. The model never directly decides compliance.</li>
            <li>Every verdict is a pure function of (state_hash, rulebook_hash). Same inputs → same output, always. No model call in the hot path.</li>
            <li>Every state transition is signed and Bitcoin-anchored, so the red-team and the auditor evaluate the exact artifact the kernel did.</li>
          </ol>
          <p className="text-[11px] text-[rgba(255,255,255,0.5)] mt-4 leading-relaxed">
            Honest scope: &ldquo;zero hallucination&rdquo; is not a property any LLM has. What this architecture
            guarantees is bounded, reproducible, verifier-gated execution — the model is confined to
            extraction and proposal, and nothing it emits is trusted until a deterministic check passes.
          </p>
        </section>
      </div>
    </div>
  )
}
