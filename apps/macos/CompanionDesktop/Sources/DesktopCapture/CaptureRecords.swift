import Foundation

/// Engineering defaults for one capture session, recorded with it. They are starting points to
/// be measured on a real Mac, not accepted coverage.
public struct CaptureSettings: Codable, Equatable, Sendable {
    /// Requested `SCStreamConfiguration.minimumFrameInterval`, in seconds.
    public var minimumFrameInterval: Double
    /// Most bytes of kept PNG per session. The first new pixels that do not fit end retention for
    /// the session.
    public var byteCap: Int
    /// A longer silence between callbacks is recorded as a gap, and without a callback for this
    /// long the current screen is unknown.
    public var silenceLimit: Double
    public var showsCursor: Bool

    public static let engineeringDefaults = CaptureSettings(
        minimumFrameInterval: 2, byteCap: 2 * 1024 * 1024 * 1024, silenceLimit: 6, showsCursor: true)
}

/// The display chosen for one session, as the system described it when capture started.
public struct DisplayFacts: Codable, Equatable, Sendable {
    /// `CGDirectDisplayID`. It is not guaranteed to be stable across reconnections or restarts.
    public var displayID: UInt32
    /// AppKit's localized screen name, or nil if no screen matched the display.
    public var name: String?
    /// `SCDisplay.frame`, in points in the global display space.
    public var frame: RecordedRect
    /// `SCShareableContentInfo.pointPixelScale` for the whole-display filter.
    public var pointPixelScale: Double
    /// The requested output size, in pixels. Each kept frame records its delivered size.
    public var requestedWidth: Int
    public var requestedHeight: Int
    /// `CGDisplayRotation`, in degrees. Recorded; kept pixels are never rotated.
    public var rotationDegrees: Double
    public var isMain: Bool
    /// What the filter includes, in words.
    public var scope: String

    public init(displayID: UInt32, name: String?, frame: RecordedRect, pointPixelScale: Double, requestedWidth: Int,
                requestedHeight: Int, rotationDegrees: Double, isMain: Bool, scope: String) {
        self.displayID = displayID
        self.name = name
        self.frame = frame
        self.pointPixelScale = pointPixelScale
        self.requestedWidth = requestedWidth
        self.requestedHeight = requestedHeight
        self.rotationDegrees = rotationDegrees
        self.isMain = isMain
        self.scope = scope
    }
}

/// One kept frame: the delivered buffer at its own size, not rotated, as lossless PNG.
/// `pixelFormat` is the delivered buffer's; `encoding`, `mediaType`, `byteLength` and `sha256`
/// describe the file actually written. Local only; not a wire contract or an original binding.
public struct KeptFrame: Codable, Equatable, Sendable {
    /// Path relative to the session directory.
    public var file: String
    /// The callback's position in the session, from 1.
    public var sequence: Int
    /// `HostClock` seconds when the callback ran.
    public var callbackHost: Double
    public var facts: FrameFacts
    public var width: Int
    public var height: Int
    public var pixelFormat: String
    public var mediaType: String
    public var encoding: String
    public var byteLength: Int
    /// Lowercase hexadecimal SHA-256 of the file's bytes.
    public var sha256: String
}

/// Callbacks of one kind that arrived consecutively.
public struct CallbackRun: Codable, Equatable, Sendable {
    /// idle, blank, suspended, a `missing`/`unknown_<raw>` status, or `not_retained_<reason>`.
    public var kind: String
    /// Whether the screen is unknown for this run.
    public var isGap: Bool
    public var firstSequence: Int
    public var lastSequence: Int
    public var firstHost: Double
    public var lastHost: Double
}

/// How and when a session ended.
public struct Ending: Codable, Equatable, Sendable {
    /// user_stop, display_disconnected, system_sleep, start_failed, app_quit, a `StopReason` kind,
    /// or unknown.
    public var reason: String
    public var detail: String?
    /// `HostClock` seconds when live claims ended (the gate closed).
    public var liveEndedHost: Double
    /// `HostClock` seconds and wall time when the session was closed, after the stream had
    /// stopped where that could be awaited.
    public var host: Double
    public var wall: Date
}

/// The latest state of one session, rewritten atomically as `status.json`.
public struct SessionStatus: Codable, Equatable, Sendable {
    public var session: String
    /// Wall time and `HostClock` seconds read together when the session was created. Other host
    /// times convert to an estimated wall time only through this pair; none is a measured
    /// capture time.
    public var startedWall: Date
    public var startedHost: Double
    public var updatedWall: Date
    public var display: DisplayFacts
    public var settings: CaptureSettings
    /// `CGPreflightScreenCaptureAccess()` just before the session was created.
    public var permissionPreflightAtStart: Bool
    /// When `SCStream.startCapture` returned, if it did.
    public var streamStartedHost: Double?
    /// Callbacks accepted while live, by `FrameFacts.status`.
    public var callbacks = 0
    public var callbacksByStatus: [String: Int] = [:]
    public var lastCallbackHost: Double?
    public var lastCallbackStatus: String?
    /// The last callback that delivered new pixels (complete, with an image).
    public var lastNewPixelsHost: Double?
    public var lastNewPixelsSequence: Int?
    /// Whether, by the system's report, the last new pixels are still the screen's content: set
    /// by new pixels, kept by `idle`, cleared by any callback without usable pixels.
    public var pixelsCurrent = false
    public var keptFrames = 0
    public var bytesKept = 0
    public var lastKept: KeptFrame?
    /// New pixels that were not kept, by reason.
    public var notRetained: [String: Int] = [:]
    public var gaps = 0
    /// The run still being counted; its event is written when it ends.
    public var openRun: CallbackRun?
    /// Nonzero means events.jsonl is incomplete.
    public var eventWriteFailures = 0
    public var statusWriteFailures = 0
    /// Why keeping stopped, if a failed candidate could not be removed.
    public var storeStoppedReason: String?
    /// Callbacks that arrived after live claims ended. They are never kept.
    public var callbacksAfterLiveEnded = 0
    public var ending: Ending?
}

/// One line of `events.jsonl`.
public struct CaptureEvent: Codable, Equatable, Sendable {
    /// session_created, stream_started, kept, run, gap, stream_status, ended, callback_after_end,
    /// or a named note (display_parameters_changed, stream_error_after_live_ended,
    /// stream_stopped_after_start_returned).
    public var event: String
    public var host: Double
    public var wall: Date?
    public var detail: [String: String]?
    public var frame: KeptFrame?
    public var run: CallbackRun?

    public init(event: String, host: Double, wall: Date? = nil, detail: [String: String]? = nil,
                frame: KeptFrame? = nil, run: CallbackRun? = nil) {
        self.event = event
        self.host = host
        self.wall = wall
        self.detail = detail
        self.frame = frame
        self.run = run
    }
}

/// JSON for the local session files: sorted keys, wall times as UTC ISO 8601 with milliseconds.
/// An unknown (nil) value is omitted, not written as null.
public enum CaptureFiles {
    static let wallFormat = Date.ISO8601FormatStyle(includingFractionalSeconds: true)

    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(wallFormat.format(date))
        }
        return encoder
    }()

    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            return try wallFormat.parse(text)
        }
        return decoder
    }()
}
