# Next release: Pool’d 1.1 (after 1.0 is approved)

Night mode is built and on the test site (td-pool-v2.vercel.app); its code
is on `main` too but switched off there. It needs iPhone build 2, so hold it
until Apple approves 1.0, then turn it on and ship build 2 together.

## Website

- **Night mode + Appearance setting** — account sheet (tap your initials) →
  Appearance: Automatic · Light · Dark. Cookie `poold-theme` → `<html data-theme>`.
  The code is already on main but switched off there by `APPEARANCE_READY`
  in `src/lib/theme.ts` (on for the test site). **To release: delete
  `APPEARANCE_READY` and its three checks** (layout viewport + theme, account menu).

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
player link, posting fixes (read on paste, link-only screenshot steps),
onboarding icons, odds pulls Wed/Thu/Sun/Mon for this week's games only.
