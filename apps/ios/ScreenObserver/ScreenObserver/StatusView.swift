import SwiftUI
import UIKit

/// Shows the latest broadcast session from the shared local store. Saved status and frames are
/// always shown as saved, with their times, never as a live view.
struct StatusView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var snapshot = CaptureSnapshot.load()
    private let refresh = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Capture only. AI is not connected and this app sends nothing. Kept frames are stored in this app's storage on the iPad, which iCloud or computer backups can include.")
                    HStack(spacing: 16) {
                        BroadcastPicker()
                            .frame(width: 60, height: 60)
                        Text("Start or stop the screen broadcast here. Choose Screen Observer in the system sheet. It can keep running while you use other apps, but the system or an error can also end it without notice; check Latest session below.")
                    }
                }

                Section("Latest session") {
                    Text(snapshot.summary)
                    if let status = snapshot.status {
                        row("Session", status.session)
                        row("Reported state", status.state)
                        row("Started", status.startedWallTime.formatted(date: .abbreviated, time: .standard))
                        row("Last update", status.updatedWallTime.formatted(date: .abbreviated, time: .standard))
                        row("Video buffers received", status.videoBuffers)
                        row("Keyframes kept", status.keyframesKept)
                        row("Not retained (luma-grid heuristic)", status.notRetainedByHeuristic)
                        row("Not retained (minimum interval)", status.notRetainedWithinInterval)
                        row("Not retained (session cap)", status.notRetainedAfterCap)
                        row("Not retained (no image)", status.notRetainedWithoutImage)
                        row("Not retained (attempts stopped)", status.notRetainedAfterStop)
                        row("Keyframe write failures", status.keyframeWriteFailures)
                        row("Event log write failures (log incomplete)", status.eventWriteFailures)
                        row("Gaps recorded", status.gaps)
                        row("Audio buffers (not captured)", status.audioBuffersNotCaptured)
                        row("Kept size", ByteCountFormatter.string(fromByteCount: Int64(status.bytesKept), countStyle: .file))
                        row("App on screen", "unknown (not reported by the broadcast)")
                        if let reason = status.stoppedReason {
                            Text("Keyframe attempts stopped: \(reason)")
                        }
                    }
                }

                if let frame = snapshot.lastFrame, let record = snapshot.status?.lastKeyframe {
                    Section("Last kept frame (saved, not live)") {
                        Image(uiImage: frame)
                            .resizable()
                            .scaledToFit()
                            .accessibilityLabel("Last kept screen frame")
                        Text("Frame \(record.sequence), \(record.width)×\(record.height), shown unrotated from a lossless PNG (\(record.byteLength) bytes); orientation value \(record.orientation.map { String($0) } ?? "not reported").")
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("Screen Observer")
        }
        .onReceive(refresh) { _ in
            if scenePhase == .active { snapshot = .load() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { snapshot = .load() }
        }
    }

    private func row(_ label: String, _ value: CustomStringConvertible) -> some View {
        LabeledContent(label, value: value.description)
    }
}

/// What the app can honestly say about the latest session.
struct CaptureSnapshot {
    var summary: String
    var status: CaptureStatus?
    var lastFrame: UIImage?

    static func load(now: Date = Date()) -> CaptureSnapshot {
        guard let root = CaptureStore.root else {
            return CaptureSnapshot(summary: "Shared storage is unavailable in this build (no App Group), so no session can be shown.")
        }
        let sessions = ((try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: [.isDirectoryKey])) ?? [])
            .filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        guard let latest = sessions.last else {
            return CaptureSnapshot(summary: "No broadcast session yet.")
        }
        guard let data = try? Data(contentsOf: latest.appending(path: "status.json")),
              let status = try? CaptureStore.decoder.decode(CaptureStatus.self, from: data) else {
            return CaptureSnapshot(summary: "The latest session's status could not be read.")
        }
        let frame = status.lastKeyframe.flatMap {
            UIImage(contentsOfFile: latest.appending(path: $0.file).path(percentEncoded: false))
        }
        return CaptureSnapshot(summary: summary(for: status, now: now), status: status, lastFrame: frame)
    }

    private static func summary(for status: CaptureStatus, now: Date) -> String {
        let age = Int(now.timeIntervalSince(status.updatedWallTime))
        switch status.state {
        case "finished":
            return "The broadcast finished. Everything shown is saved, not live."
        case "paused":
            return "The broadcast reported a pause \(age) s ago. Nothing is shown as live."
        default:
            if Double(age) > CaptureStatus.staleAfter {
                return "No update for \(age) s. The broadcast may have ended without notice, or no frames are arriving; the state is unknown. Nothing is shown as live."
            }
            return "The broadcast reported activity \(age) s ago. The frame below is the last kept frame, not a live view."
        }
    }
}
