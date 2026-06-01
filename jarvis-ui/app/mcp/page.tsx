import Link from 'next/link'
import { ArrowLeft, Cpu, Code2, Bot, Sparkles } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'Genesis MCP Server · Call Genesis from any LLM · Genesis Swarm',
  description: 'Genesis Swarm as a Model Context Protocol (MCP) server. ChatGPT, Claude, Cursor, and any MCP-compatible client can query Genesis natively.',
}

const CONFIG_EXAMPLE = `{
  "mcpServers": {
    "genesis-swarm": {
      "transport": "http",
      "url": "https://genesis-swarm-rgq5.vercel.app/api/mcp"
    }
  }
}`

const CALL_EXAMPLE = `curl -X POST https://genesis-swarm-rgq5.vercel.app/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "genesis.score.get",
      "arguments": {
        "entity_name": "Deutsche Bank",
        "explain": true
      }
    }
  }'`

const RESPONSE_EXAMPLE = `{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "found": true,
    "entity": "Deutsche Bank AG, London Branch",
    "lei": "7H6GLXDRUGQFU57RNE97",
    "pre_crime_index": 55,
    "trajectory": "RISING",
    "pattern_match": "wirecard",
    "forecast": "...",
    "permalink": "...",
    "breakdown": { /* 11-bot signal breakdown */ }
  }
}`

const TOOLS = [
  { name: 'genesis.score.get',          desc: 'Score + optional 11-bot breakdown for any tracked entity or LEI' },
  { name: 'genesis.prophecy.list',      desc: 'List sealed Book of Genesis entries, ranked by Pre-Crime Index' },
  { name: 'genesis.vindication.list',   desc: 'Confirmed prophecies from the Vindication Engine' },
  { name: 'genesis.entity.search',      desc: 'Fuzzy search across Genesis-tracked entities' },
  { name: 'genesis.manifest.get',       desc: 'Book Merkle root + Bitcoin anchor status' },
]

export default function McpPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#9b6dff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Cpu className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">MCP SERVER</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">JSON-RPC 2.0 · MCP-compatible</span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">
              Genesis becomes infrastructure for LLMs
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Ask ChatGPT, Claude, or Cursor:</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(155,109,255,0.3))',
            }}>"What's the Genesis Score for X?"</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Genesis Swarm exposes itself as a Model Context Protocol server. Any MCP-compatible
            LLM client can call Genesis natively. Free, no API key, public methods.
          </p>
        </div>

        {/* CONFIG */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">1. Add to your MCP client config</div>
          <CodeBlock code={CONFIG_EXAMPLE} language="JSON" accent="#9b6dff" />
          <div className="text-[11px] text-[rgba(255,255,255,0.55)] mt-3">
            Works with Claude Code, Cursor, Continue, Cline, and any MCP-compliant runtime.
            ChatGPT support coming via the OpenAI Agents API.
          </div>
        </section>

        {/* TOOL LIST */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">2. Available tools</div>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
            {TOOLS.map((t, i) => (
              <div key={t.name} className="grid grid-cols-[280px_1fr] gap-4 px-4 py-3 items-center"
                style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                <span className="font-mono text-[12px] font-bold text-[#9b6dff]">{t.name}</span>
                <span className="text-[12px] text-[rgba(255,255,255,0.75)]">{t.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CALL EXAMPLE */}
        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">3. Call it directly (curl)</div>
          <CodeBlock code={CALL_EXAMPLE} language="bash" accent="#4a9eff" />
        </section>

        <section className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-4">4. Sample response</div>
          <CodeBlock code={RESPONSE_EXAMPLE} language="JSON" accent="#00ff88" />
        </section>

        {/* WHY */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <Bot className="w-5 h-5 text-[#9b6dff] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-2">Why MCP matters</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Every compliance team is putting LLMs (ChatGPT, Claude, Copilot) into their workflow. If
            those LLMs can call Genesis natively, Genesis becomes part of the workflow without a
            separate UI, login, or API key. We turn into <strong className="text-white">infrastructure for the LLMs themselves</strong>.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed">
            Strategically: this is how a small team gets distribution. Bloomberg has terminals.
            S&P has data feeds. We have an MCP server every modern LLM can talk to in one config line.
          </p>
        </section>

        {/* STATUS */}
        <section className="rounded-xl p-4 flex items-center gap-3 flex-wrap"
          style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.25)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #00ff88' }} />
          <span className="text-[11px] uppercase tracking-wider font-black text-[#00ff88]">OPERATIONAL</span>
          <span className="text-[11px] text-[rgba(255,255,255,0.65)]">
            Server endpoint:
            <a href="/api/mcp" className="ml-2 font-mono text-[#4a9eff] hover:underline">
              https://genesis-swarm-rgq5.vercel.app/api/mcp
            </a>
          </span>
        </section>

      </div>
    </div>
  )
}

function CodeBlock({ code, language, accent }: { code: string; language: string; accent: string }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${accent}30`, backdropFilter: 'blur(10px)' }}>
      <div className="flex items-center gap-2 px-4 py-2"
        style={{ background: `${accent}06`, borderBottom: `1px solid ${accent}15` }}>
        <Code2 className="w-3.5 h-3.5" style={{ color: accent }} />
        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: accent }}>{language}</span>
      </div>
      <pre className="p-4 text-[11px] font-mono text-[rgba(255,255,255,0.88)] overflow-x-auto">{code}</pre>
    </div>
  )
}
