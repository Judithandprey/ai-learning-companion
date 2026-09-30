import CoreGraphics
import DesktopCapture
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var controller: CaptureController

    var body: some View {
        Form {
            Section("Screen recording permission") {
                Text(controller.permissionGranted
                     ? "macOS reports that this app may record the screen."
                     : "macOS does not report screen-recording access for this app yet.")
                HStack {
                    Button("Request Access") { controller.requestPermission() }
                    Button("Open Privacy Settings") { controller.openPrivacySettings() }
                    Button("Check Again") { controller.refreshPermission() }
                }
                Text("After access is granted, macOS may require quitting and reopening this app.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Display") {
                Picker("Display to capture", selection: $controller.selectedDisplayID) {
                    Text("Choose a display").tag(CGDirectDisplayID?.none)
                    ForEach(controller.displays) { display in
                        Text(display.label).tag(CGDirectDisplayID?.some(display.id))
                    }
                }
                .disabled(!controller.canChooseDisplay)
                Button("Refresh Displays") { controller.refreshDisplays() }
                    .disabled(!controller.canChooseDisplay)
                Text("The whole display is captured, including this window whenever it is visible. Which app is on screen is not identified; it is shown as unknown.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Capture") {
                HStack {
                    Button("Start Capture") { controller.start() }
                        .disabled(!controller.canStart)
                    Button("Stop Capture") { controller.stop() }
                        .disabled(!controller.canStop)
                }
                FreshnessLine(freshness: controller.freshness)
                Text("App on screen: unknown")
                if let status = controller.status {
                    StatusDetails(status: status, now: controller.now)
                    Button("Show Session Files") { controller.revealSession() }
                }
                if case .ended(let text) = controller.phase {
                    Text(text)
                }
                if let message = controller.message {
                    Text(message).foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 560, minHeight: 620)
        .task { controller.refreshDisplays() }
    }
}

extension Freshness {
    /// One symbol per case, shared by the window and the menu bar.
    var symbol: String {
        switch self {
        case .notLive: return "circle"
        case .unknown: return "questionmark.circle"
        case .unavailable: return "exclamationmark.triangle"
        case .live: return "record.circle"
        }
    }
}

struct FreshnessLine: View {
    let freshness: Freshness

    var body: some View {
        Label(text, systemImage: freshness.symbol)
    }

    private var text: String {
        switch freshness {
        case .notLive(let reason):
            return "Not live (\(reason))."
        case .unknown(let silent):
            return "Capturing, but no screen callback for \(seconds(silent)): the current screen is unknown. It may be unchanged, or frames may have stopped arriving."
        case .unavailable(let status, let age):
            return "A callback \(seconds(age)) ago reported \(status): no current screen pixels."
        case .live(let callbackAge, let pixelsAge):
            // Only an idle callback after the new pixels is a system report of no change.
            return "Live: the last new pixels arrived \(seconds(pixelsAge)) ago and no newer pixels have been delivered"
                + (callbackAge < pixelsAge ? "; a later callback \(seconds(callbackAge)) ago reported no change." : ".")
        }
    }
}

struct StatusDetails: View {
    let status: SessionStatus
    let now: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Session \(status.session) on \(status.display.name ?? "display \(status.display.displayID)")")
            Text("Callbacks: \(status.callbacks) — " + status.callbacksByStatus.sorted { $0.key < $1.key }
                .map { "\($0.key) \($0.value)" }.joined(separator: ", "))
            Text("Kept frames: \(status.keptFrames), \(ByteCountFormatter.string(fromByteCount: Int64(status.bytesKept), countStyle: .file)) of \(ByteCountFormatter.string(fromByteCount: Int64(status.settings.byteCap), countStyle: .file))")
            if let kept = status.lastKept {
                Text("Last kept: \(kept.file), \(kept.width)×\(kept.height) \(kept.pixelFormat), \(seconds(now - kept.callbackHost)) ago")
            }
            if !status.notRetained.isEmpty {
                Text("New pixels not kept: " + status.notRetained.sorted { $0.key < $1.key }
                    .map { "\($0.key) \($0.value)" }.joined(separator: ", "))
            }
            Text("Gaps recorded: \(status.gaps)")
            if status.callbacksAfterLiveEnded > 0 {
                Text("Callbacks after live ended (not kept): \(status.callbacksAfterLiveEnded)")
            }
            if status.eventWriteFailures + status.statusWriteFailures > 0 {
                Text("Write failures: \(status.eventWriteFailures) events, \(status.statusWriteFailures) status")
                    .foregroundStyle(.red)
            }
            if let reason = status.storeStoppedReason {
                Text(reason).foregroundStyle(.red)
            }
        }
        .font(.callout)
    }
}

func seconds(_ value: Double) -> String {
    "\(Int(max(0, value).rounded(.down))) s"
}
