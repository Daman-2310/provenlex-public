// Genesis Swarm Chrome Extension — content script
// Right-click any selected text → "Screen with Genesis Swarm" → shows OFAC + AI screen result overlay
// Also injects an inline screen badge next to any text that matches known sanctioned entity prefixes

const API_BASE = 'https://genesis-swarm-rgq5.vercel.app'

let overlay = null

function createOverlay() {
  if (overlay) return overlay
  overlay = document.createElement('div')
  overlay.id = 'genesis-swarm-overlay'
  document.body.appendChild(overlay)
  return overlay
}

function showOverlay(html) {
  const el = createOverlay()
  el.innerHTML = html
  el.style.display = 'block'
}

function hideOverlay() {
  if (overlay) overlay.style.display = 'none'
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
}

async function screenEntity(query) {
  showOverlay(`
    <div class="gs-card gs-loading">
      <div class="gs-spinner"></div>
      <div class="gs-loading-text">Screening "${escapeHtml(query)}" against US Treasury OFAC SDN...</div>
    </div>
  `)
  try {
    const r = await fetch(`${API_BASE}/api/real/sanctions?q=${encodeURIComponent(query)}&limit=5`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    const hits = (d.results || []).filter(x => x.score >= 60)
    if (hits.length === 0) {
      showOverlay(`
        <div class="gs-card gs-pass">
          <button class="gs-close" id="gs-close">&times;</button>
          <div class="gs-header">
            <span class="gs-logo">⚡</span>
            <span>GENESIS SWARM</span>
          </div>
          <div class="gs-title">Clean pass</div>
          <div class="gs-subtitle">"${escapeHtml(query)}" — no OFAC matches.</div>
          <div class="gs-meta">Source: US Treasury OFAC SDN · ${d.indexed?.toLocaleString() ?? '—'} entities indexed</div>
          <a class="gs-cta" href="${API_BASE}" target="_blank">Open dashboard →</a>
        </div>
      `)
    } else {
      showOverlay(`
        <div class="gs-card gs-hit">
          <button class="gs-close" id="gs-close">&times;</button>
          <div class="gs-header">
            <span class="gs-logo">⚡</span>
            <span>GENESIS SWARM</span>
          </div>
          <div class="gs-title gs-title-red">${hits.length} sanctions ${hits.length === 1 ? 'match' : 'matches'}</div>
          <div class="gs-subtitle">"${escapeHtml(query)}" matched US Treasury OFAC SDN list:</div>
          <ul class="gs-hits">
            ${hits.slice(0, 4).map(h => `
              <li>
                <span class="gs-hit-score gs-score-${h.matchLevel.toLowerCase()}">${h.score}</span>
                <div>
                  <div class="gs-hit-name">${escapeHtml(h.name)}</div>
                  <div class="gs-hit-program">${escapeHtml(h.program || h.type || '')}</div>
                </div>
              </li>
            `).join('')}
          </ul>
          <a class="gs-cta gs-cta-red" href="${API_BASE}/audit" target="_blank">Generate 60-min audit pack →</a>
        </div>
      `)
    }
    document.getElementById('gs-close')?.addEventListener('click', hideOverlay)
  } catch (e) {
    showOverlay(`
      <div class="gs-card gs-error">
        <button class="gs-close" id="gs-close">&times;</button>
        <div class="gs-title">Genesis Swarm error</div>
        <div class="gs-subtitle">${escapeHtml(String(e))}</div>
      </div>
    `)
    document.getElementById('gs-close')?.addEventListener('click', hideOverlay)
  }
}

// Listen for messages from background (context menu trigger)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'gs-screen' && msg.text) {
    screenEntity(msg.text.trim())
  }
})

// Floating button on text selection (for any page)
let selectionBtn = null
document.addEventListener('mouseup', (e) => {
  const sel = window.getSelection()?.toString().trim()
  if (!sel || sel.length < 3 || sel.length > 80) {
    if (selectionBtn) { selectionBtn.remove(); selectionBtn = null }
    return
  }
  if (selectionBtn) selectionBtn.remove()
  selectionBtn = document.createElement('button')
  selectionBtn.id = 'gs-selection-btn'
  selectionBtn.textContent = '⚡ Screen with Genesis Swarm'
  selectionBtn.style.position = 'fixed'
  selectionBtn.style.left = e.clientX + 'px'
  selectionBtn.style.top = (e.clientY - 36) + 'px'
  selectionBtn.style.zIndex = '2147483647'
  selectionBtn.addEventListener('click', () => {
    screenEntity(sel)
    selectionBtn?.remove(); selectionBtn = null
  })
  document.body.appendChild(selectionBtn)
})

// Close on Escape
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideOverlay() })
