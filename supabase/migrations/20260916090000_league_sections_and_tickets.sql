-- League sections + tickets.
--
-- A league is no longer one thing. It carries up to three sections: the
-- weekly TD pool, group bets (shared parlays built from the prop board) and
-- tickets — bets members placed themselves at their own book, posted from a
-- screenshot so the rest of the league can follow along and ride them.
-- Existing leagues keep exactly the section they were, plus tickets, which
-- needs nothing set up to be useful.

-- 1) Sections ----------------------------------------------------------------

alter table public.leagues
  add column if not exists enable_td_pool boolean not null default true,
  add column if not exists enable_group_bets boolean not null default true,
  add column if not exists enable_tickets boolean not null default true;

-- Rows that exist today were one type or the other; new leagues default to
-- everything on and the creator unticks what they don't want.
update public.leagues set
  enable_td_pool = (league_type <> 'group_betting'),
  enable_group_bets = (league_type = 'group_betting');

alter table public.leagues drop constraint if exists leagues_sections_check;
alter table public.leagues
  add constraint leagues_sections_check
  check (enable_td_pool or enable_group_bets or enable_tickets);

-- 2) Tickets are parlays of a second kind ------------------------------------
-- They reuse the slip and leg tables so grading, live progress, share links
-- and realtime all come for free. The book's own numbers are kept because a
-- same-game parlay is priced by the book, not by multiplying its legs.

alter table public.parlays
  add column if not exists kind text not null default 'group',
  add column if not exists sportsbook text,
  add column if not exists book_odds int,
  add column if not exists book_payout numeric,
  add column if not exists screenshot_path text;

alter table public.parlays drop constraint if exists parlays_kind_check;
alter table public.parlays
  add constraint parlays_kind_check check (kind in ('group', 'ticket'));

alter table public.parlays drop constraint if exists parlays_book_payout_check;
alter table public.parlays
  add constraint parlays_book_payout_check
  check (book_payout is null or book_payout >= 0);

create index if not exists parlays_league_kind_idx
  on public.parlays (league_id, kind);

-- A screenshot does not always show a price per leg.
alter table public.parlay_legs alter column american_odds drop not null;
alter table public.parlay_legs alter column decimal_odds drop not null;

-- 3) Rides -------------------------------------------------------------------
-- Who tapped "I'm riding" on a ticket. One row per member per slip.

create table if not exists public.parlay_rides (
  parlay_id uuid not null references public.parlays(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  member_id uuid not null references public.league_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parlay_id, member_id)
);

create index if not exists parlay_rides_league_idx
  on public.parlay_rides (league_id);

alter table public.parlay_rides enable row level security;

drop policy if exists "parlay_rides_select_member" on public.parlay_rides;
create policy "parlay_rides_select_member" on public.parlay_rides
  for select to authenticated using (public.is_league_member(league_id));

revoke insert, update, delete, truncate, references, trigger on
  public.parlay_rides from anon, authenticated;
revoke select on public.parlay_rides from anon;
grant select on public.parlay_rides to authenticated;
grant all on public.parlay_rides to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parlay_rides'
  ) then
    alter publication supabase_realtime add table public.parlay_rides;
  end if;
end $$;

-- 4) Screenshots -------------------------------------------------------------
-- Private bucket, no storage policies: only the service role reads or writes,
-- and the app hands members short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tickets',
  'tickets',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
