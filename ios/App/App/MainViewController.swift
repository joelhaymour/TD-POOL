import UIKit
import WebKit
import Capacitor

/**
 The one screen in the app: Capacitor's web view pointed at the live site.

 On top of the stock controller — the swipe-from-the-left-edge back gesture
 people expect from a native app, rubber-band scrolling on every screen (even
 short ones), pull-to-refresh, the pasteboard plugin, and a `TD_POOL_SITE`
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
        // Behind the page (while it loads, and past the edges when it
        // rubber-bands): the site's field colour, light or dark with the phone.
        let field = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x0e / 255, green: 0x11 / 255, blue: 0x0d / 255, alpha: 1)
                : UIColor(red: 0xf2 / 255, green: 0xf3 / 255, blue: 0xee / 255, alpha: 1)
        }
        view.backgroundColor = field
        webView?.backgroundColor = field
        webView?.scrollView.backgroundColor = field
        if let scrollView = webView?.scrollView {
            scrollView.bounces = true
            scrollView.alwaysBounceVertical = true
            let refresh = UIRefreshControl()
            refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
            scrollView.refreshControl = refresh
        }
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

    /// Pull down to refresh: the site reloads the screen's data in place
    /// (`window.__pooldRefresh`, src/components/native-refresh.tsx); a page
    /// without it (the offline page) reloads whole.
    @objc private func pullToRefresh(_ control: UIRefreshControl) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let script = "typeof window.__pooldRefresh === 'function' ? (window.__pooldRefresh(), true) : false"
        webView?.evaluateJavaScript(script) { [weak self] result, _ in
            if (result as? Bool) != true { self?.webView?.reload() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { control.endRefreshing() }
        }
    }

    /// Load a path of the live site, e.g. "/share".
    func open(path: String) {
        guard let base = bridge?.config.serverURL,
              let url = URL(string: path, relativeTo: base)?.absoluteURL else { return }
        webView?.load(URLRequest(url: url))
    }
}
