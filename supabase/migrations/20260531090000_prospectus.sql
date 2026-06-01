-- =============================================================================
-- GENESIS SWARM — PROSPECTUS INGESTION (Mirror v2 real-data layer)
-- supabase/migrations/20260531090000_prospectus.sql
--
-- Stores real fund-document ingestions + the structured claims extracted from
-- them. Mirror reads these when present and falls back to the synthetic model
-- when an entity has no ingested document yet.
-- =============================================================================

-- ── prospectus_documents (one row per ingested PDF) ─────────────────────────
create table if not exists public.prospectus_documents (
  id              uuid primary key default uuid_generate_v4(),
  prophecy_id     text,                                  -- links to a Book entity (nullable for ad-hoc)
  entity_name     text not null,
  jurisdiction    text,
  category        text,
  source_url      text not null,
  doc_type        text not null default 'prospectus' check (doc_type in ('prospectus','kiid','kid','annual_report','pillar3','sfcr','factsheet')),
  sha256          text,                                  -- hash of the raw PDF bytes
  page_count      smallint,
  char_count      integer,
  ingested_at     timestamptz not null default now(),
  status          text not null default 'parsed' check (status in ('fetched','parsed','extracted','failed')),
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists prospectus_docs_prophecy_idx on public.prospectus_documents(prophecy_id);
create index if not exists prospectus_docs_entity_idx on public.prospectus_documents(entity_name);
create unique index if not exists prospectus_docs_url_uq on public.prospectus_documents(source_url);
alter table public.prospectus_documents enable row level security;

create policy "prospectus_docs_public_read"
  on public.prospectus_documents for select using (true);

-- writes are service-role only (ingest endpoint)

-- ── prospectus_claims (structured claims extracted from a document) ─────────
create table if not exists public.prospectus_claims (
  id              uuid primary key default uuid_generate_v4(),
  document_id     uuid not null references public.prospectus_documents on delete cascade,
  prophecy_id     text,
  metric          text not null,                         -- machine key, e.g. 'tier1_capital_ratio_min'
  label           text not null,                         -- human label
  promised        numeric,                               -- the stated commitment
  observed        numeric,                               -- observed value (null until a second source confirms)
  unit            text,
  direction       text check (direction in ('min','max')),
  quote           text,                                  -- the exact sentence the claim was extracted from
  page_ref        smallint,
  confidence      smallint,                              -- 0-100 extractor confidence
  created_at      timestamptz not null default now()
);

create index if not exists prospectus_claims_doc_idx on public.prospectus_claims(document_id);
create index if not exists prospectus_claims_prophecy_idx on public.prospectus_claims(prophecy_id);
alter table public.prospectus_claims enable row level security;

create policy "prospectus_claims_public_read"
  on public.prospectus_claims for select using (true);

-- writes are service-role only
