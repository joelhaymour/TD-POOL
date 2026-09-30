import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Launched by the share extension, or by tapping a Pool’d link (an
        // invite in Messages): open that screen once the app has loaded.
        if let url = connectionOptions.urlContexts.first?.url, let path = Self.appPath(for: url) {
            MainViewController.pendingPath = path
        } else if let path = connectionOptions.userActivities.lazy.compactMap(Self.linkPath(for:)).first {
            MainViewController.pendingPath = path
        }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url, let path = Self.appPath(for: url) {
            (window?.rootViewController as? MainViewController)?.open(path: path)
            return
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    /// poold://share → "/share". Anything else is not ours to route.
    static func appPath(for url: URL) -> String? {
        guard url.scheme == "poold", url.host == "share" else { return nil }
        return "/share"
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
