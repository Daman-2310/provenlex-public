-- Protocol 4: storage for the edge scraper + pg_cron schedule.
-- Run AFTER deploying the regulator-scraper edge function.

create table if not exists public.regulator_items (
  id          text primary key,
  source      text not null,
  title       text not null,
  link        text,
  summary     text,
  published   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists regulator_items_published_idx on public.regulator_items(published desc);
create index if not exists regulator_items_source_idx on public.regulator_items(source);
alter table public.regulator_items enable row level security;
create policy "regulator_items_public_read" on public.regulator_items for select using (true);
create policy "regulator_items_service_write" on public.regulator_items for all to service_role using (true) with check (true);

-- Scheduler + outbound HTTP (enable in Dashboard → Database → Extensions if needed)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Invoke the edge function every 15 minutes, decoupled from Vercel entirely.
-- Store the service key once:  select set_config('app.service_key','sb_secret_xxx', false);
-- (or use Vault). Replace <ref> with your project ref.
select cron.schedule(
  'regulator-scrape-15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<ref>.functions.supabase.co/regulator-scraper',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.service_key', true)
               ),
    body    := '{}'::jsonb
  );
  $$
);
