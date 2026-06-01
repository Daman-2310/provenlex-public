-- =============================================================================
-- GENESIS SWARM — INITIAL POSTGRES SCHEMA
-- supabase/migrations/20260530180000_initial_schema.sql
--
-- Tables: profiles, tenants, tenant_members, vindications, whistleblower_tips,
--         witness_signatures, watchlist_anchors, alert_subscriptions,
--         api_keys, audit_log
--
-- All tables have Row Level Security (RLS) enabled. Per-tenant tables are
-- gated by tenant membership; user-owned tables by user_id == auth.uid().
-- =============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists citext;

-- ── Helper: updated_at trigger ──────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles (one row per auth.users) ───────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       citext unique not null,
  full_name   text,
  avatar_url  text,
  role        text not null default 'user' check (role in ('user','admin','support')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_self_read"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_self_update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_all"
  on public.profiles for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Auto-create a profile on every new auth.users row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── tenants (a billing entity — fund, firm, individual subscriber) ──────────
create table public.tenants (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  slug            citext unique not null,
  type            text not null default 'individual' check (type in ('individual','fund','manco','aifm','regulator','enterprise')),
  jurisdiction    text,                                    -- ISO country code
  lei             text,                                    -- Legal Entity Identifier (optional)
  plan            text not null default 'free' check (plan in ('free','starter','pro','enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function set_updated_at();

alter table public.tenants enable row level security;

-- ── tenant_members (junction: user ↔ tenant) ────────────────────────────────
create table public.tenant_members (
  tenant_id   uuid not null references public.tenants on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_members_user_idx on public.tenant_members(user_id);
alter table public.tenant_members enable row level security;

create policy "members_read_own_tenant"
  on public.tenant_members for select
  using (user_id = auth.uid());

create policy "members_owner_admin_manage"
  on public.tenant_members for all
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = tenant_members.tenant_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
    )
  );

-- tenants RLS — visible to any member
create policy "tenants_visible_to_members"
  on public.tenants for select
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = id and m.user_id = auth.uid()
    )
  );

create policy "tenants_owner_admin_update"
  on public.tenants for update
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')
    )
  );

-- Helper: ensure_default_tenant — called from app on first sign-in. Creates a
-- personal tenant for a user if they have none.
create or replace function public.ensure_default_tenant(p_user uuid, p_display text)
returns uuid
language plpgsql
security definer
as $$
declare
  tid uuid;
  slug_base text;
  slug_try text;
  i int := 0;
begin
  -- Already has a tenant?
  select tenant_id into tid from public.tenant_members where user_id = p_user limit 1;
  if found then return tid; end if;

  slug_base := lower(regexp_replace(coalesce(p_display, 'user'), '[^a-z0-9]+', '-', 'g'));
  slug_try := slug_base;
  while exists (select 1 from public.tenants where slug = slug_try) loop
    i := i + 1;
    slug_try := slug_base || '-' || i::text;
  end loop;

  insert into public.tenants (name, slug, type, plan)
  values (coalesce(p_display, 'Personal'), slug_try, 'individual', 'free')
  returning id into tid;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (tid, p_user, 'owner');

  return tid;
end;
$$;

-- ── vindications (confirmed prophecies — formerly in KV) ────────────────────
create table public.vindications (
  id              uuid primary key default uuid_generate_v4(),
  prophecy_id     text not null,
  entity_name     text not null,
  jurisdiction    text,
  confirmed_at    timestamptz not null default now(),
  source_url      text not null,
  source_outlet   text not null,
  signal_text     text not null,
  pci_at_confirm  smallint,
  confidence      smallint,
  created_at      timestamptz not null default now()
);

create index vindications_prophecy_idx on public.vindications(prophecy_id);
create index vindications_confirmed_idx on public.vindications(confirmed_at desc);
alter table public.vindications enable row level security;

-- Vindications are PUBLIC — anyone can read
create policy "vindications_public_read"
  on public.vindications for select
  using (true);

create policy "vindications_admin_write"
  on public.vindications for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── whistleblower_tips (hash + sealed contents) ─────────────────────────────
create table public.whistleblower_tips (
  hash            text primary key,                        -- SHA-256 hex
  entity          text not null,
  sealed_at       timestamptz not null,
  status          text not null default 'sealed' check (status in ('sealed','revealed','withdrawn')),
  revealed_at     timestamptz,
  tip             text,                                    -- populated only on reveal
  salt            text,                                    -- populated only on reveal
  ip_hash         text,                                    -- SHA-256 of IP for abuse tracking
  created_at      timestamptz not null default now()
);

create index whistleblower_sealed_idx on public.whistleblower_tips(sealed_at desc);
create index whistleblower_status_idx on public.whistleblower_tips(status);
alter table public.whistleblower_tips enable row level security;

-- Public can read hash+entity+sealed_at+status (the ledger); contents stay private
create policy "whistleblower_ledger_read"
  on public.whistleblower_tips for select
  using (true);

-- Only the service role inserts/updates (the API route uses it)
-- (Default: no insert/update for authenticated; service role bypasses RLS.)

-- ── witness_signatures (board-member attestations) ──────────────────────────
create table public.witness_signatures (
  id                uuid primary key default uuid_generate_v4(),
  prophecy_id       text not null,
  signer_name       text not null,
  signer_role       text,                                 -- e.g. "Board Director"
  signer_entity     text,                                 -- the fund/firm they sign on behalf of
  signature_text    text not null,                        -- HMAC or simple textual
  signed_at         timestamptz not null default now(),
  ip_hash           text,
  user_id           uuid references auth.users on delete set null,
  created_at        timestamptz not null default now()
);

create index witness_prophecy_idx on public.witness_signatures(prophecy_id);
create index witness_signed_idx on public.witness_signatures(signed_at desc);
alter table public.witness_signatures enable row level security;

create policy "witness_public_read"
  on public.witness_signatures for select
  using (true);

create policy "witness_signer_create"
  on public.witness_signatures for insert
  with check (user_id = auth.uid() or user_id is null);

-- ── watchlist_anchors (OpenTimestamps receipts) ─────────────────────────────
create table public.watchlist_anchors (
  hash              text primary key,
  receipt_b64       text not null,
  calendar          text not null,
  submitted_at      timestamptz not null,
  publication_date  timestamptz not null,
  verification_url  text not null,
  edition           text not null default 'GENESIS-WATCHLIST-V1',
  created_at        timestamptz not null default now()
);

alter table public.watchlist_anchors enable row level security;

create policy "anchors_public_read"
  on public.watchlist_anchors for select
  using (true);

-- ── alert_subscriptions (per-tenant alerts on entities/prophecies) ──────────
create table public.alert_subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants on delete cascade,
  entity_name     text,
  prophecy_id     text,
  trigger         text not null default 'any' check (trigger in ('any','pci_rise_10','vindication','witness','press')),
  channel         text not null default 'email' check (channel in ('email','webhook','slack')),
  channel_target  text not null,                           -- email address, webhook URL, slack hook
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger alerts_updated_at
  before update on public.alert_subscriptions
  for each row execute function set_updated_at();

create index alerts_tenant_idx on public.alert_subscriptions(tenant_id);
alter table public.alert_subscriptions enable row level security;

create policy "alerts_tenant_read"
  on public.alert_subscriptions for select
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = alert_subscriptions.tenant_id and m.user_id = auth.uid()
    )
  );

create policy "alerts_tenant_write"
  on public.alert_subscriptions for all
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = alert_subscriptions.tenant_id and m.user_id = auth.uid()
      and m.role in ('owner','admin','member')
    )
  );

-- ── api_keys (per-tenant API access) ────────────────────────────────────────
create table public.api_keys (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants on delete cascade,
  prefix      text not null,                              -- first 8 chars (visible)
  hash        text unique not null,                       -- SHA-256 of full key (never stored plaintext)
  name        text not null,
  scopes      text[] not null default '{"read"}',
  last_used_at timestamptz,
  expires_at  timestamptz,
  revoked     boolean not null default false,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create index api_keys_tenant_idx on public.api_keys(tenant_id);
create index api_keys_hash_idx on public.api_keys(hash);
alter table public.api_keys enable row level security;

create policy "api_keys_tenant_read"
  on public.api_keys for select
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = api_keys.tenant_id and m.user_id = auth.uid()
    )
  );

create policy "api_keys_tenant_admin_write"
  on public.api_keys for all
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = api_keys.tenant_id and m.user_id = auth.uid() and m.role in ('owner','admin')
    )
  );

-- ── audit_log (append-only — immutable record of significant actions) ───────
create table public.audit_log (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references auth.users on delete set null,
  actor_kind  text not null default 'user' check (actor_kind in ('user','service','api_key','anonymous','cron')),
  tenant_id   uuid references public.tenants on delete set null,
  action      text not null,                              -- e.g. 'vindication.create', 'tip.reveal', 'witness.sign'
  resource    text,                                       -- e.g. 'prophecy:578a618e28db'
  metadata    jsonb,
  ip_hash     text,
  user_agent  text
);

create index audit_log_actor_idx on public.audit_log(actor_id);
create index audit_log_tenant_idx on public.audit_log(tenant_id);
create index audit_log_occurred_idx on public.audit_log(occurred_at desc);
create index audit_log_action_idx on public.audit_log(action);
alter table public.audit_log enable row level security;

create policy "audit_log_tenant_read"
  on public.audit_log for select
  using (
    actor_id = auth.uid() or
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = audit_log.tenant_id and m.user_id = auth.uid()
      and m.role in ('owner','admin')
    )
  );

create policy "audit_log_admin_read"
  on public.audit_log for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- audit_log is intentionally append-only — no update or delete policies

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
