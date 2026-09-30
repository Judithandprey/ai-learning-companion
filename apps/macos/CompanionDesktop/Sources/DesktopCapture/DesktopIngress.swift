import CryptoKit
import Foundation

// Maps a retained native capture session to the released desktop frame 0.2.7 and
// DesktopFrameBatchRequest 0.2.8 shapes. The mapping is pure: it reads retained files, and
// sends, registers and grants nothing. Every identity comes from the trusted host: frame,
// device/session/stream, source, original binding, record and batch. Nothing here mints one, and
// no process sequence is taken from a callback ordinal.
//
// Unknown stays unknown:
// - capture UTC, media position, pixel orientation, the estimate and its basis, uncertainty and
//   any Process clock are always null;
// - an absent optional fact is null, and a known-empty dirty-rectangle list stays [].
// Data the contract cannot carry is refused, never truncated. The retained original is never
// changed.

/// Owner, source and version of a registered shared display.
public struct SourceReference: Equatable, Sendable {
    public var userID: String
    public var sourceID: String
    public var sourceVersion: Int

    public init(userID: String, sourceID: String, sourceVersion: Int) {
        self.userID = userID
        self.sourceID = sourceID
        self.sourceVersion = sourceVersion
    }
}

/// A complete PNG artifact reference: identity, digest and length of the retained file's bytes.
public struct PNGReference: Equatable, Sendable {
    public var artifactID: String
    public var sha256: String
    public var byteLength: Int
    public var mediaType: String

    public init(artifactID: String, sha256: String, byteLength: Int, mediaType: String = "image/png") {
        self.artifactID = artifactID
        self.sha256 = sha256
        self.byteLength = byteLength
        self.mediaType = mediaType
    }
}

/// OriginalArtifactBinding 0.2.2 of one retained PNG, from the existing original archive.
public struct OriginalBinding: Equatable, Sendable {
    public var contractVersion: String
    public var source: SourceReference
    public var artifact: PNGReference
    public var kind: String

    public init(contractVersion: String = "0.2.2", source: SourceReference, artifact: PNGReference,
                kind: String = "screen_image") {
        self.contractVersion = contractVersion
        self.source = source
        self.artifact = artifact
        self.kind = kind
    }
}

/// The trusted capture incarnation: device, learning session and capture stream.
public struct CaptureIncarnation: Equatable, Sendable {
    public var deviceID: String
    public var sessionID: String
    public var streamID: String

    public init(deviceID: String, sessionID: String, streamID: String) {
        self.deviceID = deviceID
        self.sessionID = sessionID
        self.streamID = streamID
    }
}

/// A process record's identity, as the trusted host assigns it.
public struct RecordIdentity: Equatable, Sendable {
    public var recordID: String
    /// The process-stream sequence. It is never a callback ordinal.
    public var sequence: Int

    public init(recordID: String, sequence: Int) {
        self.recordID = recordID
        self.sequence = sequence
    }
}

/// One DesktopFrameBatchRequest to prepare, with every identity supplied by the trusted host.
public struct DesktopIngressPlan: Sendable {
    public enum Entry: Sendable {
        /// The retained kept frame with this callback sequence, as one framed record.
        case frame(callbackSequence: Int, frameID: String, binding: OriginalBinding, record: RecordIdentity)
        /// One of the session's retained native gaps, as one frameless coverage record.
        case gap(NativeGap, record: RecordIdentity)
    }

    public var batchID: String
    public var idempotencyKey: String
    /// live or historical, as the trusted host states.
    public var deliveryMode: String
    public var incarnation: CaptureIncarnation
    /// The retained shared-display source of every record.
    public var source: SourceReference
    /// The native session and start display the trusted host registered that source for.
    public var nativeSessionID: String
    public var displayID: UInt32
    public var entries: [Entry]

    public init(batchID: String, idempotencyKey: String, deliveryMode: String, incarnation: CaptureIncarnation,
                source: SourceReference, nativeSessionID: String, displayID: UInt32, entries: [Entry]) {
        self.batchID = batchID
        self.idempotencyKey = idempotencyKey
        self.deliveryMode = deliveryMode
        self.incarnation = incarnation
        self.source = source
        self.nativeSessionID = nativeSessionID
        self.displayID = displayID
        self.entries = entries
    }
}

/// A prepared, unsent request.
public struct DesktopIngressRequest: Equatable, Sendable {
    public let idempotencyKey: String
    /// DesktopFrameBatchRequest 0.2.8 as Foundation JSON. These exact bytes are kept for retries.
    public let body: Data
    /// Native facts in the plan that 0.2.8 cannot carry. They stay in the retained session files.
    public let unrepresented: [String]
}

/// Why a frame or request cannot be represented. Nothing retained is changed.
public struct MappingRefusal: Error, Equatable, CustomStringConvertible {
    public let reason: String

    public init(_ reason: String) {
        self.reason = reason
    }

    public var description: String { reason }
}

extension MappingRefusal: LocalizedError {
    public var errorDescription: String? { reason }
}

// MARK: - Retained session (read only)

/// A kept frame read back from events.jsonl.
public struct RetainedFrame: Equatable, Sendable {
    public let record: KeptFrame
    /// Nil when the retained PNG was re-read and its bytes match the record's SHA-256 and length;
    /// otherwise why not. Such a frame is not mapped.
    public let originalProblem: String?
}

/// A native coverage gap read back from events.jsonl or the open run in status.json.
public struct NativeGap: Equatable, Sendable {
    /// no_callbacks, complete_without_image, retention_cap_reached, keep_failed, or a run kind:
    /// blank, suspended, missing, unknown_<n> or not_retained_<reason>.
    public let kind: String
    public let firstCallback: Int?
    public let lastCallback: Int?
    public let fromHost: Double?
    public let toHost: Double?
    /// From the run still open in status.json.
    public let open: Bool
}

/// A kept frame's retained composition outcome, as events.jsonl records it.
public enum CompositionOutcome: Equatable, Sendable {
    case composed(ComposedFrame, host: Double)
    case notComposed(host: Double, reason: String, detail: String)
}

/// One capture session as its files retain it. Reading changes nothing.
public struct RetainedSession: Sendable {
    public let directory: URL
    public let status: SessionStatus
    /// `startedWall` exactly as status.json holds it, not re-formatted from a Date.
    public let startedWallText: String
    public let frames: [RetainedFrame]
    public let gaps: [NativeGap]
    /// Session facts that no desktop frame or record carries, such as later display changes or
    /// known-incomplete files. Each request reports them as unrepresented.
    public let notes: [String]
    /// Composition outcomes by kept callback sequence; a sequence with more than one recorded
    /// outcome is in `conflictingOutcomes` instead, and one naming no kept frame in
    /// `strayOutcomes`.
    public var outcomes: [Int: CompositionOutcome] = [:]
    public var conflictingOutcomes: Set<Int> = []
    public var strayOutcomes: [Int] = []
    /// The recorded capture_filter details, and how many composition requests came after an
    /// outcome (`composition_request_ignored`).
    public var captureFilter: [String: String]?
    public var ignoredCompositionRequests = 0
    /// The `ended` event's details as events.jsonl holds them (status.json may trail it), and
    /// stream notes (errors after live ended, stops after a start or a Quit), in order.
    public var endedEvent: [String: String]?
    public var streamNotes: [String] = []

    private struct WallText: Decodable {
        let startedWall: String
    }

    /// Reads status.json and events.jsonl with the recorder's own decoder, so UInt64 display ticks
    /// are parsed as UInt64, never as Double. An unreadable file or event line is refused as a
    /// whole: nothing is mapped from a session that cannot be read completely.
    public static func read(_ directory: URL) throws -> RetainedSession {
        try read(directory, verifying: nil)
    }

    /// As `read`, re-reading only the kept PNGs of `verifying` (all when nil); every other kept
    /// frame carries the problem "not re-read in this pass", so it is never mapped from this read.
    public static func read(_ directory: URL, verifying: Set<Int>?) throws -> RetainedSession {
        let statusData: Data
        let status: SessionStatus
        let wall: String
        do {
            statusData = try Data(contentsOf: directory.appending(path: "status.json"))
            status = try CaptureFiles.decoder.decode(SessionStatus.self, from: statusData)
            wall = try JSONDecoder().decode(WallText.self, from: statusData).startedWall
        } catch {
            throw MappingRefusal("status.json is missing or unreadable: \(error.localizedDescription)")
        }
        let eventsData: Data
        do {
            eventsData = try Data(contentsOf: directory.appending(path: "events.jsonl"))
        } catch {
            throw MappingRefusal("events.jsonl is missing or unreadable: \(error.localizedDescription)")
        }
        var frames: [RetainedFrame] = []
        var gaps: [NativeGap] = []
        var notes: [String] = []
        var outcomes: [Int: CompositionOutcome] = [:]
        var conflicting: Set<Int> = []
        var filter: [String: String]?
        var ignored = 0
        var ended: [String: String]?
        var streamNotes: [String] = []
        func outcome(_ sequence: Int, _ value: CompositionOutcome) {
            if outcomes[sequence] != nil || conflicting.contains(sequence) {
                outcomes[sequence] = nil
                conflicting.insert(sequence)
            } else {
                outcomes[sequence] = value
            }
        }
        for (index, line) in eventsData.split(separator: 0x0A).enumerated() {
            let event: CaptureEvent
            do {
                event = try CaptureFiles.decoder.decode(CaptureEvent.self, from: Data(line))
            } catch {
                throw MappingRefusal("events.jsonl entry \(index + 1) is unreadable; nothing is mapped from this session")
            }
            // A recognized event without its payload would silently lose a kept frame or a gap.
            let missingPayload = MappingRefusal(
                "events.jsonl entry \(index + 1) is a \(event.event) event without its payload; nothing is mapped from this session")
            switch event.event {
            case "kept":
                guard let record = event.frame else { throw missingPayload }
                let verify: Bool = verifying?.contains(record.sequence) ?? true
                let problem: String? = verify ? originalProblem(record, in: directory) : "not re-read in this pass"
                frames.append(RetainedFrame(record: record, originalProblem: problem))
            case "gap":
                guard let detail = event.detail, let kind = detail["kind"] else { throw missingPayload }
                let sequence = detail["sequence"].flatMap { Int($0) }
                gaps.append(NativeGap(kind: kind, firstCallback: sequence, lastCallback: sequence,
                                      fromHost: detail["from_host"].flatMap { Double($0) },
                                      toHost: detail["to_host"].flatMap { Double($0) }, open: false))
            case "run":
                guard let run = event.run else { throw missingPayload }
                if isGap(run) {
                    gaps.append(gap(run, open: false))
                }
            case "display_parameters_changed":
                notes.append("the display's parameters changed at host \(event.host) s; display_at_start stays the startup snapshot")
            case "composed":
                guard let composed = event.composed else { throw missingPayload }
                outcome(composed.rawSequence, .composed(composed, host: event.host))
            case "not_composed":
                guard let detail = event.detail, let sequence = detail["sequence"].flatMap({ Int($0) }),
                      let reason = detail["reason"], let text = detail["detail"] else { throw missingPayload }
                outcome(sequence, .notComposed(host: event.host, reason: reason, detail: text))
            case "capture_filter":
                filter = event.detail ?? [:]
            case "composition_request_ignored":
                ignored += 1
            case "ended":
                ended = event.detail ?? [:]
            case "stream_error_after_live_ended", "stream_stopped_after_start_returned", "stream_stopped_after_quit_request":
                streamNotes.append(event.event + " at host \(event.host) s: "
                                   + (event.detail ?? [:]).sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "; "))
            default:
                break
            }
        }
        if status.keptFrames != frames.count {
            notes.append("status.json counts \(status.keptFrames) kept frames but events.jsonl holds \(frames.count); the session may have ended abruptly")
        }
        if status.eventWriteFailures > 0 || status.statusWriteFailures > 0 {
            notes.append("the session files are known incomplete (\(status.eventWriteFailures) event and \(status.statusWriteFailures) status write failures); frames and gaps may be missing")
        }
        if let run = status.openRun, isGap(run),
           !gaps.contains(where: { $0.kind == run.kind && $0.firstCallback == run.firstSequence }) {
            gaps.append(gap(run, open: true))
        }
        let kept = Set(frames.map(\.record.sequence))
        let stray = (Set(outcomes.keys).union(conflicting)).subtracting(kept).sorted()
        return RetainedSession(directory: directory, status: status, startedWallText: wall, frames: frames, gaps: gaps,
                               notes: notes, outcomes: outcomes.filter { kept.contains($0.key) },
                               conflictingOutcomes: conflicting.intersection(kept), strayOutcomes: stray,
                               captureFilter: filter, ignoredCompositionRequests: ignored, endedEvent: ended,
                               streamNotes: streamNotes)
    }

    private static func isGap(_ run: CallbackRun) -> Bool {
        run.isGap || run.kind.hasPrefix("not_retained_")
    }

    private static func gap(_ run: CallbackRun, open: Bool) -> NativeGap {
        NativeGap(kind: run.kind, firstCallback: run.firstSequence, lastCallback: run.lastSequence,
                  fromHost: run.firstHost, toHost: run.lastHost, open: open)
    }

    /// Re-reads the retained PNG under `RetainedOriginal`'s policy.
    private static func originalProblem(_ record: KeptFrame, in directory: URL) -> String? {
        switch RetainedOriginal.read(file: record.file, sequence: record.sequence, sha256: record.sha256,
                                     byteLength: record.byteLength, in: directory) {
        case .success: return nil
        case .failure(let refusal): return refusal.reason
        }
    }
}

/// Reads a retained original PNG only under the retained-file policy, checked before any byte is
/// read:
/// - the file is `frames/NNNNNNNN.png`;
/// - `frames` is opened relative to the session directory as a real directory, and the file
///   relative to it, neither through a symbolic link, so the file checked is the file read;
/// - the opened descriptor is a regular file (a FIFO or device is refused without blocking) of the
///   recorded length, and at most one byte more than that is read.
/// Its bytes must match the recorded SHA-256 and length. Nothing is changed.
enum RetainedOriginal {
    /// `folder` is `frames` for a raw original and `composed` for a composed image.
    static func read(file name: String, sequence: Int, sha256 expected: String, byteLength: Int,
                     in directory: URL, folder: String = "frames") -> Result<Data, MappingRefusal> {
        // The recorder names files "%08ld.png": at least eight digits, equal to the callback sequence.
        let digits = name.dropFirst(folder.count + 1).dropLast(".png".count)
        guard name.hasPrefix(folder + "/"), name.hasSuffix(".png"), digits.count >= 8,
              digits.allSatisfy({ $0.isASCII && $0.isNumber }), Int(digits) == sequence else {
            return .failure(MappingRefusal("\(name) is not this frame's \(folder)/NNNNNNNN.png path inside the session"))
        }
        return verified(name, folder: folder, sha256: expected, byteLength: byteLength, in: directory)
    }

    /// The bytes of `<folder>/<file>` under the policy above, once its name has been checked.
    static func verified(_ name: String, folder: String, sha256 expected: String, byteLength: Int,
                         in directory: URL) -> Result<Data, MappingRefusal> {
        let leaf = String(name.dropFirst(folder.count + 1))
        guard name.hasPrefix(folder + "/"), !leaf.isEmpty, !leaf.contains("/"), leaf != ".", leaf != ".." else {
            return .failure(MappingRefusal("\(name) is not a file directly inside \(folder)/"))
        }
        // Missing, a symbolic link or not a directory keep their messages; any other failure (such as
        // a permission or descriptor limit) says only that it cannot be opened, with its errno.
        let absent: Set<Int32> = [ENOENT, ELOOP, ENOTDIR]
        let root = open(directory.path(percentEncoded: false), O_RDONLY | O_DIRECTORY | O_CLOEXEC)
        guard root >= 0 else {
            let code = errno
            return .failure(MappingRefusal(absent.contains(code)
                ? "\(folder) is not a real directory inside the session (it is missing or a symbolic link)"
                : "the session directory cannot be opened (errno \(code))"))
        }
        defer { close(root) }
        let parent = openat(root, folder, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard parent >= 0 else {
            let code = errno
            return .failure(MappingRefusal(absent.contains(code)
                ? "\(folder) is not a real directory inside the session (it is missing or a symbolic link)"
                : "\(folder) cannot be opened (errno \(code))"))
        }
        defer { close(parent) }
        let descriptor = openat(parent, leaf, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard descriptor >= 0 else {
            let code = errno
            return .failure(MappingRefusal(absent.contains(code)
                ? "\(name) is not a regular file inside the session (it is missing or a symbolic link)"
                : "\(name) cannot be opened (errno \(code))"))
        }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        var info = stat()
        guard fstat(descriptor, &info) == 0, info.st_mode & S_IFMT == S_IFREG else {
            return .failure(MappingRefusal("\(name) is not a regular file"))
        }
        // A file of another size is refused before any byte is read.
        guard Int(info.st_size) == byteLength else {
            return .failure(MappingRefusal("\(name) no longer has the recorded SHA-256 and length"))
        }
        let data: Data
        do {
            data = try handle.read(upToCount: byteLength + 1) ?? Data()
        } catch {
            return .failure(MappingRefusal("\(name) cannot be read"))
        }
        let sha256 = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard data.count == byteLength, sha256 == expected else {
            return .failure(MappingRefusal("\(name) no longer has the recorded SHA-256 and length"))
        }
        return .success(data)
    }

    /// A retained ink original: `ink-originals/<its SHA-256>.json`, under the same policy.
    static func inkOriginal(file name: String, sha256 expected: String, byteLength: Int,
                            in directory: URL) -> Result<Data, MappingRefusal> {
        guard name == "ink-originals/\(expected).json", expected.count == 64,
              expected.utf8.allSatisfy({ (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }) else {
            return .failure(MappingRefusal("\(name) is not the ink-originals/<SHA-256>.json path of these bytes"))
        }
        return verified(name, folder: "ink-originals", sha256: expected, byteLength: byteLength, in: directory)
    }

    /// The entry's own type, without following a final symbolic link; nil when it is missing.
    static func entryType(_ url: URL) -> FileAttributeType? {
        (try? FileManager.default.attributesOfItem(atPath: url.path(percentEncoded: false)))?[.type] as? FileAttributeType
    }
}

// MARK: - Mapping

public enum DesktopIngress {
    public static let frameVersion = "0.2.7"
    public static let requestVersion = "0.2.8"
    /// The PNG reference ceiling of the released contracts.
    public static let maxPNGBytes = 33_554_432
    public static let maxBodyBytes = 4 * 1024 * 1024
    public static let maxRecords = 100
    public static let maxDirtyRects = 4096
    public static let maxDisplayNameScalars = 1024
    static let scopes: Set<String> = [
        "whole display; no window excluded, so this app's windows are captured when visible; cursor shown; BGRA buffers requested in sRGB; no audio",
        "whole display; no window excluded, so this app's windows are captured when visible; cursor hidden; BGRA buffers requested in sRGB; no audio",
        "synthetic fixture; not a captured display",
    ]

    /// Frameless coverage for a native gap kind, or nil for a kind that is not a coverage gap.
    /// Engineering defaults: pixels delivered but not kept are partial samples; a screen without
    /// usable pixels is unobserved; a silence or unreadable status is unknown.
    public static func coverage(forGap kind: String) -> (coverage: String, limitations: [String])? {
        switch kind {
        case "no_callbacks", "missing":
            return ("unknown", ["unknown"])
        case "blank", "suspended", "complete_without_image":
            return ("unobserved", ["unknown"])
        case "retention_cap_reached", "keep_failed":
            return ("partial", ["sample_only"])
        default:
            if kind.hasPrefix("not_retained_") { return ("partial", ["sample_only"]) }
            if kind.hasPrefix("unknown_") { return ("unknown", ["unknown"]) }
            return nil
        }
    }

    /// One retained kept frame as a desktop frame 0.2.7 value. The frame's source is the binding's.
    public static func frame(_ retained: RetainedFrame, in session: RetainedSession, frameID: String,
                             incarnation: CaptureIncarnation, binding: OriginalBinding) throws -> JSONValue {
        let record = retained.record
        let facts = record.facts
        let status = session.status
        if let problem = retained.originalProblem { throw MappingRefusal(problem) }
        try identifiers([("frame ID", frameID)])
        let source = try sourceJSON(binding.source)
        let artifact = try artifactJSON(binding.artifact)
        try identifiers([("device ID", incarnation.deviceID), ("session ID", incarnation.sessionID),
                         ("stream ID", incarnation.streamID), ("native session", status.session)])
        guard binding.contractVersion == "0.2.2", binding.kind == "screen_image" else {
            throw MappingRefusal("the original binding is not a 0.2.2 screen_image binding")
        }
        guard binding.artifact.sha256 == record.sha256, binding.artifact.byteLength == record.byteLength,
              record.mediaType == "image/png" else {
            throw MappingRefusal("the original binding is not the retained PNG's SHA-256 and length")
        }
        guard record.encoding == FrameStore.encoding else {
            throw MappingRefusal("the kept frame's encoding is not the reviewed PNG encoding")
        }
        guard facts.status == "complete" else {
            throw MappingRefusal("only a complete callback's kept pixels are a desktop frame, not \(facts.status)")
        }
        guard record.pixelFormat.unicodeScalars.count == 4,
              record.pixelFormat.unicodeScalars.allSatisfy({ $0.value <= 0xFF }) else {
            throw MappingRefusal("the pixel format is not a four-character code")
        }
        guard isNativeWall(session.startedWallText) else {
            throw MappingRefusal("the session wall anchor is not a UTC time with at most millisecond digits")
        }
        guard status.startedHost >= 0, record.callbackHost >= status.startedHost else {
            throw MappingRefusal("the callback precedes its local session origin")
        }
        guard (facts.displayTimeTicks == nil) == (facts.displayTimeSeconds == nil) else {
            throw MappingRefusal("display ticks and their converted seconds are not both known or both unknown")
        }
        // The UInt64 becomes a decimal string here, before any JSON number parsing can round it.
        let ticks: JSONValue = facts.displayTimeTicks.map { .string(String($0)) } ?? .null
        let displaySeconds: JSONValue = try facts.displayTimeSeconds.map { try number($0, "display time") } ?? .null
        let presentation: JSONValue = try facts.presentationTime.map { try number($0, "sample PTS", allowNegative: true) } ?? .null
        let contentRect: JSONValue = try facts.contentRect.map { try rectJSON($0, "content rectangle") } ?? .null
        let contentScale: JSONValue = try facts.contentScale.map { try scale($0, "content scale") } ?? .null
        let scaleFactor: JSONValue = try facts.scaleFactor.map { try scale($0, "scale factor") } ?? .null
        let dirtyRects: JSONValue = try facts.dirtyRects.map { try dirtyJSON($0) } ?? .null
        let width = try positive(record.width, "raw width")
        let height = try positive(record.height, "raw height")
        let callbackSequence = try positive(record.sequence, "callback sequence")
        let display = try displayJSON(status.display)
        let started = try number(status.startedHost, "session start")
        let callback = try number(record.callbackHost, "callback time")
        return .object([
            "contract_version": .string(frameVersion),
            "kind": .string("raw_capture_frame"),
            "frame_id": .string(frameID),
            "device_id": .string(incarnation.deviceID),
            "session_id": .string(incarnation.sessionID),
            "stream_id": .string(incarnation.streamID),
            "source": source,
            "artifact": artifact,
            "raw_width": width,
            "raw_height": height,
            "callback_sequence": callbackSequence,
            "captured_at": .null,
            "media_position": .null,
            "pixel_orientation": .null,
            "pixels_transformed": .bool(false),
            "timing": .object([
                "observed_at_estimate": .null, "estimate_basis": .null, "uncertainty_ms": .null, "callback_clock": .null,
            ]),
            "profile": .object([
                "kind": .string("macos_screencapturekit"),
                "native_session_id": .string(status.session),
                "pixel_format": .string(record.pixelFormat),
                "encoding": .string(record.encoding),
                "display_at_start": display,
                "host_clock": .object([
                    "basis": .string("mach_absolute_time_seconds"),
                    "session_started_wall_utc": .string(session.startedWallText),
                    "session_started_seconds": started,
                    "callback_seconds": callback,
                    "display_time_ticks_decimal": ticks,
                    "display_time_seconds": displaySeconds,
                ]),
                "sample": .object([
                    "status": .string(facts.status),
                    "presentation_time_seconds": presentation,
                    "geometry_basis": .string("SCStreamFrameInfo_as_reported"),
                    "geometry_unit": .null,
                    "content_rect": contentRect,
                    "content_scale": contentScale,
                    "scale_factor": scaleFactor,
                    "dirty_rects": dirtyRects,
                ]),
            ]),
        ])
    }

    /// One unsent DesktopFrameBatchRequest 0.2.8 from the plan's entries, in their order.
    public static func request(_ plan: DesktopIngressPlan, session: RetainedSession) throws -> DesktopIngressRequest {
        try identifiers([("batch ID", plan.batchID), ("Idempotency-Key", plan.idempotencyKey),
                         ("device ID", plan.incarnation.deviceID), ("session ID", plan.incarnation.sessionID),
                         ("stream ID", plan.incarnation.streamID)])
        guard ["live", "historical"].contains(plan.deliveryMode) else {
            throw MappingRefusal("the delivery mode is neither live nor historical")
        }
        guard session.status.session == plan.nativeSessionID else {
            throw MappingRefusal("the retained session is not the native session this source was registered for")
        }
        guard session.status.display.displayID == plan.displayID else {
            throw MappingRefusal("the retained session's start display is not the registered display")
        }
        guard (1...maxRecords).contains(plan.entries.count) else {
            throw MappingRefusal("a request holds 1 to \(maxRecords) records, not \(plan.entries.count)")
        }
        let source = try sourceJSON(plan.source)
        var records: [JSONValue] = []
        var frames: [JSONValue] = []
        var framesByID: [String: JSONValue] = [:]
        var artifactsByID: [String: JSONValue] = [:]
        var recordIDs: Set<String> = []
        var sequences: Set<Int> = []
        var unrepresented = session.notes
        for entry in plan.entries {
            let identity: RecordIdentity
            switch entry {
            case .frame(_, _, _, let record), .gap(_, let record):
                identity = record
            }
            try identifiers([("record ID", identity.recordID)])
            guard (1...ContractLimits.maxSafeInteger).contains(identity.sequence) else {
                throw MappingRefusal("the process sequence \(identity.sequence) is not a positive safe integer")
            }
            guard recordIDs.insert(identity.recordID).inserted, sequences.insert(identity.sequence).inserted else {
                throw MappingRefusal("record IDs and process sequences must be unique in a batch")
            }
            switch entry {
            case .frame(let callbackSequence, let frameID, let binding, let record):
                guard binding.source == plan.source else {
                    throw MappingRefusal("the original binding belongs to another source")
                }
                guard let retained = session.frames.first(where: { $0.record.sequence == callbackSequence }) else {
                    throw MappingRefusal("the session retains no kept frame for callback \(callbackSequence)")
                }
                let mapped = try frame(retained, in: session, frameID: frameID, incarnation: plan.incarnation,
                                       binding: binding)
                if let existing = framesByID[frameID] {
                    guard existing == mapped else { throw MappingRefusal("frame ID \(frameID) names two different frames") }
                } else {
                    framesByID[frameID] = mapped
                    frames.append(mapped)
                }
                let artifact = try artifactJSON(binding.artifact)
                if let existing = artifactsByID[binding.artifact.artifactID], existing != artifact {
                    throw MappingRefusal("artifact ID \(binding.artifact.artifactID) names two different PNGs")
                }
                artifactsByID[binding.artifact.artifactID] = artifact
                records.append(recordJSON(record, source: source, frameID: .string(frameID), artifacts: [artifact],
                                          coverage: "observed_samples", limitations: ["sample_only", "unsupported_history"]))
            case .gap(let gap, let record):
                guard session.gaps.contains(gap) else {
                    throw MappingRefusal("the gap is not one of this session's retained gaps")
                }
                guard let evidence = coverage(forGap: gap.kind) else {
                    throw MappingRefusal("\(gap.kind) is not a coverage gap")
                }
                records.append(recordJSON(record, source: source, frameID: .null, artifacts: [],
                                          coverage: evidence.coverage, limitations: evidence.limitations))
                unrepresented.append(describe(gap, record: record))
            }
        }
        let request: JSONValue = .object([
            "contract_version": .string(requestVersion),
            "batch": .object([
                "contract_version": .string("0.2.0"),
                "batch_id": .string(plan.batchID),
                "device_id": .string(plan.incarnation.deviceID),
                "session_id": .string(plan.incarnation.sessionID),
                "stream_id": .string(plan.incarnation.streamID),
                "delivery_mode": .string(plan.deliveryMode),
                "records": .array(records),
            ]),
            "frames": .array(frames),
        ])
        let body: Data
        do {
            body = try DesktopJSON.encode(request)
        } catch {
            throw MappingRefusal("the request cannot be encoded as strict JSON: \(error)")
        }
        guard body.count <= maxBodyBytes else {
            throw MappingRefusal("the request is \(body.count) bytes, over the \(maxBodyBytes)-byte metadata limit")
        }
        return DesktopIngressRequest(idempotencyKey: plan.idempotencyKey, body: body, unrepresented: unrepresented)
    }

    // MARK: - Pieces

    static func recordJSON(_ record: RecordIdentity, source: JSONValue, frameID: JSONValue, artifacts: [JSONValue],
                                   coverage: String, limitations: [String]) -> JSONValue {
        .object([
            "record_id": .string(record.recordID),
            "sequence": .integer(record.sequence),
            "source": source,
            "scope": .object(["kind": .string("provisional_session")]),
            "observed_at": .null,
            "clock": .null,
            "media_position": .null,
            "surface": .string("external_app"),
            "method": .string("visual"),
            "causal_parents": .array([]),
            "artifacts": .array(artifacts),
            "evidence": .object([
                "kind": .string("coverage"),
                "coverage": .string(coverage),
                "from_clock_ms": .null,
                "through_clock_ms": .null,
                "missing_sequences": .array([]),
                "limitations": .array(limitations.map(JSONValue.string)),
            ]),
            "frame_id": frameID,
        ])
    }

    static func describe(_ gap: NativeGap, record: RecordIdentity) -> String {
        let callbacks = gap.firstCallback.map { first in "callbacks \(first)–\(gap.lastCallback ?? first)" } ?? "no callback range"
        let hosts = gap.fromHost.map { from in "host \(from)–\(gap.toHost.map { String($0) } ?? "?") s" } ?? "no host interval"
        return "record \(record.recordID): native gap \(gap.kind) (\(callbacks), \(hosts)\(gap.open ? ", still open" : "")) is carried only as coverage; its callback range and host interval stay in the session files"
    }

    static func sourceJSON(_ source: SourceReference) throws -> JSONValue {
        try identifiers([("user ID", source.userID), ("source ID", source.sourceID)])
        return .object([
            "user_id": .string(source.userID),
            "source_id": .string(source.sourceID),
            "source_version": try positive(source.sourceVersion, "source version"),
        ])
    }

    static func artifactJSON(_ artifact: PNGReference) throws -> JSONValue {
        try identifiers([("artifact ID", artifact.artifactID)])
        guard artifact.mediaType == "image/png", artifact.sha256.count == 64,
              artifact.sha256.utf8.allSatisfy({ (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }) else {
            throw MappingRefusal("the artifact is not a PNG reference with a lowercase SHA-256")
        }
        guard (1...maxPNGBytes).contains(artifact.byteLength) else {
            throw MappingRefusal("the PNG is \(artifact.byteLength) bytes, outside the 1…\(maxPNGBytes)-byte reference range; the retained original stays unchanged")
        }
        return .object([
            "artifact_id": .string(artifact.artifactID),
            "sha256": .string(artifact.sha256),
            "byte_length": .integer(artifact.byteLength),
            "media_type": .string(artifact.mediaType),
        ])
    }

    private static func displayJSON(_ display: DisplayFacts) throws -> JSONValue {
        if let name = display.name, name.unicodeScalars.count > maxDisplayNameScalars {
            throw MappingRefusal("the display name has more than \(maxDisplayNameScalars) code points")
        }
        if display.scope.hasPrefix(DisplayFacts.inkOverlayScopePrefix) {
            throw MappingRefusal("the session records that its ink overlay may or may not be in the kept frames; no released 0.2.7 scope value says that, so nothing is mapped and the retained originals stay unchanged")
        }
        if display.scope.hasPrefix(DisplayFacts.appExcludedScopePrefix) {
            throw MappingRefusal("the session excludes this app's windows from capture and composes ink separately; no released 0.2.7 scope value says that, so nothing is mapped and the retained originals stay unchanged")
        }
        guard scopes.contains(display.scope) else {
            throw MappingRefusal("the display scope is not one of the released descriptions")
        }
        return try displayFacts(display)
    }

    /// The Mac display-at-start value, for a scope the caller has already accepted.
    static func displayFacts(_ display: DisplayFacts) throws -> JSONValue {
        if let name = display.name, name.unicodeScalars.count > maxDisplayNameScalars {
            throw MappingRefusal("the display name has more than \(maxDisplayNameScalars) code points")
        }
        return .object([
            "display_id": .integer(Int(display.displayID)),
            "name": display.name.map(JSONValue.string) ?? .null,
            "frame_points": try rectJSON(display.frame, "display frame"),
            "point_pixel_scale": try scale(display.pointPixelScale, "point-pixel scale"),
            "requested_width_pixels": try positive(display.requestedWidth, "requested width"),
            "requested_height_pixels": try positive(display.requestedHeight, "requested height"),
            "rotation_degrees": try number(display.rotationDegrees, "display rotation", allowNegative: true),
            "is_main": .bool(display.isMain),
            "scope": .string(display.scope),
        ])
    }

    static func dirtyJSON(_ rects: [RecordedRect]) throws -> JSONValue {
        guard rects.count <= maxDirtyRects else {
            throw MappingRefusal("\(rects.count) dirty rectangles exceed the \(maxDirtyRects) the contract can carry")
        }
        return .array(try rects.map { try rectJSON($0, "dirty rectangle") })
    }

    static func rectJSON(_ rect: RecordedRect, _ what: String) throws -> JSONValue {
        guard rect.width >= 0, rect.height >= 0 else { throw MappingRefusal("the \(what) has a negative extent") }
        return .object([
            "x": try number(rect.x, what, allowNegative: true),
            "y": try number(rect.y, what, allowNegative: true),
            "width": try number(rect.width, what),
            "height": try number(rect.height, what),
        ])
    }

    static func number(_ value: Double, _ what: String, allowNegative: Bool = false) throws -> JSONValue {
        guard value.isFinite, allowNegative || value >= 0 else {
            throw MappingRefusal("the \(what) \(value) is not a finite\(allowNegative ? "" : " nonnegative") number")
        }
        return .number(value)
    }

    static func scale(_ value: Double, _ what: String) throws -> JSONValue {
        guard value.isFinite, value > 0 else { throw MappingRefusal("the \(what) \(value) is not a positive number") }
        return .number(value)
    }

    static func positive(_ value: Int, _ what: String) throws -> JSONValue {
        guard (1...ContractLimits.maxSafeInteger).contains(value) else {
            throw MappingRefusal("the \(what) \(value) is not a positive safe integer")
        }
        return .integer(value)
    }

    static func identifiers(_ values: [(String, String)]) throws {
        for (what, value) in values where !isIdentifier(value) {
            throw MappingRefusal("the \(what) is not a contract Identifier")
        }
    }

    /// `^[A-Za-z0-9][A-Za-z0-9_.:-]*$`, 1–128 characters.
    static func isIdentifier(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        func alphanumeric(_ byte: UInt8) -> Bool {
            (0x30...0x39).contains(byte) || (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte)
        }
        guard let first = bytes.first, bytes.count <= 128, alphanumeric(first) else { return false }
        return bytes.dropFirst().allSatisfy { alphanumeric($0) || [UInt8(ascii: "_"), UInt8(ascii: "."),
                                                                     UInt8(ascii: ":"), UInt8(ascii: "-")].contains($0) }
    }

    /// `YYYY-MM-DDTHH:MM:SS[.f{1,3}]Z`, the native wall-anchor form.
    static func isNativeWall(_ text: String) -> Bool {
        let bytes = Array(text.utf8)
        let digit: (UInt8) -> Bool = { (0x30...0x39).contains($0) }
        let shape = Array("dddd-dd-ddTdd:dd:dd".utf8)
        guard bytes.count >= shape.count + 1, bytes.last == UInt8(ascii: "Z") else { return false }
        for (index, expected) in shape.enumerated() {
            guard expected == UInt8(ascii: "d") ? digit(bytes[index]) : bytes[index] == expected else { return false }
        }
        let fraction = bytes[shape.count..<(bytes.count - 1)]
        if fraction.isEmpty { return Date.ISO8601FormatStyle().isValid(text) }
        guard fraction.first == UInt8(ascii: "."), (2...4).contains(fraction.count),
              fraction.dropFirst().allSatisfy(digit) else { return false }
        return CaptureFiles.wallFormat.isValid(text)
    }
}

enum ContractLimits {
    static let maxSafeInteger = 9_007_199_254_740_991
}

private extension Date.ISO8601FormatStyle {
    /// Whether the text parses as a real instant; a pattern alone accepts impossible dates.
    func isValid(_ text: String) -> Bool {
        (try? parse(text)) != nil
    }
}
