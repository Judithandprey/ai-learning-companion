import Foundation

// Maps one kept ScreenObserver keyframe to an exact `RawCaptureFrame` 0.2.5 descriptor
// (packages/contracts/capture_frame) as canonical JSON: sorted keys, no whitespace.
//
// Pure: it reads and writes no file. A refusal is a thrown error, and it can never consume, move
// or delete an original PNG or its sidecars. Nothing in the app calls it yet.
//
// Every identity comes from the caller, who must hold it from a trusted, current registration: the
// frame ID, source version, device, session and stream, and the callback clock domain. Nothing
// here registers a source, mints an identity or clock domain, or grants producer permission. The
// original binding is the complete OriginalArtifactBinding 0.2.2 of this frame's PNG, for example
// from its upload record. The caller also names the local capture session that the record and
// status were read from. A status of another session is refused. The record has no session field,
// so the caller is responsible for reading it from that same session.
//
// What the producer actually knows, and therefore what the descriptor says:
// - `captured_at` is null: the pixel-capture UTC is unknown.
// - `media_position` is null. The sample PTS is not a course playhead. It is kept separately as
//   `sample_pts_seconds`.
// - `buffer_sequence` is the native video-buffer count, not a process sequence.
// - `raw_width`, `raw_height` and `orientation` describe the delivered buffer, unrotated. The
//   orientation is the recorded CGImagePropertyOrientation value 1–8, or null when none was
//   reported; it is never applied.
// - `timing` holds only a callback-observation estimate: the saved session wall anchor plus the
//   monotonic host-time delta to the keyframe's callback, labeled with that basis, with unknown
//   (null) uncertainty. The saved wall anchor has whole-second resolution (ISO 8601 in
//   status.json), which the estimate inherits. Without a supplied clock domain and a saved anchor,
//   the callback clock and the estimate stay unknown.

/// The caller's explicitly supplied, trusted identity for one frame of the current capture
/// incarnation. None of it is derived from local files.
struct RawFrameIdentity {
    let frameID: String
    let source: OriginalSourceRef
    let deviceID: String
    let sessionID: String
    let streamID: String
    /// The callback-observation clock domain of this producer incarnation, or nil when unknown. A
    /// restarted producer needs a new domain.
    let callbackClockDomain: String?
}

enum RawCaptureFrame {
    static let contractVersion = "0.2.5"
    static let estimateBasis = "session_wall_plus_callback_monotonic_delta"
    /// 9999-12-31T23:59:59.999Z, the last instant a four-digit UTC timestamp can express.
    static let maxEpochMilliseconds: Int64 = 253_402_300_799_999

    enum MappingError: Error, Equatable {
        case identity(String)
        case record(String)
        case binding(String)
        case clock(String)
    }

    /// The exact 0.2.5 JSON for `record`, or a thrown `MappingError`.
    ///
    /// `localSession` names the ScreenObserver capture session (its directory, `CaptureStatus.session`)
    /// that `record` and `status` were read from. A `KeyframeRecord` has no session field, so the
    /// caller owns that provenance for the record. A `status` of any other session is refused. Pass
    /// a nil `status` when the session's saved anchor is not available; the clock is then unknown.
    static func json(record: KeyframeRecord, localSession: String, status: CaptureStatus?,
                     identity: RawFrameIdentity, binding: OriginalArtifactBinding) throws -> Data {
        try check(identity)
        try check(record)
        try check(binding, of: record, source: identity.source)
        guard !localSession.isEmpty else { throw MappingError.identity("no local capture session was named") }
        if let status, !status.session.utf8.elementsEqual(localSession.utf8) {
            throw MappingError.clock("the saved status belongs to another local capture session")
        }
        let timing = try timingJSON(record: record, status: status, domain: identity.callbackClockDomain)
        let artifact = binding.artifact
        let source = identity.source
        let orientation = record.orientation.map { String($0) } ?? "null"
        return Data(#"{"artifact":{"artifact_id":"\#(artifact.artifactID)","byte_length":\#(artifact.byteLength),"media_type":"\#(artifact.mediaType)","sha256":"\#(artifact.sha256)"},"buffer_sequence":\#(record.sequence),"captured_at":null,"contract_version":"\#(contractVersion)","device_id":"\#(identity.deviceID)","frame_id":"\#(identity.frameID)","kind":"raw_capture_frame","media_position":null,"orientation":{"applied_to_pixels":false,"system":"CGImagePropertyOrientation","value":\#(orientation)},"raw_height":\#(record.height),"raw_width":\#(record.width),"session_id":"\#(identity.sessionID)","source":{"source_id":"\#(source.sourceID)","source_version":\#(source.sourceVersion),"user_id":"\#(source.userID)"},"stream_id":"\#(identity.streamID)","timing":\#(timing)}"#.utf8)
    }

    // MARK: - Checks

    private static func check(_ identity: RawFrameIdentity) throws {
        let identifiers = [("frame_id", identity.frameID), ("device_id", identity.deviceID),
                           ("session_id", identity.sessionID), ("stream_id", identity.streamID)]
        for (name, value) in identifiers where !OriginalUpload.isIdentifier(value) {
            throw MappingError.identity("the \(name) is not a contract Identifier")
        }
        if let domain = identity.callbackClockDomain, !OriginalUpload.isIdentifier(domain) {
            throw MappingError.identity("the callback clock domain is not a contract Identifier")
        }
        guard identity.source.isValid else { throw MappingError.identity("the source is not a valid SourceRef") }
    }

    private static func check(_ record: KeyframeRecord) throws {
        let safe = 1...OriginalUpload.maxSafeInteger
        guard safe.contains(record.sequence) else {
            throw MappingError.record("the buffer sequence \(record.sequence) is not a positive safe integer")
        }
        guard safe.contains(record.width), safe.contains(record.height) else {
            throw MappingError.record("the raw size \(record.width)×\(record.height) is not positive")
        }
        if let orientation = record.orientation, !(1...8).contains(orientation) {
            throw MappingError.record("the orientation \(orientation) is not a CGImagePropertyOrientation value 1–8")
        }
        guard record.mediaType == OriginalUpload.mediaType, OriginalUpload.isSHA256Hex(record.sha256),
              (1...OriginalUpload.maxOriginalBytes).contains(record.byteLength) else {
            throw MappingError.record("the kept file is not described as a PNG of 1 byte to 32 MiB with a lowercase SHA-256")
        }
        guard record.presentationTime.isFinite else { throw MappingError.record("the sample PTS is not finite") }
        guard record.hostTime.isFinite else { throw MappingError.record("the callback host time is not finite") }
    }

    private static func check(_ binding: OriginalArtifactBinding, of record: KeyframeRecord,
                              source: OriginalSourceRef) throws {
        let artifact = binding.artifact
        guard binding.contractVersion == OriginalUpload.contractVersion, binding.kind == OriginalUpload.kind,
              artifact.mediaType == OriginalUpload.mediaType, OriginalUpload.isIdentifier(artifact.artifactID),
              binding.source.isValid else {
            throw MappingError.binding("the binding is not a valid 0.2.2 screen_image PNG original")
        }
        // Validated ASCII on both sides, so these comparisons are byte for byte.
        guard binding.source == source else {
            throw MappingError.binding("the binding belongs to another owner, source or version")
        }
        guard artifact.sha256 == record.sha256, artifact.byteLength == record.byteLength else {
            throw MappingError.binding("the binding's SHA-256 or length differs from the kept frame")
        }
    }

    // MARK: - Timing

    private static func timingJSON(record: KeyframeRecord, status: CaptureStatus?, domain: String?) throws -> String {
        let pts = String(record.presentationTime) // Finite: shortest round-trip JSON number.
        guard let domain, let status else {
            return #"{"callback_clock":null,"estimate_basis":null,"observed_at_estimate":null,"sample_pts_seconds":\#(pts),"uncertainty_ms":null}"#
        }
        // Host times (CACurrentMediaTime) and Date offsets are in seconds; the descriptor's elapsed
        // value and the estimate are whole milliseconds, rounded down.
        let anchorHostSeconds = status.startedHostTime
        guard anchorHostSeconds.isFinite, anchorHostSeconds >= 0 else {
            throw MappingError.clock("the saved session host-time anchor is not a finite, nonnegative value")
        }
        let elapsedSeconds = record.hostTime - anchorHostSeconds
        guard elapsedSeconds >= 0 else {
            throw MappingError.clock("the keyframe callback precedes the saved session anchor, so they are not the same capture incarnation")
        }
        let elapsedMilliseconds = (elapsedSeconds * 1000).rounded(.down)
        let anchorWallMilliseconds = (status.startedWallTime.timeIntervalSince1970 * 1000).rounded(.down)
        guard anchorWallMilliseconds.isFinite, anchorWallMilliseconds >= 0 else {
            throw MappingError.clock("the saved session wall anchor is not a time from 1970 on")
        }
        guard elapsedMilliseconds <= Double(OriginalUpload.maxSafeInteger),
              anchorWallMilliseconds + elapsedMilliseconds <= Double(maxEpochMilliseconds) else {
            throw MappingError.clock("the callback time overflows the timestamp range")
        }
        let elapsedMS = Int64(elapsedMilliseconds)
        let estimate = utcTimestamp(milliseconds: Int64(anchorWallMilliseconds) + elapsedMS)
        return #"{"callback_clock":{"domain_id":"\#(domain)","elapsed_ms":\#(elapsedMS),"uncertainty_ms":null},"estimate_basis":"\#(estimateBasis)","observed_at_estimate":"\#(estimate)","sample_pts_seconds":\#(pts),"uncertainty_ms":null}"#
    }

    private static let secondsFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return formatter
    }()

    /// `yyyy-MM-ddTHH:mm:ss.SSSZ` in UTC, from whole milliseconds since 1970 (0 to `maxEpochMilliseconds`).
    static func utcTimestamp(milliseconds: Int64) -> String {
        let seconds = Date(timeIntervalSince1970: TimeInterval(milliseconds / 1000))
        return secondsFormatter.string(from: seconds) + String(format: ".%03lldZ", milliseconds % 1000)
    }
}
