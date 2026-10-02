import CoreGraphics
import Foundation

// The private desktop-to-connector interface of ADR 0004, version 1: JSON lines between this app
// and its own connector child, for one bounded live companion session. It is local process IPC,
// not a capture protocol. A request is `{version, id, method, params}`; an answer is `{id, result}`
// or `{id, error: {code, submission}}`; an event is `{method, params}`. One child speaks one
// version: a child started for this one is never sent `lc-subscription-ask/1` lines.
//
// The connector owns the official login, tokens, the session's bounds and the model call. Nothing
// here reads, holds or shows a credential, and nothing here is the connector's validator: these
// types build exactly the shapes it admits and read exactly the shapes it answers.

/// Whether a refused request had reached the service, as the connector reports it. It is a fact
/// of its own, apart from why the request was refused.
public enum LiveSubmission: String, Equatable, Sendable {
    case notSubmitted = "not_submitted"
    case submitted
    case unknown

    /// Fixed words for the card and the session line.
    public var words: String {
        switch self {
        case .notSubmitted: return "It did not reach ChatGPT"
        case .submitted: return "It had reached ChatGPT"
        case .unknown: return "Whether it reached ChatGPT is not known"
        }
    }
}

/// A typed refusal of one request. The connector sends no message text; the words are this app's.
public struct LiveError: Equatable, Sendable {
    /// One of `LiveWire.errorCodes`.
    public var code: String
    public var submission: LiveSubmission

    public init(code: String, submission: LiveSubmission) {
        self.code = code
        self.submission = submission
    }

    /// Whether the session is over after this refusal. The connector stops its session after
    /// every failure of a request that may have reached the service, and after auth, quota, model
    /// and lifecycle failures; nothing is sent again by itself, and only the user starts another.
    /// A request that was only not taken (`busy`), replaced (`stale_context`), cancelled, malformed,
    /// or refused by this session's own request bound before it was sent leaves the session usable.
    public var endsSession: Bool {
        if submission == .unknown { return true }
        switch code {
        case "busy", "cancelled", "stale_context", "invalid_request": return false
        case "budget_reached": return submission != .notSubmitted
        default: return true
        }
    }

    /// A refusal that comes from the account or the service, not from this session's own bounds.
    public var isOfficial: Bool {
        ["allowance_exhausted", "rate_limited", "allowance_unknown", "workspace_limit", "ordinary_usage_not_allowed",
         "unauthenticated", "unsupported_model", "overloaded", "context_limit"].contains(code)
    }

    /// Fixed words: the reason, never the connector's or the service's own text.
    public var words: String { LiveWire.words(for: self) }
}

/// The bounds of one session, chosen by the user before Start. Never clamped or changed here.
public struct LivePolicy: Equatable, Sendable {
    public var maxSubmissions: Int
    public var maxSessionMS: Int
    public var minObservationIntervalMS: Int

    /// What this version of the interface admits. They are implementation bounds, not user limits.
    public static let submissions = 1...100
    public static let sessionMS = 1_000...3_600_000
    public static let observationIntervalMS = 500...60_000
    /// The values the fields start with: an engineering preset, the same as the Windows client's,
    /// not a product decision and not the user's spending limit.
    public static let preset = LivePolicy(maxSubmissions: 60, maxSessionMS: 30 * 60_000, minObservationIntervalMS: 30_000)

    public init(maxSubmissions: Int, maxSessionMS: Int, minObservationIntervalMS: Int) {
        self.maxSubmissions = maxSubmissions
        self.maxSessionMS = maxSessionMS
        self.minObservationIntervalMS = minObservationIntervalMS
    }

    /// Why this policy cannot be used, or nil. A value out of bounds is refused, never clamped.
    public var problem: String? {
        guard Self.submissions.contains(maxSubmissions) else { return "the requests must be a whole number from 1 to 100" }
        guard Self.sessionMS.contains(maxSessionMS) else { return "the session must last from 1 second to 60 minutes" }
        guard Self.observationIntervalMS.contains(minObservationIntervalMS) else {
            return "the time between two unattended looks must be from half a second to 60 seconds"
        }
        return nil
    }

    /// The last requests of a session are kept for the user's own focus and follow-ups: one fifth,
    /// at least one. It is the connector's rule; unattended looks stop when only these are left.
    public var reserve: Int { max(1, (maxSubmissions + 4) / 5) }
    /// How many requests of any kind may have been used when an unattended look is still sent.
    public var observationLimit: Int { maxSubmissions - reserve }

    var json: JSONValue {
        .object(["max_submissions": .integer(maxSubmissions), "max_session_ms": .integer(maxSessionMS),
                 "min_observation_interval_ms": .integer(minObservationIntervalMS)])
    }
}

/// The account's usage as the official app server reported it, read by `connection/read` only.
/// Unavailable differs from zero, null differs from false, and a balance is the server's own text:
/// nothing here is computed, estimated or turned into money.
public struct LiveQuota: Equatable, Sendable {
    public struct Span: Equatable, Sendable {
        public var usedPercent: Int
        public var durationMinutes: Int?
        public var resetsAt: String?
    }

    public struct Credits: Equatable, Sendable {
        public var hasCredits: Bool
        public var unlimited: Bool
        /// The server's exact text, or nil when it reported none.
        public var balance: String?
    }

    public struct IndividualLimit: Equatable, Sendable {
        public var limit: String
        public var used: String
        public var remainingPercent: Int
        public var resetsAt: String
    }

    public struct Window: Equatable, Sendable {
        public var limitID: String?
        public var modelSlug: String?
        public var primary: Span?
        public var secondary: Span?
        public var credits: Credits?
        /// One of `LiveQuota.reachedTypes`, or nil.
        public var reached: String?
        public var spendControlReached: Bool?
        public var individualLimit: IndividualLimit?
    }

    public var available: Bool
    /// Whether included usage was allowed, as reported; nil when it was not reported. False says
    /// nothing about credits, and none of these facts is used here to refuse or allow a request.
    public var ordinaryUsageAllowed: Bool?
    public var windows: [Window]

    static let reachedTypes: [String: String] = [
        "rate_limit_reached": "rate limit reached",
        "workspace_owner_credits_depleted": "the workspace owner's credits are used up",
        "workspace_member_credits_depleted": "this member's credits are used up",
        "workspace_owner_usage_limit_reached": "the workspace owner's usage limit is reached",
        "workspace_member_usage_limit_reached": "this member's usage limit is reached",
    ]

    /// The `quota` object in its exact shape; nil for anything else.
    static func parse(_ value: Any?) -> LiveQuota? {
        guard let object = MacIngressUpload.closed(value, ["available", "ordinary_usage_allowed", "windows"]),
              let available = MacIngressUpload.boolean(object["available"]),
              object["ordinary_usage_allowed"] is NSNull || MacIngressUpload.boolean(object["ordinary_usage_allowed"]) != nil,
              let rows = object["windows"] as? [Any], rows.count <= 100 else { return nil }
        let allowed = MacIngressUpload.boolean(object["ordinary_usage_allowed"])
        // An unavailable quota states nothing.
        if !available, allowed != nil || !rows.isEmpty { return nil }
        func optional<T>(_ value: Any?, _ read: (Any?) -> T?) -> T?? {
            if value is NSNull { return .some(nil) }
            return read(value).map { .some($0) }
        }
        func identifier(_ value: Any?) -> String? {
            guard let text = value as? String, AskWire.isIdentifier(text) else { return nil }
            return text
        }
        func time(_ value: Any?) -> String? {
            guard let text = value as? String, text.utf8.count <= 64, MacIngressUpload.isUTCTimestamp(text) else { return nil }
            return text
        }
        func bounded(_ value: Any?) -> String? {
            guard let text = value as? String, text.unicodeScalars.count <= 128 else { return nil }
            return text
        }
        func span(_ value: Any?) -> Span? {
            guard let object = MacIngressUpload.closed(value, ["used_percent", "window_duration_mins", "resets_at"]),
                  let used = MacIngressUpload.integer(object["used_percent"]), used >= 0,
                  let duration = optional(object["window_duration_mins"], { MacIngressUpload.integer($0).flatMap { $0 >= 0 ? $0 : nil } }),
                  let resets = optional(object["resets_at"], time) else { return nil }
            return Span(usedPercent: used, durationMinutes: duration, resetsAt: resets)
        }
        func credits(_ value: Any?) -> Credits? {
            guard let object = MacIngressUpload.closed(value, ["has_credits", "unlimited", "balance"]),
                  let has = MacIngressUpload.boolean(object["has_credits"]), let unlimited = MacIngressUpload.boolean(object["unlimited"]),
                  let balance = optional(object["balance"], bounded) else { return nil }
            return Credits(hasCredits: has, unlimited: unlimited, balance: balance)
        }
        func individual(_ value: Any?) -> IndividualLimit? {
            guard let object = MacIngressUpload.closed(value, ["limit", "used", "remaining_percent", "resets_at"]),
                  let limit = bounded(object["limit"]), let used = bounded(object["used"]),
                  let remaining = MacIngressUpload.integer(object["remaining_percent"]),
                  (Int(Int32.min)...Int(Int32.max)).contains(remaining), let resets = time(object["resets_at"]) else { return nil }
            return IndividualLimit(limit: limit, used: used, remainingPercent: remaining, resetsAt: resets)
        }
        var windows: [Window] = []
        for row in rows {
            guard let object = MacIngressUpload.closed(row, ["limit_id", "normal_model_slug", "primary", "secondary", "credits",
                                                             "rate_limit_reached_type", "spend_control_reached", "individual_limit"]),
                  let limitID = optional(object["limit_id"], identifier), let slug = optional(object["normal_model_slug"], identifier),
                  let primary = optional(object["primary"], span), let secondary = optional(object["secondary"], span),
                  let credit = optional(object["credits"], credits),
                  let reached = optional(object["rate_limit_reached_type"], { ($0 as? String).flatMap { reachedTypes[$0] == nil ? nil : $0 } }),
                  let spend = optional(object["spend_control_reached"], MacIngressUpload.boolean),
                  let limit = optional(object["individual_limit"], individual) else { return nil }
            windows.append(Window(limitID: limitID, modelSlug: slug, primary: primary, secondary: secondary, credits: credit,
                                  reached: reached, spendControlReached: spend, individualLimit: limit))
        }
        return LiveQuota(available: available, ordinaryUsageAllowed: allowed, windows: windows)
    }

    /// The usage in fixed words, for the account's own section: what was reported, when, and that
    /// it is the account's and not this app's session bounds. `readAt` is the time of the read.
    public func lines(readAt: String) -> [String] {
        guard available else {
            return ["Usage as ChatGPT reported it at \(readAt): not available then (not known; this is not zero)."]
        }
        let included: String
        switch ordinaryUsageAllowed {
        case nil: included = "whether included usage was allowed was not reported"
        case true?: included = "included usage was allowed then"
        case false?: included = "included usage was NOT allowed then (this alone says nothing about credits)"
        }
        var lines = ["Usage as ChatGPT reported it at \(readAt) (the account's, not this app's session bounds; "
            + "Check Again reads it again): \(included)."]
        if windows.isEmpty { lines.append("No usage bucket was reported.") }
        for window in windows {
            var parts: [String] = []
            func span(_ name: String, _ span: Span?) {
                guard let span else { return }
                parts.append("\(name) window \(span.usedPercent)% used"
                    + (span.durationMinutes.map { " (\(Self.duration($0)))" } ?? "")
                    + (span.resetsAt.map { ", resets \($0)" } ?? ""))
            }
            span("first", window.primary)
            span("second", window.secondary)
            if let credits = window.credits {
                if credits.unlimited {
                    parts.append("credits: unlimited")
                } else {
                    let balance = credits.balance.flatMap { AskWire.shown($0, limit: 128) }
                    parts.append("credits: \(credits.hasCredits ? "some" : "none"), "
                        + (balance.map { "balance \($0) as ChatGPT states it (not an amount of money)" } ?? "balance not reported"))
                }
            } else {
                parts.append("credits not reported")
            }
            if let reached = window.reached { parts.append("reached: " + (Self.reachedTypes[reached] ?? "a limit")) }
            switch window.spendControlReached {
            case true?: parts.append("a spend control is reached")
            case false?: parts.append("no spend control is reached")
            case nil: break
            }
            if let own = window.individualLimit {
                let used = AskWire.shown(own.used, limit: 128) ?? "?", limit = AskWire.shown(own.limit, limit: 128) ?? "?"
                parts.append("your own limit: \(used) of \(limit) used, \(own.remainingPercent)% left, resets \(own.resetsAt)")
            }
            let name = (window.limitID.flatMap { AskWire.shown($0, limit: 128) } ?? "a bucket without a name")
                + (window.modelSlug.flatMap { AskWire.shown($0, limit: 128) }.map { " (\($0))" } ?? "")
            lines.append(name + ": " + parts.joined(separator: "; ") + ".")
        }
        return lines
    }

    private static func duration(_ minutes: Int) -> String {
        if minutes > 0, minutes % 1_440 == 0 { return "\(minutes / 1_440)-day" }
        if minutes > 0, minutes % 60 == 0 { return "\(minutes / 60)-hour" }
        return "\(minutes)-minute"
    }
}

/// `connection/read` of this version: the managed sign-in, the model catalog and the usage.
public struct LiveConnection: Equatable, Sendable {
    public var auth: AskConnection.Auth
    public var plan: String?
    public var quota: LiveQuota
    public var models: [AskConnection.Model]

    /// The result in its exact shape. Text is bounded and has no control characters.
    static func parse(_ result: [String: Any]) -> LiveConnection? {
        guard Set(result.keys) == ["auth", "quota", "models"],
              let auth = MacIngressUpload.closed(result["auth"], ["state", "mode", "plan"]),
              let state = auth["state"] as? String, ["signed_in", "signed_out", "unknown"].contains(state),
              auth["mode"] is NSNull || MacIngressUpload.same(auth["mode"], "chatgpt"),
              auth["plan"] is NSNull || auth["plan"] is String, let quota = LiveQuota.parse(result["quota"]),
              let catalog = result["models"] as? [Any], catalog.count <= 256 else { return nil }
        var models: [AskConnection.Model] = []
        for entry in catalog {
            guard let entry = MacIngressUpload.closed(entry, ["id", "label", "image_input", "default"]), let id = entry["id"] as? String,
                  AskWire.isIdentifier(id), let label = AskWire.shown(entry["label"] as? String, limit: 128),
                  let image = MacIngressUpload.boolean(entry["image_input"]),
                  let isDefault = MacIngressUpload.boolean(entry["default"]) else { return nil }
            models.append(AskConnection.Model(id: id, label: label, imageInput: image, isDefault: isDefault))
        }
        // Signed in another way is not the managed ChatGPT subscription.
        let managed = MacIngressUpload.same(auth["mode"], "chatgpt")
        let reported = AskConnection.Auth(rawValue: state) ?? .unknown
        return LiveConnection(auth: reported == .signedIn && !managed ? .otherMode : reported,
                              plan: AskWire.shown(auth["plan"] as? String, limit: 128), quota: quota, models: models)
    }
}

/// What a request asks for.
public enum LiveTrigger: String, Equatable, Sendable {
    /// An unattended look: the whole display, for the session's own context. It asks for no help,
    /// and its answer is never shown as help.
    case observation
    /// A completed selection: the whole display with that part as the user's focus.
    case focus
    /// The user's typed words about the same context.
    case textFollowup = "text_followup"
}

/// How much help the user allows for a request. A circle alone never asks for more than a hint.
public enum LiveAssistance: String, Equatable, CaseIterable, Sendable {
    case none
    case hint
    case explain
    case fullSolution = "full_solution"
}

/// A rectangle of the user's focus inside one whole frame: display-local points and the frame's
/// pixels they cover, by the interface's own rule (`AskSelectionBuilder.span`).
public struct LiveFocus: Equatable, Sendable {
    public var frameSeq: Int
    public var regionDip: RecordedRect
    public var regionPx: RecordedRect

    /// The focus of `rect` (display-local points) on a frame of `frameWidth`×`frameHeight` pixels
    /// of a display of `display` points. Nil when it lies outside the display.
    public static func make(_ rect: RecordedRect, frameSeq: Int, display: RecordedRect, frameWidth: Int, frameHeight: Int) -> LiveFocus? {
        guard let across = AskSelectionBuilder.span(rect.x, rect.width, display: display.width, frame: frameWidth),
              let down = AskSelectionBuilder.span(rect.y, rect.height, display: display.height, frame: frameHeight) else { return nil }
        return LiveFocus(frameSeq: frameSeq,
                         regionDip: RecordedRect(CGRect(x: across.origin, y: down.origin, width: across.size, height: down.size)),
                         regionPx: RecordedRect(CGRect(x: across.pixel, y: down.pixel, width: across.pixels, height: down.pixels)))
    }

    /// The interface's own check, on these very numbers: the rectangle lies inside the display, and
    /// its pixels are the ones the rule gives (the frame's size over the display's size; the start
    /// rounded down, the end rounded up, within the frame).
    func agrees(display: RecordedRect, frameWidth: Int, frameHeight: Int) -> Bool {
        func axis(_ origin: Double, _ size: Double, _ pixel: Double, _ pixels: Double, _ points: Double, _ frame: Int) -> Bool {
            guard origin >= 0, size > 0, origin + size <= points else { return false }
            let scale = Double(frame) / points
            let low = (origin * scale).rounded(.down)
            let high = min(Double(frame), ((origin + size) * scale).rounded(.up))
            return pixel == low && pixels == high - low && pixels >= 1
        }
        return axis(regionDip.x, regionDip.width, regionPx.x, regionPx.width, display.width, frameWidth)
            && axis(regionDip.y, regionDip.height, regionPx.y, regionPx.height, display.height, frameHeight)
    }

    var json: JSONValue {
        .object(["frame_seq": .integer(frameSeq), "region_dip": LiveWire.rect(regionDip), "region_px": LiveWire.pixels(regionPx)])
    }
}

/// One earlier thing said, seen or answered in this session, given to the model as bounded recent
/// context. The originals stay in this app's own records; this is a projection of them.
public struct LiveHistoryEntry: Equatable, Sendable {
    public enum Kind: String, Equatable, Sendable {
        case user, assistant, observation
    }

    public var kind: Kind
    public var text: String
    /// When it was said or answered (UTC), or nil when not known.
    public var at: String?
    public var frameSeq: Int?
    public var requestID: String?
    /// For an answer: `shown`, `unconfirmed` or `not_presented`. Nil for the user's own words.
    public var presentation: String?

    public init(kind: Kind, text: String, at: String?, frameSeq: Int?, requestID: String?, presentation: String?) {
        self.kind = kind
        self.text = text
        self.at = at
        self.frameSeq = frameSeq
        self.requestID = requestID
        self.presentation = presentation
    }

    var json: JSONValue {
        .object(["kind": .string(kind.rawValue), "text": .string(text), "at": at.map(JSONValue.string) ?? .null,
                 "frame_seq": frameSeq.map(JSONValue.integer) ?? .null, "request_id": requestID.map(JSONValue.string) ?? .null,
                 "audio_source": .null, "presentation": presentation.map(JSONValue.string) ?? .null])
    }
}

/// Frames of this session that the model was not given, and why.
public struct LiveGap: Equatable, Sendable {
    public enum Reason: String, Equatable, Sendable {
        /// A newer frame replaced it before it was sent.
        case coalesced
        /// The connector did not take it (another request was in the way).
        case backpressure
        /// Kept back by this session's own request bound, or left out of the bounded history.
        case budget
        /// It could not be given or was refused.
        case notObserved = "not_observed"
    }

    public var from: Int
    public var to: Int
    public var reason: Reason

    public init(from: Int, to: Int, reason: Reason) {
        self.from = from
        self.to = to
        self.reason = reason
    }

    var json: JSONValue {
        .object(["from_frame_seq": .integer(from), "to_frame_seq": .integer(to), "reason": .string(reason.rawValue)])
    }
}

/// The whole-display picture of one request and the captured facts it is sent with.
public struct LivePicture: Equatable, Sendable {
    /// The exact PNG bytes sent, with their SHA-256 and size: the whole frame, never a crop.
    public var png: Data
    public var sha256: String
    public var width: Int
    public var height: Int
    public var captureSessionID: String
    public var displayID: UInt32
    /// The display in the global display space, in points; its origin may be negative.
    public var displayBounds: RecordedRect
    public var scaleFactor: Double
    /// The ink in the picture: its revision and retained editable original, as for ADR 0003. A
    /// known revision without a hash says the editable original is not bound to these pixels.
    public var inkRevision: Int?
    public var inkSHA256: String?

    /// Whether two pictures are the same frame for the connector: the same bytes and the same facts.
    func isSameFrame(as other: LivePicture) -> Bool {
        sha256 == other.sha256 && width == other.width && height == other.height && captureSessionID == other.captureSessionID
            && displayID == other.displayID && displayBounds == other.displayBounds && scaleFactor == other.scaleFactor
            && inkRevision == other.inkRevision && inkSHA256 == other.inkSHA256
    }
}

/// Exactly the `Turn` of `companion/turn`.
public struct LiveTurn: Equatable, Sendable {
    public static let maxTextCharacters = 4_000
    public static let maxHistoryEntries = 24
    public static let maxHistoryCharacters = 32_000
    public static let maxGaps = 64
    /// The connector's request check takes a PNG of at most 8 MiB and 16 million pixels.
    public static let maxImageBytes = 8 * 1024 * 1024
    public static let maxImagePixels = 16_000_000
    public static let maxImageSide = 16_384

    public var requestID: String
    public var sessionID: String
    public var epoch: Int
    public var permissionRevision: Int
    public var trigger: LiveTrigger
    public var assistance: LiveAssistance
    /// Whether an answer may be presented at all. Speech is not connected in this version, so an
    /// answer is silent text or nothing.
    public var presents: Bool
    public var userText: String?
    public var picture: LivePicture
    /// This session's own number of the picture, in the order pictures were given to it.
    public var frameSeq: Int
    public var focus: LiveFocus?
    public var history: [LiveHistoryEntry]
    public var gaps: [LiveGap]

    /// Why the connector would refuse this request, or nil. It mirrors the interface's own rules,
    /// so a request that cannot be taken is not sent, and is said as that.
    public var problem: String? {
        guard AskWire.isIdentifier(requestID), AskWire.isIdentifier(sessionID), AskWire.isIdentifier(picture.captureSessionID) else {
            return "an identifier of the request is not valid"
        }
        guard epoch >= 1, permissionRevision >= 1, frameSeq >= 0 else { return "a number of the request is not valid" }
        guard (1...Self.maxImageBytes).contains(picture.png.count) else {
            return "the picture of the whole display is larger than the connector takes (8 MiB as a PNG)"
        }
        guard (1...Self.maxImageSide).contains(picture.width), (1...Self.maxImageSide).contains(picture.height),
              picture.width <= Self.maxImagePixels / picture.height else {
            return "the display has more pixels than the connector takes (16 million)"
        }
        let bounds = picture.displayBounds
        guard [bounds.x, bounds.y, bounds.width, bounds.height, picture.scaleFactor].allSatisfy(\.isFinite), bounds.width > 0,
              bounds.height > 0, picture.scaleFactor > 0 else { return "the display's size was not recorded" }
        guard picture.inkSHA256 == nil || picture.inkRevision != nil else { return "an ink hash needs its revision" }
        if let text = userText {
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "the question is empty" }
            guard text.unicodeScalars.count <= Self.maxTextCharacters else {
                return "the question is longer than \(Self.maxTextCharacters) characters"
            }
        }
        switch trigger {
        case .observation:
            guard assistance == .none, !presents else { return "an unattended look asks for no help" }
        case .focus:
            guard let focus, focus.frameSeq == frameSeq else { return "a focus belongs to the picture it was made on" }
            guard userText != nil || assistance == .none || assistance == .hint else {
                return "a selection alone asks for no more than a hint"
            }
        case .textFollowup:
            guard userText != nil else { return "a follow-up needs your words" }
        }
        guard assistance != .none || !presents else { return "no help means nothing is presented" }
        if let focus {
            // The same check the connector makes on these numbers.
            guard focus.frameSeq == frameSeq, focus.agrees(display: bounds, frameWidth: picture.width, frameHeight: picture.height) else {
                return "the focus does not lie on this picture"
            }
        }
        guard history.count <= Self.maxHistoryEntries, history.allSatisfy({ entry in
            !entry.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && entry.text.unicodeScalars.count <= Self.maxTextCharacters
                && (entry.frameSeq ?? 0) <= frameSeq
        }), history.reduce(0, { $0 + $1.text.unicodeScalars.count }) <= Self.maxHistoryCharacters else {
            return "the recent context is larger than the connector takes"
        }
        guard gaps.count <= Self.maxGaps, gaps.allSatisfy({ 0 <= $0.from && $0.from <= $0.to && $0.to <= frameSeq }) else {
            return "the list of frames not given is not valid"
        }
        return nil
    }

    /// The `Turn` object. Without `includingImage` the PNG is left out: that is the provenance an
    /// answer must echo in full, and what the local record keeps (it names the retained file).
    func json(includingImage: Bool) -> JSONValue {
        var image: [String: JSONValue] = ["sha256": .string(picture.sha256), "width": .integer(picture.width),
                                          "height": .integer(picture.height)]
        if includingImage { image["png_base64"] = .string(picture.png.base64EncodedString()) }
        let bounds = picture.displayBounds
        let context: JSONValue = .object([
            "capture_session_id": .string(picture.captureSessionID), "frame_seq": .integer(frameSeq),
            // The retained records keep host-clock times and one wall anchor; a wall time for this
            // frame would be an estimate, so none is given.
            "frame_captured_at": .null,
            "frame_width": .integer(picture.width), "frame_height": .integer(picture.height),
            "display": .object(["id": .string(String(picture.displayID)), "bounds": LiveWire.rect(bounds),
                                "scale_factor": .number(picture.scaleFactor)]),
            // The whole display, always: a selection is a focus inside it, never a replacement.
            "region_dip": LiveWire.rect(RecordedRect(CGRect(x: 0, y: 0, width: bounds.width, height: bounds.height))),
            "region_px": .object(["x": .integer(0), "y": .integer(0), "width": .integer(picture.width),
                                  "height": .integer(picture.height)]),
            "ink_revision": picture.inkRevision.map(JSONValue.integer) ?? .null,
            "ink_sha256": picture.inkSHA256.map(JSONValue.string) ?? .null,
            // The Mac capture has no page URL, version or media position: unknown, never read off pixels.
            "source_url": .null, "source_version": .null, "media_position": .null,
        ])
        return .object([
            "request_id": .string(requestID), "session_id": .string(sessionID), "epoch": .integer(epoch),
            "permission_revision": .integer(permissionRevision), "trigger": .string(trigger.rawValue),
            "allowed_assistance": .string(assistance.rawValue), "presentation": .string(presents ? "silent" : "none"),
            "user_text": userText.map(JSONValue.string) ?? .null, "audio_source": .null, "image": .object(image),
            "context": context, "focus": focus?.json ?? .null, "history": .array(history.map(\.json)),
            "gaps": .array(gaps.map(\.json)),
        ])
    }
}

/// A completed answer to one request, bound to it.
public struct LiveAnswer: Equatable, Sendable {
    public var requestID: String
    /// Model text: shown as plain text, never run or rendered as markup.
    public var text: String
    public var model: String
    public var latencyMS: Int?
    public var threadID: String
    public var turnID: String

    public static let maxTextCharacters = 32_000

    /// A `companion/turn` result for exactly `turn`, from the session's own `model`, through the
    /// ChatGPT subscription mode, of the kind the request asked for, and with a provenance equal in
    /// full to the request as it was sent (without the image bytes). Nil for anything else: the
    /// result is never taken as the current state.
    static func parse(_ result: [String: Any], turn: LiveTurn, model: String) -> LiveAnswer? {
        guard Set(result.keys) == ["request_id", "text", "provenance", "model", "auth_mode", "latency_ms", "thread_id", "turn_id", "kind"],
              MacIngressUpload.same(result["request_id"], turn.requestID), MacIngressUpload.same(result["auth_mode"], "chatgpt"),
              MacIngressUpload.same(result["model"], model),
              MacIngressUpload.same(result["kind"], turn.trigger == .observation ? "observation" : "generated_assistance"),
              let text = result["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.unicodeScalars.count <= maxTextCharacters,
              let latency = result["latency_ms"] as? NSNumber, MacIngressUpload.boolean(latency) == nil, latency.doubleValue.isFinite,
              latency.doubleValue >= 0, latency.doubleValue <= 9_007_199_254_740_991,
              let thread = result["thread_id"] as? String, AskWire.isIdentifier(thread),
              let turnID = result["turn_id"] as? String, AskWire.isIdentifier(turnID),
              let sent = try? DesktopJSON.encode(turn.json(includingImage: false)),
              let expected = try? JSONSerialization.jsonObject(with: sent),
              let provenance = result["provenance"], AskWire.sameJSON(provenance, expected) else { return nil }
        return LiveAnswer(requestID: turn.requestID, text: text, model: model, latencyMS: Int(latency.doubleValue.rounded()),
                          threadID: thread, turnID: turnID)
    }
}

public enum LiveWire {
    public static let version = "lc-subscription-live/1"
    /// A line to the connector is at most 12 MiB, and one from it at most 1 MiB (ADR 0004).
    static let maxRequestLine = 12 * 1024 * 1024
    public static let maxIncomingLine = 1024 * 1024
    /// The closed error codes of this version.
    static let errorCodes: Set<String> = [
        "invalid_request", "busy", "cancelled", "session_stopped", "unavailable", "unauthenticated", "unsupported_model",
        "allowance_exhausted", "rate_limited", "allowance_unknown", "workspace_limit", "ordinary_usage_not_allowed", "context_limit",
        "overloaded", "interrupt_unconfirmed", "failed", "budget_reached", "stale_context",
    ]

    /// What one line from the connector is.
    enum Incoming {
        case result(id: String, [String: Any])
        /// `id` is nil when the connector could not tell which request a line was.
        case error(id: String?, LiveError)
        case event(method: String, [String: Any])
    }

    /// One request line with its final newline; nil when it cannot be encoded or is too long.
    static func request(id: String, method: String, params: JSONValue) -> Data? {
        guard var line = try? DesktopJSON.encode(.object(["version": .string(version), "id": .string(id),
                                                          "method": .string(method), "params": params])),
              line.count < maxRequestLine else { return nil }
        line.append(0x0A)
        return line
    }

    /// One line (without its newline) in exactly one of the three forms; nil for anything else.
    static func parse(_ line: Data) -> Incoming? {
        guard let object = MacIngressUpload.object(line) else { return nil }
        if let identity = object["id"] {
            let id = identity as? String
            guard identity is NSNull || id.map(AskWire.isIdentifier) == true else { return nil }
            if let id, Set(object.keys) == ["id", "result"], let result = object["result"] as? [String: Any] {
                return .result(id: id, result)
            }
            guard Set(object.keys) == ["id", "error"], let error = MacIngressUpload.closed(object["error"], ["code", "submission"]),
                  let code = error["code"] as? String, let submission = error["submission"] as? String else { return nil }
            // A code or submission outside the closed sets is not believed as itself: it is a
            // failure whose outcome is not known.
            return .error(id: id, LiveError(code: errorCodes.contains(code) ? code : "failed",
                                            submission: errorCodes.contains(code) ? LiveSubmission(rawValue: submission) ?? .unknown : .unknown))
        }
        guard Set(object.keys) == ["method", "params"], let method = object["method"] as? String,
              let params = object["params"] as? [String: Any] else { return nil }
        return .event(method: method, params)
    }

    /// The answer to `companion/start` for the session and policy that were asked for: how many
    /// requests and how much time the connector grants. Nil for any other shape or value.
    static func started(_ result: [String: Any], sessionID: String, epoch: Int, policy: LivePolicy) -> (remaining: Int, expiresInMS: Int)? {
        guard Set(result.keys) == ["session_id", "epoch", "remaining_submissions", "expires_in_ms"],
              MacIngressUpload.same(result["session_id"], sessionID), MacIngressUpload.integer(result["epoch"]) == epoch,
              let remaining = MacIngressUpload.integer(result["remaining_submissions"]), (0...policy.maxSubmissions).contains(remaining),
              let expires = MacIngressUpload.integer(result["expires_in_ms"]), (0...policy.maxSessionMS).contains(expires) else { return nil }
        return (remaining, expires)
    }

    /// The answer to `companion/interrupt` and `companion/stop`, in its exact shape.
    static func control(_ result: [String: Any]) -> (cancelled: Bool, uncertain: Bool)? {
        guard Set(result.keys) == ["cancelled", "uncertain"], let cancelled = MacIngressUpload.boolean(result["cancelled"]),
              let uncertain = MacIngressUpload.boolean(result["uncertain"]) else { return nil }
        return (cancelled, uncertain)
    }

    /// A model the service can be asked with: listed as taking images, and with an identifier the
    /// connector's own call accepts.
    static func isUsableModel(_ model: AskConnection.Model) -> Bool {
        guard model.imageInput, let first = model.id.unicodeScalars.first, model.id.unicodeScalars.count <= 128 else { return false }
        let letters = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        return letters.contains(first) && model.id.unicodeScalars.allSatisfy { letters.contains($0) || "_.:/-".unicodeScalars.contains($0) }
    }

    static func rect(_ rect: RecordedRect) -> JSONValue {
        .object(["x": .number(rect.x), "y": .number(rect.y), "width": .number(rect.width), "height": .number(rect.height)])
    }

    /// A UTC time as the interface writes it.
    static func utc(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    static func pixels(_ rect: RecordedRect) -> JSONValue {
        .object(["x": .integer(Int(rect.x)), "y": .integer(Int(rect.y)), "width": .integer(Int(rect.width)),
                 "height": .integer(Int(rect.height))])
    }

    /// Fixed words for a refusal. The connector sends no message, and none is ever shown.
    static func words(for error: LiveError) -> String {
        switch error.code {
        case "invalid_request": return "the connector refused the request as malformed"
        case "busy": return "another request of yours is still waiting, so this one was not taken"
        case "cancelled": return "it was cancelled"
        case "session_stopped": return "the AI session has stopped; start it again to go on"
        case "unavailable": return "the ChatGPT connection is not available"
        case "unauthenticated": return "ChatGPT is not signed in"
        case "unsupported_model": return "the chosen model is not available for pictures"
        case "allowance_exhausted": return "ChatGPT says the account's allowance is used up"
        case "rate_limited": return "ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance)"
        case "allowance_unknown": return "ChatGPT refused the request, and what is left of the allowance is not known"
        case "workspace_limit": return "ChatGPT says a workspace limit was reached"
        case "ordinary_usage_not_allowed": return "ChatGPT says included usage is not allowed for this request now"
        case "context_limit": return "the request or its answer is too large"
        case "overloaded": return "ChatGPT says it is overloaded for now"
        case "interrupt_unconfirmed": return "an interruption was not confirmed by ChatGPT, so the AI session was stopped"
        case "stale_context": return "it was replaced by a newer request, or what it was about is no longer current"
        case "budget_reached":
            // The connector uses one code for two things; only whether the request went out tells them apart.
            return error.submission == .notSubmitted ? "this session's own bound (requests or time) was reached"
                : "a bound was reached while ChatGPT worked on it: this session's own time, or ChatGPT's own budget for it "
                    + "(the connector does not tell the two apart)"
        default: return "the request failed"
        }
    }
}
