// Mirror ingestion endpoint — admin/service only.
//
// POST /api/mirror/ingest
//   body: { url, entity_name, prophecy_id?, jurisdiction?, category?, doc_type?, auth }
//
// Fetches the PDF, extracts claims via Groq, and persists document + claims to
// Supabase. Requires either an authenticated admin session OR the INGEST_AUTH
// secret (so it can be triggered from a script / cron without a browser).

import { ingestDocument } from '@/lib/prospectus-ingest'
import { createServiceClient, isSupabaseAdminConfigured } from '@/lib/supabase'
import { withApiGuard } from '@/lib/api-guard'

export const runtime = 'nodejs'
export const maxDuration = 60

// Bearer-gated (scope 'ingest') + PII-scrubbed + audited via withApiGuard.
export const POST = withApiGuard(async (_req, { body: rawBody }) => {
  const body = (rawBody ?? {}) as {
    url?: string
    entity_name?: string
    prophecy_id?: string
    jurisdiction?: string
    category?: string
    doc_type?: string
  }

  if (!body.url || !body.entity_name) {
    return Response.json({ error: 'missing_fields', detail: 'url and entity_name required' }, { status: 400 })
  }

  // 1. Ingest (fetch + parse + extract)
  const result = await ingestDocument(body.url, body.category)

  if (!isSupabaseAdminConfigured()) {
    // No DB configured — return the extraction result without persisting
    return Response.json({
      ...result,
      persisted: false,
      note: 'Supabase service role not configured; extraction returned but not stored.',
    }, { status: result.ok ? 200 : 502 })
  }

  if (!result.ok) {
    return Response.json({ ...result, persisted: false }, { status: 502 })
  }

  // 2. Persist document + claims
  const sb = createServiceClient()
  const docType = body.doc_type ?? 'prospectus'

  const { data: doc, error: docErr } = await sb
    .from('prospectus_documents')
    .upsert({
      prophecy_id: body.prophecy_id ?? null,
      entity_name: body.entity_name,
      jurisdiction: body.jurisdiction ?? null,
      category: body.category ?? null,
      source_url: body.url,
      doc_type: docType,
      sha256: result.sha256,
      page_count: result.page_count,
      char_count: result.char_count,
      status: result.claims.length > 0 ? 'extracted' : 'parsed',
    }, { onConflict: 'source_url' })
    .select()
    .single()

  if (docErr || !doc) {
    return Response.json({ error: 'db_document_error', detail: docErr?.message, extraction: result }, { status: 500 })
  }

  // Replace existing claims for this document
  await sb.from('prospectus_claims').delete().eq('document_id', doc.id)

  if (result.claims.length > 0) {
    const rows = result.claims.map(c => ({
      document_id: doc.id,
      prophecy_id: body.prophecy_id ?? null,
      metric: c.metric,
      label: c.label,
      promised: c.promised,
      unit: c.unit,
      direction: c.direction,
      quote: c.quote,
      page_ref: c.page_ref,
      confidence: c.confidence,
    }))
    const { error: claimErr } = await sb.from('prospectus_claims').insert(rows)
    if (claimErr) {
      return Response.json({ error: 'db_claims_error', detail: claimErr.message, document_id: doc.id }, { status: 500 })
    }
  }

  return Response.json({
    ok: true,
    persisted: true,
    document_id: doc.id,
    entity_name: body.entity_name,
    source_url: body.url,
    page_count: result.page_count,
    char_count: result.char_count,
    claims_extracted: result.claims.length,
    claims: result.claims,
  })
}, { scope: 'ingest', rateLimit: 30, scrubBody: true })
