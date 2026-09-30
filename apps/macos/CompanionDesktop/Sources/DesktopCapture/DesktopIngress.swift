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

    private struct WallText: Decodable {
        let startedWall: String
    }

    /// Reads status.json and events.jsonl with the recorder's own decoder, so UInt64 display ticks
    /// are parsed as UInt64, never as Double. An unreadable file or event line is refused as a
    /// whole: nothing is mapped from a session that cannot be read completely.
    public static func read(_ directory: URL) throws -> RetainedSession {
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
        for (index, line) in eventsData.split(separator: 0x0A).enumerated() {
            let event: CaptureEvent
            do {
                event = try CaptureFiles.decoder.decode(CaptureEvent.self, from: Data(line))
            } catch {
                throw MappingRefusal("events.jsonl entry \(index + 1) is unreadable; nothing is mapped from this session")
            }
            if event.event == "kept", let record = event.frame {
                frames.append(RetainedFrame(record: record, originalProblem: originalProblem(record, in: directory)))
            } else if event.event == "gap", let detail = event.detail, let kind = detail["kind"] {
                let sequence = detail["sequence"].flatMap { Int($0) }
                gaps.append(NativeGap(kind: kind, firstCallback: sequence, lastCallback: sequence,
                                      fromHost: detail["from_host"].flatMap { Double($0) },
                                      toHost: detail["to_host"].flatMap { Double($0) }, open: false))
            } else if event.event == "run", let run = event.run, isGap(run) {
                gaps.append(gap(run, open: false))
            } else if event.event == "display_parameters_changed" {
                notes.append("the display's parameters changed at host \(event.host) s; display_at_start stays the startup snapshot")
            }
        }
        if status.eventWriteFailures > 0 || status.statusWriteFailures > 0 {
            notes.append("the session files are known incomplete (\(status.eventWriteFailures) event and \(status.statusWriteFailures) status write failures); frames and gaps may be missing")
        }
        if let run = status.openRun, isGap(run),
           !gaps.contains(where: { $0.kind == run.kind && $0.firstCallback == run.firstSequence }) {
            gaps.append(gap(run, open: true))
        }
        return RetainedSession(directory: directory, status: status, startedWallText: wall, frames: frames, gaps: gaps,
                               notes: notes)
    }

    private static func isGap(_ run: CallbackRun) -> Bool {
        run.isGap || run.kind.hasPrefix("not_retained_")
    }

    private static func gap(_ run: CallbackRun, open: Bool) -> NativeGap {
        NativeGap(kind: run.kind, firstCallback: run.firstSequence, lastCallback: run.lastSequence,
                  fromHost: run.firstHost, toHost: run.lastHost, open: open)
    }

    /// Re-hashes the retained PNG, which must be `frames/NNNNNNNN.png` inside the session.
    private static func originalProblem(_ record: KeptFrame, in directory: URL) -> String? {
        // The recorder names files "%08ld.png": at least eight digits, equal to the callback sequence.
        let digits = record.file.dropFirst("frames/".count).dropLast(".png".count)
        guard record.file.hasPrefix("frames/"), record.file.hasSuffix(".png"), digits.count >= 8,
              digits.allSatisfy({ $0.isASCII && $0.isNumber }), Int(digits) == record.sequence else {
            return "\(record.file) is not this frame's frames/NNNNNNNN.png path inside the session"
        }
        do {
            let actual = try FrameStore.digest(of: directory.appending(path: record.file))
            guard actual.byteLength == record.byteLength, actual.sha256 == record.sha256 else {
                return "\(record.file) no longer has the recorded SHA-256 and length"
            }
            return nil
        } catch {
            return "\(record.file) cannot be read: \(error.localizedDescription)"
        }
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

    private static func recordJSON(_ record: RecordIdentity, source: JSONValue, frameID: JSONValue, artifacts: [JSONValue],
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

    private static func describe(_ gap: NativeGap, record: RecordIdentity) -> String {
        let callbacks = gap.firstCallback.map { first in "callbacks \(first)–\(gap.lastCallback ?? first)" } ?? "no callback range"
        let hosts = gap.fromHost.map { from in "host \(from)–\(gap.toHost.map { String($0) } ?? "?") s" } ?? "no host interval"
        return "record \(record.recordID): native gap \(gap.kind) (\(callbacks), \(hosts)\(gap.open ? ", still open" : "")) is carried only as coverage; its callback range and host interval stay in the session files"
    }

    private static func sourceJSON(_ source: SourceReference) throws -> JSONValue {
        try identifiers([("user ID", source.userID), ("source ID", source.sourceID)])
        return .object([
            "user_id": .string(source.userID),
            "source_id": .string(source.sourceID),
            "source_version": try positive(source.sourceVersion, "source version"),
        ])
    }

    private static func artifactJSON(_ artifact: PNGReference) throws -> JSONValue {
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
        guard scopes.contains(display.scope) else {
            throw MappingRefusal("the display scope is not one of the released descriptions")
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

    private static func dirtyJSON(_ rects: [RecordedRect]) throws -> JSONValue {
        guard rects.count <= maxDirtyRects else {
            throw MappingRefusal("\(rects.count) dirty rectangles exceed the \(maxDirtyRects) the contract can carry")
        }
        return .array(try rects.map { try rectJSON($0, "dirty rectangle") })
    }

    private static func rectJSON(_ rect: RecordedRect, _ what: String) throws -> JSONValue {
        guard rect.width >= 0, rect.height >= 0 else { throw MappingRefusal("the \(what) has a negative extent") }
        return .object([
            "x": try number(rect.x, what, allowNegative: true),
            "y": try number(rect.y, what, allowNegative: true),
            "width": try number(rect.width, what),
            "height": try number(rect.height, what),
        ])
    }

    private static func number(_ value: Double, _ what: String, allowNegative: Bool = false) throws -> JSONValue {
        guard value.isFinite, allowNegative || value >= 0 else {
            throw MappingRefusal("the \(what) \(value) is not a finite\(allowNegative ? "" : " nonnegative") number")
        }
        return .number(value)
    }

    private static func scale(_ value: Double, _ what: String) throws -> JSONValue {
        guard value.isFinite, value > 0 else { throw MappingRefusal("the \(what) \(value) is not a positive number") }
        return .number(value)
    }

    private static func positive(_ value: Int, _ what: String) throws -> JSONValue {
        guard (1...ContractLimits.maxSafeInteger).contains(value) else {
            throw MappingRefusal("the \(what) \(value) is not a positive safe integer")
        }
        return .integer(value)
    }

    private static func identifiers(_ values: [(String, String)]) throws {
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
