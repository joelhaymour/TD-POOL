-- Invite-link / Realtime MVP: public SELECT on league tables.
-- Existing member-scoped policies remain; RLS policies for the same command are OR'd.
-- Production should replace these with pin/auth-scoped access.
-- Idempotent: safe if invite_link_rls_and_realtime already applied these.

drop policy if exists "leagues_select_public" on public.leagues;
create policy "leagues_select_public"
  on public.leagues
  for select
  using (true);

drop policy if exists "members_select_public" on public.league_members;
create policy "members_select_public"
  on public.league_members
  for select
  using (true);

drop policy if exists "picks_select_public" on public.picks;
create policy "picks_select_public"
  on public.picks
  for select
  using (true);

-- Ensure Realtime can see league rows when subscribed
do $$
begin
  alter publication supabase_realtime add table public.leagues;
exception
  when duplicate_object then null;
end $$;
