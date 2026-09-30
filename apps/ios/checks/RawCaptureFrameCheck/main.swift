// Executed checks for ScreenObserver's RawCaptureFrame 0.2.5 mapper
// (apps/ios/ScreenObserver/ScreenObserver/RawCaptureFrame.swift). Builds without the app on any Mac
// with Xcode, for example the hosted macos-26 runner:
//
//   xcrun swiftc -target arm64-apple-macos14 \
//     apps/ios/ScreenObserver/Shared/CaptureStore.swift \
//     apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
//     apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift \
//     apps/ios/ScreenObserver/ScreenObserver/RawCaptureFrame.swift \
//     apps/ios/checks/RawCaptureFrameCheck/main.swift -o raw-capture-frame-check
//   ./raw-capture-frame-check FIXTURE_DIR
//   python3 apps/ios/checks/RawCaptureFrameCheck/validate_raw_frames.py FIXTURE_DIR
//
// The keyframe is a real PNG written by ScreenObserver's FrameStore. Its record and the session
// status are saved and read back in their actual JSON formats. The original binding comes from
// OriginalUploader.enqueue, with a transport that sends nothing. The expected estimates are
// literals computed independently. FIXTURE_DIR (absent or empty) receives each mapped JSON and
// its inputs for the Python contract check. This is not ReplayKit, device, server or AI evidence.
// The program exits non-zero on any failure.

import CoreImage
import Foundation

var failures = 0

func expect(_ condition: Bool, _ name: String) {
    print((condition ? "PASS " : "FAIL ") + name)
    if !condition { failures += 1 }
}

let root = FileManager.default.temporaryDirectory
    .appending(path: "raw-capture-frame-check-\(UUID().uuidString)", directoryHint: .isDirectory)
let fixtures = CommandLine.arguments.count > 1
    ? URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    : root.appending(path: "fixtures", directoryHint: .isDirectory)
var manifest: [[String: Any]] = []

let localSession = "20260930T041500Z-A1B2C3D4"
let trustedSource = OriginalSourceRef(userID: "user-1", sourceID: "display-source-1", sourceVersion: 1)
let trustedIdentity = RawFrameIdentity(frameID: "raw-frame-42", source: trustedSource, deviceID: "ipad-1",
                                       sessionID: "learning-session-1", streamID: "capture-stream-1",
                                       callbackClockDomain: "callback-clock-a1b2")
/// 1790000000.25 s since 1970: a session anchor with a fractional second, as held in memory.
let anchorWall = Date(timeIntervalSince1970: 1_790_000_000.25)
let anchorHost = 1000.25
let callbackHost = 1003.4567 // 3206.7 ms after the anchor; the descriptor keeps 3206 ms.

/// Sends nothing: the check needs only the uploader's enqueue, which records a binding locally.
struct NoTransport: IngressTransport {
    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        throw URLError(.notConnectedToInternet)
    }
}

// MARK: - A real kept keyframe with its saved record, status and original binding

/// Writes `value` with the capture store's encoder and reads it back, as the app would.
func savedCopy<T: Codable>(_ value: T, at url: URL) throws -> T {
    try CaptureStore.encoder.encode(value).write(to: url, options: .atomic)
    return try CaptureStore.decoder.decode(T.self, from: Data(contentsOf: url))
}

final class ResultBox<T>: @unchecked Sendable {
    var result: Result<T, Error>?
}

/// Runs one async call from this synchronous program in a detached task, which never inherits an
/// actor, and waits for it.
func waitFor<T>(_ operation: @escaping @Sendable () async throws -> T) throws -> T {
    let box = ResultBox<T>()
    let done = DispatchSemaphore(value: 0)
    Task.detached {
        do {
            box.result = .success(try await operation())
        } catch {
            box.result = .failure(error)
        }
        done.signal()
    }
    done.wait()
    return try box.result!.get()
}

func keptKeyframe(in session: URL) throws -> KeyframeRecord {
    let frames = session.appending(path: "frames", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: frames, withIntermediateDirectories: true)
    let image = CIImage(color: CIColor(red: 0.2, green: 0.6, blue: 0.4))
        .cropped(to: CGRect(x: 0, y: 0, width: 64, height: 48))
    let outcome = FrameStore(directory: frames, byteCap: 1 << 20).keep(image, name: String(format: "%08ld.png", 42))
    guard case .kept(let file, let byteLength, let sha256) = outcome else {
        throw CocoaError(.fileWriteUnknown)
    }
    let record = KeyframeRecord(file: "frames/" + file, sequence: 42, presentationTime: 12.345,
                                hostTime: callbackHost, width: 64, height: 48, orientation: 6,
                                pixelFormat: "BGRA", mediaType: "image/png", encoding: FrameStore.encoding,
                                byteLength: byteLength, sha256: sha256)
    let event = try savedCopy(CaptureEvent(event: "keyframe", hostTime: callbackHost, keyframe: record),
                              at: session.appending(path: "events.jsonl"))
    return event.keyframe!
}

// MARK: - Helpers

func mapJSON(_ record: KeyframeRecord, status: CaptureStatus?, identity: RawFrameIdentity,
             binding: OriginalArtifactBinding, session: String = localSession) throws -> Data {
    try RawCaptureFrame.json(record: record, localSession: session, status: status, identity: identity, binding: binding)
}

func mapped(_ record: KeyframeRecord, status: CaptureStatus?, identity: RawFrameIdentity,
            binding: OriginalArtifactBinding) throws -> [String: Any] {
    try JSONSerialization.jsonObject(with: mapJSON(record, status: status, identity: identity, binding: binding))
        as! [String: Any]
}

func refusalKind(_ body: () throws -> Data) -> String {
    do {
        _ = try body()
        return "none"
    } catch RawCaptureFrame.MappingError.identity {
        return "identity"
    } catch RawCaptureFrame.MappingError.record {
        return "record"
    } catch RawCaptureFrame.MappingError.binding {
        return "binding"
    } catch RawCaptureFrame.MappingError.clock {
        return "clock"
    } catch {
        return "other"
    }
}

func snapshot(_ directory: URL) -> [String: Data] {
    var files: [String: Data] = [:]
    let walker = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: nil)
    while let url = walker?.nextObject() as? URL {
        if let data = try? Data(contentsOf: url) { files[url.path(percentEncoded: false)] = data }
    }
    return files
}

/// The trusted identity, but with the callback clock domain unknown.
func identityWithoutClockDomain() -> RawFrameIdentity {
    RawFrameIdentity(frameID: trustedIdentity.frameID, source: trustedSource, deviceID: trustedIdentity.deviceID,
                     sessionID: trustedIdentity.sessionID, streamID: trustedIdentity.streamID, callbackClockDomain: nil)
}

/// Saves one mapped descriptor and the inputs it came from, for the Python contract check.
func emit(_ name: String, record: KeyframeRecord, status: CaptureStatus?, identity: RawFrameIdentity,
          binding: OriginalArtifactBinding) throws {
    let data = try mapJSON(record, status: status, identity: identity, binding: binding)
    try data.write(to: fixtures.appending(path: "frame-\(name).json"))
    let bindingObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(binding))
    let domain: Any = identity.callbackClockDomain ?? NSNull()
    let orientation: Any = record.orientation ?? NSNull()
    var anchor: Any = NSNull()
    if let status {
        anchor = ["session": status.session, "wall_seconds_since_1970": status.startedWallTime.timeIntervalSince1970,
                  "host_seconds": status.startedHostTime] as [String: Any]
    }
    manifest.append([
        "name": name,
        "frame": "frame-\(name).json",
        "binding": bindingObject,
        "identity": ["frame_id": identity.frameID, "device_id": identity.deviceID, "session_id": identity.sessionID,
                     "stream_id": identity.streamID, "callback_clock_domain": domain] as [String: Any],
        "record": ["sequence": record.sequence, "presentation_time": record.presentationTime,
                   "host_time": record.hostTime, "width": record.width, "height": record.height,
                   "orientation": orientation, "sha256": record.sha256, "byte_length": record.byteLength] as [String: Any],
        "anchor": anchor,
    ])
}

// MARK: - Checks

func checkMapping(record: KeyframeRecord, saved: CaptureStatus, memory: CaptureStatus,
                  binding: OriginalArtifactBinding) throws {
    let frame = try mapped(record, status: saved, identity: trustedIdentity, binding: binding)
    let timing = frame["timing"] as! [String: Any]
    let clock = timing["callback_clock"] as! [String: Any]
    let orientation = frame["orientation"] as! [String: Any]
    let artifact = frame["artifact"] as! [String: Any]
    let source = frame["source"] as! [String: Any]
    expect(frame["contract_version"] as? String == "0.2.5" && frame["kind"] as? String == "raw_capture_frame"
           && frame["captured_at"] is NSNull && frame["media_position"] is NSNull
           && frame["frame_id"] as? String == "raw-frame-42" && frame["stream_id"] as? String == "capture-stream-1",
           "the descriptor is 0.2.5 raw_capture_frame, with capture time and course position unknown (null)")
    expect(frame["buffer_sequence"] as? Int == 42 && frame["raw_width"] as? Int == 64 && frame["raw_height"] as? Int == 48
           && orientation["value"] as? Int == 6 && orientation["applied_to_pixels"] as? Bool == false
           && timing["sample_pts_seconds"] as? Double == 12.345,
           "the buffer sequence, raw size, unapplied orientation and sample PTS are the saved record's")
    expect(saved.startedWallTime.timeIntervalSince1970 == 1_790_000_000
           && timing["observed_at_estimate"] as? String == "2026-09-21T14:13:23.206Z"
           && clock["elapsed_ms"] as? Int == 3206 && clock["domain_id"] as? String == "callback-clock-a1b2"
           && clock["uncertainty_ms"] is NSNull && timing["uncertainty_ms"] is NSNull
           && timing["estimate_basis"] as? String == "session_wall_plus_callback_monotonic_delta",
           "with the saved, whole-second anchor: 3206 ms after it, estimate 14:13:23.206Z, uncertainty unknown")
    let fractional = try mapped(record, status: memory, identity: trustedIdentity, binding: binding)["timing"] as! [String: Any]
    let fractionalClock = fractional["callback_clock"] as! [String: Any]
    expect(fractional["observed_at_estimate"] as? String == "2026-09-21T14:13:23.456Z"
           && fractionalClock["elapsed_ms"] as? Int == 3206,
           "with an anchor at 14:13:20.250: the estimate is 14:13:23.456Z, so seconds and milliseconds are not confused")
    expect(artifact["sha256"] as? String == record.sha256 && artifact["byte_length"] as? Int == record.byteLength
           && artifact["artifact_id"] as? String == binding.artifact.artifactID && artifact["media_type"] as? String == "image/png"
           && source["source_id"] as? String == "display-source-1" && source["source_version"] as? Int == 1,
           "the artifact and source are the complete original binding's, equal to the kept file's hash and length")
    let once = try mapJSON(record, status: saved, identity: trustedIdentity, binding: binding)
    let twice = try mapJSON(record, status: saved, identity: trustedIdentity, binding: binding)
    expect(once == twice, "mapping is deterministic, byte for byte")
}

func checkUnknownClock(record: KeyframeRecord, saved: CaptureStatus, binding: OriginalArtifactBinding) throws {
    let noDomain = try mapped(record, status: saved, identity: identityWithoutClockDomain(), binding: binding)["timing"] as! [String: Any]
    let noStatus = try mapped(record, status: nil, identity: trustedIdentity, binding: binding)["timing"] as! [String: Any]
    let fields = ["callback_clock", "observed_at_estimate", "estimate_basis", "uncertainty_ms"]
    expect(fields.allSatisfy { noDomain[$0] is NSNull } && fields.allSatisfy { noStatus[$0] is NSNull }
           && noDomain["sample_pts_seconds"] as? Double == 12.345 && noStatus["sample_pts_seconds"] as? Double == 12.345,
           "without a supplied clock domain, or without the saved anchor, the clock and estimate stay unknown and the PTS is kept")

    var atAnchor = record
    atAnchor.hostTime = anchorHost
    atAnchor.presentationTime = -0.5
    let zero = try mapped(atAnchor, status: saved, identity: trustedIdentity, binding: binding)["timing"] as! [String: Any]
    let zeroClock = zero["callback_clock"] as! [String: Any]
    expect(zero["observed_at_estimate"] as? String == "2026-09-21T14:13:20.000Z" && zeroClock["elapsed_ms"] as? Int == 0
           && zero["sample_pts_seconds"] as? Double == -0.5,
           "a callback at the anchor gives 0 ms and the anchor itself; a negative PTS is kept")
}

func checkOrientations(record: KeyframeRecord, saved: CaptureStatus, binding: OriginalArtifactBinding) throws {
    var values: [Int?] = []
    var unapplied = true
    let orientations: [Int?] = [nil, 1, 2, 3, 4, 5, 6, 7, 8]
    for orientation in orientations {
        var variant = record
        variant.orientation = orientation
        let value = try mapped(variant, status: saved, identity: trustedIdentity, binding: binding)["orientation"] as! [String: Any]
        values.append(value["value"] as? Int)
        unapplied = unapplied && value["system"] as? String == "CGImagePropertyOrientation"
            && value["applied_to_pixels"] as? Bool == false
        try emit("orientation-\(orientation.map { String($0) } ?? "null")", record: variant, status: saved,
                 identity: trustedIdentity, binding: binding)
    }
    expect(values == [nil, 1, 2, 3, 4, 5, 6, 7, 8] && unapplied,
           "all eight CGImagePropertyOrientation values, mirrored ones included, and an absent value (null) are kept, never applied")
}

func checkRefusals(record: KeyframeRecord, saved: CaptureStatus, binding: OriginalArtifactBinding) {
    func changedRecord(_ change: (inout KeyframeRecord) -> Void) -> KeyframeRecord {
        var copy = record
        change(&copy)
        return copy
    }
    func changedStatus(_ change: (inout CaptureStatus) -> Void) -> CaptureStatus {
        var copy = saved
        change(&copy)
        return copy
    }
    func changedBinding(source: OriginalSourceRef? = nil, sha256: String? = nil, byteLength: Int? = nil,
                        mediaType: String? = nil, kind: String? = nil, version: String? = nil) -> OriginalArtifactBinding {
        let artifact = binding.artifact
        return OriginalArtifactBinding(
            contractVersion: version ?? binding.contractVersion, source: source ?? binding.source,
            artifact: OriginalArtifactReference(artifactID: artifact.artifactID, sha256: sha256 ?? artifact.sha256,
                                                byteLength: byteLength ?? artifact.byteLength,
                                                mediaType: mediaType ?? artifact.mediaType),
            kind: kind ?? binding.kind)
    }
    func changedIdentity(frameID: String? = nil, source: OriginalSourceRef? = nil, deviceID: String? = nil,
                         domain: String? = nil) -> RawFrameIdentity {
        RawFrameIdentity(frameID: frameID ?? trustedIdentity.frameID, source: source ?? trustedSource,
                         deviceID: deviceID ?? trustedIdentity.deviceID, sessionID: trustedIdentity.sessionID,
                         streamID: trustedIdentity.streamID, callbackClockDomain: domain ?? trustedIdentity.callbackClockDomain)
    }
    func withRecord(_ changed: KeyframeRecord) -> () throws -> Data {
        { try mapJSON(changed, status: saved, identity: trustedIdentity, binding: binding) }
    }
    func withStatus(_ changed: CaptureStatus) -> () throws -> Data {
        { try mapJSON(record, status: changed, identity: trustedIdentity, binding: binding) }
    }
    func withBinding(_ changed: OriginalArtifactBinding) -> () throws -> Data {
        { try mapJSON(record, status: saved, identity: trustedIdentity, binding: changed) }
    }
    func withIdentity(_ changed: RawFrameIdentity) -> () throws -> Data {
        { try mapJSON(record, status: saved, identity: changed, binding: binding) }
    }

    let otherSource = OriginalSourceRef(userID: "user-1", sourceID: "display-source-2", sourceVersion: 1)
    let otherVersion = OriginalSourceRef(userID: "user-1", sourceID: "display-source-1", sourceVersion: 2)
    let invalidSource = OriginalSourceRef(userID: "user 1", sourceID: "display-source-1", sourceVersion: 1)
    let cases: [(String, String, () throws -> Data)] = [
        ("a binding for another source", "binding", withBinding(changedBinding(source: otherSource))),
        ("a binding for another source version", "binding", withBinding(changedBinding(source: otherVersion))),
        ("a binding whose SHA-256 differs from the kept file", "binding",
         withBinding(changedBinding(sha256: String(repeating: "0", count: 64)))),
        ("a binding whose length differs from the kept file", "binding",
         withBinding(changedBinding(byteLength: record.byteLength + 1))),
        ("a binding for editable ink", "binding", withBinding(changedBinding(kind: "editable_ink"))),
        ("a binding for a JPEG", "binding", withBinding(changedBinding(mediaType: "image/jpeg"))),
        ("a binding of another contract version", "binding", withBinding(changedBinding(version: "0.2.4"))),
        ("orientation 0", "record", withRecord(changedRecord { $0.orientation = 0 })),
        ("orientation 9", "record", withRecord(changedRecord { $0.orientation = 9 })),
        ("buffer sequence 0", "record", withRecord(changedRecord { $0.sequence = 0 })),
        ("buffer sequence 2^53", "record", withRecord(changedRecord { $0.sequence = 9_007_199_254_740_992 })),
        ("a zero width", "record", withRecord(changedRecord { $0.width = 0 })),
        ("a record that is not a PNG", "record", withRecord(changedRecord { $0.mediaType = "image/jpeg" })),
        ("an uppercase SHA-256 in the record", "record", withRecord(changedRecord { $0.sha256 = $0.sha256.uppercased() })),
        ("a record over 32 MiB", "record", withRecord(changedRecord { $0.byteLength = 32 * 1024 * 1024 + 1 })),
        ("a NaN sample PTS", "record", withRecord(changedRecord { $0.presentationTime = .nan })),
        ("an infinite sample PTS", "record", withRecord(changedRecord { $0.presentationTime = .infinity })),
        ("a NaN callback host time", "record", withRecord(changedRecord { $0.hostTime = .nan })),
        ("a status of another local capture session", "clock",
         withStatus(changedStatus { $0.session = "20260930T041501Z-FFFFFFFF" })),
        ("a callback before the session anchor", "clock", withRecord(changedRecord { $0.hostTime = anchorHost - 0.001 })),
        ("a NaN anchor host time", "clock", withStatus(changedStatus { $0.startedHostTime = .nan })),
        ("a negative anchor host time", "clock", withStatus(changedStatus { $0.startedHostTime = -1 })),
        ("a wall anchor before 1970", "clock", withStatus(changedStatus { $0.startedWallTime = Date(timeIntervalSince1970: -1) })),
        ("an elapsed time that overflows", "clock", withRecord(changedRecord { $0.hostTime = 1e300 })),
        ("an estimate after year 9999", "clock",
         withStatus(changedStatus { $0.startedWallTime = Date(timeIntervalSince1970: 253_402_300_799) })),
        ("an invalid frame ID", "identity", withIdentity(changedIdentity(frameID: "raw frame"))),
        ("an empty device ID", "identity", withIdentity(changedIdentity(deviceID: ""))),
        ("an invalid clock domain", "identity", withIdentity(changedIdentity(domain: "clock a"))),
        ("an invalid source", "identity", withIdentity(changedIdentity(source: invalidSource))),
        ("no named local capture session", "identity",
         { try mapJSON(record, status: saved, identity: trustedIdentity, binding: binding, session: "") }),
    ]
    for (name, expected, body) in cases {
        expect(refusalKind(body) == expected, "refuses \(name), as a \(expected) error")
    }
}

func run() throws {
    let session = root.appending(path: localSession, directoryHint: .isDirectory)
    let record = try keptKeyframe(in: session)
    let memory = CaptureStatus(session: localSession, state: "started", startedWallTime: anchorWall,
                               startedHostTime: anchorHost, updatedWallTime: anchorWall)
    let saved = try savedCopy(memory, at: session.appending(path: "status.json"))
    let binding = try waitFor { () async throws -> OriginalArtifactBinding in
        let uploader = try OriginalUploader(session: session, transport: NoTransport())
        return try await uploader.enqueue(record, source: trustedSource).binding
    }
    // Every mapping and refusal below runs inside this window; fixtures are written elsewhere.
    let before = snapshot(session)
    try checkMapping(record: record, saved: saved, memory: memory, binding: binding)
    try checkUnknownClock(record: record, saved: saved, binding: binding)
    try checkOrientations(record: record, saved: saved, binding: binding)
    checkRefusals(record: record, saved: saved, binding: binding)

    var atAnchor = record
    atAnchor.hostTime = anchorHost
    atAnchor.presentationTime = -0.5
    var largest = record
    largest.sequence = 9_007_199_254_740_991
    try emit("saved-anchor", record: record, status: saved, identity: trustedIdentity, binding: binding)
    try emit("fractional-anchor", record: record, status: memory, identity: trustedIdentity, binding: binding)
    try emit("no-clock-domain", record: record, status: saved, identity: identityWithoutClockDomain(), binding: binding)
    try emit("no-status", record: record, status: nil, identity: trustedIdentity, binding: binding)
    try emit("zero-elapsed-negative-pts", record: atAnchor, status: saved, identity: trustedIdentity, binding: binding)
    try emit("largest-buffer-sequence", record: largest, status: saved, identity: trustedIdentity, binding: binding)
    expect(snapshot(session) == before,
           "all mappings and refusals leave the PNG, its record, the status and the upload state byte-identical")
}

// MARK: - Run

do {
    try FileManager.default.createDirectory(at: fixtures, withIntermediateDirectories: true)
    guard try FileManager.default.contentsOfDirectory(atPath: fixtures.path(percentEncoded: false)).isEmpty else {
        print("FAIL the fixture directory \(fixtures.path(percentEncoded: false)) must be absent or empty")
        exit(2)
    }
    try run()
    try JSONSerialization.data(withJSONObject: ["local_session": localSession, "cases": manifest] as [String: Any],
                               options: [.prettyPrinted, .sortedKeys])
        .write(to: fixtures.appending(path: "manifest.json"))
} catch {
    expect(false, "the checks ran to completion (\(error))")
}
let keptName: String? = CommandLine.arguments.count > 1 ? nil : "fixtures"
for entry in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    where entry.lastPathComponent != keptName {
    try? FileManager.default.removeItem(at: entry)
}
print("fixtures: \(fixtures.path(percentEncoded: false))")
if failures > 0 {
    print("\(failures) raw capture frame check(s) failed")
    exit(1)
}
print("all raw capture frame checks passed")
