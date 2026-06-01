// One-shot Bitcoin anchor for the Watch List.
//
// Computes the canonical SHA-256 hash and submits it to OpenTimestamps via the
// public calendar. Returns the receipt and caches it in KV so subsequent calls
// are idempotent.

import { kv } from '@/lib/kv'
import { computeWatchListHash, WATCHLIST_PUBLICATION_DATE } from '@/lib/watchlist'
import { submitToCalendar, verificationUrl } from '@/lib/opentimestamps'

export const runtime = 'nodejs'   // OTS submit needs node fetch with binary body
export const maxDuration = 30

interface AnchorState {
  hash: string
  receipt: string
  calendar: string
  submitted_at: string
  publication_date: string
  verification_url: string
}

export async function GET() {
  const hash = await computeWatchListHash()
  const existing = await kv.get<AnchorState>(`watchlist:anchor:current`)
  if (existing && existing.hash === hash) {
    return Response.json({ ok: true, cached: true, ...existing })
  }
  const submission = await submitToCalendar(hash)
  if (!submission) {
    return Response.json({
      ok: false,
      hash,
      message: 'All OpenTimestamps calendars unreachable. Try again in a few seconds.',
      verification_url: verificationUrl(hash),
    }, { status: 503 })
  }
  const state: AnchorState = {
    hash,
    receipt: submission.receipt,
    calendar: submission.calendar,
    submitted_at: submission.submitted_at,
    publication_date: WATCHLIST_PUBLICATION_DATE,
    verification_url: verificationUrl(hash),
  }
  await kv.set('watchlist:anchor:current', state, { ex: 60 * 60 * 24 * 365 * 5 })
  return Response.json({ ok: true, cached: false, ...state })
}
