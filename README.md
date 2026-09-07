# TD Pool

Mobile-first weekly **Anytime Touchdown Pool** for private fantasy leagues.

Phase 1 is fully playable with mock NFL/odds data and a local JSON store. Supabase schema is provisioned for Phase 2+ (live data + Realtime).

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000/joels-league](http://localhost:3000/joels-league).

### Demo league

| | |
|---|---|
| URL | `/joels-league` |
| Admin PIN | `1234` |
| Join PIN | `0000` |

Reseed mock data (dev server running):

```bash
npm run seed
```

## What's in Phase 1

- League create + invite slug links
- Member identity picker (localStorage)
- Ranked TD Pool player list with filters
- Player research / detail pages
- Pick submit + change with duplicate prevention
- Parlay summary + Bet Slip (copy picks)
- Money modes: individual / fixed / none
- Admin settings + override tools
- Polling refresh every 3s (Realtime wired for Supabase later)
- Provider interfaces: Odds / NFL / Weather / Injury (mock implementations)
- Weighted **TD Pool Score** model (market-anchored, not odds-only)

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Local store: `.data/store.json` (`USE_SUPABASE=false`)
- Supabase project + Postgres schema (RLS, uniqueness constraints, Realtime publication)
- Vercel-compatible

## Architecture

```
External APIs (later) → providers → store/DB → API routes → mobile UI
```

Key folders:

- `src/app/[slug]/*` — league pages
- `src/components/*` — UI
- `src/lib/providers/*` — data provider abstractions
- `src/lib/scoring/*` — TD Pool model
- `src/lib/store/*` — persistence
- `supabase/migrations/*` — Postgres schema

## Legal note

Odds and projections are informational estimates and may differ from sportsbook pricing. Gambling involves risk.

## Roadmap

1. **Phase 1** — Core product with mock data ✅
2. **Phase 2** — Live NFL schedule / results
3. **Phase 3** — Sportsbook odds integration
4. **Phase 4** — Full TD intelligence (usage, injuries, weather)
5. **Phase 5** — PWA, history depth, leaderboards, notifications
