import CoreImage
import CoreVideo
import Foundation
import ImageIO

/// The local record of one capture session:
///
///     <root>/<session>/status.json     latest state and counts, rewritten atomically
///     <root>/<session>/events.jsonl    append-only session, kept-frame, run, gap and end events
///     <root>/<session>/frames/*.png    kept frames: lossless PNG (8-bit RGBA, sRGB) of the
///                                      delivered buffers at their own size, not rotated
///     <root>/<session>/composed/*.png  when the session composes ink: each kept frame's raw
///                                      original with the committed ink drawn over it (`compose`)
///
/// Nothing is sent anywhere, and nothing kept is overwritten or deleted.
///
/// Every screen callback is counted by its reported status. Each callback that delivers new
/// pixels is offered to `FrameStore`; the stream's minimum frame interval bounds how often that
/// happens. Silences, blank or suspended screens, statuses without usable pixels, new pixels that
/// could not be kept and the retention cap are written as events, so the kept frames are never
/// presented as a complete history of the screen.
///
/// Two clocks are kept apart. A callback's host time is when it was admitted, which can be
/// long after its pixels were on screen when the queue is busy. The pixels' own time is their
/// validated `displayTime` (`sourceTime`); without one, their age is unknown.
///
/// Not thread-safe: use one instance from one serial queue.
public final class CaptureRecorder {
    public let directory: URL
    private var state: SessionStatus
    private let settings: CaptureSettings
    private let events: FileHandle
    private let frames: FrameStore
    private var run: CallbackRun?
    private var capReached = false
    private var lastStatusWrite = -Double.infinity
    /// Bytes of events.jsonl that hold whole lines; a failed append is cut back to this.
    private var eventsLength: UInt64 = 0
    /// Whether each kept frame gets exactly one composition outcome: `composed` or `not_composed`.
    private let composesInk: Bool
    /// Kept frames still without a composition outcome.
    private var awaitingComposition = Set<Int>()
    private var composedStore: FrameStore?
    private var composedCapReached = false

    /// Creates a new session directory under `root`; it never reuses an existing one.
    /// With `composesInk`, every kept frame is later composed with ink or recorded as not composed
    /// (`compose`, `finish`).
    public init(root: URL, display: DisplayFacts, settings: CaptureSettings, permissionPreflightAtStart: Bool,
                composesInk: Bool = false, wall: Date = Date(), host: Double = HostClock.now()) throws {
        let session = Self.sessionID(wall)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        directory = root.appending(path: session, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        let framesDirectory = directory.appending(path: "frames", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: framesDirectory, withIntermediateDirectories: false)
        let eventsURL = directory.appending(path: "events.jsonl")
        guard FileManager.default.createFile(atPath: eventsURL.path(percentEncoded: false), contents: nil) else {
            throw CocoaError(.fileWriteUnknown, userInfo: [NSFilePathErrorKey: eventsURL.path(percentEncoded: false)])
        }
        events = try FileHandle(forWritingTo: eventsURL)
        frames = FrameStore(directory: framesDirectory, byteCap: settings.byteCap)
        self.settings = settings
        self.composesInk = composesInk
        state = SessionStatus(session: session, startedWall: wall, startedHost: host, updatedWall: wall,
                              display: display, settings: settings,
                              permissionPreflightAtStart: permissionPreflightAtStart)
        append(CaptureEvent(event: "session_created", host: host, wall: wall))
        writeStatus(host: host, force: true)
    }

    public var status: SessionStatus {
        var status = state
        status.openRun = run
        return status
    }

    /// `SCStream.startCapture` returned at `host`/`wall`. Callbacks can be recorded before this
    /// is, so `stream_started` may follow them in events.jsonl.
    public func streamStarted(host: Double, wall: Date) {
        state.streamStartedHost = host
        append(CaptureEvent(event: "stream_started", host: host, wall: wall))
        writeStatus(host: host, force: true)
    }

    /// Records one screen callback. `accepted` is whether the callback was admitted before live
    /// claims ended (`LiveGate.admit`), and `host` is its admission time. An admitted frame is kept
    /// even if its encoding finishes after Stop. A callback that was not admitted, or that arrives
    /// after the ending, is only counted.
    public func frame(_ facts: FrameFacts, image: CVPixelBuffer?, host: Double, accepted: Bool) {
        guard accepted, state.ending == nil else {
            state.callbacksAfterLiveEnded += 1
            if state.ending != nil {
                append(CaptureEvent(event: "callback_after_end", host: host, detail: ["status": facts.status]))
                writeStatus(host: host, force: true)
            }
            return
        }
        state.callbacks += 1
        let sequence = state.callbacks
        if let previous = state.lastCallbackHost ?? state.streamStartedHost, host - previous > settings.silenceLimit {
            gap("no_callbacks", host: host, detail: [
                "from_host": String(previous), "to_host": String(host), "before_sequence": String(sequence),
                "note": "no screen callback arrived: the screen may have been unchanged, or frames were not delivered; unknown",
            ])
        }
        state.lastCallbackHost = host
        state.lastCallbackStatus = facts.status
        state.callbacksByStatus[facts.status, default: 0] += 1
        defer { writeStatus(host: host, force: false) }

        switch facts.status {
        case "complete":
            newPixels(image, facts: facts, sequence: sequence, host: host)
        case "idle":
            // The system reports no new pixels; whatever `pixelsCurrent` was stays. A valid
            // source time confirms the current pixels as of that time; without one, the last
            // confirmation stands.
            let source = sourceTime(facts, callbackHost: host)
            if state.pixelsCurrent, let source, source > (state.screenStateAsOfHost ?? -Double.infinity) {
                state.screenStateAsOfHost = source
            }
            extendRun("idle", isGap: false, sequence: sequence, host: host)
        case "started", "stopped":
            pixelsNotCurrent()
            flushRun()
            append(CaptureEvent(event: "stream_status", host: host,
                                detail: ["status": facts.status, "sequence": String(sequence)]))
        default:
            // blank, suspended, missing or unknown: no usable pixels, so the screen is unknown.
            pixelsNotCurrent()
            extendRun(facts.status, isGap: true, sequence: sequence, host: host)
        }
    }

    /// Adds an event without changing the counts, for example a stream error after the ending.
    public func note(_ event: String, host: Double, detail: [String: String]) {
        append(CaptureEvent(event: event, host: host, wall: Date(), detail: detail))
        writeStatus(host: host, force: true)
    }

    /// Closes the session once; later calls do nothing. A silence before live claims ended is
    /// recorded as a gap.
    public func finish(reason: String, detail: String?, liveEndedHost: Double, host: Double, wall: Date) {
        guard state.ending == nil else { return }
        flushRun()
        let last = state.lastCallbackHost ?? state.streamStartedHost ?? state.startedHost
        if liveEndedHost - last > settings.silenceLimit {
            gap("no_callbacks", host: host, detail: [
                "from_host": String(last), "to_host": String(liveEndedHost),
                "note": "no screen callback arrived before live claims ended; the screen in this interval is unknown",
            ])
        }
        pixelsNotCurrent()
        // Every kept frame gets its composition outcome before the ending.
        for sequence in awaitingComposition.sorted() {
            notComposed(sequence, reason: "session_ended_before_composition", host: host,
                        detail: "the session ended before this frame was composed; its raw original is kept")
        }
        awaitingComposition.removeAll()
        state.ending = Ending(reason: reason, detail: detail, liveEndedHost: liveEndedHost, host: host, wall: wall)
        var facts = ["reason": reason, "live_ended_host": String(liveEndedHost),
                     "callbacks_after_live_ended": String(state.callbacksAfterLiveEnded)]
        facts["detail"] = detail
        append(CaptureEvent(event: "ended", host: host, wall: wall, detail: facts))
        writeStatus(host: host, force: true)
    }

    // MARK: - New pixels

    private func newPixels(_ image: CVPixelBuffer?, facts: FrameFacts, sequence: Int, host: Double) {
        guard let image else {
            pixelsNotCurrent()
            gap("complete_without_image", host: host, detail: ["sequence": String(sequence)])
            return
        }
        let source = sourceTime(facts, callbackHost: host)
        state.lastNewPixelsHost = host
        state.lastNewPixelsSequence = sequence
        state.lastNewPixelsSourceHost = source
        state.pixelsCurrent = true
        // New pixels without a valid source time are current at an unknown time.
        state.screenStateAsOfHost = source
        if capReached {
            notRetain("retention_cap_reached", sequence: sequence, host: host)
            return
        }
        if frames.stoppedReason != nil {
            notRetain("store_stopped", sequence: sequence, host: host)
            return
        }
        flushRun()
        // The delivered buffer as it is: never rotated, cropped or scaled.
        let outcome = frames.keep(CIImage(cvPixelBuffer: image), name: String(format: "%08ld.png", sequence))
        switch outcome {
        case .kept(let name, let byteLength, let sha256):
            let record = KeptFrame(
                file: "frames/" + name, sequence: sequence, callbackHost: host, sourceHost: source, facts: facts,
                width: CVPixelBufferGetWidth(image), height: CVPixelBufferGetHeight(image),
                pixelFormat: Self.fourCC(CVPixelBufferGetPixelFormatType(image)),
                mediaType: "image/png", encoding: FrameStore.encoding, byteLength: byteLength, sha256: sha256)
            state.keptFrames += 1
            state.bytesKept = frames.bytesKept
            state.lastKept = record
            if composesInk {
                awaitingComposition.insert(sequence)
            }
            append(CaptureEvent(event: "kept", host: host, frame: record))
            // status.json never trails a kept PNG; the stream's interval bounds how often this runs.
            writeStatus(host: host, force: true)
        case .notKept(let reason, let detail):
            state.notRetained[reason, default: 0] += 1
            if reason == "over_budget" {
                capReached = true
                gap("retention_cap_reached", host: host, detail: [
                    "sequence": String(sequence), "detail": detail,
                    "note": "these and later new pixels in this session are not kept",
                ])
            } else {
                gap("keep_failed", host: host, detail: ["sequence": String(sequence), "reason": reason, "detail": detail])
            }
            state.storeStoppedReason = frames.stoppedReason
        }
    }

    // MARK: - Composed images

    /// Composes a kept frame with the ink paired with it (`InkComposer.request`), as a new PNG in
    /// `composed/`, or records why it is not composed. The raw original is re-read under the
    /// retained-file policy and only read; nothing kept is replaced. Each kept frame gets exactly one
    /// outcome; a request for a frame that already has one (for example after the ending) is only
    /// noted, with no pixels.
    public func compose(_ request: CompositionRequest, host: Double) {
        let frame = request.frame
        guard awaitingComposition.remove(frame.sequence) != nil else {
            state.lateCompositionRequests = (state.lateCompositionRequests ?? 0) + 1
            append(CaptureEvent(event: "composition_request_ignored", host: host, wall: Date(), detail: [
                "sequence": String(frame.sequence),
                "reason": state.ending == nil ? "this frame already has a composition outcome or was not awaiting one"
                    : "the session had ended; this frame's outcome was recorded then",
            ]))
            writeStatus(host: host, force: true)
            return
        }
        defer { writeStatus(host: host, force: true) }
        if let problem = request.problem {
            return notComposed(frame.sequence, reason: "refused", host: host, detail: problem)
        }
        guard let ink = request.ink else {
            return notComposed(frame.sequence, reason: "refused", host: host, detail: "no ink pairing was given")
        }
        let data: Data
        switch RetainedOriginal.read(file: frame.file, sequence: frame.sequence, sha256: frame.sha256,
                                     byteLength: frame.byteLength, in: directory) {
        case .success(let bytes): data = bytes
        case .failure(let refusal): return notComposed(frame.sequence, reason: "raw_unavailable", host: host, detail: refusal.reason)
        }
        if request.strokes.isEmpty {
            // Nothing to draw: the composed image is the raw original itself, verified above.
            var unchanged = ink
            unchanged.limits.append(InkComposer.rawAliasLimit)
            state.composedFrames = (state.composedFrames ?? 0) + 1
            return append(CaptureEvent(event: "composed", host: host, composed: ComposedFrame(
                rawSequence: frame.sequence, rawFile: frame.file, rawSHA256: frame.sha256, rawByteLength: frame.byteLength,
                file: frame.file, sha256: frame.sha256, byteLength: frame.byteLength, width: frame.width, height: frame.height,
                mediaType: frame.mediaType, encoding: frame.encoding, ink: unchanged, composedHost: host)))
        }
        if composedCapReached {
            return notComposed(frame.sequence, reason: "composed_cap_reached", host: host,
                               detail: "composed images reached their byte cap earlier in this session")
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let raw = CGImageSourceCreateImageAtIndex(source, 0, nil), raw.width == frame.width, raw.height == frame.height else {
            return notComposed(frame.sequence, reason: "raw_unavailable", host: host,
                               detail: "\(frame.file) does not decode at its recorded \(frame.width)×\(frame.height)")
        }
        guard let composed = InkComposer.render(raw, strokes: request.strokes, scaleX: request.scaleX, scaleY: request.scaleY) else {
            return notComposed(frame.sequence, reason: "render_failed", host: host, detail: "the ink could not be drawn over \(frame.file)")
        }
        let store: FrameStore
        if let composedStore {
            store = composedStore
        } else {
            let folder = directory.appending(path: "composed", directoryHint: .isDirectory)
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            } catch {
                return notComposed(frame.sequence, reason: "write_failed", host: host,
                                   detail: "composed/ cannot be created: \(error.localizedDescription)")
            }
            // Composed PNGs have their own cap, equal to the raw one (`composedBytes`).
            store = FrameStore(directory: folder, byteCap: settings.byteCap)
            composedStore = store
        }
        switch store.keep(CIImage(cgImage: composed), name: String(format: "%08ld.png", frame.sequence)) {
        case .kept(let name, let byteLength, let sha256):
            let record = ComposedFrame(
                rawSequence: frame.sequence, rawFile: frame.file, rawSHA256: frame.sha256, rawByteLength: frame.byteLength,
                file: "composed/" + name, sha256: sha256, byteLength: byteLength, width: composed.width, height: composed.height,
                mediaType: "image/png", encoding: FrameStore.encoding, ink: ink, composedHost: host)
            state.composedFrames = (state.composedFrames ?? 0) + 1
            state.composedBytes = store.bytesKept
            append(CaptureEvent(event: "composed", host: host, composed: record))
        case .notKept(let reason, let detail):
            if reason == "over_budget" {
                composedCapReached = true
                notComposed(frame.sequence, reason: "composed_cap_reached", host: host,
                            detail: detail + "; later frames in this session are not composed")
            } else {
                notComposed(frame.sequence, reason: reason == "stopped" ? "composed_store_stopped" : "write_failed",
                            host: host, detail: detail)
            }
        }
    }

    private func notComposed(_ sequence: Int, reason: String, host: Double, detail: String) {
        state.notComposed = (state.notComposed ?? [:]).merging([reason: 1], uniquingKeysWith: +)
        append(CaptureEvent(event: "not_composed", host: host, detail: [
            "sequence": String(sequence), "reason": reason, "detail": detail,
        ]))
    }

    private func pixelsNotCurrent() {
        state.pixelsCurrent = false
        state.screenStateAsOfHost = nil
    }

    /// The pixels' `displayTime` in host seconds when it is usable: present, nonzero, and not later
    /// than the callback by more than the tolerance. Otherwise nil, with the reason counted.
    private func sourceTime(_ facts: FrameFacts, callbackHost: Double) -> Double? {
        let problem: String
        if let ticks = facts.displayTimeTicks, let seconds = facts.displayTimeSeconds {
            if ticks == 0 {
                problem = "zero"
            } else if seconds > callbackHost + settings.sourceTimeLeadTolerance {
                problem = "after_callback"
            } else {
                return seconds
            }
        } else {
            problem = "missing"
        }
        state.sourceTimeUnknown[problem, default: 0] += 1
        return nil
    }

    private func notRetain(_ reason: String, sequence: Int, host: Double) {
        state.notRetained[reason, default: 0] += 1
        extendRun("not_retained_" + reason, isGap: false, sequence: sequence, host: host)
    }

    // MARK: - Runs and gaps

    /// Extends the open run of the same kind, or starts a new one. A gap run counts as one gap.
    private func extendRun(_ kind: String, isGap: Bool, sequence: Int, host: Double) {
        if var current = run, current.kind == kind, current.lastSequence == sequence - 1 {
            current.lastSequence = sequence
            current.lastHost = host
            run = current
            return
        }
        flushRun()
        if isGap {
            state.gaps += 1
        }
        run = CallbackRun(kind: kind, isGap: isGap, firstSequence: sequence, lastSequence: sequence,
                          firstHost: host, lastHost: host)
    }

    private func flushRun() {
        guard let current = run else { return }
        run = nil
        append(CaptureEvent(event: "run", host: current.lastHost, run: current))
    }

    private func gap(_ kind: String, host: Double, detail: [String: String]) {
        flushRun()
        state.gaps += 1
        append(CaptureEvent(event: "gap", host: host, detail: detail.merging(["kind": kind]) { current, _ in current }))
    }

    // MARK: - Files

    /// A failed append is counted, so a nonzero count shows that events.jsonl is incomplete. A
    /// partly written line is cut off again, so the file keeps only whole lines.
    private func append(_ event: CaptureEvent) {
        do {
            var line = try CaptureFiles.encoder.encode(event)
            line.append(0x0A)
            try events.seek(toOffset: eventsLength)
            try events.write(contentsOf: line)
            eventsLength += UInt64(line.count)
        } catch {
            state.eventWriteFailures += 1
            try? events.truncate(atOffset: eventsLength)
        }
    }

    /// At most once a second unless forced; kept frames, stream starts, notes and the ending force a
    /// write. The open run is saved with the status, so after each write the callbacks counted so far
    /// are described by events.jsonl plus status.json. Between writes, status.json may trail by up
    /// to a second of runs.
    private func writeStatus(host: Double, force: Bool) {
        guard force || host - lastStatusWrite >= 1 else { return }
        lastStatusWrite = host
        state.updatedWall = Date()
        do {
            let data = try CaptureFiles.encoder.encode(status)
            try data.write(to: directory.appending(path: "status.json"), options: .atomic)
        } catch {
            state.statusWriteFailures += 1
        }
    }

    private static func sessionID(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter.string(from: date) + "-" + UUID().uuidString.prefix(8)
    }

    private static func fourCC(_ code: OSType) -> String {
        let characters = [24, 16, 8, 0].map { Character(UnicodeScalar(UInt8((code >> $0) & 0xFF))) }
        return String(characters)
    }
}
