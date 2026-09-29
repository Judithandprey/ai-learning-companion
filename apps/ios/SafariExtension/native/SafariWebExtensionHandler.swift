import Foundation

/// Native side of the Safari web extension.
///
/// This slice has no native bridge: the extension's JavaScript does not call
/// `browser.runtime.sendNativeMessage`. Any request that still arrives is completed with no
/// data, so nothing is acknowledged as saved, received or answered. Message contents are
/// never logged. The v0.1 `selection.submit` bridge is wired later under P0-08.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
