# TD Pool V2 development

## Environments

- Live code: GitHub `main`; Vercel `td-pool`; https://td-pool-five.vercel.app.
- Live Supabase: `yzqdawphpjxarctbggxl`. Never use it for tests or development migrations.
- Test code: GitHub `v2`; Vercel `td-pool-v2`; https://td-pool-v2.vercel.app.
- Test Supabase: `lskwowovnnjdndkthrzm`, in the free **TD Pool Development** organization.
- Local test server: `npm run dev -- --hostname 127.0.0.1 --port 3002 --webpack`.

The stable deployment in the **td-pool-v2** project is called “Production” by
Vercel, but it is the TD Pool test environment. It tracks `v2` and uses only the
test database. The original project's production branch remains `main`.

## Safety checks

`next.config.ts` checks the environment before compilation, and instrumentation
checks it again on server startup. The live database is permitted only for the
original Vercel project's production deployment from `main`. A staging build
requires the exact test database, test keys, visible test banner, and disabled
paid services/jobs. Mixed-project legacy JWT keys are rejected.

`vercel.json` skips non-main branches in the original Vercel project and skips
main in the staging project. No production Vercel settings were changed.
Local `.vercel/project.json` is linked to `td-pool-v2`.

`.env.local` contains test credentials only. The prior local configuration is
preserved in `.env.production-backup.local`, and the prior Vercel local folder
is in `.local-backups/vercel-production`. These backups and test passwords are
ignored by Git and excluded from Vercel uploads. Never restore production
credentials into a development server.

## Routine commands

```sh
npm run test:environment
npm run lint
npm run typecheck
npm run build
npm run db:v2:plan
npm run db:v2:push
npm run db:v2:status
```

The database commands refuse `main` and any linked project other than V2. The
database password is in ignored `.env.v2.setup.local`. Database migrations are
applied deliberately; there is no automatic production migration pipeline.
If local Turbopack cannot create its worker, use `npm run build -- --webpack`.

## Test accounts and data

Run the local test server, then `npm run setup:v2`. The script creates synthetic
admin/member/outsider accounts without sending emails, creates V2 Playground and
V2 Second League, and checks authentication, invitation PINs, access controls,
and disabled cron jobs. It does not reset accounts or clear existing leagues.
Test passwords are stored privately in `.data/V2-TEST-ACCESS.md`.

The new database uses the checked-in schema plus a V2 migration removing old
anonymous write policies. Client writes are disabled; app server routes enforce
identity and game locks. Authenticated members retain read access for Realtime.
No production users, picks, or cached odds were copied.

ESPN/Sleeper provide live football data. `PROVIDER_MODE=mock` produces simulated
odds for testing, clearly labeled in the page banner. Paid odds, SportsDataIO,
and AI calls are disabled, including Vercel's automatic AI Gateway OIDC path.
Both scheduled refresh endpoints return without touching data.

## Bet365 and expanded props

As checked on 2026-09-11, The Odds API documents `bet365_au` only for AFL/NRL
moneyline, spreads, and totals. NFL anytime-TD coverage is not documented, so
the default request contains only the five supported target US books. Caesars
and Fanatics require a paid The Odds API subscription. The mappings remain for
future coverage, but requesting extra regions cannot manufacture missing odds.

Before selecting an alternative, verify live NFL response samples for the exact
Bet365 jurisdiction, target props, all six books, update latency, and display
rights. Same-game parlay pricing is a separate capability from individual odds.

Sources: [Supabase environment guidance](https://supabase.com/docs/guides/deployment/managing-environments),
[Vercel Git deployment guidance](https://vercel.com/docs/git),
[The Odds API bookmakers](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html).

## Releasing later

Feature work stays on `v2` or branches based on it. Review and test code and
migrations before separately authorizing a merge to `main` and a production
database migration. A Git merge does not migrate the database.
