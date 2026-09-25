import UIKit

/**
 The hand-off between the share extension and the app. The extension drops
 what a sportsbook shared (the slip picture and the link text) here, opens
 poold://share, and the app's /share screen takes it.

 Normally an App Group folder both targets can see. A build without the App
 Group entitlement (an unsigned simulator build) falls back to a private named
 pasteboard, which apps from the same developer share.
 */
enum ShareInbox {
    static let appGroup = "group.com.joelhaymour.poold"
    static let pasteboardName = UIPasteboard.Name("com.joelhaymour.poold.share")
    private static let metaType = "com.joelhaymour.poold.share-meta"

    private static var folder: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("share", isDirectory: true)
    }

    struct Payload {
        var image: Data?
        var text: String
        var at: Date
    }

    static func save(image: Data?, text: String) {
        let meta: [String: Any] = ["text": text, "at": Date().timeIntervalSince1970]
        let metaData = (try? JSONSerialization.data(withJSONObject: meta)) ?? Data()
        if let dir = folder {
            let fm = FileManager.default
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let imageURL = dir.appendingPathComponent("ticket.jpg")
            try? fm.removeItem(at: imageURL)
            if let image { try? image.write(to: imageURL) }
            try? metaData.write(to: dir.appendingPathComponent("payload.json"))
            return
        }
        guard let board = UIPasteboard(name: pasteboardName, create: true) else { return }
        var item: [String: Any] = [metaType: metaData]
        if let image { item["public.jpeg"] = image }
        board.items = [item]
    }

    /// What was shared, once: taking it clears it.
    static func take() -> Payload? {
        if let dir = folder {
            let fm = FileManager.default
            let metaURL = dir.appendingPathComponent("payload.json")
            let imageURL = dir.appendingPathComponent("ticket.jpg")
            guard let data = try? Data(contentsOf: metaURL),
                  let meta = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            let image = try? Data(contentsOf: imageURL)
            try? fm.removeItem(at: metaURL)
            try? fm.removeItem(at: imageURL)
            return Payload(image: image,
                           text: meta["text"] as? String ?? "",
                           at: Date(timeIntervalSince1970: meta["at"] as? Double ?? 0))
        }
        guard let board = UIPasteboard(name: pasteboardName, create: false),
              let item = board.items.first,
              let metaData = item[metaType] as? Data,
              let meta = try? JSONSerialization.jsonObject(with: metaData) as? [String: Any] else { return nil }
        let image = item["public.jpeg"] as? Data
        board.items = []
        return Payload(image: image,
                       text: meta["text"] as? String ?? "",
                       at: Date(timeIntervalSince1970: meta["at"] as? Double ?? 0))
    }
}
