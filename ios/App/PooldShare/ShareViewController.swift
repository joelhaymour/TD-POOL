import UIKit
import UniformTypeIdentifiers
import UserNotifications

/**
 "Pool’d" in a sportsbook's share sheet. Collects the slip picture and the
 link and leaves them in the ShareInbox. Share extensions can't open their
 app, so this says where to finish: open Pool’d (it goes straight to the post
 screen, where you pick the league(s) and post). With notifications on, a
 "tap to post" notification does the opening.
 */
final class ShareViewController: UIViewController {
    private var handedOff = false
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let doneButton = UIButton(type: .system)

    private static let field = UIColor(red: 0xf2 / 255, green: 0xf3 / 255, blue: 0xee / 255, alpha: 1)
    private static let ink = UIColor(red: 0x12 / 255, green: 0x17 / 255, blue: 0x0f / 255, alpha: 1)
    private static let muted = UIColor(red: 0x54 / 255, green: 0x5b / 255, blue: 0x53 / 255, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.field

        titleLabel.text = "Saving to Pool’d…"
        titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        titleLabel.textColor = Self.ink
        titleLabel.textAlignment = .center

        detailLabel.font = .systemFont(ofSize: 15)
        detailLabel.textColor = Self.muted
        detailLabel.textAlignment = .center
        detailLabel.numberOfLines = 0

        var config = UIButton.Configuration.filled()
        config.title = "Done"
        config.cornerStyle = .capsule
        config.baseBackgroundColor = Self.ink
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 40, bottom: 14, trailing: 40)
        doneButton.configuration = config
        doneButton.isHidden = true
        doneButton.addTarget(self, action: #selector(done), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [titleLabel, detailLabel, doneButton])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.setCustomSpacing(24, after: detailLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor, constant: -16),
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
        let notified = await postReadyNotification()
        await MainActor.run {
            titleLabel.text = "Saved to Pool’d"
            detailLabel.text = notified
                ? "Tap the Pool’d notification, or open Pool’d, to choose your leagues and post it."
                : "Open Pool’d to choose your leagues and post it."
            doneButton.isHidden = false
        }
    }

    /// "Tap to post" — only when notifications are already allowed for Pool’d.
    private func postReadyNotification() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            return false
        }
        let content = UNMutableNotificationContent()
        content.title = "Your bet is ready to post"
        content.body = "Tap to choose your leagues and post it in Pool’d."
        let request = UNNotificationRequest(identifier: ShareInbox.notificationId, content: content, trigger: nil)
        do {
            try await center.add(request)
            return true
        } catch {
            return false
        }
    }

    @objc private func done() {
        extensionContext?.completeRequest(returningItems: nil)
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
}
