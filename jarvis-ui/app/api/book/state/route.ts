import { kv } from '@/lib/kv'
import { type BookEntry, type BookManifest } from '@/lib/book'
import { BOOK_SNAPSHOT_MANIFEST, BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import { decorateWithVindications } from '@/lib/vindicate'

export const runtime = 'nodejs'  // need nodejs for KV scan & decorate loop

export async function GET() {
  // Try KV first (live data) → fall back to static snapshot bundled with deploy
  let manifest = await kv.get<BookManifest>('book:manifest:current')
  let entries = await kv.get<BookEntry[]>('book:entries:current')
  let source: 'kv' | 'snapshot' = 'kv'

  if (!manifest || !entries) {
    if (BOOK_SNAPSHOT_MANIFEST && BOOK_SNAPSHOT_ENTRIES.length > 0) {
      manifest = BOOK_SNAPSHOT_MANIFEST
      entries = BOOK_SNAPSHOT_ENTRIES
      source = 'snapshot'
    }
  }

  if (!manifest || !entries) {
    return Response.json({
      sealed: false,
      message: 'The Book has not yet been sealed.',
    })
  }

  // Decorate with vindication state from KV (no-op when KV is empty)
  const decorated = await decorateWithVindications(entries)
  const vindicationCount = decorated.filter(e => e.vindication).length

  return Response.json({
    sealed: true,
    source,
    manifest: {
      version: manifest.version,
      sealed_at: manifest.sealed_at,
      reveal_at: manifest.reveal_at,
      total_prophecies: manifest.total_prophecies,
      vindications: vindicationCount,
      misses: manifest.misses,
      pending: manifest.total_prophecies - vindicationCount - manifest.misses,
      merkle_root: manifest.merkle_root,
      ots_calendar: manifest.ots_calendar,
      ots_submitted_at: manifest.ots_submitted_at,
      ots_status: manifest.ots_status,
      has_receipt: !!manifest.ots_receipt,
    },
    entries: decorated,
  })
}
