import AppKit
import CoreGraphics
import CoreMedia
import DesktopCapture
import ScreenCaptureKit

/// A display the user can choose. Nothing about the apps on it is known.
struct DisplayChoice: Identifiable, Equatable {
    let id: CGDirectDisplayID
    let name: String?
    let frame: CGRect
    let isMain: Bool

    var label: String {
        "\(name ?? "Display \(id)") — \(Int(frame.width))×\(Int(frame.height)) pt" + (isMain ? ", main" : "")
    }
}

/// Explicit display choice, screen-recording permission and Start/Stop for one capture at a
/// time. Live claims end synchronously: Stop, a stream error or a disconnected display closes
/// the run's gate before anything is awaited.
@MainActor
final class CaptureController: ObservableObject {
    enum Phase: Equatable {
        case idle
        case starting
        case capturing
        case stopping
        case ended(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var permissionGranted = CGPreflightScreenCaptureAccess()
    @Published private(set) var displays: [DisplayChoice] = []
    /// Nil until the user chooses; no display is selected for them.
    @Published var selectedDisplayID: CGDirectDisplayID?
    @Published private(set) var status: SessionStatus?
    @Published private(set) var sessionDirectory: URL?
    @Published private(set) var message: String?
    /// `HostClock` seconds, refreshed every second so freshness ages keep counting without callbacks.
    @Published private(set) var now = HostClock.now()

    let settings = CaptureSettings.engineeringDefaults
    private var active: CaptureRun?
    private var shown: CaptureRun?
    private var observers: [NSObjectProtocol] = []
    private var ticker: Timer?
    /// A sleep that arrived while starting, before there was a run to end.
    private var sleptWhileStarting = false

    init() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.screensChanged() }
        })
        observers.append(center.addObserver(forName: NSApplication.willTerminateNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.terminate() }
        })
        // The host clock does not advance during sleep, so a sleep could never show as a gap:
        // capture ends before it instead.
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.systemWillSleep() }
        })
        let ticker = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.now = HostClock.now() }
        }
        RunLoop.main.add(ticker, forMode: .common)
        self.ticker = ticker
    }

    var canChooseDisplay: Bool { active == nil && phase != .starting }
    var canStart: Bool { canChooseDisplay && selectedDisplayID != nil }
    var canStop: Bool { active != nil && (phase == .starting || phase == .capturing) }

    var freshness: Freshness {
        Freshness.judge(status, capturing: phase == .capturing && active?.gate.isOpen == true, now: now)
    }

    // MARK: - Permission

    func refreshPermission() {
        permissionGranted = CGPreflightScreenCaptureAccess()
    }

    func requestPermission() {
        permissionGranted = CGRequestScreenCaptureAccess()
        message = permissionGranted ? nil
            : "macOS did not report access. Allow this app under Privacy & Security > Screen & System Audio Recording; macOS may require quitting and reopening it."
    }

    func openPrivacySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Displays

    func refreshDisplays() {
        refreshPermission()
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                displays = content.displays.map { display in
                    DisplayChoice(id: display.displayID, name: Self.screenName(display.displayID),
                                  frame: display.frame, isMain: CGDisplayIsMain(display.displayID) != 0)
                }
                if let selected = selectedDisplayID, !displays.contains(where: { $0.id == selected }), active == nil {
                    selectedDisplayID = nil
                }
            } catch {
                displays = []
                message = "Displays could not be listed: \(StopReason(error).summary)"
            }
        }
    }

    // MARK: - Start and Stop

    func start() {
        guard canStart, let displayID = selectedDisplayID else { return }
        phase = .starting
        message = nil
        sleptWhileStarting = false
        Task { await begin(displayID) }
    }

    func stop() {
        guard canStop else { return }
        end("user_stop")
    }

    func revealSession() {
        if let sessionDirectory {
            NSWorkspace.shared.activateFileViewerSelecting([sessionDirectory])
        }
    }

    private func begin(_ displayID: CGDirectDisplayID) async {
        let preflight = CGPreflightScreenCaptureAccess()
        permissionGranted = preflight
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            phase = .ended("Not started: displays unavailable. \(StopReason(error).summary)")
            return
        }
        // No await follows until the run is active, so a later sleep reaches end().
        guard !sleptWhileStarting else {
            phase = .ended("Not started: the Mac went to sleep while capture was starting.")
            return
        }
        guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
            phase = .ended("Not started: the selected display is no longer available.")
            refreshDisplays()
            return
        }
        // The whole display, with no window excluded: this app's own windows are captured
        // whenever they are visible on it.
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let info = SCShareableContent.info(for: filter)
        let scale = Double(info.pointPixelScale)
        let width = Int((Double(info.contentRect.width) * scale).rounded())
        let height = Int((Double(info.contentRect.height) * scale).rounded())
        let configuration = SCStreamConfiguration()
        configuration.width = width
        configuration.height = height
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.colorSpaceName = CGColorSpace.sRGB
        configuration.minimumFrameInterval = CMTime(seconds: settings.minimumFrameInterval, preferredTimescale: 600)
        configuration.showsCursor = settings.showsCursor
        configuration.capturesAudio = false
        let facts = DisplayFacts(
            displayID: displayID, name: Self.screenName(displayID), frame: RecordedRect(display.frame),
            pointPixelScale: scale, requestedWidth: width, requestedHeight: height,
            rotationDegrees: CGDisplayRotation(displayID), isMain: CGDisplayIsMain(displayID) != 0,
            scope: "whole display; no window excluded, so this app's windows are captured when visible; cursor "
                + (settings.showsCursor ? "shown" : "hidden") + "; BGRA buffers requested in sRGB; no audio")

        let recorder: CaptureRecorder
        do {
            recorder = try CaptureRecorder(root: Self.storageRoot, display: facts, settings: settings,
                                           permissionPreflightAtStart: preflight)
        } catch {
            phase = .ended("Not started: the session could not be created. \(error.localizedDescription)")
            return
        }
        let run = CaptureRun(displayID: displayID, recorder: recorder, controller: self)
        let stream = SCStream(filter: filter, configuration: configuration, delegate: run)
        shown = run
        sessionDirectory = recorder.directory
        do {
            try stream.addStreamOutput(run, type: .screen, sampleHandlerQueue: run.queue)
        } catch {
            // No stream runs, so nothing else touches the recorder yet.
            let host = HostClock.now()
            recorder.finish(reason: "start_failed", detail: StopReason(error).summary, liveEndedHost: host,
                            host: host, wall: Date())
            status = recorder.status
            phase = .ended("Not started: \(StopReason(error).summary)")
            return
        }
        run.scStream = stream
        // Nothing runs on the queue until the stream starts, so the first status can be read here.
        status = recorder.status
        now = HostClock.now()
        active = run

        do {
            try await stream.startCapture()
        } catch {
            if run.gate.close("start_failed", host: HostClock.now()) {
                run.finish(detail: StopReason(error).summary)
            }
            return
        }
        let startedHost = HostClock.now()
        let startedWall = Date()
        run.streamStarted = true
        guard run.gate.isOpen else {
            // Stopped while starting: the stop path could not stop a stream that had not started.
            let problem = await Self.stopStream(run)
            run.note("stream_stopped_after_start_returned",
                     detail: ["started_host": String(startedHost), "problem": problem ?? "none"])
            return
        }
        phase = .capturing
        run.started(host: startedHost, wall: startedWall)
    }

    /// Ends live claims now, before anything is awaited, then stops the stream and writes the
    /// ending. Does nothing if this run's live claims have already ended.
    private func end(_ reason: String, detail: String? = nil) {
        guard let run = active, run.gate.close(reason, host: HostClock.now()) else { return }
        phase = .stopping
        Task {
            let problem = await Self.stopStream(run)
            let details = [detail, problem].compactMap { $0 }
            run.finish(detail: details.isEmpty ? nil : details.joined(separator: "; "))
        }
    }

    /// Stops a started stream once per run, whichever path asks first.
    private static func stopStream(_ run: CaptureRun) async -> String? {
        guard run.streamStarted, !run.stopRequested, let stream = run.scStream else { return nil }
        run.stopRequested = true
        do {
            try await stream.stopCapture()
            return nil
        } catch {
            return "stopCapture failed: \(StopReason(error).summary)"
        }
    }

    // MARK: - Reports from the run

    func receive(_ status: SessionStatus, from run: CaptureRun, ended: Bool) {
        if run === shown {
            // The status holds host times read after the last tick; judge it against a later `now`.
            now = HostClock.now()
            self.status = status
        }
        if ended, run === active {
            active = nil
            let ending = status.ending
            phase = .ended("Stopped: \(ending?.reason ?? "unknown")" + (ending?.detail.map { " — \($0)" } ?? ""))
        }
    }

    func streamStopped(_ run: CaptureRun, reason: StopReason, closedHere: Bool) {
        if closedHere {
            if run === active {
                phase = .stopping
            }
            // The stream has already stopped; there is nothing to await.
            run.finish(detail: reason.summary)
        } else {
            run.note("stream_error_after_live_ended", detail: ["reason": reason.summary])
        }
    }

    // MARK: - System events

    private func systemWillSleep() {
        if active == nil, phase == .starting {
            sleptWhileStarting = true
        } else {
            end("system_sleep", detail: "the Mac went to sleep; the host clock does not advance during sleep")
        }
    }

    private func screensChanged() {
        if let run = active {
            if let online = Self.onlineDisplays(), !online.contains(run.displayID) {
                end("display_disconnected", detail: "the display left the online display list")
            } else {
                run.note("display_parameters_changed", detail: Self.displayParameters(run.displayID))
            }
        }
        refreshDisplays()
    }

    /// Writes the ending before the process exits, also when another ending is still pending
    /// (Stop awaiting `stopCapture`). The gate keeps its first reason; a second finish does nothing.
    private func terminate() {
        guard let run = active else { return }
        run.gate.close("app_quit", host: HostClock.now())
        run.finish(detail: "the app quit; stopping the stream was not awaited", wait: true)
    }

    // MARK: - Helpers

    static var storageRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "CompanionDesktop/Capture", directoryHint: .isDirectory)
    }

    private static func screenName(_ id: CGDirectDisplayID) -> String? {
        NSScreen.screens.first { screen in
            (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == id
        }?.localizedName
    }

    /// The display's current parameters. The stream keeps its configured output size.
    private static func displayParameters(_ id: CGDirectDisplayID) -> [String: String] {
        let bounds = CGDisplayBounds(id)
        var detail = [
            "rotation_degrees": String(CGDisplayRotation(id)),
            "bounds_points": "\(bounds.origin.x),\(bounds.origin.y) \(bounds.width)x\(bounds.height)",
            "note": "screen parameters changed during capture; the stream keeps its configured output size; how later frames are scaled is unverified",
        ]
        if let mode = CGDisplayCopyDisplayMode(id) {
            detail["mode_pixels"] = "\(mode.pixelWidth)x\(mode.pixelHeight)"
        }
        return detail
    }

    /// Nil when the list could not be read, so a failed query never looks like a disconnection.
    private static func onlineDisplays() -> Set<CGDirectDisplayID>? {
        var count: UInt32 = 0
        guard CGGetOnlineDisplayList(0, nil, &count) == .success else { return nil }
        var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
        guard CGGetOnlineDisplayList(count, &ids, &count) == .success else { return nil }
        return Set(ids.prefix(Int(count)))
    }
}
