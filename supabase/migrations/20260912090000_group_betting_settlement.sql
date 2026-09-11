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
