# Pool’d on iPhone

The iOS app is a **native shell around the live site**. An Xcode project in
`ios/` wraps a WKWebView that loads `https://td-pool-five.vercel.app`, so every
deploy of `main` reaches the app instantly — there is no separate app build for
a web change. What the shell adds on top of Safari:

- a real app icon, launch screen, and no browser chrome;
- the swipe-from-the-left-edge back gesture;
- the keyboard shrinks the page instead of covering it (`@capacitor/keyboard`);
- **one-tap paste** of a bet slip: the native pasteboard plugin
  (`ios/App/App/TDPoolClipboardPlugin.swift`) hands the ticket sheet the
  picture *and* the link in one read — no "Paste" bubble to miss;
- sportsbook "Ride on …" links open in the book's own app (or Safari), never
  inside the shell;
- an offline page (`native/www/error.html`) with a retry when the site can't
  be reached.

**Group bets are gone** — retired 2026-09-25 and their code deleted
2026-10-08 (App Review 5.6 clean-up, see `docs/NEXT-RELEASE.md`). A league
runs the TD Pool, Tickets, or both. Old group slips and the
`enable_group_bets` column stay in the database; nothing reads them.

**The app and the website are the same product.** Nothing on the site checks
whether it is running inside the app to show or hide features; the only
app-specific code is native plumbing (push registration, clipboard, haptics,
share inbox) and instructions that only make sense on a phone.

The same web changes also make the site a better **home-screen app**: on any
iPhone, open the site in Safari → Share → *Add to Home Screen*. That needs no
Apple account and works today.

**Share from a sportsbook.** The app ships a Share Extension (`PooldShare`),
so **Pool’d appears in the iPhone share sheet**. In bet365 (or any app) tap
Share → Pool’d: the extension saves the slip picture and the link into the
App Group `group.com.joelhaymour.poold` (`ios/App/Shared/ShareInbox.swift`)
and says "Saved to Pool’d — open Pool’d to post it" (plus a "ready to post"
notification when notifications are allowed). Share extensions can't open
their app, so the app does the rest: the next time it comes to the front
(`SceneDelegate`) it sees the waiting share and loads `/share`, where you tick
one or more leagues, the slip is read automatically, and one button posts it
to each.
The same screen is "Post a ticket" on the home page (paste instead of share).

## Layout

| Path | What it is |
| --- | --- |
| `capacitor.config.ts` | App id `com.joelhaymour.poold`, name, which site the shell loads (`server.url`). |
| `ios/App/App.xcodeproj` | The Xcode project. Open it, pick your team, run. |
| `ios/App/App/MainViewController.swift` | Registers the plugin, turns on swipe-back, injects `TD_POOL_SITE`. |
| `ios/App/PooldShare/` | The share extension (its own target, bundle id `com.joelhaymour.poold.share`). |
| `ios/App/Shared/ShareInbox.swift` | The hand-off between the extension and the app (App Group folder). |
| `ios/App/App/PooldShareInboxPlugin.swift` | Lets `/share` collect what the extension left. Web side: `src/lib/native/share-inbox.ts`. |
| `ios/App/App/TDPoolClipboardPlugin.swift` | Native pasteboard read (picture + text). Web side: `src/lib/native/clipboard.ts`. |
| `ios/App/App/Info.plist` | Portrait only, follows light/dark, photo/camera usage strings, no-encryption flag. No URL schemes, no ATS exceptions. |
| `ios/App/App/Assets.xcassets` | App icon + launch image, generated. |
| `ios/App/CapApp-SPM` | Swift package pulling Capacitor and the keyboard plugin (no CocoaPods). |
| `native/make-artwork.swift` | Draws every icon, the launch screen and the SVG logo files from one vector copy of the logo (`native/brand/logo-source.jpg`). |
| `native/assets/` | 1024px icon and 2732px splash sources for `@capacitor/assets`. |
| `public/brand/mark.svg`, `public/icon.svg` | The logo: the mark alone, and the rounded tile (browser tab icon). |
| `native/www/` | The only bundled pages: a placeholder and the offline page. |
| `src/app/privacy/page.tsx` | Public privacy notice — App Store Connect and TestFlight ask for its URL. |

## Commands

```bash
npm install                      # once per clone: the Swift package points at node_modules/@capacitor/keyboard
npm run ios:sync                 # writes ios/App/App/capacitor.config.json (always the production URL) + copies native/www
npm run ios:open                 # opens the project in Xcode
npm run ios:artwork              # re-draw the PNGs after editing native/make-artwork.swift
npm run ios:assets               # push native/assets into the Xcode asset catalog
```

To point a test build at **staging** instead of production:

```bash
npm run ios:sync:staging
```

Run `npm run ios:sync` again before committing or archiving — the committed
`ios/App/App/capacitor.config.json` must carry the production address. Local
`next dev` is not reachable from the simulator (no ATS exception); test the
site in a browser, or the app against staging.

Command-line build for the simulator (what CI or a quick check would run):

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

## Steps only you can do

Everything Apple-facing is tied to your Apple ID, so these are yours.

### 1. Run it on your own iPhone (free, 7-day installs)

1. Open Xcode → Settings → Accounts → **+** → sign in with your Apple ID.
   Without a paid membership Xcode calls this a *Personal Team*.
2. `npm run ios:open`. In the project navigator click **App** (blue icon) →
   target **App** → **Signing & Capabilities** → tick *Automatically manage
   signing* → Team: your team. Do the same for the second target,
   **PooldShare**. Xcode registers both bundle ids and the App Group
   `group.com.joelhaymour.poold` (if the App Groups box shows it unticked
   or red, tick it on both targets).
   If it says the id is taken, change `appId` in `capacitor.config.ts`, run
   `npm run ios:sync`, and set the same value in *Bundle Identifier* here.
3. Plug in your iPhone (or enable Wi-Fi debugging), pick it in the device
   menu, press **Run**. On the phone: Settings → General → VPN & Device
   Management → trust your Apple ID.

Personal-team apps stop launching after 7 days; pressing Run again renews
them. That's fine for you, not for the league — for friends you need step 2.

### 2. Put it on friends' phones: Apple Developer Program + TestFlight

1. Enrol at <https://developer.apple.com/programs/enroll/> — $99 USD/year,
   your legal name, two-factor on the Apple ID. Apple usually confirms within
   a day, sometimes longer if they verify identity.
2. In Xcode change the Team to the new membership team (same screen as above).
3. <https://appstoreconnect.apple.com> → My Apps → **+** → New App: platform
   iOS, name **Pool’d**, bundle id `com.joelhaymour.poold`, SKU `poold`.
4. Xcode: device menu → *Any iOS Device (arm64)* → **Product → Archive** →
   **Distribute App → TestFlight & App Store → Upload**. Keep the defaults.
5. App Store Connect → TestFlight tab → the build appears after processing
   (10–30 min). Fill in *Test Information* (what to test, your email, the
   privacy URL `https://td-pool-five.vercel.app/privacy`).
6. **External Testing** → create a group → **Enable Public Link** → set the
   tester limit to your league size → share the link in the group chat.
   Friends install the free **TestFlight** app, tap the link, tap Install.
   The first build goes through a short Beta App Review (usually a day).

Each build is good for **90 days**; before it expires bump the build number
in Xcode (target App → General → Build) and archive/upload again. The web
app updates independently — you only re-upload when the shell itself changes
or the 90 days are up.

### Push notifications (after the developer account is active)

The app, the server and the inbox are ready; only Apple's key is missing.

1. <https://developer.apple.com/account/resources/authkeys/list> → **+** →
   name it "Pool’d push", tick **Apple Push Notifications service (APNs)** →
   Continue → Register → **Download** the `.p8` file (Apple lets you download
   it once). Note the **Key ID** on that page and your **Team ID** (top right
   of the developer site, or Membership details).
2. Vercel → each project (td-pool and td-pool-v2) → Settings → Environment
   Variables → add `APNS_KEY_ID`, `APNS_TEAM_ID`, and `APNS_PRIVATE_KEY` (open
   the .p8 in TextEdit and paste the whole text, BEGIN/END lines included).
   Redeploy.
3. In Xcode, target App → Signing & Capabilities: the Push Notifications
   capability is already in `App.entitlements`; with your team selected Xcode
   turns it on for the App ID by itself. If it shows a warning, click
   **+ Capability → Push Notifications** once.
4. On the phone: Pool’d → bell → Settings → **Turn on notifications** → Allow.

For browsers and Pool’d added to an iPhone home screen, generate Web Push
keys once on the Mac and add all three to both Vercel projects:

```bash
npx web-push generate-vapid-keys
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` = the public key, `VAPID_PRIVATE_KEY` = the
private key, `VAPID_SUBJECT` = `mailto:` + your email. Redeploy.

### 3. App Store (optional)

The App Store adds full App Review. Two guidelines matter for this app:

- **4.2 Minimum functionality** — Apple rejects "a repackaged website". The
  shell adds native pieces (pasteboard plugin, keyboard handling, gestures,
  offline page), but a reviewer may still push back. If they do, TestFlight
  or **Unlisted App Distribution**
  (<https://developer.apple.com/support/unlisted-app-distribution/>, an App
  Store link that isn't searchable, no 90-day expiry) are the fallbacks.
- **5.3 Gambling** — Pool’d never takes a wager or moves money; say exactly
  that in *App Review Information → Notes*: "Bet tracker for a private
  friends league. No wagering, no money handled. 'Ride' links open the user's
  own licensed sportsbook app." Rate the app 17+ and answer *Gambling and
  Contests: Infrequent/Mild* honestly. Keep the app free with no in-app
  purchases.

### App Store listing (copy/paste)

Every App Store Connect field, filled in, as submitted for 1.0 (1). For the
resubmission (build 2) the App Review notes and the reply to Apple are in
`docs/NEXT-RELEASE.md`. The four
screenshots (1320×2868, iPhone 6.9") were rendered from the real components
with sample data at 440×956 CSS px and 3× scale in headless Chrome.

```text
POOL’D — APP STORE CONNECT, FIELD BY FIELD
(Copy each block into the matching box. Screenshots are the 4 PNGs in this folder.)

================================================================
APP INFORMATION  (left sidebar → App Information)
================================================================
Name:        Pool’d
Subtitle:    TD picks & bets with friends
Primary category:    Sports
Secondary category:  Social Networking
Content rights:      "Yes, it contains third-party content" → tick that you have
                     the rights (player names, schedules and odds come from
                     data providers). Your call — say if you're unsure.
Age rating:  click Set Up / Edit and answer honestly:
             - Simulated gambling: None
             - Real-money gambling in the app: No (the app takes no bets)
             - Contests: Yes (friends' pick'em, no money through the app)
             - Everything else (violence, profanity, etc.): None
             It will likely come out 17+ / 18+ because of betting themes. That's fine.

================================================================
PRICING AND AVAILABILITY
================================================================
Price:         Free (USD 0)
Availability:  United States and Canada (or all countries — your call)

================================================================
APP PRIVACY  (left sidebar → App Privacy → Get Started)
================================================================
Privacy Policy URL:  https://td-pool-five.vercel.app/privacy
"Do you or your third-party partners collect data from this app?"  → Yes
Data types to tick (for each: Linked to the user = Yes,
Used for tracking = No, Purpose = App Functionality only):
  - Contact Info → Email Address
  - Contact Info → Name            (display name in leagues)
  - User Content → Photos or Videos (bet slip screenshots)
  - User Content → Other User Content (picks, tickets, thumbs)
  - Identifiers → User ID
Nothing else (no analytics, no ads, no location).

================================================================
VERSION 1.0  (left sidebar → iOS App → 1.0 Prepare for Submission)
================================================================
Screenshots → iPhone 6.9" Display: drag in the 4 PNGs, in order 1–4.

Promotional text:
New: share a slip straight from your sportsbook, ride your friends’ tickets, and get a buzz the moment a leg hits.

Description:
Pool’d is where your group chat’s football week lives.

WEEKLY TD POOL
Every week, everyone in your league picks one player to score a touchdown. All the picks together make the league’s parlay, and Pool’d shows the odds and the pot as picks come in. Picks grade themselves live and the leaderboard keeps the season standings.

POST YOUR BETS
Share a bet slip from your sportsbook straight to Pool’d, or paste it. Pool’d reads the legs, odds and payout for you, so you just pick your leagues and tap Post.

RIDE ALONG
See every bet your friends place and watch each leg fill in as the games are played. Ride a ticket you like, follow one you’re curious about, and give it a thumbs up (or down).

KNOW THE MOMENT IT HITS
Get a notification when a friend posts a ticket, when a leg hits on a ticket you ride or follow, when tickets win or lose, when all the picks are in, and when it’s time to make yours.

PRIVATE LEAGUES
Leagues are invite-only. Share one link and your friends are in with a tap.

Pool’d never takes bets and never holds or moves money. It tracks bets you’ve placed elsewhere. Please bet responsibly. 21+ where required by law.

Keywords:
touchdown,td pool,pick em,football,parlay,bet tracker,sportsbook,friends,league,leaderboard,picks

Support URL:    https://td-pool-five.vercel.app/privacy
Marketing URL:  (leave blank)
Copyright:      2026 Joel Haymour

Build:  click "Add Build" and pick 1.0 (1) — it appears ~15–30 min after I upload it.

================================================================
APP REVIEW INFORMATION  (same page, bottom)
================================================================
Sign-in required: YES
User name / Password: a DEMO account you create on the live site
  (e.g. appreview.poold@gmail.com). Put it in a small demo league
  with a few picks and one posted ticket so the reviewer sees content.
Contact: your name, phone, email.

Notes (paste):
Pool’d is a private pick’em game and bet tracker for groups of friends. It takes no wagers and handles no money: users record bets they already placed elsewhere, and the "Ride" link opens the user's own sportsbook app or website. The demo account is already a member of the demo league "<your demo league code>" so you can see the weekly TD pool (TD Pool tab) and posted tickets (Tickets tab). To post a ticket: Home → Post a ticket → Paste the bet, or share a screenshot to Pool’d from the Photos share sheet. Account deletion: Home → tap your initials (top right) → Delete account.

Version release: "Manually release this version" (you choose the day it goes live).
```

## How the shell behaves

- **Login** is the normal email + password screen; Supabase's cookies are
  first-party (the web view's origin is the real site) and persist across
  launches. Sign-up confirmation emails open in Safari — that's fine, the
  account is confirmed there and the person then signs in inside the app.
- **Pasting a ticket**: tapping the big box calls the native plugin. iOS asks
  *"Pool’d would like to paste from bet365"* → Allow. (Settings → Pool’d →
  *Paste from Other Apps* → Allow stops the question.) A refusal reads as an
  empty pasteboard and the sheet offers the photo picker.
- **Links** to any host other than the site leave the app (`target="_blank"`
  and cross-origin navigations both go to `UIApplication.open`). Never add
  sportsbook hosts to `server.allowNavigation`.
- **No service worker** in the shell (WKWebView needs App-Bound Domains for
  that, which would also block the ride links). `public/sw.js` is a no-op
  anyway.
- **Errors**: `src/app/not-found.tsx`, `error.tsx` and `global-error.tsx`
  render the dark field with a way home, since there is no address bar.
- **Detecting the shell** from the site: `window.Capacitor.isNativePlatform()`
  is true (client side only). There is no user-agent marker, and the server
  renders the same thing for the app and a browser — keep it that way (App
  Review 5.6).

## Updating Capacitor

```bash
npm install @capacitor/core@latest @capacitor/keyboard@latest
npm install -D @capacitor/cli@latest @capacitor/ios@latest
npx cap migrate          # only across major versions
npm run ios:sync
```

Never hand-edit `ios/App/CapApp-SPM/Package.swift`; the CLI owns it.
