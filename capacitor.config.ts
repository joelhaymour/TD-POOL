import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS app (Pool’d) is a native shell around the live site: the web view loads TD
 * Pool straight from Vercel, so every deploy reaches the app with no App Store
 * release. `npx cap sync ios` bakes the address below into the Xcode project;
 * point a build at staging with
 * `CAP_SERVER_URL=https://td-pool-v2.vercel.app npx cap sync ios`.
 */
export const PRODUCTION_SITE = "https://td-pool-five.vercel.app";
const serverUrl = process.env.CAP_SERVER_URL?.trim() || PRODUCTION_SITE;

const config: CapacitorConfig = {
  appId: "com.joelhaymour.poold",
  appName: "Pool’d",
  // Only the offline fallback lives here; the app itself is the site.
  webDir: "native/www",
  backgroundColor: "#f2f3ee",
  zoomEnabled: false,
  // Lets the site tell the shell apart from Safari (`navigator.userAgent`).
  appendUserAgent: "TDPoolApp",
  server: {
    url: serverUrl,
    // Only a local dev server is ever plain http (the simulator can reach the
    // Mac's `next dev` on 127.0.0.1); Info.plist allows local networking.
    cleartext: serverUrl.startsWith("http:"),
    errorPath: "error.html",
  },
  ios: {
    contentInset: "never",
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
  },
};

export default config;
