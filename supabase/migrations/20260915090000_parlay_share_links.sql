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
