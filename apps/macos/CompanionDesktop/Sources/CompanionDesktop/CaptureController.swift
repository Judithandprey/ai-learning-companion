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

private enum StartProblem: LocalizedError {
    case displayUnavailable

    var errorDescription: String? { "the selected display is no longer available" }
}

/// Explicit display choice, screen-recording permission and Start/Stop for one capture at a
/// time. Live claims end synchronously: Stop, a stream error, a disconnected display, sleep or quit
/// closes the gate before anything is awaited. The gate exists from the Start click, so Stop can
/// also cancel a Start that is still listing displays.
@MainActor
final class CaptureController: ObservableObject {
    enum Phase: Equatable {
        case idle
        case starting
        case capturing
        case stopping
        case ended(String)
    }

    @Published private(set) var phase: Phase = .idle {
        didSet {
            holdActivityWhileCapturing()
            inkFollowsCapture(from: oldValue)
        }
    }
    @Published private(set) var permissionGranted = CGPreflightScreenCaptureAccess()
    @Published private(set) var displays: [DisplayChoice] = []
    /// Nil until the user chooses; no display is selected for them.
    @Published var selectedDisplayID: CGDirectDisplayID?
    @Published private(set) var status: SessionStatus?
    @Published private(set) var sessionDirectory: URL?
    @Published private(set) var message: String?
    /// The development capture service link: separate from local capture, which never waits for it.
    @Published private(set) var linkStatus = CaptureLinkStatus(state: .idle)
    /// `HostClock` seconds, refreshed every second so freshness ages keep counting without callbacks.
    @Published private(set) var now = HostClock.now()

    let settings = CaptureSettings.engineeringDefaults
    /// The ink layer over the selected display; it exists only while capture runs.
    let ink = InkController()
    /// Links each explicit Start to the local capture service, when it is configured.
    let link = CaptureLink(config: CaptureHostConfig.load())
    /// The ChatGPT subscription connection and the card of a confirmed selection.
    let ask = AskController()
    private var active: CaptureRun?
    private var shown: CaptureRun?
    /// The gate of a Start that has no session yet; nil once the session exists.
    private var starting: LiveGate?
    /// Held from Start until the ending, so App Nap does not throttle the freshness ticker while
    /// the app is in the background. Idle system sleep stays allowed.
    private var activity: NSObjectProtocol?
    private typealias Session = (run: CaptureRun, stream: SCStream)
    private var observers: [NSObjectProtocol] = []
    private var ticker: Timer?

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
        ink.capture = self
        ink.ask = ask
        // Earlier unsettled streams are read, and Stopped if still live; nothing is resent and no
        // capture starts.
        let link = link
        Task { [weak self] in
            // In order: a later status is never replaced by an earlier one.
            await link.setStatusHandler { status in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.linkStatus = status }
                }
            }
            await link.reconcile()
        }
    }

    var canChooseDisplay: Bool { active == nil && phase != .starting }
    var canStart: Bool { canChooseDisplay && selectedDisplayID != nil }
    var canStop: Bool { (active != nil || starting != nil) && (phase == .starting || phase == .capturing) }

    var freshness: Freshness {
        Freshness.judge(status, capturing: phase == .capturing && active?.gate.isOpen == true, now: now)
    }

    /// Freshness judged at this moment rather than at the last one-second tick.
    func currentFreshness() -> Freshness {
        Freshness.judge(status, capturing: phase == .capturing && active?.gate.isOpen == true, now: HostClock.now())
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
        // The gate exists from the click, so Stop can cancel every step of the start.
        let gate = LiveGate()
        starting = gate
        phase = .starting
        message = nil
        Task { await begin(displayID, gate: gate) }
    }

    func stop() {
        guard canStop else { return }
        if active != nil {
            end("user_stop")
        } else {
            cancelStart("user_stop")
        }
    }

    func revealSession() {
        if let sessionDirectory {
            NSWorkspace.shared.activateFileViewerSelecting([sessionDirectory])
        }
    }

    private func begin(_ displayID: CGDirectDisplayID, gate: LiveGate) async {
        let preflight = CGPreflightScreenCaptureAccess()
        permissionGranted = preflight
        var opened: CaptureRun?
        var startedAt: (host: Double, wall: Date)?
        let outcome = await CaptureStart.run(
            gate: gate,
            // Off-screen windows too, so this app is listed even when its main window is closed.
            find: { try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false) },
            open: { (content: SCShareableContent) throws -> Session in
                let session = try self.openSession(content, displayID: displayID, gate: gate, preflight: preflight)
                opened = session.run
                return session
            },
            start: { (session: Session) in
                try await session.stream.startCapture()
                session.run.streamStarted = true
                startedAt = (HostClock.now(), Date())
            },
            stopStarted: { (session: Session) in
                // Stopped while starting: the stop path could not stop a stream that had not started.
                let problem = await Self.stopStream(session.run)
                session.run.note("stream_stopped_after_start_returned", detail: [
                    "started_host": startedAt.map { String($0.host) } ?? "unknown", "problem": problem ?? "none",
                ])
            })

        switch outcome {
        case .started:
            guard let run = opened, let startedAt else { return }
            phase = .capturing
            run.started(host: startedAt.host, wall: startedAt.wall)
            // The explicit Start is this stream's only fresh consent; local capture does not wait.
            let link = link
            let session = run.recorder.directory
            let gate = run.gate
            Task { [weak self] in
                await link.begin(gate: gate, session: session) { reason in
                    Task { @MainActor in self?.serviceEnded(reason, gate: gate) }
                }
            }
        case .stoppedBeforeSession, .stoppedAfterSession:
            // Stop, sleep or quit already ended this start; a late result changes nothing.
            break
        case .failed(let step, let reason):
            if let run = opened {
                if run.gate.close("start_failed") {
                    run.finish(detail: reason)
                }
            } else if gate.close("start_failed") {
                starting = nil
                phase = .ended("Not started (\(step)): \(reason)")
            }
        }
    }

    /// Creates the session for one Start: the display lookup, stream configuration, recorder, run and
    /// stream output. `CaptureStart` calls it only while the Start's gate is open.
    private func openSession(_ content: SCShareableContent, displayID: CGDirectDisplayID, gate: LiveGate,
                             preflight: Bool) throws -> Session {
        guard let display = content.displays.first(where: { $0.displayID == displayID }) else {
            refreshDisplays()
            throw StartProblem.displayUnavailable
        }
        // The whole display without this app: ScreenCaptureKit's documented application exclusion,
        // so kept frames are meant to hold no ink or controls and are composed with the ink
        // separately. If this app is not listed, nothing is excluded, the ink panels' inclusion is
        // unknown, and nothing is composed (`sharingType = .none` is not relied on).
        let ownApp = content.applications.first { $0.processID == ProcessInfo.processInfo.processIdentifier }
        let filter = ownApp.map { SCContentFilter(display: display, excludingApplications: [$0], exceptingWindows: []) }
            ?? SCContentFilter(display: display, excludingWindows: [])
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
            scope: ownApp == nil ? DisplayFacts.inkOverlayScope(showsCursor: settings.showsCursor)
                : DisplayFacts.appExcludedScope(showsCursor: settings.showsCursor))

        let recorder = try CaptureRecorder(root: Self.storageRoot, display: facts, settings: settings,
                                           permissionPreflightAtStart: preflight, composesInk: ownApp != nil)
        // Nothing runs on the queue yet, so the recorder can be written here.
        recorder.note("capture_filter", host: HostClock.now(), detail: ownApp.map { app in [
            "method": "SCContentFilter(display:excludingApplications:exceptingWindows:)",
            "excluded_process_id": String(app.processID), "excluded_bundle_identifier": app.bundleIdentifier,
            "excluded_application_name": app.applicationName, "composition": "each kept frame is composed with the ink separately",
        ] } ?? [
            "method": "SCContentFilter(display:excludingWindows: [])",
            "problem": "this app was not in the shareable content, so it could not be excluded",
            "composition": "not made: kept frames may already contain the ink",
        ])
        ink.captureOpened(session: recorder.status.session, display: facts)
        let run = CaptureRun(displayID: displayID, gate: gate, recorder: recorder, composesInk: ownApp != nil, controller: self)
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
            throw error
        }
        run.scStream = stream
        // Nothing runs on the queue until the stream starts, so the first status can be read here.
        status = recorder.status
        now = HostClock.now()
        // From here Stop goes through end(), which also stops a stream that has started.
        active = run
        starting = nil
        return (run, stream)
    }

    /// Stops a Start that has no session yet: nothing has been created, and its late result is ignored.
    private func cancelStart(_ reason: String) {
        guard let gate = starting, gate.close(reason) else { return }
        starting = nil
        phase = .ended("Stopped before capture started (\(reason)); no session was created.")
    }

    /// Ends live claims now, before anything is awaited, then stops the stream and writes the
    /// ending. Does nothing if this run's live claims have already ended.
    private func end(_ reason: String, detail: String? = nil) {
        guard let run = active, run.gate.close(reason) else { return }
        phase = .stopping
        run.pendingEndingDetail = detail
        // Sending already stopped with the gate; the server Stop follows.
        let link = link
        Task { await link.stop() }
        // Nothing more is asked from this capture, and a question on its way is fenced.
        ask.captureStopped(run.recorder.directory.lastPathComponent)
        Task {
            let problem = await Self.stopStream(run)
            // Frames kept before the gate closed get their composition request before the ending.
            await run.settleCompositions()
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
        // Each newly kept frame is paired here, on the main thread where ink is committed, so every
        // ink change made before its pixels is already in the document.
        if run.composesInk, let kept = status.lastKept, kept.sequence > run.lastCompositionRequested {
            run.lastCompositionRequested = kept.sequence
            run.compose(ink.compositionRequest(for: kept, display: status.display, session: status.session))
        }
        if run === active, run.gate.isOpen {
            link.framesChanged()
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
            // The stream has already stopped; only the kept frames' composition requests are awaited.
            run.pendingEndingDetail = reason.summary
            let link = link
            Task { await link.stop() }
            ask.captureStopped(run.recorder.directory.lastPathComponent)
            Task {
                await run.settleCompositions()
                run.finish(detail: reason.summary)
            }
        } else {
            run.note("stream_error_after_live_ended", detail: ["reason": reason.summary])
        }
    }

    /// The capture service stopped or withdrew this run's stream, or its permission was lost: this
    /// run's local capture ends too, with its normal ending. A later run is never ended by it.
    private func serviceEnded(_ reason: String, gate: LiveGate) {
        guard let run = active, run.gate === gate, gate.isOpen else { return }
        end(reason, detail: "the local capture service ended this stream")
    }

    // MARK: - System events

    private func systemWillSleep() {
        if active != nil {
            end("system_sleep", detail: "the Mac went to sleep; the host clock does not advance during sleep")
        } else {
            cancelStart("system_sleep")
        }
    }

    private func screensChanged() {
        if let run = active {
            if let online = Self.onlineDisplays(), !online.contains(run.displayID) {
                end("display_disconnected", detail: "the display left the online display list")
            } else {
                run.note("display_parameters_changed", detail: Self.displayParameters(run.displayID))
                ink.displayChanged()
            }
        }
        refreshDisplays()
    }

    /// Quit (`applicationShouldTerminate`): live claims and ink input end at once and the ending
    /// is written, also when another ending is still pending (Stop awaiting `stopCapture`); the
    /// gate keeps its first reason and a second finish does nothing. Then Quit waits while any
    /// ink is only in memory (`InkController.mayQuit`). Returns whether the app may terminate.
    func quitRequested() -> Bool {
        endForQuit()
        return ink.mayQuit()
    }

    /// Also on `willTerminateNotification`, for a termination that did not ask first.
    private func terminate() {
        endForQuit()
        ink.saveUnsaved()
    }

    private func endForQuit() {
        // A Start without a session has nothing to write; closing its gate voids its late result,
        // and the app shows it as stopped in case Quit is held.
        cancelStart("app_quit")
        guard let run = active else { return }
        let closedHere = run.gate.close("app_quit")
        // The link's Stop starts now, also when Quit is then held for unsaved ink; Quit joins it.
        let link = link
        Task { await link.stop() }
        ask.captureStopped(run.recorder.directory.lastPathComponent)
        // Also when a stream error closed the gate off the main thread and its main-thread report
        // has not arrived yet: ink input closes and saves now, and a failed save holds Quit.
        ink.captureEnding(reason: run.gate.closure?.reason ?? "app_quit")
        if closedHere {
            // Runs only if the app stays open because Quit was held. A stream still starting is
            // stopped when its start returns (`CaptureStart`).
            if run.streamStarted {
                Task {
                    let problem = await Self.stopStream(run)
                    run.note("stream_stopped_after_quit_request", detail: ["problem": problem ?? "none"])
                }
            }
        }
        // A Stop or stream error still waiting to write its ending keeps its detail.
        run.finish(detail: [run.pendingEndingDetail, "Quit was requested; the ending was written before stopping the stream was awaited"]
            .compactMap { $0 }.joined(separator: "; "), wait: true)
    }

    // MARK: - Helpers

    /// Ink input opens when capture starts and closes in the same call that ends live claims
    /// (Stop, disconnect, sleep); a stream error closes it on the next main-thread turn.
    private func inkFollowsCapture(from old: Phase) {
        if phase == .capturing, old != .capturing, let run = active {
            ink.captureStarted(displayID: run.displayID)
        } else if old == .capturing, phase != .capturing {
            ink.captureEnding(reason: active?.gate.closure?.reason ?? "capture ended")
        }
    }

    private func holdActivityWhileCapturing() {
        switch phase {
        case .starting, .capturing, .stopping:
            if activity == nil {
                activity = ProcessInfo.processInfo.beginActivity(
                    options: .userInitiatedAllowingIdleSystemSleep, reason: "Screen capture freshness")
            }
        case .idle, .ended:
            if let activity {
                ProcessInfo.processInfo.endActivity(activity)
                self.activity = nil
            }
        }
    }

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
