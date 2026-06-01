"""
Genesis Swarm — Investor pitch deck rendered as a self-contained HTML page.
Served at GET /pitch (public, no auth required).
"""

from __future__ import annotations

import time


def render_pitch_deck() -> str:
    year = time.strftime("%Y")
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Genesis Swarm — Investor Deck</title>
  <style>
    :root{{
      --bg:#0a0a14;--surface:#111827;--accent:#00ff88;--accent2:#00c6ff;
      --text:#e8eaf0;--muted:#6b7280;--danger:#ef4444;--warn:#f59e0b;
      --card:#151f2e;--border:#1e3a5f;
    }}
    *{{box-sizing:border-box;margin:0;padding:0}}
    html{{scroll-behavior:smooth}}
    body{{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;overflow-x:hidden}}

    /* ── Nav ── */
    nav{{position:fixed;top:0;left:0;right:0;z-index:100;
         background:rgba(10,10,20,.95);backdrop-filter:blur(8px);
         border-bottom:1px solid var(--border);
         display:flex;align-items:center;justify-content:space-between;
         padding:.7rem 2rem}}
    .nav-logo{{color:var(--accent);font-weight:bold;font-size:1rem;letter-spacing:2px}}
    .nav-links{{display:flex;gap:1.5rem}}
    .nav-links a{{color:var(--muted);text-decoration:none;font-size:.75rem;letter-spacing:1px;
                  transition:color .2s}}
    .nav-links a:hover{{color:var(--accent)}}

    /* ── Slides ── */
    section{{min-height:100vh;display:flex;flex-direction:column;
             justify-content:center;padding:6rem 4rem 4rem;
             border-bottom:1px solid var(--border);position:relative}}
    section:nth-child(even){{background:var(--surface)}}

    /* ── Typography ── */
    .slide-num{{color:var(--muted);font-size:.7rem;letter-spacing:3px;margin-bottom:.8rem}}
    h1{{font-size:clamp(2rem,5vw,3.5rem);line-height:1.15;margin-bottom:1rem}}
    h2{{font-size:clamp(1.4rem,3vw,2rem);color:var(--accent);margin-bottom:1.2rem}}
    h3{{font-size:1rem;color:var(--accent2);margin-bottom:.6rem;letter-spacing:1px;text-transform:uppercase}}
    p{{color:#9ca3af;line-height:1.7;max-width:65ch;margin-bottom:.8rem}}
    .accent{{color:var(--accent)}}
    .accent2{{color:var(--accent2)}}
    .big{{font-size:clamp(2.5rem,6vw,5rem);font-weight:bold;line-height:1}}

    /* ── Grid helpers ── */
    .grid-2{{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:1.5rem}}
    .grid-3{{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-top:1.5rem}}
    .grid-4{{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-top:1.5rem}}
    @media(max-width:768px){{.grid-2,.grid-3,.grid-4{{grid-template-columns:1fr}}}}

    /* ── Cards ── */
    .card{{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1.5rem}}
    .card h3{{margin-bottom:.5rem}}
    .stat-val{{font-size:2.2rem;font-weight:bold;color:var(--accent);line-height:1}}
    .stat-lbl{{font-size:.7rem;color:var(--muted);letter-spacing:1px;margin-top:.3rem}}

    /* ── Table ── */
    table{{width:100%;border-collapse:collapse;margin-top:1.2rem;font-size:.85rem}}
    th{{color:var(--muted);text-align:left;padding:.5rem .8rem;
        border-bottom:1px solid var(--border);letter-spacing:1px;font-size:.7rem}}
    td{{padding:.5rem .8rem;border-bottom:1px solid #0f1929}}
    tr:hover td{{background:#0f1929}}
    .tag{{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.7rem;font-weight:bold}}
    .tag-green{{background:#00ff8820;color:var(--accent);border:1px solid #00ff8840}}
    .tag-blue{{background:#00c6ff20;color:var(--accent2);border:1px solid #00c6ff40}}
    .tag-red{{background:#ef444420;color:var(--danger);border:1px solid #ef444440}}

    /* ── Timeline ── */
    .timeline{{margin-top:1.5rem;border-left:2px solid var(--border);padding-left:2rem}}
    .tl-item{{margin-bottom:1.5rem;position:relative}}
    .tl-item::before{{content:'';position:absolute;left:-2.4rem;top:.35rem;
                       width:.7rem;height:.7rem;border-radius:50%;
                       background:var(--accent);border:2px solid var(--bg)}}
    .tl-date{{font-size:.7rem;color:var(--muted);letter-spacing:1px}}
    .tl-title{{font-weight:bold;color:var(--text);margin:.2rem 0}}
    .tl-desc{{font-size:.85rem;color:var(--muted)}}

    /* ── Architecture ascii ── */
    pre.arch{{background:#050510;border:1px solid var(--border);border-radius:8px;
              padding:1.5rem;font-size:.75rem;line-height:1.6;color:#64748b;
              overflow-x:auto}}
    pre.arch .hi{{color:var(--accent)}}

    /* ── CTA ── */
    .cta{{display:inline-block;margin-top:2rem;padding:.8rem 2rem;
          background:var(--accent);color:#000;font-weight:bold;
          border-radius:6px;text-decoration:none;letter-spacing:1px;
          transition:opacity .2s}}
    .cta:hover{{opacity:.85}}
    .cta-ghost{{background:transparent;color:var(--accent);
                border:1px solid var(--accent);margin-left:1rem}}

    /* ── Footer ── */
    footer{{text-align:center;padding:3rem;color:var(--muted);font-size:.75rem;
            border-top:1px solid var(--border)}}
  </style>
</head>
<body>

<nav>
  <span class="nav-logo">⬡ GENESIS SWARM</span>
  <div class="nav-links">
    <a href="#problem">Problem</a>
    <a href="#solution">Solution</a>
    <a href="#product">Product</a>
    <a href="#traction">Traction</a>
    <a href="#market">Market</a>
    <a href="#team">Team</a>
    <a href="#ask">The Ask</a>
    <a href="https://genesis-swarm-terminal.vercel.app" target="_blank">Live Demo ↗</a>
  </div>
</nav>

<!-- ── Slide 1: Cover ── -->
<section id="cover" style="text-align:center;align-items:center">
  <div class="slide-num">GENESIS SWARM · INVESTOR DECK · {year}</div>
  <h1>The <span class="accent">AI Immune System</span><br>for Institutional Finance</h1>
  <p style="text-align:center;font-size:1.1rem;max-width:55ch;margin:0 auto 1rem">
    11 autonomous agents. Real-time compliance surveillance. Byzantine fault-tolerant consensus.
    Built for the €5.3 trillion Luxembourg fund industry.
  </p>
  <div class="grid-4" style="max-width:700px;margin:2rem auto 0">
    <div class="card" style="text-align:center">
      <div class="stat-val">&lt;50ms</div>
      <div class="stat-lbl">CONSENSUS ROUND</div>
    </div>
    <div class="card" style="text-align:center">
      <div class="stat-val">11</div>
      <div class="stat-lbl">SPECIALIST AGENTS</div>
    </div>
    <div class="card" style="text-align:center">
      <div class="stat-val">f=3</div>
      <div class="stat-lbl">BYZANTINE TOLERANCE</div>
    </div>
    <div class="card" style="text-align:center">
      <div class="stat-val">0</div>
      <div class="stat-lbl">FALSE NEGATIVES (DEMO)</div>
    </div>
  </div>
  <div style="margin-top:2.5rem">
    <a class="cta" href="https://genesis-swarm-terminal.vercel.app" target="_blank">See Live Demo</a>
    <a class="cta cta-ghost" href="mailto:daman.sharma.2310@gmail.com">Contact Founder</a>
  </div>
</section>

<!-- ── Slide 2: Problem ── -->
<section id="problem">
  <div class="slide-num">01 / THE PROBLEM</div>
  <h2>Wirecard happened because no one was watching in real time</h2>
  <div class="grid-2">
    <div>
      <p>The €1.9 billion accounting fraud unravelled over <strong style="color:var(--text)">five years</strong>.
      KPMG auditors missed it. Regulators missed it. The signals were there — in NAV deviations,
      suspicious FX flows, shell entity chains — but no system was watching <em>all of them simultaneously</em>.</p>
      <p>Today's compliance teams use siloed tools: one system for sanctions, another for AML,
      another for NAV monitoring. No correlation. No consensus. No real-time response.</p>
      <div class="timeline" style="margin-top:1.5rem">
        <div class="tl-item">
          <div class="tl-date">2015</div>
          <div class="tl-title">First anomaly signals appear</div>
          <div class="tl-desc">NAV deviations, suspicious entity chains — missed by all parties</div>
        </div>
        <div class="tl-item">
          <div class="tl-date">2019</div>
          <div class="tl-title">Short-seller reports note missing cash</div>
          <div class="tl-desc">FT Alphaville, Zatarra Research — ignored by regulators</div>
        </div>
        <div class="tl-item" style="--accent:#ef4444">
          <div class="tl-date">June 2020</div>
          <div class="tl-title" style="color:var(--danger)">€1.9B declared missing. Stock collapses.</div>
          <div class="tl-desc">5 years of detectable fraud. One of the largest in European history.</div>
        </div>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:1rem">
        <h3>The cost of slow detection</h3>
        <div style="margin-top:.8rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:.5rem">
            <span style="color:var(--muted);font-size:.85rem">Wirecard detection lag</span>
            <span style="color:var(--danger);font-weight:bold">~5 years</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.5rem">
            <span style="color:var(--muted);font-size:.85rem">Avg AML investigation cost</span>
            <span style="color:var(--warn);font-weight:bold">$8k–$25k per case</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:.5rem">
            <span style="color:var(--muted);font-size:.85rem">EU regulatory fines 2020–24</span>
            <span style="color:var(--danger);font-weight:bold">$2.1 billion</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--muted);font-size:.85rem">DORA non-compliance penalty</span>
            <span style="color:var(--danger);font-weight:bold">Up to 2% of global turnover</span>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Genesis Swarm Wirecard Replay</h3>
        <p style="font-size:.85rem">Our synthetic fraud replay feeds Wirecard-timeline data
        through the swarm. First CRITICAL alert fires at simulated day ~500 —
        <strong style="color:var(--accent)">1,395 days before real-world discovery</strong>.</p>
        <div style="margin-top:.8rem;font-size:.75rem;color:var(--accent);font-family:monospace">
          GET /api/v1/simulation/wirecard-replay
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── Slide 3: Solution ── -->
<section id="solution">
  <div class="slide-num">02 / THE SOLUTION</div>
  <h2>An autonomous swarm that never sleeps, never silos, never misses</h2>
  <pre class="arch">
  ┌─────────────────────────────────────────────────────────────┐
  │  <span class="hi">LIVE DATA FEEDS</span>                                            │
  │  OFAC SDN · ECB FX · AISStream · Celestrak · OpenCorporates│
  └─────────────────┬───────────────────────────────────────────┘
                    │ real-time
  ┌─────────────────▼───────────────────────────────────────────┐
  │  <span class="hi">11 SPECIALIST AGENTS</span>  (IsolationForest · online learning)  │
  │  NAV · FX · Cargo · Sanctions · Compliance · Succession … │
  └─────────────────┬───────────────────────────────────────────┘
                    │ anomaly score &gt; threshold
  ┌─────────────────▼───────────────────────────────────────────┐
  │  <span class="hi">PBFT CONSENSUS</span>  (N=11, f=3, quorum=7, Ed25519 signed)     │
  │  PRE-PREPARE → PREPARE → COMMIT → REPLY → Merkle proof     │
  └─────────────────┬───────────────────────────────────────────┘
                    │ consensus reached
  ┌─────────────────▼───────────────────────────────────────────┐
  │  <span class="hi">RESPONSE</span>: Alert dispatch · Case opened · PDF report        │
  │  Slack · Email · On-chain Merkle anchor · JARVIS AI chat   │
  └─────────────────────────────────────────────────────────────┘</pre>
  <div class="grid-3" style="margin-top:2rem">
    <div class="card">
      <h3>No single point of failure</h3>
      <p style="font-size:.85rem">PBFT tolerates 3 malicious or crashed agents.
      An alert is only raised when 7 of 11 independent agents independently confirm the risk.</p>
    </div>
    <div class="card">
      <h3>Tamper-evident audit trail</h3>
      <p style="font-size:.85rem">Every decision is Merkle-chained and anchored to Ethereum calldata.
      Any post-hoc modification of the log invalidates the chain — court-admissible.</p>
    </div>
    <div class="card">
      <h3>Self-learning, not rules</h3>
      <p style="font-size:.85rem">IsolationForest retrains every 5 minutes from live data.
      Operator feedback closes the RL loop. A/B shadow models gate every deployment.</p>
    </div>
  </div>
</section>

<!-- ── Slide 4: Product ── -->
<section id="product">
  <div class="slide-num">03 / THE PRODUCT</div>
  <h2>What it does today — live, not a mockup</h2>
  <div class="grid-2">
    <div>
      <table>
        <thead><tr><th>Capability</th><th>Status</th><th>Tech</th></tr></thead>
        <tbody>
          <tr><td>11 live detection agents</td><td><span class="tag tag-green">LIVE</span></td><td>IsolationForest + online learning</td></tr>
          <tr><td>PBFT consensus (gRPC)</td><td><span class="tag tag-green">LIVE</span></td><td>Ed25519, N=11 f=3, view-change</td></tr>
          <tr><td>Claude AI analysis</td><td><span class="tag tag-green">LIVE</span></td><td>Streaming SSE, live swarm context</td></tr>
          <tr><td>On-chain Merkle anchor</td><td><span class="tag tag-green">LIVE</span></td><td>Ethereum calldata + IPFS</td></tr>
          <tr><td>SHAP explainability</td><td><span class="tag tag-green">LIVE</span></td><td>TreeExplainer, top-N features</td></tr>
          <tr><td>PDF compliance reports</td><td><span class="tag tag-green">LIVE</span></td><td>reportlab + Merkle root</td></tr>
          <tr><td>Multi-tenancy</td><td><span class="tag tag-green">LIVE</span></td><td>Per-tenant JWT + DB isolation</td></tr>
          <tr><td>i18n EN/FR</td><td><span class="tag tag-green">LIVE</span></td><td>60-key catalogue + middleware</td></tr>
          <tr><td>CSSF 18/698 mapping</td><td><span class="tag tag-green">LIVE</span></td><td>Full paragraph-level mapping</td></tr>
          <tr><td>External security audit</td><td><span class="tag tag-red">PLANNED</span></td><td>v1.0 — TIBER-EU engagement</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <div class="card" style="margin-bottom:1rem">
        <h3>Live demo</h3>
        <p style="font-size:.85rem">The terminal UI at <strong style="color:var(--accent)">genesis-swarm-terminal.vercel.app</strong>
        runs against a live Railway backend. Every alert, every consensus round, every JARVIS
        AI response is real — not scripted.</p>
        <a class="cta" style="display:inline-block;margin-top:1rem;font-size:.8rem"
           href="https://genesis-swarm-terminal.vercel.app" target="_blank">Open Live Demo ↗</a>
      </div>
      <div class="card">
        <h3>Open source</h3>
        <p style="font-size:.85rem">Full codebase on GitHub — 4,000+ lines of production Python,
        CI pipeline, Docker, Alembic migrations, property-based tests, chaos tests.
        Investors can read every line.</p>
        <a class="cta cta-ghost" style="display:inline-block;margin-top:1rem;font-size:.8rem"
           href="https://github.com/Daman-2310/genesis-swarm" target="_blank">View on GitHub ↗</a>
      </div>
    </div>
  </div>
</section>

<!-- ── Slide 5: Wirecard Proof ── -->
<section id="proo">
  <div class="slide-num">04 / PROOF OF CONCEPT</div>
  <h2>We replayed Wirecard. We caught it 1,395 days early.</h2>
  <div class="grid-2">
    <div>
      <p>Our synthetic fraud replay feeds 5 years of Wirecard-analog signals through all 11 agents simultaneously.
      The swarm raises its first CRITICAL alert at simulated day ~500 — nearly <strong style="color:var(--accent)">4 years</strong>
      before KPMG refused to sign off the 2019 accounts.</p>
      <div class="card" style="margin-top:1.5rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;text-align:center">
          <div>
            <div class="big accent">~500</div>
            <div class="stat-lbl">SWARM DETECTION DAY</div>
          </div>
          <div>
            <div class="big" style="color:var(--danger)">1895</div>
            <div class="stat-lbl">REAL DISCOVERY DAY</div>
          </div>
        </div>
        <div style="margin-top:1rem;text-align:center;color:var(--accent);font-size:1.1rem;font-weight:bold">
          1,395 days ahead of the market
        </div>
      </div>
    </div>
    <div>
      <div class="card">
        <h3>Detection sequence</h3>
        <div style="margin-top:.8rem">
          <div style="margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid var(--border)">
            <div style="font-size:.7rem;color:var(--muted)">DAY ~180</div>
            <div style="color:var(--warn);font-size:.85rem">⚠ NAV_DETECTOR raises WARNING (score 25)</div>
          </div>
          <div style="margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid var(--border)">
            <div style="font-size:.7rem;color:var(--muted)">DAY ~500</div>
            <div style="color:var(--danger);font-size:.85rem">🔴 Multi-vector CRITICAL — 3 bots confirm</div>
          </div>
          <div style="margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid var(--border)">
            <div style="font-size:.7rem;color:var(--muted)">DAY ~730</div>
            <div style="color:var(--danger);font-size:.85rem">🔴 PBFT consensus — quorum of 7 reached</div>
          </div>
          <div>
            <div style="font-size:.7rem;color:var(--muted)">DAY 1895 (REAL WORLD)</div>
            <div style="color:var(--muted);font-size:.85rem">KPMG refuses to sign. €1.9B declared missing.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── Slide 6: Market ── -->
<section id="market">
  <div class="slide-num">05 / MARKET OPPORTUNITY</div>
  <h2>RegTech is a $120B market. Luxembourg is the perfect beachhead.</h2>
  <div class="grid-3">
    <div class="card" style="text-align:center">
      <div class="big accent">€5.3T</div>
      <div class="stat-lbl">LUXEMBOURG AuM UNDER MANAGEMENT</div>
      <p style="font-size:.8rem;margin-top:.8rem">World's 2nd largest fund domicile.
      Every major asset manager has a Luxembourg entity.</p>
    </div>
    <div class="card" style="text-align:center">
      <div class="big accent">$120B</div>
      <div class="stat-lbl">GLOBAL REGTECH TAM (2026)</div>
      <p style="font-size:.8rem;margin-top:.8rem">Growing at 23% CAGR.
      DORA enforcement (Jan 2025) created immediate demand.</p>
    </div>
    <div class="card" style="text-align:center">
      <div class="big accent">$2.1B</div>
      <div class="stat-lbl">EU REGULATORY FINES 2020–24</div>
      <p style="font-size:.8rem;margin-top:.8rem">Each fine represents a
      fund manager who needed Genesis Swarm.</p>
    </div>
  </div>
  <div class="grid-2" style="margin-top:1.5rem">
    <div class="card">
      <h3>Why now</h3>
      <p style="font-size:.85rem">DORA (EU 2022/2554) came into full enforcement January 2025.
      Every CSSF-regulated entity must demonstrate operational resilience, ICT risk management,
      and tamper-evident audit trails. Genesis Swarm was built for exactly this.</p>
    </div>
    <div class="card">
      <h3>Competitive moat</h3>
      <p style="font-size:.85rem">Existing RegTech tools (Nasdaq Surveillance,
      NICE Actimize, ComplyAdvantage) are rules-based, siloed, and expensive.
      None run Byzantine fault-tolerant consensus across 11 live data sources
      with an AI analysis layer. This architecture is 2–3 years ahead.</p>
    </div>
  </div>
</section>

<!-- ── Slide 7: Business Model ── -->
<section id="business">
  <div class="slide-num">06 / BUSINESS MODEL</div>
  <h2>SaaS — simple pricing, high switching cost</h2>
  <div class="grid-3">
    <div class="card">
      <h3>Starter</h3>
      <div class="big accent" style="font-size:2rem;margin:.5rem 0">€2,500<span style="font-size:1rem;color:var(--muted)">/mo</span></div>
      <ul style="color:var(--muted);font-size:.85rem;list-style:none;line-height:2">
        <li>✓ 5 detection agents</li>
        <li>✓ PBFT consensus</li>
        <li>✓ PDF compliance reports</li>
        <li>✓ Email + Slack alerts</li>
        <li>✓ Single tenant</li>
      </ul>
      <p style="font-size:.75rem;margin-top:1rem;color:var(--muted)">Target: boutique fund managers (&lt;€500M AuM)</p>
    </div>
    <div class="card" style="border-color:var(--accent)">
      <h3 style="color:var(--accent)">Professional ⭐</h3>
      <div class="big accent" style="font-size:2rem;margin:.5rem 0">€8,500<span style="font-size:1rem;color:var(--muted)">/mo</span></div>
      <ul style="color:var(--muted);font-size:.85rem;list-style:none;line-height:2">
        <li>✓ All 11 agents</li>
        <li>✓ gRPC distributed PBFT</li>
        <li>✓ On-chain Merkle anchor</li>
        <li>✓ SHAP explainability</li>
        <li>✓ Multi-tenant isolation</li>
        <li>✓ CSSF 18/698 mapping</li>
        <li>✓ Claude AI JARVIS</li>
      </ul>
      <p style="font-size:.75rem;margin-top:1rem;color:var(--muted)">Target: mid-size fund admins (€500M–€5B AuM)</p>
    </div>
    <div class="card">
      <h3>Enterprise</h3>
      <div class="big accent" style="font-size:2rem;margin:.5rem 0">Custom</div>
      <ul style="color:var(--muted);font-size:.85rem;list-style:none;line-height:2">
        <li>✓ White-label deployment</li>
        <li>✓ On-premise / private cloud</li>
        <li>✓ Custom agent development</li>
        <li>✓ DORA evidence package</li>
        <li>✓ Dedicated support SLA</li>
        <li>✓ External audit support</li>
      </ul>
      <p style="font-size:.75rem;margin-top:1rem;color:var(--muted)">Target: large fund admins, depositaries, custodians</p>
    </div>
  </div>
  <div class="card" style="margin-top:1.5rem;text-align:center">
    <span style="color:var(--muted);font-size:.85rem">Unit economics: </span>
    <strong style="color:var(--text)">CAC est. €3,000–8,000</strong>
    <span style="color:var(--muted);font-size:.85rem"> (direct outreach + CSSF event circuit) · </span>
    <strong style="color:var(--text)">LTV est. €180,000–306,000</strong>
    <span style="color:var(--muted);font-size:.85rem"> (3-year average contract, high switching cost once DORA evidence trail established)</span>
  </div>
</section>

<!-- ── Slide 8: Traction ── -->
<section id="traction">
  <div class="slide-num">07 / TRACTION</div>
  <h2>Technical proof of concept complete. Ready for first paying customer.</h2>
  <div class="grid-2">
    <div>
      <div class="timeline">
        <div class="tl-item">
          <div class="tl-date">JAN {year}</div>
          <div class="tl-title">Prototype — single NAV detector bot</div>
          <div class="tl-desc">Basic threshold detection, SQLite cases</div>
        </div>
        <div class="tl-item">
          <div class="tl-date">MAR {year}</div>
          <div class="tl-title">v0.3 — live data feeds + 11 agents</div>
          <div class="tl-desc">OFAC, ECB, AISStream, Celestrak integrated</div>
        </div>
        <div class="tl-item">
          <div class="tl-date">MAY {year}</div>
          <div class="tl-title accent">v0.4.1 — production-grade architecture</div>
          <div class="tl-desc">PBFT gRPC, SHAP, on-chain anchoring, i18n, a11y —
          30+ engineering improvements shipped in one sprint</div>
        </div>
        <div class="tl-item">
          <div class="tl-date">Q3 {year}</div>
          <div class="tl-title" style="color:var(--accent2)">Target: first paying pilot</div>
          <div class="tl-desc">1 Luxembourg fund admin, 3-month proof of value</div>
        </div>
        <div class="tl-item">
          <div class="tl-date">Q1 {int(year)+1}</div>
          <div class="tl-title" style="color:var(--accent2)">Target: 5 paying customers, €40k MRR</div>
          <div class="tl-desc">Series A readiness</div>
        </div>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:1rem">
        <h3>Technical milestones achieved</h3>
        <ul style="list-style:none;line-height:2;font-size:.85rem;color:var(--muted)">
          <li><span class="accent">✓</span> Full PBFT consensus over gRPC (independent processes)</li>
          <li><span class="accent">✓</span> Live OFAC screening — 15,000+ SDN entries, daily refresh</li>
          <li><span class="accent">✓</span> Ethereum on-chain Merkle anchoring</li>
          <li><span class="accent">✓</span> CSSF Circular 18/698 paragraph-level control mapping</li>
          <li><span class="accent">✓</span> 62 automated tests incl. chaos + property-based fuzzing</li>
          <li><span class="accent">✓</span> Wirecard replay: 1,395 days early detection proof</li>
          <li><span class="accent">✓</span> Multi-tenant isolation, RBAC JWT, refresh tokens</li>
          <li><span class="accent">✓</span> EN/FR i18n — Luxembourg bilingual market ready</li>
        </ul>
      </div>
      <div class="card">
        <h3>What seed funding unlocks</h3>
        <ul style="list-style:none;line-height:2;font-size:.85rem;color:var(--muted)">
          <li>→ TIBER-EU external penetration test (required for enterprise sales)</li>
          <li>→ Bloomberg Terminal live NAV feed integration</li>
          <li>→ CSSF regulatory pilot programme application</li>
          <li>→ First 2 BD hires (Luxembourg market specialist)</li>
          <li>→ Redis + NATS horizontal scaling (multi-fund deployment)</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- ── Slide 9: Team ── -->
<section id="team">
  <div class="slide-num">08 / TEAM</div>
  <h2>Builder-led. Deeply technical. Luxembourg-focused.</h2>
  <div class="grid-2">
    <div class="card">
      <h3>Daman Sharma — Founder & CEO</h3>
      <p style="font-size:.85rem;margin-top:.5rem">
        Built Genesis Swarm from zero to a production-grade, distributed AI compliance platform
        with 4,000+ lines of auditable code, CI/CD, chaos tests, and a live deployed demo — solo.
      </p>
      <p style="font-size:.85rem;margin-top:.6rem">
        Deep expertise in distributed systems (PBFT, gRPC), machine learning (IsolationForest,
        SHAP, online learning), and regulatory technology (CSSF, DORA, AIFMD).
      </p>
      <div style="margin-top:1rem;display:flex;gap:1rem">
        <a href="mailto:daman.sharma.2310@gmail.com" style="color:var(--accent);font-size:.8rem;text-decoration:none">
          ✉ daman.sharma.2310@gmail.com
        </a>
        <a href="https://github.com/Daman-2310" target="_blank" style="color:var(--accent2);font-size:.8rem;text-decoration:none">
          ⌥ GitHub ↗
        </a>
      </div>
    </div>
    <div class="card">
      <h3>What we're looking for in co-founders</h3>
      <ul style="list-style:none;line-height:2;font-size:.85rem;color:var(--muted);margin-top:.5rem">
        <li>→ <strong style="color:var(--text)">RegTech Sales</strong> — Luxembourg fund market
        relationships (ALFI members, CSSF contacts, Big 4 audit partners)</li>
        <li>→ <strong style="color:var(--text)">Compliance Domain Expert</strong> — former CSSF
        officer, fund auditor, or AIFM compliance director</li>
        <li>→ <strong style="color:var(--text)">Backend Infrastructure</strong> — distributed
        systems, Kubernetes, NATS/Kafka for horizontal scaling</li>
      </ul>
      <p style="font-size:.8rem;color:var(--muted);margin-top:1rem">
        Investors with relevant network are valued equally to capital.
      </p>
    </div>
  </div>
</section>

<!-- ── Slide 10: The Ask ── -->
<section id="ask">
  <div class="slide-num">09 / THE ASK</div>
  <h2>€150,000 pre-seed. 18 months of runway to first revenue.</h2>
  <div class="grid-2">
    <div>
      <div class="card" style="margin-bottom:1.2rem">
        <h3>Use of funds</h3>
        <div style="margin-top:.8rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <span style="color:var(--muted);font-size:.85rem">External security audit (TIBER-EU)</span>
            <span style="color:var(--text);font-weight:bold">€25,000</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <span style="color:var(--muted);font-size:.85rem">Bloomberg data license (12 months)</span>
            <span style="color:var(--text);font-weight:bold">€30,000</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <span style="color:var(--muted);font-size:.85rem">BD hire — Luxembourg market</span>
            <span style="color:var(--text);font-weight:bold">€60,000</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <span style="color:var(--muted);font-size:.85rem">Infrastructure (Railway → dedicated)</span>
            <span style="color:var(--text);font-weight:bold">€15,000</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding-top:.6rem;border-top:1px solid var(--border)">
            <span style="color:var(--text);font-weight:bold">TOTAL</span>
            <span style="color:var(--accent);font-weight:bold;font-size:1.2rem">€130,000</span>
          </div>
          <p style="font-size:.75rem;color:var(--muted);margin-top:.5rem">
            Remaining €20,000 reserved for ALFI conference circuit + legal (IP, incorporation).
          </p>
        </div>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:1.2rem">
        <h3>18-month milestones</h3>
        <ul style="list-style:none;line-height:2.2;font-size:.85rem;color:var(--muted)">
          <li><span class="accent">M3</span> — First paying pilot (€2,500/mo)</li>
          <li><span class="accent">M6</span> — TIBER-EU audit complete, enterprise-ready</li>
          <li><span class="accent">M9</span> — 3 paying customers, €25k MRR</li>
          <li><span class="accent">M12</span> — Bloomberg integration live, 5 customers</li>
          <li><span class="accent">M18</span> — €40k+ MRR, Series A raise</li>
        </ul>
      </div>
      <div class="card" style="text-align:center">
        <h3>Ready to talk</h3>
        <p style="font-size:.85rem;margin:.8rem 0">
          Full codebase, CSSF compliance mapping, and investor brief available immediately.
          No NDAs required for the technical review.
        </p>
        <a class="cta" href="mailto:daman.sharma.2310@gmail.com?subject=Genesis Swarm — Investment Inquiry"
           style="display:inline-block;margin-top:.5rem">
          Schedule a Call ↗
        </a>
      </div>
    </div>
  </div>
</section>

<footer>
  <p>Genesis Swarm v0.4.1 · Luxembourg, {year}</p>
  <p style="margin-top:.5rem">
    <a href="https://genesis-swarm-terminal.vercel.app" target="_blank">Live Demo</a> ·
    <a href="https://github.com/Daman-2310/genesis-swarm" target="_blank">GitHub</a> ·
    <a href="/api/v1/report/pd">Download Compliance PDF</a> ·
    <a href="mailto:daman.sharma.2310@gmail.com">daman.sharma.2310@gmail.com</a>
  </p>
  <p style="margin-top:.8rem;color:#374151;font-size:.7rem">
    This deck contains forward-looking projections. Past prototype performance is not indicative of future results.
  </p>
</footer>

</body>
</html>""".replace("{year}", year)
