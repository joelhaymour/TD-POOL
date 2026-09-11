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
