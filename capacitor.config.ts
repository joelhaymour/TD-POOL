import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS app (Pool’d) is a native shell around the Pool’d web service: the web
 * view loads the site from Vercel. `npm run ios:sync` bakes the production
 * address into the Xcode project (it ignores CAP_SERVER_URL);
 * `npm run ios:sync:staging` points a test build at the test site instead.
 * Never archive a staging build.
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
  server: {
    url: serverUrl,
    errorPath: "error.html",
  },
  plugins: {
    // Show a notification even while the app is open.
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
  ios: {
    contentInset: "never",
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
  },
};

export default config;
