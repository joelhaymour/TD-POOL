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

## Git identity

Vercel blocks a deployment when the commit email does not resolve to a GitHub
account, and the build never starts — the branch alias keeps serving the last
good deployment, so the push looks successful until you open the dashboard. Set
the repository identity once per machine:

```sh
git config user.email "joelhaymour00@gmail.com"
git config user.name "Joel Haymour"
```

## Bet365 and expanded props

Confirmed on 2026-09-11 with live calls, not just documentation:

- `bookmakers=bet365,bet365_au` with `markets=player_anytime_td` on an NFL event
  returns **no bookmakers at all**.
- `regions=uk` with `markets=h2h` returns 15 UK books and **bet365 is not among
  them**, so this is total NFL absence rather than a player-props gap.
- The bookmaker table lists only `bet365_au`, paid plans only, "coverage
  currently limited to h2h, spreads and totals for AFL and NRL".

Bet365 NFL odds therefore cannot be bought from The Odds API at any tier, and
bet365's own share links are server-generated codes with no public format a
third party can construct. SportsGameOdds carries bet365 only from its $299/mo
Pro tier. PredictionData.io exposes a bet365 parlay deeplink endpoint at
quote-based pricing — see `docs/predictiondata-outreach.md`.

Caesars (`williamhill_us`) and Fanatics also require a paid subscription and
return empty on free keys.

The prop board group betting picks from is FanDuel's, because FanDuel returns
market and selection ids through `includeLinks=true&includeSids=true` at no
extra credit cost. Placing the bet is a different problem, solved by share
links rather than by a second odds feed — adding a book there is one entry in
`src/lib/props/sportsbooks.ts`.

Credits are billed per market **returned**, so requesting markets a book does
not price is free. A full FanDuel board for one NFL game measured 12-16 credits;
a 16-game slate is roughly 200-256. Boards cache for six hours, shared by every
league.

Sources: [Supabase environment guidance](https://supabase.com/docs/guides/deployment/managing-environments),
[Vercel Git deployment guidance](https://vercel.com/docs/git),
[The Odds API bookmakers](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html).

## Group betting

A league is either a weekly TD pool or a group betting league (`league_type`).
Group betting members build shared parlays: each member adds up to
`max_props_per_member` legs per slip from the full FanDuel board of any game.

- **Prop boards** are fetched per game on demand, shared by every league, and
  refreshed at most every `PROPS_SYNC_TTL_HOURS` (default 6). Refreshes stop
  below `ODDS_CREDIT_FLOOR` credits (default 40) and never run after kickoff,
  when FanDuel pulls pregame markets.
- **Two market tiers.** `CORE_PROP_MARKETS` (18) load when a game is opened;
  `EXTENDED_PROP_MARKETS` (alternate ladders, defence, longest, last TD,
  team totals, first-half and first-quarter lines) load when someone taps
  "Alt lines, defense & more markets". The Odds API bills per market a book
  prices, so a measured TB@CIN board cost 11 credits for core (154
  selections) and 17 more for extended (567 selections). Each tier replaces
  only its own markets, so one does not wipe the other. Only markets an ESPN
  box score can settle are listed — an ungradeable market would keep its slip
  out of History forever.
- **FanDuel reuses one selection id per player across markets**: Cade Otton's
  receptions Over and receiving-yards Over are both `41346941`, differing only
  by market id. Identify a selection by market + player + side + line, never
  by `fd_selection_id` alone. Deep links are unaffected, since they send the
  market id alongside.
- **Boards pulled before props post.** FanDuel lists a Sunday game's lines as
  soon as the previous week ends and its player markets midweek. A board with
  lines but no player markets asks again for just the player markets every 30
  minutes; The Odds API charges nothing when no requested market comes back
  (verified: 0 credits), so waiting is free.
- **Week roll.** Group betting leagues move to the next week at the last
  kickoff, not the last final — nothing can be added once every game has
  started. Scores keep syncing for earlier weeks that still have open legs.
  TD pools still wait for every game to go final.
- **Tabs.** Create (build and name a parlay, add picks), Parlays (every slip in
  play as a tile leading with odds and payout, expandable to its legs and its
  place-the-bet links), History (settled), Board. A league can carry many
  parlays at once, so Create switches between them through a list rather than a
  row of chips.
- **No prefilled FanDuel slip.** The launcher and `fanduel-link.ts` were
  removed: a share link the bettor pastes carries the real prices from the book
  they actually used, and needs no state subdomain, no indexed-array format and
  no per-leg id matching. FanDuel ids are still captured on each leg, so
  prefill can come back from git history if it is ever wanted.
- **Ride this bet.** Sportsbooks mint share links on their own servers and no
  third party can construct one, so the member who placed the slip pastes
  theirs (`parlay_share_links`) and everyone else gets a branded button that
  loads the same selections in their own account. One link per member per book,
  so several books can sit side by side. The pasted text is scanned for the
  first URL and its host must match a book in `src/lib/props/sportsbooks.ts` —
  these become buttons other members tap, so an open field would turn a slip
  into a place to post any link. **Adding a book is one entry in that file**;
  nothing else changes. `deepLink: true` marks the books we can also prefill
  from our own board (FanDuel today).
- **Grading** runs on every Home load (throttled to once a minute): scores come
  from ESPN, then each pending leg on a final game is graded from the ESPN box
  score. A player absent from the box score counts as zero unless the injury
  report ruled him out (void). Admins can override any leg once its game has
  started. A slip settles, and moves to History, only when every leg is graded.

### TD odds early in the week

Books post anytime-TD markets game by game. A sync the night a week opens
priced 62 players against a full week's ~368, and the 40-hour hold kept the
board mostly blank until Wednesday. A sync pricing fewer than 12 players per
unstarted game is now recorded as `partial` and retries after 12 hours.

### Stale reads in page requests

Next.js memoizes identical `GET` fetches for a whole page request, and work
scheduled with `after()` shares that request. Supabase reads are `GET`s, so a
row read back after a write came back unchanged: the refresh moved a league to
Week 2, re-read the league as Week 1, and paid to re-price the finished week.
`createAdminClient` passes an `AbortController` signal on every fetch, which is
Next's documented opt-out. Route handlers were never affected.

### Staging odds

Staging keeps `ENABLE_PAID_PROVIDERS=false` (no SportsDataIO or AI writeups)
and turns odds on separately with `ENABLE_ODDS_API=true`, `PROVIDER_MODE=auto`
and the **test** Odds API key. The test key is a free 500-credit plan, so
staging sets `PROPS_SYNC_TTL_HOURS=24` and `ODDS_CREDIT_FLOOR=60`. Never put the
production Odds API key in the staging project.

## Releasing later

Feature work stays on `v2` or branches based on it. Review and test code and
migrations before separately authorizing a merge to `main` and a production
database migration. A Git merge does not migrate the database.
