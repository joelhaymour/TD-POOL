-- The first cut of 20260925120000 made this index partial, which
-- ON CONFLICT (user_id, dedupe_key) cannot target. Idempotent either way.
drop index if exists public.notifications_dedupe_idx;
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key);
