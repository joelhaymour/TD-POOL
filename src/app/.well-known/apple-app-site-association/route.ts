/**
 * Tells iOS that Pool’d links open in the Pool’d app when it's installed
 * (universal links). The app claims the domain in ios/App/App/App.entitlements
 * and routes the link in SceneDelegate.linkPath. API routes stay on the web.
 */
const APP_ID = "CAA5L944T6.com.joelhaymour.poold";

export function GET() {
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
            { "/": "/api/*", exclude: true },
            { "/": "/.well-known/*", exclude: true },
            { "/": "*" },
          ],
        },
      ],
    },
  });
}
