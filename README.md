# TD Pool

TD Pool is a mobile-first football pool app for private groups built around weekly Anytime Touchdown picks.

It started as a simple pool manager and grew into a full-stack sports product with live game data, touchdown grading, odds, player research, league history, realtime data, push-notification support, and an iOS wrapper.

## Highlights

- Create and manage private touchdown pools
- Weekly player picks with duplicate-prevention logic
- Live NFL game and scoring updates
- Automatic touchdown grading
- Anytime-touchdown odds integration
- Player research and historical performance views
- Leaderboards and multi-week history
- Supabase-backed data and realtime updates
- Progressive Web App support
- Capacitor-based iOS integration
- Push notification support
- Local/mock provider fallbacks for development

## Stack

- Next.js
- React
- TypeScript
- Supabase / Postgres
- Supabase Realtime
- Zustand
- ESPN data provider
- The Odds API
- Vercel
- Capacitor
- iOS
- Web Push

## Architecture

The app separates external sports data behind provider interfaces so production feeds can be swapped without changing the core pool logic.

It supports:

- hosted Supabase persistence
- local development storage
- live and mock data providers
- realtime league updates
- server-side grading and result synchronization
- isolated V2 development and database migration tooling

## Core product areas

### Pool management
League creation, weekly picks, duplicate prevention, admin controls, and mobile-first entry flows.

### Live results
Game status synchronization, touchdown detection, grading, weekly results, and league history.

### Odds
Anytime-touchdown pricing with bookmaker and consensus views.

### Research
Player history, recent touchdown performance, opponent context, and an internal scoring model.

### Native/mobile
PWA behavior plus Capacitor tooling for an iOS build.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1
```

The repository contains environment-variable placeholders only. Production API keys and database credentials are not committed.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run test:environment
```

V2 development notes live in [docs/V2-DEVELOPMENT.md](docs/V2-DEVELOPMENT.md).

## Note

Odds and projections are informational. This project is a private-pool management and sports-data application, not a sportsbook.

---

Built by [Joel Haymour](https://github.com/joelhaymour).
