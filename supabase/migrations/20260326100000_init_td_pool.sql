-- TD Pool Phase 1 schema
-- Extensions
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type betting_mode as enum ('individual', 'fixed', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pick_lock_type as enum ('first_kickoff', 'custom', 'individual_game');
exception when duplicate_object then null; end $$;

do $$ begin
  create type odds_format as enum ('american', 'decimal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type currency_code as enum ('USD', 'CAD');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('admin', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pick_result as enum ('pending', 'td', 'no_td', 'game_not_finished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type injury_status as enum ('healthy', 'questionable', 'doubtful', 'out', 'ir');
exception when duplicate_object then null; end $$;

-- leagues
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  admin_user_id uuid,
  currency currency_code not null default 'USD',
  betting_mode betting_mode not null default 'individual',
  contribution_per_member numeric(10,2) not null default 10,
  fixed_weekly_stake numeric(10,2) not null default 100,
  member_count_setting int not null default 12,
  pick_lock_type pick_lock_type not null default 'individual_game',
  custom_lock_at timestamptz,
  allow_pick_changes boolean not null default true,
  survivor_mode boolean not null default false,
  odds_format odds_format not null default 'american',
  join_pin text,
  admin_pin text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leagues_slug_idx on public.leagues (slug);

-- league_members
create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid,
  display_name text not null,
  role member_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (league_id, display_name)
);

create index if not exists league_members_league_idx on public.league_members (league_id);

-- nfl_weeks
create table if not exists public.nfl_weeks (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  week int not null,
  start_date date not null,
  end_date date not null,
  unique (season, week)
);

-- nfl_games
create table if not exists public.nfl_games (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.nfl_weeks(id) on delete cascade,
  external_game_id text,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled',
  spread numeric(5,2),
  total numeric(5,2),
  unique (week_id, home_team, away_team)
);

create index if not exists nfl_games_week_idx on public.nfl_games (week_id);
create index if not exists nfl_games_kickoff_idx on public.nfl_games (kickoff_at);

-- nfl_players
create table if not exists public.nfl_players (
  id uuid primary key default gen_random_uuid(),
  external_player_id text unique,
  name text not null,
  team text not null,
  position text not null,
  active boolean not null default true,
  headshot_url text
);

create index if not exists nfl_players_team_idx on public.nfl_players (team);
create index if not exists nfl_players_name_idx on public.nfl_players (name);

-- player_week_data
create table if not exists public.player_week_data (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.nfl_players(id) on delete cascade,
  week_id uuid not null references public.nfl_weeks(id) on delete cascade,
  game_id uuid references public.nfl_games(id) on delete set null,
  market_probability numeric(6,4),
  our_probability numeric(6,4),
  td_pool_score numeric(8,4),
  td_pool_rank int,
  matchup_rating int check (matchup_rating between 1 and 5),
  goal_line_rating int check (goal_line_rating between 1 and 5),
  research_json jsonb not null default '{}'::jsonb,
  injury_status injury_status not null default 'healthy',
  consensus_american_odds int,
  consensus_decimal_odds numeric(10,4),
  updated_at timestamptz not null default now(),
  unique (player_id, week_id)
);

create index if not exists player_week_data_week_rank_idx on public.player_week_data (week_id, td_pool_rank);

-- player_odds
create table if not exists public.player_odds (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.nfl_players(id) on delete cascade,
  game_id uuid references public.nfl_games(id) on delete cascade,
  sportsbook text not null,
  market text not null default 'anytime_td',
  american_odds int not null,
  decimal_odds numeric(10,4) not null,
  implied_probability numeric(6,4) not null,
  fetched_at timestamptz not null default now()
);

create index if not exists player_odds_player_game_idx on public.player_odds (player_id, game_id);
create index if not exists player_odds_fetched_idx on public.player_odds (fetched_at desc);

-- picks
create table if not exists public.picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  week_id uuid not null references public.nfl_weeks(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id) on delete restrict,
  odds_at_selection int,
  decimal_odds_at_selection numeric(10,4),
  probability_at_selection numeric(6,4),
  picked_at timestamptz not null default now(),
  result pick_result not null default 'pending',
  touchdown_scored boolean,
  unique (league_id, week_id, player_id),
  unique (league_id, week_id, member_id)
);

create index if not exists picks_league_week_idx on public.picks (league_id, week_id);

-- Helper: is league member
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
      and m.active = true
  );
$$;

-- RLS
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.nfl_weeks enable row level security;
alter table public.nfl_games enable row level security;
alter table public.nfl_players enable row level security;
alter table public.player_week_data enable row level security;
alter table public.player_odds enable row level security;
alter table public.picks enable row level security;

-- Phase 1: allow anon read of NFL reference data (public sports data)
create policy "nfl_weeks_read" on public.nfl_weeks for select using (true);
create policy "nfl_games_read" on public.nfl_games for select using (true);
create policy "nfl_players_read" on public.nfl_players for select using (true);
create policy "player_week_data_read" on public.player_week_data for select using (true);
create policy "player_odds_read" on public.player_odds for select using (true);

-- Leagues: members can read; for invite-link V1 also allow read by authenticated or anon via service role APIs
-- Client-side access when authenticated as member:
create policy "leagues_select_member" on public.leagues
  for select using (
    auth.uid() is not null and public.is_league_member(id)
  );

create policy "leagues_update_admin" on public.leagues
  for update using (public.is_league_admin(id));

create policy "leagues_insert_auth" on public.leagues
  for insert with check (auth.uid() is not null);

create policy "members_select" on public.league_members
  for select using (public.is_league_member(league_id) or public.is_league_admin(league_id));

create policy "members_admin_write" on public.league_members
  for all using (public.is_league_admin(league_id));

create policy "picks_select_member" on public.picks
  for select using (public.is_league_member(league_id));

create policy "picks_insert_member" on public.picks
  for insert with check (
    public.is_league_member(league_id)
    and member_id in (
      select id from public.league_members
      where league_id = picks.league_id and user_id = auth.uid()
    )
  );

create policy "picks_update_own" on public.picks
  for update using (
    public.is_league_admin(league_id)
    or member_id in (
      select id from public.league_members
      where user_id = auth.uid()
    )
  );

-- Realtime
alter publication supabase_realtime add table public.picks;
alter publication supabase_realtime add table public.league_members;

comment on table public.picks is 'One pick per member per week; unique player per league week enforced by DB.';
