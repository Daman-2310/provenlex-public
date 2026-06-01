// Streams a zip of the chrome-extension/ directory to the user.
// Pure Uint8Array + DataView - no Buffer type to avoid Node 22 TS strictness.
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

function crc32(buf: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & (-(crc & 1)))
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function writeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = utf8(f.name)
    const crc = crc32(f.data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, f.data.length, true)
    lv.setUint32(22, f.data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    const localFull = new Uint8Array(local.length + f.data.length)
    localFull.set(local, 0)
    localFull.set(f.data, local.length)
    localParts.push(localFull)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, f.data.length, true)
    cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centralParts.push(central)
    offset += local.length + f.data.length
  }

  const concat = (parts: Uint8Array[]): Uint8Array => {
    let total = 0
    for (const p of parts) total += p.length
    const out = new Uint8Array(total)
    let pos = 0
    for (const p of parts) { out.set(p, pos); pos += p.length }
    return out
  }

  const localBlob = concat(localParts)
  const centralBlob = concat(centralParts)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralBlob.length, true)
  ev.setUint32(16, localBlob.length, true)
  ev.setUint16(20, 0, true)
  return concat([localBlob, centralBlob, end])
}

export async function GET() {
  try {
    const dir = path.join(process.cwd(), 'public', 'chrome-extension')
    const fileNames = await fs.readdir(dir)
    const files: { name: string; data: Uint8Array }[] = []
    for (const name of fileNames) {
      const data = await fs.readFile(path.join(dir, name))
      files.push({ name, data: new Uint8Array(data) })
    }
    const zip = writeZip(files)
    return new Response(zip as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="genesis-swarm-extension-v0.1.zip"',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    return Response.json({ error: 'zip_failed', detail: String(e) }, { status: 500 })
  }
}
