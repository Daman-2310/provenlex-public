import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface IndexEntry {
  id: string
  subject: string
  sealed_at: string
  pre_crime_index: number
  pattern?: string
}

export async function GET() {
  const recent = await kv.lrange<IndexEntry>('prophecy:index', 0, 49)
  return Response.json({
    count: recent.length,
    prophecies: recent,
  })
}
