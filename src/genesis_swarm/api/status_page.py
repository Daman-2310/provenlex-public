"""
Live status page — /status

Public HTML page showing:
  - Current uptime and swarm health
  - Recent incidents (last 5 CRITICAL/EMERGENCY alerts)
  - PBFT consensus round latency
  - Bot health indicators
  - Live update via meta refresh every 30s

No authentication required — status pages are public by convention.
"""

from __future__ import annotations

import time
from typing import Any


def render_status_page(swarm_state: dict[str, Any]) -> str:
    commander = swarm_state.get("commander")
    started_at = swarm_state.get("started_at", time.time())
    uptime_s = int(time.time() - started_at)
    uptime_str = f"{uptime_s // 3600}h {(uptime_s % 3600) // 60}m {uptime_s % 60}s"

    total_bots = 0
    healthy = 0
    top_score = 0.0
    mode_label = "STARTING"
    recent_alerts: list[dict] = []

    if commander:
        try:
            s = commander.get_summary()
            total_bots = s.total_bots
            healthy = s.healthy_bots
            top_score = s.top_score
            mode_data = commander.get_swarm_mode()
            mode_label = mode_data.get("mode", "UNKNOWN")
            recent_alerts = [
                a
                for a in commander.get_recent_alerts(20)
                if a.get("severity") in ("CRITICAL", "EMERGENCY")
            ][:5]
        except Exception:
            pass

    health_pct = round(healthy / total_bots * 100) if total_bots else 0
    overall = "operational" if health_pct >= 90 else "degraded" if health_pct >= 50 else "outage"
    status_color = {"operational": "#00C851", "degraded": "#FF8800", "outage": "#FF3333"}[overall]
    status_label = {
        "operational": "All Systems Operational",
        "degraded": "Partial Degradation",
        "outage": "Major Outage",
    }[overall]

    latencies = list(swarm_state.get("consensus_latency_ms", []))
    latencies_sorted = sorted(v.get("value", 0) if isinstance(v, dict) else v for v in latencies)

    def _pct(data, p):
        if not data:
            return "—"
        idx = max(0, int(len(data) * p / 100) - 1)
        return f"{data[idx]:.0f}ms"

    incident_rows = ""
    for a in recent_alerts:
        ts = a.get("timestamp", "")[:19] if a.get("timestamp") else "?"
        sev = a.get("severity", "?")
        bot = a.get("bot_type", "?")
        summary = str(a.get("summary", ""))[:80]
        color = "#FF3333" if sev == "EMERGENCY" else "#FF8800"
        incident_rows += f"""
        <tr>
          <td>{ts}</td>
          <td style="color:{color};font-weight:bold">{sev}</td>
          <td>{bot}</td>
          <td>{summary}</td>
        </tr>"""

    if not incident_rows:
        incident_rows = (
            '<tr><td colspan="4" style="color:#888;text-align:center">No recent incidents</td></tr>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>Genesis Swarm — Status</title>
  <style>
    :root {{ --bg:#0d0d1a; --surface:#16213e; --accent:#00C851; --text:#e0e0e0; --muted:#888; }}
    * {{ box-sizing:border-box; margin:0; padding:0; }}
    body {{ background:var(--bg); color:var(--text); font-family:monospace; padding:2rem; }}
    h1 {{ color:var(--accent); font-size:1.6rem; margin-bottom:.4rem; }}
    .subtitle {{ color:var(--muted); font-size:.85rem; margin-bottom:2rem; }}
    .badge {{ display:inline-block; padding:.35rem .9rem; border-radius:20px;
              font-weight:bold; font-size:1rem; margin-bottom:1.5rem; }}
    .card {{ background:var(--surface); border:1px solid #1e3a5f; border-radius:8px;
             padding:1.2rem; margin-bottom:1.2rem; }}
    .card h2 {{ color:var(--accent); font-size:.95rem; margin-bottom:.8rem; text-transform:uppercase; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:.8rem; }}
    .metric {{ background:#0d0d1a; border-radius:6px; padding:.7rem; text-align:center; }}
    .metric .val {{ font-size:1.4rem; font-weight:bold; color:var(--accent); }}
    .metric .lbl {{ font-size:.7rem; color:var(--muted); margin-top:.2rem; }}
    table {{ width:100%; border-collapse:collapse; font-size:.8rem; }}
    th {{ text-align:left; color:var(--muted); padding:.4rem; border-bottom:1px solid #1e3a5f; }}
    td {{ padding:.4rem; border-bottom:1px solid #111; }}
    footer {{ margin-top:2rem; color:var(--muted); font-size:.75rem; text-align:center; }}
    a {{ color:var(--accent); }}
  </style>
</head>
<body>

<h1>⬡ GENESIS SWARM STATUS</h1>
<p class="subtitle">Auto-refreshes every 30 seconds · <a href="/api/health/slo">SLO JSON</a> · <a href="/metrics">Prometheus</a></p>

<div class="badge" style="background:{status_color}22; color:{status_color}; border:1px solid {status_color}44;">
  ● {status_label}
</div>

<div class="card">
  <h2>System Overview</h2>
  <div class="metrics">
    <div class="metric"><div class="val">{uptime_str}</div><div class="lbl">UPTIME</div></div>
    <div class="metric"><div class="val">{healthy}/{total_bots}</div><div class="lbl">BOTS HEALTHY</div></div>
    <div class="metric"><div class="val">{health_pct}%</div><div class="lbl">HEALTH SCORE</div></div>
    <div class="metric"><div class="val">{round(top_score, 1)}</div><div class="lbl">TOP THREAT SCORE</div></div>
    <div class="metric"><div class="val">{mode_label}</div><div class="lbl">SWARM MODE</div></div>
  </div>
</div>

<div class="card">
  <h2>PBFT Consensus Latency</h2>
  <div class="metrics">
    <div class="metric"><div class="val">{_pct(latencies_sorted, 50)}</div><div class="lbl">P50</div></div>
    <div class="metric"><div class="val">{_pct(latencies_sorted, 95)}</div><div class="lbl">P95</div></div>
    <div class="metric"><div class="val">{_pct(latencies_sorted, 99)}</div><div class="lbl">P99</div></div>
    <div class="metric"><div class="val">{len(latencies_sorted)}</div><div class="lbl">SAMPLES</div></div>
  </div>
</div>

<div class="card">
  <h2>Recent Incidents (CRITICAL / EMERGENCY)</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Severity</th><th>Bot</th><th>Summary</th></tr></thead>
    <tbody>{incident_rows}</tbody>
  </table>
</div>

<footer>
  Genesis Swarm v0.5.0 · <a href="https://github.com/Daman-2310/genesis-swarm">GitHub</a> ·
  <a href="https://genesis-swarm-terminal.vercel.app">Live Demo</a> ·
  Last updated: {time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())}
</footer>
</body>
</html>"""
