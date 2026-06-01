// OpenTimestamps client — anchors a SHA-256 hash on Bitcoin's blockchain
// via free public calendar servers. No BTC needed; calendar bundles many
// requests into one Bitcoin tx every ~1 hour.
// Verification: https://opentimestamps.org · https://btc.calendar.opentimestamps.org

const CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://alice.btc.calendar.opentimestamps.org',
]

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export interface OtsReceipt {
  receipt: string         // base64 of binary proof
  calendar: string        // calendar URL that issued the receipt
  submitted_at: string    // ISO timestamp
  hash: string            // the hash we submitted (hex)
}

export async function submitToCalendar(hashHex: string): Promise<OtsReceipt | null> {
  if (hashHex.length !== 64) throw new Error('hash must be 32 bytes / 64 hex chars')
  const bytes = hexToBytes(hashHex)

  for (const calendar of CALENDARS) {
    try {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 8_000)
      const res = await fetch(`${calendar}/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
        signal: ctrl.signal,
      })
      clearTimeout(timeout)
      if (!res.ok) continue
      const proof = new Uint8Array(await res.arrayBuffer())
      if (proof.length < 16) continue
      return {
        receipt: bytesToBase64(proof),
        calendar,
        submitted_at: new Date().toISOString(),
        hash: hashHex,
      }
    } catch { /* try next calendar */ }
  }
  return null
}

// Constructs a verification URL that anyone can use to check the OTS receipt
// (downloads the .ots file and verifies against the original hash).
export function verificationUrl(hashHex: string): string {
  return `https://btc.calendar.opentimestamps.org/timestamp/${hashHex}`
}
