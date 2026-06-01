// Reads real ingested prospectus claims from Supabase (when configured).
//
// Mirror uses this to overlay REAL extracted claims on top of (or in place of)
// the synthetic model. If Supabase isn't configured or the entity has no
// ingested document, callers fall back to the synthetic buildMirror().

import { createServiceClient, isSupabaseAdminConfigured } from '@/lib/supabase'

export interface RealClaim {
  metric: string
  label: string
  promised: number | null
  observed: number | null
  unit: string | null
  direction: 'min' | 'max' | null
  quote: string
  confidence: number
}

export interface RealMirror {
  prophecy_id: string
  entity_name: string
  source_url: string
  doc_type: string
  ingested_at: string
  page_count: number
  claims: RealClaim[]
}

export async function getRealMirror(prophecy_id: string): Promise<RealMirror | null> {
  if (!isSupabaseAdminConfigured()) return null
  try {
    const sb = createServiceClient()
    const { data: doc } = await sb
      .from('prospectus_documents')
      .select('id, entity_name, source_url, doc_type, ingested_at, page_count')
      .eq('prophecy_id', prophecy_id)
      .order('ingested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!doc) return null

    const { data: claims } = await sb
      .from('prospectus_claims')
      .select('metric, label, promised, observed, unit, direction, quote, confidence')
      .eq('document_id', doc.id)
      .order('confidence', { ascending: false })

    return {
      prophecy_id,
      entity_name: doc.entity_name,
      source_url: doc.source_url,
      doc_type: doc.doc_type,
      ingested_at: doc.ingested_at,
      page_count: doc.page_count ?? 0,
      claims: (claims ?? []) as RealClaim[],
    }
  } catch {
    return null
  }
}

// Has ANY entity been ingested? Used to show a "real data" badge count.
export async function countIngestedDocuments(): Promise<number> {
  if (!isSupabaseAdminConfigured()) return 0
  try {
    const sb = createServiceClient()
    const { count } = await sb
      .from('prospectus_documents')
      .select('*', { count: 'exact', head: true })
    return count ?? 0
  } catch {
    return 0
  }
}
