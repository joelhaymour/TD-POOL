-- Cross-instance refresh coordination.
-- Serverless functions cannot share in-memory throttles, so every provider
-- refresh (board materialize, ESPN game sync, odds sync) records its run here.

create table if not exists public.sync_state (
  key text primary key,
  last_run_at timestamptz not null default now(),
  last_ok_at timestamptz,
  status text not null default 'ok',
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.sync_state is
  'Provider refresh timestamps shared across serverless instances. Written by the service role only.';

alter table public.sync_state enable row level security;

-- No anon/authenticated policies: the server writes with the service role key,
-- which bypasses RLS. Clients never read this table directly.
