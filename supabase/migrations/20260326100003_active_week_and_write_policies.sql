-- Schema parity with TS domain types + permissive anon write policies for invite-link MVP.
-- Production should tighten RLS and prefer SUPABASE_SERVICE_ROLE_KEY on the server.

-- leagues.active_week_id (missing from init)
alter table public.leagues
  add column if not exists active_week_id uuid references public.nfl_weeks(id);

-- Allow null fixed stake (TS uses null when betting_mode = individual)
alter table public.leagues
  alter column fixed_weekly_stake drop not null;

-- nfl_weeks.label (optional display)
alter table public.nfl_weeks
  add column if not exists label text;

-- Game score / venue fields used by sync + dashboard
alter table public.nfl_games
  add column if not exists home_score int,
  add column if not exists away_score int,
  add column if not exists stadium text,
  add column if not exists is_dome boolean not null default false;

-- Player jersey
alter table public.nfl_players
  add column if not exists jersey_number int;

-- player_week_data availability + tier (computed/stored for pool board)
alter table public.player_week_data
  add column if not exists availability text not null default 'available',
  add column if not exists tier text;

-- player_odds.week_id for week-scoped refresh/replace
alter table public.player_odds
  add column if not exists week_id uuid references public.nfl_weeks(id) on delete cascade;

create index if not exists player_odds_week_idx on public.player_odds (week_id);

-- Member PIN for invite-link auth (optional per member)
alter table public.league_members
  add column if not exists pin text;

-- Admin override flag on picks
alter table public.picks
  add column if not exists overridden boolean not null default false;

-- ---------------------------------------------------------------------------
-- MVP write policies: allow anon FOR ALL on app tables so the Next.js server
-- can use the anon key when service role is unavailable.
-- COMMENT: production should revoke these and use service role + tighter RLS.
-- ---------------------------------------------------------------------------

drop policy if exists "mvp_anon_leagues_all" on public.leagues;
create policy "mvp_anon_leagues_all"
  on public.leagues for all using (true) with check (true);

drop policy if exists "mvp_anon_members_all" on public.league_members;
create policy "mvp_anon_members_all"
  on public.league_members for all using (true) with check (true);

drop policy if exists "mvp_anon_picks_all" on public.picks;
create policy "mvp_anon_picks_all"
  on public.picks for all using (true) with check (true);

drop policy if exists "mvp_anon_weeks_all" on public.nfl_weeks;
create policy "mvp_anon_weeks_all"
  on public.nfl_weeks for all using (true) with check (true);

drop policy if exists "mvp_anon_games_all" on public.nfl_games;
create policy "mvp_anon_games_all"
  on public.nfl_games for all using (true) with check (true);

drop policy if exists "mvp_anon_players_all" on public.nfl_players;
create policy "mvp_anon_players_all"
  on public.nfl_players for all using (true) with check (true);

drop policy if exists "mvp_anon_pwd_all" on public.player_week_data;
create policy "mvp_anon_pwd_all"
  on public.player_week_data for all using (true) with check (true);

drop policy if exists "mvp_anon_odds_all" on public.player_odds;
create policy "mvp_anon_odds_all"
  on public.player_odds for all using (true) with check (true);

comment on policy "mvp_anon_leagues_all" on public.leagues is
  'MVP only: permissive anon write. Tighten + use service role in production.';
