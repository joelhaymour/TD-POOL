-- TD Pool: production database migration for the v2 release
-- Run this in the PRODUCTION Supabase project (yzqdawphpjxarctbggxl) SQL editor
-- BEFORE merging v2 into main. A Git merge does not migrate the database.
--
-- Four migrations, in order. Every statement is written to be safe to
-- re-run, so a partial first attempt can simply be run again.


-- ============================================================
-- 20260910194000_private_league_access.sql
-- ============================================================
-- V2 uses authenticated server routes with a service-role client for writes.
-- Remove the old invite-link MVP bypasses before putting test accounts online.
-- This migration is applied to V2 only. Production migration is a separate release.
drop policy if exists "mvp_anon_leagues_all" on public.leagues;
drop policy if exists "mvp_anon_members_all" on public.league_members;
drop policy if exists "mvp_anon_picks_all" on public.picks;
drop policy if exists "mvp_anon_weeks_all" on public.nfl_weeks;
drop policy if exists "mvp_anon_games_all" on public.nfl_games;
drop policy if exists "mvp_anon_players_all" on public.nfl_players;
drop policy if exists "mvp_anon_pwd_all" on public.player_week_data;
drop policy if exists "mvp_anon_odds_all" on public.player_odds;
drop policy if exists "leagues_select_public" on public.leagues;
drop policy if exists "members_select_public" on public.league_members;
drop policy if exists "picks_select_public" on public.picks;

-- Client writes would bypass per-game lock and identity checks in server routes.
revoke insert, update, delete, truncate, references, trigger on
  public.leagues, public.league_members, public.picks,
  public.nfl_weeks, public.nfl_games, public.nfl_players,
  public.player_week_data, public.player_odds
  from anon, authenticated;
revoke select on public.leagues, public.league_members, public.picks from anon;
grant select on public.leagues, public.league_members, public.picks to authenticated;
grant all on all tables in schema public to service_role;

-- ============================================================
-- 20260911090000_group_betting.sql
-- ============================================================
-- Group Betting leagues: league type, full-prop board, shared parlays.
--
-- A "group_betting" league replaces the one-TD-pick-per-week flow with shared
-- parlay slips: any member opens a parlay, each member adds up to
-- max_props_per_member legs from the full FanDuel prop board, and anyone can
-- open the finished slip in FanDuel via deep link.

-- 1) League type + per-member leg allowance -------------------------------

alter table public.leagues
  add column if not exists league_type text not null default 'td_pool',
  add column if not exists max_props_per_member int not null default 3;

alter table public.leagues
  drop constraint if exists leagues_league_type_check;
alter table public.leagues
  add constraint leagues_league_type_check
  check (league_type in ('td_pool', 'group_betting'));

alter table public.leagues
  drop constraint if exists leagues_max_props_check;
alter table public.leagues
  add constraint leagues_max_props_check
  check (max_props_per_member between 1 and 25);

-- 2) Full prop board (per game, per book) ---------------------------------
-- Rows are replaced wholesale per (game, sportsbook) on each refresh, so
-- nothing else may reference them without a snapshot (see parlay_legs).

create table if not exists public.game_props (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.nfl_weeks(id) on delete cascade,
  game_id uuid not null references public.nfl_games(id) on delete cascade,
  sportsbook text not null default 'fanduel',
  market_key text not null,
  market_label text not null,
  market_group text not null,
  player_id uuid references public.nfl_players(id) on delete set null,
  player_name text,
  outcome_label text not null,
  line numeric,
  american_odds int not null,
  decimal_odds numeric not null,
  fd_market_id text,
  fd_selection_id text,
  deep_link text,
  fetched_at timestamptz not null default now()
);

create index if not exists game_props_game_idx
  on public.game_props (game_id, sportsbook);
create index if not exists game_props_week_idx
  on public.game_props (week_id);

-- 3) Shared parlay slips ---------------------------------------------------

create table if not exists public.parlays (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_id uuid not null references public.nfl_weeks(id) on delete cascade,
  title text not null,
  created_by_member_id uuid references public.league_members(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parlays_status_check check (status in ('open', 'locked'))
);

create index if not exists parlays_league_week_idx
  on public.parlays (league_id, week_id);

-- Legs snapshot everything needed to rebuild the FanDuel slip, because
-- game_props rows are replaced on every odds refresh. game_prop_id is only a
-- soft pointer for duplicate detection while the source row still exists.
create table if not exists public.parlay_legs (
  id uuid primary key default gen_random_uuid(),
  parlay_id uuid not null references public.parlays(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  game_prop_id uuid references public.game_props(id) on delete set null,
  game_id uuid not null references public.nfl_games(id) on delete cascade,
  sportsbook text not null default 'fanduel',
  market_key text not null,
  market_label text not null,
  player_name text,
  outcome_label text not null,
  line numeric,
  american_odds int not null,
  decimal_odds numeric not null,
  fd_market_id text,
  fd_selection_id text,
  deep_link text,
  added_at timestamptz not null default now()
);

create index if not exists parlay_legs_parlay_idx
  on public.parlay_legs (parlay_id);
create index if not exists parlay_legs_member_idx
  on public.parlay_legs (parlay_id, member_id);

-- The same selection may not be added to one slip twice.
create unique index if not exists parlay_legs_unique_selection
  on public.parlay_legs (
    parlay_id,
    market_key,
    coalesce(player_name, ''),
    outcome_label,
    coalesce(line, -99999)
  );

-- 4) RLS ------------------------------------------------------------------
-- Matches the V2 model from 20260910194000_private_league_access: clients get
-- read access only, and every write goes through a server route using the
-- service-role key, so identity and per-member limits cannot be bypassed.

alter table public.game_props enable row level security;
alter table public.parlays enable row level security;
alter table public.parlay_legs enable row level security;

-- Sportsbook prices are public NFL market data, like player_odds.
drop policy if exists "game_props_read" on public.game_props;
create policy "game_props_read" on public.game_props for select using (true);

-- Slips are league-private: only members of that league may read them.
drop policy if exists "parlays_select_member" on public.parlays;
create policy "parlays_select_member" on public.parlays
  for select to authenticated using (public.is_league_member(league_id));

drop policy if exists "parlay_legs_select_member" on public.parlay_legs;
create policy "parlay_legs_select_member" on public.parlay_legs
  for select to authenticated using (public.is_league_member(league_id));

revoke insert, update, delete, truncate, references, trigger on
  public.game_props, public.parlays, public.parlay_legs
  from anon, authenticated;
revoke select on public.parlays, public.parlay_legs from anon;
grant select on public.parlays, public.parlay_legs to authenticated;
grant all on public.game_props, public.parlays, public.parlay_legs
  to service_role;

-- ============================================================
-- 20260912090000_group_betting_settlement.sql
-- ============================================================
-- Group betting settlement: per-slip stake, leg grading, slip results, realtime.
--
-- Legs are graded from ESPN box scores once their game is final. A slip
-- settles (and moves to History) only when every leg is graded, so a busted
-- slip keeps showing on Home while the rest of its games are still going.

alter table public.parlays
  add column if not exists stake numeric,
  add column if not exists result text not null default 'pending',
  add column if not exists payout numeric,
  add column if not exists settled_at timestamptz;

alter table public.parlays drop constraint if exists parlays_result_check;
alter table public.parlays
  add constraint parlays_result_check
  check (result in ('pending', 'won', 'lost', 'push'));

alter table public.parlays drop constraint if exists parlays_stake_check;
alter table public.parlays
  add constraint parlays_stake_check check (stake is null or stake >= 0);

alter table public.parlay_legs
  add column if not exists result text not null default 'pending',
  add column if not exists actual_value numeric,
  add column if not exists graded_at timestamptz,
  add column if not exists manual_result boolean not null default false;

alter table public.parlay_legs drop constraint if exists parlay_legs_result_check;
alter table public.parlay_legs
  add constraint parlay_legs_result_check
  check (result in ('pending', 'won', 'lost', 'push', 'void'));

create index if not exists parlays_league_settled_idx
  on public.parlays (league_id, settled_at);

-- A friend's new leg shows up without a refresh. Row visibility still follows
-- the member-only select policies on both tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parlays'
  ) then
    alter publication supabase_realtime add table public.parlays;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parlay_legs'
  ) then
    alter publication supabase_realtime add table public.parlay_legs;
  end if;
end $$;

-- ============================================================
-- 20260915090000_parlay_share_links.sql
-- ============================================================
-- Bet share links: "ride this bet" for the rest of the league.
--
-- Sportsbooks generate share links on their own servers and no third party can
-- construct one, so the member who actually placed the slip pastes theirs and
-- everyone else opens it to load the same selections in their own account.
-- One link per member per book per slip, so a second paste replaces the first.

create table if not exists public.parlay_share_links (
  id uuid primary key default gen_random_uuid(),
  parlay_id uuid not null references public.parlays(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  sportsbook text not null,
  url text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parlay_share_links_url_https check (url like 'https://%')
);

create unique index if not exists parlay_share_links_member_book_idx
  on public.parlay_share_links (parlay_id, member_id, sportsbook);

create index if not exists parlay_share_links_parlay_idx
  on public.parlay_share_links (parlay_id);

-- RLS matches the rest of group betting: members read, writes go through the
-- server routes on the service-role key. The host allowlist that decides which
-- book a link belongs to is enforced there, in src/lib/props/sportsbooks.ts.
alter table public.parlay_share_links enable row level security;

drop policy if exists "parlay_share_links_select_member" on public.parlay_share_links;
create policy "parlay_share_links_select_member" on public.parlay_share_links
  for select to authenticated using (public.is_league_member(league_id));

revoke insert, update, delete, truncate, references, trigger on
  public.parlay_share_links from anon, authenticated;
revoke select on public.parlay_share_links from anon;
grant select on public.parlay_share_links to authenticated;
grant all on public.parlay_share_links to service_role;

-- A link someone pastes appears on everyone else's slip without a refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parlay_share_links'
  ) then
    alter publication supabase_realtime add table public.parlay_share_links;
  end if;
end $$;
