import UIKit
import UniformTypeIdentifiers

/**
 "Pool’d" in a sportsbook's share sheet. Collects the slip picture and the
 link, leaves them in the ShareInbox, and opens the app on its /share
 screen, where you pick the league(s) and post.
 */
final class ShareViewController: UIViewController {
    private var handedOff = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0xf2 / 255, green: 0xf3 / 255, blue: 0xee / 255, alpha: 1)
        let label = UILabel()
        label.text = "Opening Pool’d…"
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textColor = UIColor(red: 0x12 / 255, green: 0x17 / 255, blue: 0x0f / 255, alpha: 1)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !handedOff else { return }
        handedOff = true
        Task { await handOff() }
    }

    private func handOff() async {
        var image: Data?
        var texts: [String] = []
        for item in extensionContext?.inputItems as? [NSExtensionItem] ?? [] {
            if let t = item.attributedContentText?.string, !t.isEmpty { texts.append(t) }
            for provider in item.attachments ?? [] {
                if image == nil, provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    image = await loadImage(provider)
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
                       !url.isFileURL {
                        texts.append(url.absoluteString)
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let s = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                        texts.append(s)
                    }
                }
            }
        }
        ShareInbox.save(image: image, text: texts.joined(separator: "\n"))
        await MainActor.run {
            openApp(URL(string: "poold://share")!)
            // Give the system a beat to start the app before this sheet goes away.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    /// The picture as JPEG bytes, whatever form the sharing app handed it over in.
    private func loadImage(_ provider: NSItemProvider) async -> Data? {
        guard let item = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier) else { return nil }
        var picture: UIImage?
        if let url = item as? URL { picture = UIImage(contentsOfFile: url.path) }
        else if let data = item as? Data { picture = UIImage(data: data) }
        else if let img = item as? UIImage { picture = img }
        return picture?.jpegData(compressionQuality: 0.9)
    }

    /// Extensions may not call UIApplication.shared, but the app object is in
    /// the responder chain; ask it to open our URL scheme.
    private func openApp(_ url: URL) {
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if let app = current as? UIApplication, app.responds(to: selector) {
                typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, (@convention(block) (Bool) -> Void)?) -> Void
                let open = unsafeBitCast(app.method(for: selector), to: Open.self)
                open(app, selector, url as NSURL, NSDictionary(), nil)
                return
            }
            responder = current.next
        }
    }
}
