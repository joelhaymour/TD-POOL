# TD Pool on iPhone

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

The same web changes also make the site a better **home-screen app**: on any
iPhone, open the site in Safari → Share → *Add to Home Screen*. That needs no
Apple account and works today.

## Layout

| Path | What it is |
| --- | --- |
| `capacitor.config.ts` | App id `com.joelhaymour.tdpool`, name, which site the shell loads (`server.url`). |
| `ios/App/App.xcodeproj` | The Xcode project. Open it, pick your team, run. |
| `ios/App/App/MainViewController.swift` | Registers the plugin, turns on swipe-back, injects `TD_POOL_SITE`. |
| `ios/App/App/TDPoolClipboardPlugin.swift` | Native pasteboard read (picture + text). Web side: `src/lib/native/clipboard.ts`. |
| `ios/App/App/Info.plist` | Portrait only, dark UI, photo/camera usage strings, no-encryption flag. |
| `ios/App/App/Assets.xcassets` | App icon + launch image, generated. |
| `ios/App/CapApp-SPM` | Swift package pulling Capacitor and the keyboard plugin (no CocoaPods). |
| `native/make-artwork.swift` | Draws the icon/splash/PWA PNGs from the shapes in `public/icon.svg`. |
| `native/assets/` | 1024px icon and 2732px splash sources for `@capacitor/assets`. |
| `native/www/` | The only bundled pages: a placeholder and the offline page. |
| `src/app/privacy/page.tsx` | Public privacy notice — App Store Connect and TestFlight ask for its URL. |

## Commands

```bash
npm install                      # once per clone: the Swift package points at node_modules/@capacitor/keyboard
npm run ios:sync                 # writes ios/App/App/capacitor.config.json + copies native/www (run after changing capacitor.config.ts)
npm run ios:open                 # opens the project in Xcode
npm run ios:artwork              # re-draw the PNGs after editing native/make-artwork.swift
npm run ios:assets               # push native/assets into the Xcode asset catalog
```

To point a build at **staging** instead of production:

```bash
CAP_SERVER_URL=https://td-pool-v2.vercel.app npm run ios:sync
```

Run `npm run ios:sync` again (no variable) before committing — the committed
`ios/App/App/capacitor.config.json` must carry the production address.

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
   signing* → Team: your Personal Team. Xcode registers the bundle id.
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
   iOS, name **TD Pool**, bundle id `com.joelhaymour.tdpool`, SKU `tdpool`.
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

### 3. App Store (optional)

The App Store adds full App Review. Two guidelines matter for this app:

- **4.2 Minimum functionality** — Apple rejects "a repackaged website". The
  shell adds native pieces (pasteboard plugin, keyboard handling, gestures,
  offline page), but a reviewer may still push back. If they do, TestFlight
  or **Unlisted App Distribution**
  (<https://developer.apple.com/support/unlisted-app-distribution/>, an App
  Store link that isn't searchable, no 90-day expiry) are the fallbacks.
- **5.3 Gambling** — TD Pool never takes a wager or moves money; say exactly
  that in *App Review Information → Notes*: "Bet tracker for a private
  friends league. No wagering, no money handled. 'Ride' links open the user's
  own licensed sportsbook app." Rate the app 17+ and answer *Gambling and
  Contests: Infrequent/Mild* honestly. Keep the app free with no in-app
  purchases.

You'll also need screenshots (Xcode → Simulator → ⌘S on an iPhone 17 Pro Max
and an iPhone SE-size device) and the privacy URL above.

## How the shell behaves

- **Login** is the normal email + password screen; Supabase's cookies are
  first-party (the web view's origin is the real site) and persist across
  launches. Sign-up confirmation emails open in Safari — that's fine, the
  account is confirmed there and the person then signs in inside the app.
- **Pasting a ticket**: tapping the big box calls the native plugin. iOS asks
  *"TD Pool would like to paste from bet365"* → Allow. (Settings → TD Pool →
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
- **Detecting the shell** from the site: the user agent ends in `TDPoolApp`
  (`appendUserAgent`) and `window.Capacitor.isNativePlatform()` is true.

## Updating Capacitor

```bash
npm install @capacitor/core@latest @capacitor/keyboard@latest
npm install -D @capacitor/cli@latest @capacitor/ios@latest
npx cap migrate          # only across major versions
npm run ios:sync
```

Never hand-edit `ios/App/CapApp-SPM/Package.swift`; the CLI owns it.
