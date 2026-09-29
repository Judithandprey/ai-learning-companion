import Foundation

/// Local-only files shared by the app and its broadcast upload extension through an App
/// Group:
///
///     Capture/<session>/status.json     latest state and counts, rewritten atomically
///     Capture/<session>/events.jsonl    append-only lifecycle, keyframe, not-retained and gap events
///     Capture/<session>/frames/*.jpg    kept keyframes: lossy JPEG re-encodes of the delivered
///                                       buffers, not rotated
///
/// This is not a wire contract. Nothing here is sent anywhere, and any upload must use the
/// formal contract assigned by the lead.
enum CaptureStore {
    /// Placeholder App Group. The real identifier follows user input U6.
    static let appGroup = "group.org.example.learningcompanion"

    /// `Capture` inside the App Group container, or nil when this build has no App Group,
    /// for example an unsigned build.
    static var root: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appending(path: "Capture", directoryHint: .isDirectory)
    }

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

/// The latest state of one broadcast session.
struct CaptureStatus: Codable {
    var session: String
    /// started, paused, resumed or finished.
    var state: String
    var startedWallTime: Date
    /// `CACurrentMediaTime()` at start, paired with `startedWallTime` to convert host times.
    var startedHostTime: Double
    var updatedWallTime: Date
    var videoBuffers = 0
    var keyframesKept = 0
    /// Not kept because a sparse luma grid matched the last kept frame. A matching grid does
    /// not prove the pixels were unchanged.
    var notRetainedByHeuristic = 0
    var notRetainedWithinInterval = 0
    var notRetainedAfterCap = 0
    var notRetainedWithoutImage = 0
    var keyframeWriteFailures = 0
    /// Nonzero means events.jsonl is incomplete: some events could not be written.
    var eventWriteFailures = 0
    var audioBuffersNotCaptured = 0
    var bytesKept = 0
    var gaps = 0
    var lastKeyframe: KeyframeRecord?
}

/// One kept keyframe: the delivered buffer at native size, not rotated, re-encoded as a lossy
/// JPEG (quality 0.85, sRGB). `pixelFormat` is the delivered buffer's format, not the file's.
struct KeyframeRecord: Codable {
    /// Path relative to the session directory.
    var file: String
    /// Position among all video buffers received in the session, starting at 1.
    var sequence: Int
    /// The sample buffer's presentation time, in seconds.
    var presentationTime: Double
    /// `CACurrentMediaTime()` when the buffer arrived.
    var hostTime: Double
    var width: Int
    var height: Int
    /// `CGImagePropertyOrientation` raw value from `RPVideoSampleOrientationKey`, if present.
    /// It is recorded, not applied to the stored pixels.
    var orientation: Int?
    var pixelFormat: String
}

/// One line of `events.jsonl`.
struct CaptureEvent: Codable {
    /// started, paused, resumed, finished, keyframe, not_retained, audio_not_captured or gap.
    /// Every not_retained and gap event carries its sequence and time range in `detail`.
    var event: String
    var hostTime: Double
    var wallTime: Date?
    var detail: [String: String]?
    var keyframe: KeyframeRecord?
}
