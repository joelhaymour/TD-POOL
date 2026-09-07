# TD Pool

Mobile-first weekly **Anytime Touchdown Pool** for private fantasy leagues.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1
```

Open [http://127.0.0.1:3000/joels-league](http://127.0.0.1:3000/joels-league).

> Use `127.0.0.1` (or `localhost` consistently). Mixing hosts can break Next.js client hydration in Cursor’s browser.

### Demo league

| | |
|---|---|
| URL | `/joels-league` |
| Admin PIN | `1234` |
| Join PIN | `0000` |

```bash
npm run seed   # reseed mock data (dev server must be running)
```

## Phase 1 — Core product ✅

- League create + invite slug links
- Member identity picker
- Ranked TD Pool player board + filters
- Player research / detail pages
- Pick submit / change with duplicate prevention
- Parlay summary + Bet Slip
- Money modes: individual / fixed / none
- Admin settings + overrides
- Local JSON store + mock providers

## Phase 3 — Odds ✅

- Anytime TD odds provider abstraction
- **The Odds API** integration when `ODDS_API_KEY` is set
- Mock fallback (app stays fully usable without a key)
- Automatic odds refresh on league load (~every 5 min)
- Consensus + per-book prices stored and shown on player detail
- Dashboard shows “Odds updated X min ago · live/mock”

Set in `.env.local`:

```bash
PROVIDER_MODE=auto
ODDS_API_KEY=your_key_from_the-odds-api.com
ODDS_API_REGIONS=us
```

Note: anytime TD props on The Odds API typically need a plan that includes NFL player props. If live fetch fails, the app falls back to mock automatically.

## Stack

- Next.js App Router + TypeScript + Tailwind
- Local store: `.data/store.json` (`USE_SUPABASE=false`)
- Supabase project + Postgres schema ready for Phase 3+
- Provider interfaces: Odds / NFL / Weather / Injury

## Admin results demo

1. Open `/joels-league/admin`
2. Enter PIN `1234`
3. Click **Simulate finals & resolve TDs**
4. Return to Picks / History to see results

## Legal note

Odds and projections are informational estimates and may differ from sportsbook pricing. Gambling involves risk.

## Roadmap

3. **Phase 3** — Sportsbook odds integration  
4. **Phase 4** — Full TD intelligence (usage, injuries, weather)  
5. **Phase 5** — PWA, deeper history, leaderboards, notifications
