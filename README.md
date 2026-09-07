# TD Pool

Mobile-first weekly **Anytime Touchdown Pool** for private fantasy leagues.

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
# Set USE_SUPABASE=true for hosted DB (recommended)
npm run dev -- --hostname 127.0.0.1
```

Open [http://127.0.0.1:3000/joels-league](http://127.0.0.1:3000/joels-league).

### Demo league

| | |
|---|---|
| URL | `/joels-league` |
| Admin PIN | `1234` |
| Join PIN | `0000` |

Seed Supabase (when `USE_SUPABASE=true`):

```bash
curl -X POST http://127.0.0.1:3000/api/seed-supabase
```

Local JSON fallback (`USE_SUPABASE=false`):

```bash
npm run seed
```

## What’s built

### Phase 1 — Core ✅
League create, picks, duplicate prevention, bet slip, money modes, admin, mobile UI

### Phase 2 — NFL results ✅
Auto game/status sync, TD grading, weekly results, history  
Provider: **ESPN** (`NFL_PROVIDER=espn`) with mock fallback

### Phase 3 — Odds ✅
Anytime TD odds sync, consensus + books  
Provider: **The Odds API** when `ODDS_API_KEY` is set, else mock

### Phase 4 — Research ✅ (mock + history)
Player detail research, History (last 5 + vs opponent), TD Pool score model  
Live red-zone/injury/weather feeds can swap in behind existing provider interfaces

### Phase 5 — Polish ✅
PWA (manifest + service worker), leaderboard, multi-week history API, Realtime hook

### Backend ✅
- Supabase Postgres schema + RLS + Realtime publication
- `SupabaseStore` when `USE_SUPABASE=true`
- Local file store fallback

## Env

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # optional; anon works with MVP write policies
USE_SUPABASE=true
PROVIDER_MODE=auto
NFL_PROVIDER=espn
ODDS_API_KEY=                # optional
ODDS_API_REGIONS=us
```

## Deploy (Vercel)

```bash
npx vercel login
npx vercel --prod
```

Add the same env vars in the Vercel project settings.

## Legal

Odds and projections are informational estimates and may differ from sportsbook pricing. Gambling involves risk.
