import { listPredictions } from '@/lib/predictions'

export const runtime = 'edge'

export async function GET() {
  const predictions = listPredictions()
  const now = Date.now()
  const computed = predictions.map(p => {
    const sealedMs = new Date(p.sealed_at).getTime()
    const revealMs = new Date(p.reveal_window_end).getTime()
    const elapsedDays = Math.max(0, Math.floor((now - sealedMs) / 86400_000))
    const remainingDays = Math.max(0, Math.floor((revealMs - now) / 86400_000))
    return { ...p, elapsed_days: elapsedDays, remaining_days: remainingDays }
  })
  return Response.json({
    count: computed.length,
    issued_at: predictions[0]?.sealed_at,
    book_merkle_root: predictions[0]?.book_merkle_root,
    bitcoin_anchor_status: predictions[0]?.bitcoin_anchor_status,
    predictions: computed,
  })
}
