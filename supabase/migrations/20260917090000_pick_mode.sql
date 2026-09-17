-- Group bets: one pick each, or an open slip.
--
-- "Picks per member" as a number never matched how a group actually builds a
-- slip. Either everyone makes exactly one pick and the slip is complete (and
-- locks itself) when the last member is in, or it is open — anyone adds as
-- many as they like and whoever places the bet taps "Lock in bet".

alter table public.leagues
  add column if not exists pick_mode text not null default 'open';

-- A league that was set to one pick each stays that way; any other number
-- was a soft cap nobody hit, so it becomes an open slip.
update public.leagues
  set pick_mode = case when max_props_per_member = 1 then 'one_each' else 'open' end;

alter table public.leagues drop constraint if exists leagues_pick_mode_check;
alter table public.leagues
  add constraint leagues_pick_mode_check
  check (pick_mode in ('one_each', 'open'));
