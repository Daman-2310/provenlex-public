const API_BASE = 'https://genesis-swarm-rgq5.vercel.app'

const qInput = document.getElementById('q')
const goBtn = document.getElementById('go')
const result = document.getElementById('result')

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
}

async function screen() {
  const q = qInput.value.trim()
  if (!q) return
  goBtn.disabled = true
  result.innerHTML = '<div class="spinner"></div>'
  try {
    const r = await fetch(`${API_BASE}/api/real/sanctions?q=${encodeURIComponent(q)}&limit=5`)
    const d = await r.json()
    const hits = (d.results || []).filter(x => x.score >= 60)
    if (hits.length === 0) {
      result.innerHTML = `
        <div class="pass">✓ Clean pass — no OFAC matches</div>
        <div class="meta">${d.indexed?.toLocaleString() ?? '—'} entities checked</div>
      `
    } else {
      result.innerHTML = `
        ${hits.slice(0, 4).map(h => `
          <div class="hit">
            <span class="score">${h.score}</span>
            <span class="hit-name">${escapeHtml(h.name)}</span>
            <div class="hit-program">${escapeHtml(h.program || h.type || '')}</div>
          </div>
        `).join('')}
        <div class="meta">${hits.length} ${hits.length === 1 ? 'match' : 'matches'} · US Treasury OFAC SDN</div>
      `
    }
  } catch (e) {
    result.innerHTML = `<div class="pass" style="background:rgba(255,170,0,.06);border-color:rgba(255,170,0,.3);color:#ffaa00">Error: ${escapeHtml(String(e))}</div>`
  } finally {
    goBtn.disabled = false
  }
}

goBtn.addEventListener('click', screen)
qInput.addEventListener('keydown', e => { if (e.key === 'Enter') screen() })

// Pre-fill with active tab's title if it looks like a company name
chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
  const t = tabs[0]?.title
  if (t && t.length < 80 && !/[<>{}]/.test(t)) {
    qInput.value = t.split(/[-|·•]/)[0].trim()
  }
})
