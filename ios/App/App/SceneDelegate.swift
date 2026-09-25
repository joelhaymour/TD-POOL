import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Launched by the share extension: open the share screen once loaded.
        if let url = connectionOptions.urlContexts.first?.url, let path = Self.appPath(for: url) {
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

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
