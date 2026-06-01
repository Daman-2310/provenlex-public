// Edge-runtime compatible SHA-256 + Merkle root via Web Crypto API.
// No node:crypto, no Buffer — works in both edge and node runtimes.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function merkleRoot(parts: string[]): Promise<string> {
  if (parts.length === 0) return await sha256Hex('')
  let layer = await Promise.all(parts.map(sha256Hex))
  while (layer.length > 1) {
    const next: string[] = []
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]
      const right = layer[i + 1] ?? layer[i]
      next.push(await sha256Hex(left + right))
    }
    layer = next
  }
  return layer[0]
}

export async function genesisSignature(payload: unknown, salt = ''): Promise<string> {
  const stable = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return await sha256Hex(stable + '::' + salt + '::' + Date.now().toString())
}

// Short displayable id derived from a hash — 12 hex chars
export function shortId(hex: string): string {
  return hex.slice(0, 12)
}
