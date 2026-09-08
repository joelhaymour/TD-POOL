-- Admin rights now come from league_members.role plus the signed-in account,
-- so the shared admin PIN is dead weight. It was also a weaker control than the
-- identity check that replaced it: a PIN can be forwarded, an account cannot.
--
-- league_members.pin only ever held a copy of the league admin PIN for the
-- creator's row, so it goes with it.
alter table public.leagues drop column if exists admin_pin;
alter table public.league_members drop column if exists pin;
