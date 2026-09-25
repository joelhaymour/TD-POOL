import UIKit
import WebKit
import Capacitor

/**
 The one screen in the app: Capacitor's web view pointed at the live site.

 On top of the stock controller — the swipe-from-the-left-edge back gesture
 people expect from a native app, the pasteboard plugin, and a `TD_POOL_SITE`
 global so the offline page (native/www/error.html) can send them back.
 */
final class MainViewController: CAPBridgeViewController {
    /// A screen to open once the app is up (set when a share launches it cold).
    static var pendingPath: String?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(TDPoolClipboardPlugin())
        bridge?.registerPluginInstance(PooldShareInboxPlugin())
        webView?.allowsBackForwardNavigationGestures = true
        guard let site = bridge?.config.serverURL.absoluteString,
              let json = try? JSONEncoder().encode(site),
              let literal = String(data: json, encoding: .utf8) else { return }
        let script = WKUserScript(source: "window.TD_POOL_SITE = \(literal);",
                                  injectionTime: .atDocumentStart,
                                  forMainFrameOnly: true)
        webView?.configuration.userContentController.addUserScript(script)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let path = MainViewController.pendingPath {
            MainViewController.pendingPath = nil
            open(path: path)
        }
    }

    /// Load a path of the live site, e.g. "/share".
    func open(path: String) {
        guard let base = bridge?.config.serverURL,
              let url = URL(string: path, relativeTo: base)?.absoluteURL else { return }
        webView?.load(URLRequest(url: url))
    }
}
