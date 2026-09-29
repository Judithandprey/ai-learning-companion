import SafariServices
import UIKit
import WebKit

/// The containing app's only screen. It shows whether the Safari extension is on and offers
/// one button to open its Safari settings. The learner then returns to their original page in
/// Safari; this app opens no course page and sends nothing.
///
/// Replaces the packager's generated ViewController. It keeps the generated storyboard's
/// `webView` outlet and the `Main.html` page. The page's small script is injected here, because
/// the iOS template ships only Main.html and Style.css (run 36570494322).
class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    /// `show(state)` accepts: on, off, unknown, missing, settings-error.
    private static let pageScript = """
        function show(state) {
            document.body.dataset.state = state;
        }
        document.getElementById("open-settings").addEventListener("click", () => {
            webkit.messageHandlers.controller.postMessage("open-settings");
        });
        """

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.scrollView.isScrollEnabled = false
        webView.configuration.userContentController.add(self, name: "controller")
        webView.configuration.userContentController.addUserScript(
            WKUserScript(source: Self.pageScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!,
                            allowingReadAccessTo: Bundle.main.resourceURL!)
        // The learner may have just changed the setting in Settings or Safari.
        NotificationCenter.default.addObserver(self, selector: #selector(refreshState),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshState()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.body as? String == "open-settings" else { return }
        guard #available(iOS 26.2, *), let identifier = extensionIdentifier else {
            show("settings-error")
            return
        }
        Task {
            do {
                try await SFSafariSettings.openExtensionsSettings(forIdentifiers: [identifier])
            } catch {
                show("settings-error")
            }
        }
    }

    @objc private func refreshState() {
        guard let identifier = extensionIdentifier else {
            show("missing")
            return
        }
        guard #available(iOS 26.2, *) else {
            show("unknown")
            return
        }
        Task {
            do {
                let state = try await SFSafariExtensionManager.stateOfExtension(withIdentifier: identifier)
                show(state.isEnabled ? "on" : "off")
            } catch {
                show("unknown")
            }
        }
    }

    private func show(_ state: String) {
        webView.evaluateJavaScript("show('\(state)')")
    }

    /// Bundle identifier of the Safari web extension embedded in this app, read from the
    /// built app rather than assumed.
    private var extensionIdentifier: String? {
        guard let plugIns = Bundle.main.builtInPlugInsURL,
              let contents = try? FileManager.default.contentsOfDirectory(at: plugIns, includingPropertiesForKeys: nil),
              let appex = contents.first(where: { $0.pathExtension == "appex" }) else { return nil }
        return Bundle(url: appex)?.bundleIdentifier
    }
}
