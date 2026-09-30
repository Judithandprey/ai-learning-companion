import AppKit
import SwiftUI

@main
struct CompanionDesktopApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var controller = CaptureController()

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
        case .live: return "Live"
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Also a regular, frontmost app when started as a bare executable (`swift run`).
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
    }

    /// Capture continues with the window closed; Stop and Quit remain in the menu bar.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
}
