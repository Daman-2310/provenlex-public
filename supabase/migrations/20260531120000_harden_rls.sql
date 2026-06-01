-- =============================================================================
-- GENESIS SWARM — STORAGE HARDENING (Protocol 2)
-- supabase/migrations/20260531120000_harden_rls.sql
--
-- Forces RLS on sensitive logic/transactional tables and restricts writes to
-- service_role. Public-facing ledgers (vindications, watchlist_anchors,
-- prospectus_claims read) keep their public_read policy intentionally.
-- =============================================================================

-- Force RLS even for table owners on the sensitive set.
do $$
declare t text;
begin
  foreach t in array array[
    'prospectus_documents','prospectus_claims','api_keys','audit_log',
    'alert_subscriptions','whistleblower_tips','witness_signatures'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end$$;

-- api_keys: service role only — anon must NEVER read key hashes
drop policy if exists "api_keys_tenant_read" on public.api_keys;
drop policy if exists "api_keys_tenant_admin_write" on public.api_keys;
drop policy if exists "api_keys_service_only" on public.api_keys;
create policy "api_keys_service_only" on public.api_keys
  for all to service_role using (true) with check (true);

-- audit_log: service role writes (admin read policy from initial migration retained)
drop policy if exists "audit_log_service_write" on public.audit_log;
create policy "audit_log_service_write" on public.audit_log
  for insert to service_role with check (true);

-- prospectus logic: keep public READ of extracted claims (that's the product),
-- writes service-role only — block anon from inserting fabricated claims.
drop policy if exists "prospectus_docs_service_write" on public.prospectus_documents;
create policy "prospectus_docs_service_write" on public.prospectus_documents
  for all to service_role using (true) with check (true);
drop policy if exists "prospectus_claims_service_write" on public.prospectus_claims;
create policy "prospectus_claims_service_write" on public.prospectus_claims
  for all to service_role using (true) with check (true);

-- whistleblower: expose only the safe ledger columns via a view; tip+salt stay
-- service-role only. Revoke direct base-table select from anon.
create or replace view public.whistleblower_ledger as
  select hash, entity, sealed_at, status, revealed_at
  from public.whistleblower_tips;
grant select on public.whistleblower_ledger to anon, authenticated;
revoke select on public.whistleblower_tips from anon;

-- =============================================================================
-- SUPAVISOR CONNECTION POOLER (set these as Vercel env vars — NOT in code)
-- Transaction mode (6543) for serverless + the 11-bot fan-out:
--   DATABASE_URL=postgresql://postgres.<ref>:[PW]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
-- Session mode (5432 via pooler) for migrations / long transactions only:
--   DIRECT_URL=postgresql://postgres.<ref>:[PW]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
-- Rules: connection_limit=1 per instance; pgbouncer=true (no prepared-stmt cache
-- in txn mode); never hold a connection across requests.
-- =============================================================================
