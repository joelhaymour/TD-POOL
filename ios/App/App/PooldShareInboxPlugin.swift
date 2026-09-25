import Capacitor
import Foundation

/**
 Lets the /share screen collect what the share extension left in the
 ShareInbox: the slip picture (as a data URL) and the shared text/link.
 Web side: src/lib/native/share-inbox.ts.
 */
@objc(PooldShareInboxPlugin)
public final class PooldShareInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PooldShareInboxPlugin"
    public let jsName = "PooldShareInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise)
    ]

    @objc func take(_ call: CAPPluginCall) {
        guard let payload = ShareInbox.take() else {
            call.resolve([:])
            return
        }
        var result: [String: Any] = ["text": payload.text, "at": payload.at.timeIntervalSince1970 * 1000]
        if let image = payload.image {
            result["image"] = "data:image/jpeg;base64," + image.base64EncodedString()
        }
        call.resolve(result)
    }
}
