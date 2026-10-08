import UIKit
import Capacitor
import UserNotifications

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    /// The share the app last opened /share for, so each share opens it once.
    private var openedShare: Date?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Opened by tapping a Pool’d link (an invite in Messages), or with a
        // bet waiting from the share extension: open that screen once the app
        // has loaded.
        if let path = connectionOptions.userActivities.lazy.compactMap(Self.linkPath(for:)).first {
            MainViewController.pendingPath = path
        } else if let at = ShareInbox.pendingSince() {
            openedShare = at
            clearShareNotification()
            MainViewController.pendingPath = "/share"
        }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    /// Back from a sportsbook after sharing a bet to Pool’d (by its
    /// notification or the app switcher): go to the post screen with it.
    func sceneDidBecomeActive(_ scene: UIScene) {
        guard let at = ShareInbox.pendingSince(), at != openedShare else { return }
        openedShare = at
        clearShareNotification()
        (window?.rootViewController as? MainViewController)?.open(path: "/share")
    }

    private func clearShareNotification() {
        UNUserNotificationCenter.current()
            .removeDeliveredNotifications(withIdentifiers: [ShareInbox.notificationId])
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    /// A universal link (https://td-pool-five.vercel.app/…) → its path and query,
    /// to load in the app. The domain is listed in App.entitlements and the
    /// site answers /.well-known/apple-app-site-association.
    static func linkPath(for activity: NSUserActivity) -> String? {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = activity.webpageURL,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath
        return parts.percentEncodedQuery.map { "\(path)?\($0)" } ?? path
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if let path = Self.linkPath(for: userActivity) {
            (window?.rootViewController as? MainViewController)?.open(path: path)
            return
        }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
