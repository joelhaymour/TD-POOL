# PredictionData.io outreach

Send to: support@predictiondata.io (or their "request a demo" form)
Subject: **API access for a small private betting-pool app — bet365 deeplinks + NFL props**

---

Hi,

I run a small private NFL pick-pool app used by a handful of friend groups
(under 100 users total, no public signups, no monetization). We're adding a
feature where a group builds a parlay together in the app and then opens the
finished slip in their sportsbook to place it themselves — we never place bets
or handle anyone's credentials.

Your `POST /api/deeplink` endpoint with `bet_type: "parlay"` looks like exactly
what we need, and I noticed bet365 is in the supported sportsbook list. That's
the piece nobody else seems to offer: The Odds API dropped bet365 from NFL
coverage entirely, and we already have FanDuel working through their
addToBetslip links.

What we'd need:

- **League:** NFL only (possibly NCAAF later)
- **Books:** bet365 primarily; FanDuel/DraftKings as backups
- **Markets:** anytime TD, first TD, player passing/rushing/receiving props,
  plus game lines (moneyline, spread, total)
- **Endpoints:** `/api/markets` (with `provider_deeplink_string`), `/api/fixtures`,
  `/api/deeplink`, and possibly `/api/sgp` for same-game parlay pricing
- **Volume:** very low — roughly 30-100 requests per day during the NFL season,
  refreshing a 16-game slate a few times a day. No live/in-game polling.
- **Region:** United States (we'd also want to know if bet365 deeplinks work for
  US states, or only Ontario/Canada)

A few questions:

1. Do you have a plan that fits this scale, and what would it cost per month?
   Your pricing page is quote-based and most of your listed customers are
   sportsbooks and trading firms, so I want to check we're not far too small.
2. Is there a trial or sandbox key so I can verify bet365 parlay deeplinks
   actually open the bet365 app with the slip prefilled before committing?
3. How reliable are the bet365 deeplinks in practice — do they break when
   bet365 changes their app, and how quickly are they fixed?
4. Any licensing restriction on using the deeplinks the way I've described
   (a private group app sending users to the book to place their own bet)?

Happy to jump on a short call if that's easier.

Thanks,
Joel Haymour

---

## Why we're asking (internal notes, don't send)

Verified 2026-09-11 against The Odds API with a live key:

- `bookmakers=bet365,bet365_au` + `markets=player_anytime_td` on an NFL event
  returned **zero bookmakers**.
- `regions=uk` + `h2h` returned 15 UK books (Paddy Power, William Hill, Coral,
  Betfair, …) — **bet365 was not among them**, so it is not merely a props gap.
- Their docs list only `bet365_au`, paid-plans-only, "coverage currently limited
  to h2h, spreads and totals for AFL and NRL".

So bet365 NFL data cannot be had from The Odds API at any price tier.
SportsGameOdds lists bet365 but only from their **$299/mo Pro** tier.
PredictionData is the cheapest known path *if* they'll sell to us at this scale.

Fallback if they decline or price it too high: ship FanDuel only (already built
and working) and revisit if the league grows.
