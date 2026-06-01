import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'
import { type BookEntry } from '@/lib/book'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import { getVindicationForEntry } from '@/lib/vindicate'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')?.trim()
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })
  let e = await kv.get<BookEntry>(`book:entry:${id}`)
  if (!e) {
    e = BOOK_SNAPSHOT_ENTRIES.find(x => x.prophecy_id === id) ?? null
  }
  if (!e) return Response.json({ error: 'not found' }, { status: 404 })
  const vindication = await getVindicationForEntry(id)
  return Response.json({ entry: e, vindication })
}
