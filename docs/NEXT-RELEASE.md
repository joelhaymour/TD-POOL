# Next release: Pool’d 1.1 (after 1.0 is approved)

Everything below is on `v2` (test site td-pool-v2.vercel.app) and **not** on
`main`. Hold it until Apple approves 1.0, then ship the website and build 2
together so the app and the site match.

## Website (goes live the moment v2 is pushed to main)

- **Night mode + Appearance setting** — account sheet (tap your initials) →
  Appearance: Automatic · Light · Dark. Cookie `poold-theme` → `<html data-theme>`.
- **Post a ticket inside a league reads on paste** — no "Read the ticket" tap.
- **Link-only shares** — "Your link didn't include a picture" card: go back
  with iOS's ◀ back button, screenshot, share the screenshot to Pool’d; the
  link (and the league) is kept 30 min and filled in when the picture arrives
  (`src/lib/tickets/pending-share.ts`). Paste screenshot / From photos as backups.
- **Onboarding** — real app-icon glyphs; logo stays dark on its cream tile.

## iPhone app — build 2 (needs a new upload + review)

- `@capacitor/status-bar`: clock/battery readable in dark mode.
- `Info.plist` no longer forces Light, so Automatic follows the phone.
- Web view backdrop follows light/dark (no white flash).
- Bump `CURRENT_PROJECT_VERSION` to 2 (and `MARKETING_VERSION` to 1.1), archive,
  upload (`xcodebuild -exportArchive`, destination upload), add to a new 1.1
  version in App Store Connect with "What's New" text, submit.

## Release steps

1. `git fetch && git merge origin/main` on v2 (main may have hotfixes).
2. `git push origin v2:main`; wait for the td-pool deploy.
3. `npm run ios:sync` (production URL), build number 2, archive, upload.
4. App Store Connect → + Version 1.1 → What's New → build 2 → Submit.

Already live on main while 1.0 is in review (no need to re-ship): ticket
reader fixes (slip matchup + this week's player→game data), member-picks
player link.
