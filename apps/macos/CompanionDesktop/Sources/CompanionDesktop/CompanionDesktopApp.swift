import AppKit
import DesktopCapture
import SwiftUI

@main
struct CompanionDesktopApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var controller: CaptureController

    init() {
        let controller = CaptureController()
        _controller = StateObject(wrappedValue: controller)
        AppDelegate.capture = controller
    }

    var body: some Scene {
        Window("Companion Desktop", id: "main") {
            ContentView()
                .environmentObject(controller)
        }
        .commands {
            CommandMenu("Capture") {
                Button("Start Capture") { controller.start() }
                    .keyboardShortcut("r", modifiers: [.command, .option])
                    .disabled(!controller.canStart)
                Button("Stop Capture") { controller.stop() }
                    .keyboardShortcut(".", modifiers: [.command, .option])
                    .disabled(!controller.canStop)
            }
        }

        // Stop stays reachable from the menu bar while other apps are in front.
        MenuBarExtra {
            MenuBarContent()
                .environmentObject(controller)
        } label: {
            Image(systemName: controller.freshness.symbol)
        }
    }
}

struct MenuBarContent: View {
    @EnvironmentObject private var controller: CaptureController
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text(summary)
        Text(controller.linkStatus.menuLine)
        UnsavedInkMenuItem(ink: controller.ink)
        Button("Stop Capture") { controller.stop() }
            .disabled(!controller.canStop)
        Button("Show Companion Desktop") {
            openWindow(id: "main")
            NSApp.activate()
        }
        Divider()
        Button("Quit Companion Desktop") { NSApp.terminate(nil) }
    }

    private var summary: String {
        switch controller.freshness {
        case .notLive: return "Not live"
        case .unknown: return "Capturing — current screen unknown"
        case .unavailable: return "Capturing — no current pixels"
        case .pixelAgeUnknown: return "Capturing — pixel age unknown, not live"
        case .stale: return "Capturing — pixels not recently confirmed, not live"
        case .live: return "Live"
        }
    }
}

/// A menu line while ink exists only in memory; details are in the main window.
struct UnsavedInkMenuItem: View {
    @ObservedObject var ink: InkController

    var body: some View {
        if ink.unsavedWarning != nil {
            Text("Ink not saved — see Companion Desktop")
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Set once, when the app is created.
    static weak var capture: CaptureController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Also a regular, frontmost app when started as a bare executable (`swift run`).
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
    }

    /// Capture continues with the window closed; Stop and Quit remain in the menu bar.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    /// Whether a Quit is waiting for the link's bounded Stop.
    private var quitPending = false

    /// Every normal Quit (menu, ⌘Q, logout) ends capture and ink input first; it is then held while
    /// ink exists only in memory, until that ink is saved, exported or explicitly discarded. A
    /// linked stream gets one bounded wait for its server Stop; another Quit meanwhile does not
    /// skip it. What does not finish is reconciled at the next launch. The subscription connector,
    /// this app's own child, is ended too; nothing is signed out.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let capture = Self.capture else { return .terminateNow }
        guard !quitPending else { return .terminateCancel }
        guard capture.quitRequested() else { return .terminateCancel }
        quitPending = true
        let link = capture.link
        let ask = capture.ask.link
        Task { @MainActor in
            async let connector: Void = ask.shutdown()
            await link.quit(within: 10)
            await connector
            self.quitPending = false
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
