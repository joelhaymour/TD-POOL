# Next release: Pool’d 1.0 (build 2) — resubmission after the 5.6 rejection

**Status (2026-10-08):** Apple rejected 1.0 (1) under Guideline 5.6 ("features
intentionally hidden during review"). The code below is ready on `v2`; it has
not been released to `main` or uploaded yet. Same version number (1.0), new
build (2).

## Why Apple flagged it (the audit, 2026-10-08)

Nothing in the app ever detected reviewers, Apple, TestFlight, location or
device. What could look hidden:

1. The app loads the live site, and the site changed while 1.0 was in review
   (Sep 29–30 deploys).
2. Night mode was built and on `main` but switched off on the live site
   (`APPEARANCE_READY`) "until after approval".
3. The share extension opened the app with a string-built selector
   (`openURL:options:completionHandler:` via the responder chain), which share
   extensions aren't allowed to do.
4. An odds-refresh button shown only to one email (`APP_OWNER_EMAILS`).
5. The site could tell the app from a browser (`TDPoolApp` user agent) and had
   once hidden Group Bets inside the app only (Sep 24–25).
6. Retired Group Bets: screens and APIs still deployed; the parlays API still
   answered for leagues with the old switch on.
7. Smaller: an unauthenticated `/api/admin/odds-quota`, dev seed routes, a
   simulate-final flag, a share test hook, cron routes that ran for anyone when
   `CRON_SECRET` was missing, `poold://` URL scheme, local-network ATS key,
   empty `CAPACITOR_DEBUG` key.

## What changed

### Website (ships to the app when `main` deploys)

- **Night mode is on for everyone**: account sheet (tap your initials) →
  Appearance: Automatic · Light · Dark. `APPEARANCE_READY` deleted.
- **Owner-only odds button removed**, with `src/lib/auth/owner.ts` and
  `/api/leagues/[slug]/odds-sync`. Odds refresh only on the cron schedule
  (Wed/Thu/Sun/Mon mornings ET).
- **Group Bets deleted**: `/[slug]/group/*`, its components, the parlays
  list/create/edit APIs, the add-leg and remove-leg APIs, the props API, the
  prop-board sync, pick mode, the section toggle. `LeagueSection` is now
  `td_pool | tickets`. The database keeps its columns and old rows; nothing
  reads `enable_group_bets`, and saving a league's sections now writes it
  `false`. Tickets still use `/parlays/[id]/shares` and `/parlays/[id]/legs/[legId]`
  (PATCH, admin grading).
- **App/browser switch removed**: `src/lib/native/server.ts` (user-agent
  detection, `hiddenSections`, `visibleLeague`) deleted.
- **Test/admin endpoints**: `/api/admin/odds-quota`, `/api/seed`,
  `/api/seed-supabase` deleted (`npm run seed` is now `scripts/seed.ts`, which
  refuses the production project); `simulateFinal` and the `poold:share` test
  event removed; cron routes refuse every caller when `CRON_SECRET` is unset
  (`src/lib/auth/cron.ts`; only `next dev` runs them open).
- Wording: privacy notice no longer lists "group bets"; money setting reads
  "Fixed stake — one stake on the league parlay each week" (was "Fixed Group
  Bet"); league tile with nothing on reads "No sections on" (was "Open on the
  website"); link-only screenshot steps say "come back to Pool’d (or tap its
  notification)".

### iPhone app — build 2

- **Share extension** saves the bet to the App Group and shows "Saved to
  Pool’d — open Pool’d to choose your leagues and post it" with Done. If
  notifications are allowed it also posts "Your bet is ready to post". The app
  opens `/share` the next time it comes to the front (`SceneDelegate`:
  cold start and `sceneDidBecomeActive`; `ShareInbox.pendingSince()`, 30-minute
  freshness, once per share). Verified in the simulator, both paths.
- `poold://` URL scheme removed (nothing uses it now).
- `appendUserAgent: "TDPoolApp"` removed.
- Info.plist: `NSAppTransportSecurity` / `NSAllowsLocalNetworking` and
  `CAPACITOR_DEBUG` removed; no longer forces Light (night mode).
- `@capacitor/status-bar` (status bar readable in dark mode), web-view
  backdrop follows light/dark.
- `CURRENT_PROJECT_VERSION = 2`, `MARKETING_VERSION` stays `1.0`.
- `npm run ios:sync` always bakes the production URL (it unsets
  `CAP_SERVER_URL`); `npm run ios:sync:staging` is the only way to point a
  build at the test site. Never archive a staging build.

### Not changed (decision pending)

The app still loads the frontend from `td-pool-five.vercel.app`. Bundling it
into the app would need a rewrite (static export can't do server components,
cookie auth, server actions or the proxy). Options are written up in the
2026-10-08 conversation: keep the remote shell with a review freeze (current
plan), or point the app at a separate, pinned Vercel deployment that only
changes with an App Store release.

## Release steps

1. Review on the test site (td-pool-v2.vercel.app) after `v2` deploys.
2. `git fetch && git merge origin/main` on v2, then `git push origin v2:main`;
   wait for the td-pool deploy ("Deployment has completed").
3. Check live: `/api/admin/odds-quota` → 404, `/api/cron/tick` without the
   bearer → 401, account sheet shows Appearance.
4. `npm run ios:sync` (production URL), then archive and upload:
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath <path>/Poold-1.0-2.xcarchive -allowProvisioningUpdates archive`,
   then `xcodebuild -exportArchive` with `destination=upload` in ExportOptions.
5. App Store Connect → 1.0 → Build: remove 1.0 (1), add 1.0 (2). Update App
   Review notes (below). Reply in App Review (draft below). Submit.
6. **Freeze `main` until Apple decides.** No deploys to td-pool-five during
   review; fixes wait on `v2`.

## App Review notes (paste into App Review Information → Notes)

```text
Pool’d is a private pick’em game and bet tracker for groups of friends. It takes no wagers and handles no money: members record bets they already placed at their own sportsbook, and the "Ride" link opens that sportsbook's own app or website.

How the app works: Pool’d is the iPhone client for the Pool’d web service. Its screens are rendered by our server inside the app; native code adds the share extension, push notifications, a clipboard reader for bet slips, haptics, pull-to-refresh and universal links. Every user, including the review account, gets the same features. Nothing is switched on or off by account, device, region, build or date, and the app's features will not change while it is in review.

Demo account: <email> / <password>. It is the admin of the demo league "<league name>", so every screen is reachable:
- TD Pool tab: Picks (choose a player), Slip (the league parlay), History, Board.
- Tickets tab: posted bets with Ride, Follow and thumbs; tap a ticket for its legs.
- Post a ticket: Home → Post a ticket → paste a bet slip. Or in Photos (or a sportsbook) tap Share → Pool’d, then open Pool’d (or tap its notification) to finish posting.
- League settings (gear icon) → Open admin tools: refresh results, correct a pick, manage members. Anyone who creates a league is its admin.
- Appearance (Automatic/Light/Dark), Privacy and Delete account: Home → tap your initials (top right).

Since the last submission we removed a developer-only maintenance button, deleted a retired feature's code, turned Dark mode on for everyone, moved the share extension to the standard save-then-open flow, and removed developer test endpoints.
```

## Reply to App Review (Resolution Center)

```text
Hello,

Thank you for the review. We take Guideline 5.6 seriously, so we audited the app and our server for anything a reviewer might not be able to see, and fixed everything we found in build 1.0 (2):

1. A developer-only maintenance button ("Force odds refresh") on the league admin screen was shown only to the developer's own account. It has been removed, along with its server endpoint. Odds now refresh only on a fixed automatic schedule.
2. Dark mode was built but switched off on our server for a later version. It is now on for everyone (Home → your initials → Appearance) and included in this build.
3. A retired feature ("Group Bets") was no longer shown anywhere, but its code was still on our server. All of its screens and endpoints have been deleted.
4. Our share extension used a workaround to open the app directly from the share sheet. It now uses the standard approach: it saves the bet and asks the user to open Pool’d (or tap a notification) to finish posting.
5. Developer test endpoints and leftover settings (demo-data routes, a test flag, an unused URL scheme, a custom user-agent marker and a local-network exception) were removed.

Pool’d is the iPhone client for the Pool’d web service: its screens are rendered by our server inside the app, and native code provides the share extension, push notifications, clipboard reading, haptics and universal links. All users get the same features; nothing changes based on the account, device, location, date, or whether the app is in review, and we will not change the app's features while it is in review.

The demo account in the Review Notes is the admin of the demo league, so every feature, including the league admin tools, is reachable. The notes list where each feature lives.

Pool’d never accepts wagers or handles money.

Thank you,
Joel Haymour
```
