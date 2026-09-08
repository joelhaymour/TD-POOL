-- Measured goal-line usage from nflverse play-by-play.
--
-- Replaces an estimate that was quietly wrong: Sleeper's `rush_rz_att` counts
-- carries inside the 20, not inside the 5, so the old `* 0.55` multiplier both
-- overstated goal-line volume by ~2x and — worse — flattened the real spread.
-- The true inside-5 share of inside-20 carries ranges from 0.17 to 1.00, so a
-- fixed multiplier rated Jahmyr Gibbs (51 inside-20, only 10 inside-5) the same
-- in kind as Derrick Henry (62 -> 27), erasing the exact signal an anytime-TD
-- model exists to find.

create table if not exists public.nflverse_goal_line_week (
  season int not null,
  week int not null,
  season_type text not null default 'REG',
  gsis_id text not null,
  -- Resolved through the DynastyProcess crosswalk. Sleeper's own gsis_id is
  -- null for 81% of active skill players, so it cannot be used for this join.
  sleeper_id text,
  player_name text,
  team text not null,
  inside5_carries int not null default 0,
  inside10_carries int not null default 0,
  inside5_targets int not null default 0,
  inside10_targets int not null default 0,
  endzone_targets int not null default 0,
  rush_tds int not null default 0,
  rec_tds int not null default 0,
  team_inside5_rushes int not null default 0,
  team_inside5_plays int not null default 0,
  team_inside10_plays int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, week, season_type, gsis_id)
);

create index if not exists nflverse_goal_line_week_sleeper_idx
  on public.nflverse_goal_line_week (sleeper_id, season);

create table if not exists public.nflverse_goal_line_season (
  season int not null,
  season_type text not null default 'REG',
  gsis_id text not null,
  sleeper_id text,
  player_name text,
  team text,
  games_played int not null default 0,
  inside5_carries int not null default 0,
  inside10_carries int not null default 0,
  inside5_targets int not null default 0,
  inside10_targets int not null default 0,
  endzone_targets int not null default 0,
  rush_tds int not null default 0,
  rec_tds int not null default 0,
  -- Summed only over weeks the player was active. Using the team's full-season
  -- total would deflate the share of anyone who missed games.
  team_inside5_rushes int not null default 0,
  team_inside5_plays int not null default 0,
  inside5_team_share double precision,
  updated_at timestamptz not null default now(),
  primary key (season, season_type, gsis_id)
);

create index if not exists nflverse_goal_line_season_sleeper_idx
  on public.nflverse_goal_line_season (sleeper_id, season);

comment on table public.nflverse_goal_line_week is
  'Measured inside-5 / inside-10 usage from nflverse play-by-play. Written by the service role only.';

alter table public.nflverse_goal_line_week enable row level security;
alter table public.nflverse_goal_line_season enable row level security;

-- No anon/authenticated policies: the service role writes and bypasses RLS,
-- matching the sync_state convention.
