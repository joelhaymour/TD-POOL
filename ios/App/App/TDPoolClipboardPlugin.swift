import Capacitor
import UIKit

/**
 Reads the whole pasteboard in one go for the ticket sheet.

 A sportsbook's share puts a picture of the slip *and* the link on the
 pasteboard. The web clipboard API inside a WKWebView needs the small "Paste"
 bubble tapped and reads one part at a time; the stock Capacitor clipboard
 plugin returns only the text when both are present. This returns both.

 iOS asks "Allow paste from <app>?" the first time (Settings › TD Pool › Paste
 from Other Apps changes that); a refusal simply reads as an empty pasteboard.
 The web side is src/lib/native/clipboard.ts.
 */
@objc(TDPoolClipboardPlugin)
public final class TDPoolClipboardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TDPoolClipboardPlugin"
    public let jsName = "TDPoolClipboard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise)
    ]

    @objc func read(_ call: CAPPluginCall) {
        let board = UIPasteboard.general
        // hasStrings / hasURLs / hasImages never trigger the paste prompt;
        // only the reads below do, and only when there is something to read.
        let hasSomething = board.hasStrings || board.hasURLs || board.hasImages
        var result: [String: Any] = [:]
        if board.hasStrings || board.hasURLs, let text = board.string ?? board.url?.absoluteString {
            result["text"] = text
        }
        if board.hasImages, let image = board.image,
           // JPEG keeps a phone screenshot well under a megabyte over the bridge;
           // the page shrinks it again before upload.
           let data = image.jpegData(compressionQuality: 0.9) {
            result["image"] = "data:image/jpeg;base64," + data.base64EncodedString()
        }
        // Something is there but nothing came back: the person (or the app's
        // paste setting) refused, and the sheet should say so rather than
        // "nothing on the clipboard".
        if hasSomething && result.isEmpty {
            result["denied"] = true
        }
        call.resolve(result)
    }
}
