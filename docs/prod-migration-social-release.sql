-- Pool'd release: pinned leagues, thumbs up/down, following tickets, notifications.
-- Paste into the LIVE Supabase SQL editor (project yzqdawphpjxarctbggxl) and Run. Safe to run twice.

-- Pool'd: pinned leagues, thumbs up/down, following tickets, notifications.

-- 1) Pinned leagues: per seat, newest pin first.
alter table public.league_members add column if not exists pinned_at timestamptz;

-- 2) Thumbs up / down on a posted ticket or a TD pool pick. Exactly one
--    target per row; deleting the ticket or the pick (a changed pick is a new
--    row) takes its reactions with it.
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  parlay_id uuid references public.parlays(id) on delete cascade,
  pick_id uuid references public.picks(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  constraint reactions_one_target check ((parlay_id is null) <> (pick_id is null))
);
create unique index if not exists reactions_member_parlay_idx on public.reactions (member_id, parlay_id) where parlay_id is not null;
create unique index if not exists reactions_member_pick_idx on public.reactions (member_id, pick_id) where pick_id is not null;
create index if not exists reactions_parlay_idx on public.reactions (parlay_id) where parlay_id is not null;
create index if not exists reactions_pick_idx on public.reactions (pick_id) where pick_id is not null;

-- 3) Following a ticket: updates without riding it.
create table if not exists public.parlay_follows (
  parlay_id uuid not null references public.parlays(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parlay_id, member_id)
);
create index if not exists parlay_follows_member_idx on public.parlay_follows (member_id);

-- 4) The in-app inbox. One row per person per event; dedupe_key stops the
--    same event (a leg hitting, a ping in the same window) landing twice.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  league_id uuid references public.leagues(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
-- Not partial: NULL keys never collide anyway, and a plain index is what
-- "insert … on conflict (user_id, dedupe_key) do nothing" can target.
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- 5) Where to push: a browser's Web Push subscription or an iPhone's APNs token.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('web', 'apns')),
  endpoint text not null unique,
  p256dh text,
  auth text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- 6) Which kinds of notification a person wants. Missing keys mean "on".
create table if not exists public.notification_prefs (
  user_id uuid primary key,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS: reads for the people who should see them; every write goes through the
-- server with the service role (the app's model since 2026-09-10).
alter table public.reactions enable row level security;
alter table public.parlay_follows enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;

drop policy if exists "members read reactions" on public.reactions;
create policy "members read reactions" on public.reactions
  for select using (public.is_league_member(league_id));
drop policy if exists "members read follows" on public.parlay_follows;
create policy "members read follows" on public.parlay_follows
  for select using (public.is_league_member(league_id));
drop policy if exists "owner reads notifications" on public.notifications;
create policy "owner reads notifications" on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists "owner reads prefs" on public.notification_prefs;
create policy "owner reads prefs" on public.notification_prefs
  for select using (user_id = auth.uid());
-- push_subscriptions: no client access at all.

-- Live updates: the bell badge and the reaction counts.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reactions;
  exception when duplicate_object then null;
  end;
end $$;

-- The first cut of 20260925120000 made this index partial, which
-- ON CONFLICT (user_id, dedupe_key) cannot target. Idempotent either way.
drop index if exists public.notifications_dedupe_idx;
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key);

-- Check: should return 5 rows.
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('reactions','parlay_follows','notifications','push_subscriptions','notification_prefs') order by 1;
