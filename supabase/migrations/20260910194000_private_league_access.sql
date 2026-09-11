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
