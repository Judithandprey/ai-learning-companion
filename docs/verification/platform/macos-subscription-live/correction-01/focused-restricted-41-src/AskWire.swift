import Foundation
import FoundationNetworking
import Glibc
import Foundation

// The private desktop-to-connector interface of ADR 0003, version 1: JSON lines between this app
// and its own connector child. It is local process IPC, not a capture protocol. Every request is
// `{version, id, method, params}`; an answer is `{id, result}` or `{id, error: {code, message}}`;
// an event is `{method, params}`. The connector owns the official login, tokens and the model
// call: nothing here reads, holds or shows a credential.

/// How much help the user asked for with this question. Never chosen for the user.
public enum AskAssistance: String, Codable, CaseIterable, Sendable {
    case hint
    case explain
    case fullSolution = "full_solution"
}

/// Exactly the `request` of `ask/start`: one selected image, the user's own question, and the
/// captured facts of that selection. Nothing here is inferred from the pixels.
public struct AskRequest: Equatable, Sendable {
    public struct Context: Equatable, Sendable {
        public var captureSessionID: String
        public var frameSequence: Int
        /// An estimate through the session's wall anchor, or nil when it cannot be made.
        public var frameCapturedAt: String?
        public var frameWidth: Int
        public var frameHeight: Int
        /// Sent as a text identifier, as the shared interface requires.
        public var displayID: UInt32
        /// The display in the global display space, in points.
        public var displayBounds: RecordedRect
        public var scaleFactor: Double
        /// The region in display-local points, and the whole-pixel rectangle cropped from the frame.
        public var regionDip: RecordedRect
        public var regionPx: RecordedRect
        /// The ink drawn into the image: its committed revision and retained editable original.
        /// Nil when no retained document is bound to these pixels.
        public var inkRevision: Int?
        public var inkSHA256: String?
    }

    /// Engineering defaults of ADR 0003.
    public static let maxQuestionCharacters = 4_000
    public static let maxImageBytes = 8 * 1024 * 1024
    public static let maxImagePixels = 16_000_000

    public var requestID: String
    public var question: String
    public var assistance: AskAssistance
    /// The exact PNG bytes sent, with their SHA-256 and size.
    public var image: Data
    public var imageSHA256: String
    public var imageWidth: Int
    public var imageHeight: Int
    public var context: Context

    /// Why this request cannot be sent, or nil.
    public var problem: String? {
        guard DesktopIngress.isIdentifier(requestID) else { return "the request ID is not an identifier" }
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return "the question is empty" }
        // Counted as code points, like the connector counts them.
        guard question.unicodeScalars.count <= Self.maxQuestionCharacters else {
            return "the question is longer than \(Self.maxQuestionCharacters) characters"
        }
        guard (1...Self.maxImageBytes).contains(image.count) else { return "the selected image is empty or larger than 8 MiB" }
        guard imageWidth > 0, imageHeight > 0, imageWidth <= Self.maxImagePixels / imageHeight else {
            return "the selected image is empty or larger than 16 million pixels"
        }
        let rects = [context.displayBounds, context.regionDip, context.regionPx]
        guard rects.allSatisfy({ [$0.x, $0.y, $0.width, $0.height].allSatisfy(\.isFinite) }),
              context.regionDip.width > 0, context.regionDip.height > 0, context.regionPx.width > 0, context.regionPx.height > 0,
              context.displayBounds.width > 0, context.displayBounds.height > 0, context.scaleFactor.isFinite,
              context.scaleFactor > 0 else {
            return "the selection or display rectangle is not finite and positive"
        }
        // The region lies inside its display and its frame.
        guard context.regionDip.x >= 0, context.regionDip.y >= 0,
              context.regionDip.x + context.regionDip.width <= context.displayBounds.width,
              context.regionDip.y + context.regionDip.height <= context.displayBounds.height,
              context.regionPx.x >= 0, context.regionPx.y >= 0,
              context.regionPx.x + context.regionPx.width <= Double(context.frameWidth),
              context.regionPx.y + context.regionPx.height <= Double(context.frameHeight) else {
            return "the selection lies outside its display or frame"
        }
        return nil
    }

    /// The `request` object. Without `includingImage` the PNG is left out (for the local record,
    /// which names the retained file instead).
    func json(includingImage: Bool) -> JSONValue {
        func rect(_ rect: RecordedRect) -> JSONValue {
            .object(["x": .number(rect.x), "y": .number(rect.y), "width": .number(rect.width), "height": .number(rect.height)])
        }
        var image: [String: JSONValue] = [
            "sha256": .string(imageSHA256), "width": .integer(imageWidth), "height": .integer(imageHeight),
        ]
        if includingImage { image["png_base64"] = .string(self.image.base64EncodedString()) }
        let context: JSONValue = .object([
            "capture_session_id": .string(self.context.captureSessionID), "frame_seq": .integer(self.context.frameSequence),
            "frame_captured_at": self.context.frameCapturedAt.map(JSONValue.string) ?? .null,
            "frame_width": .integer(self.context.frameWidth), "frame_height": .integer(self.context.frameHeight),
            "display": .object(["id": .string(String(self.context.displayID)), "bounds": rect(self.context.displayBounds),
                                "scale_factor": .number(self.context.scaleFactor)]),
            "region_dip": rect(self.context.regionDip), "region_px": rect(self.context.regionPx),
            "ink_revision": self.context.inkRevision.map(JSONValue.integer) ?? .null,
            "ink_sha256": self.context.inkSHA256.map(JSONValue.string) ?? .null,
            // The Mac capture has no page URL, version or media position: unknown, never read off pixels.
            "source_url": .null, "source_version": .null, "media_position": .null,
        ])
        return .object(["request_id": .string(requestID), "question": .string(question),
                        "assistance": .string(assistance.rawValue), "image": .object(image), "context": context])
    }
}

/// The connector's sanitized view of the managed login: no email, token or account identifier.
public struct AskConnection: Equatable, Sendable {
    public enum Auth: String, Equatable, Sendable {
        /// The managed ChatGPT account, as Codex reports it. It is not proof that a question will
        /// be answered.
        case signedIn = "signed_in"
        case signedOut = "signed_out"
        /// Signed in some other way (for example an API key): not this subscription mode.
        case otherMode = "other_mode"
        case unknown
    }

    public struct RateLimit: Equatable, Sendable {
        public var label: String
        public var usedPercent: Double
        public var resetsAt: String?
    }

    public struct Model: Equatable, Sendable {
        public var id: String
        public var label: String
        /// Whether the catalog lists image input for it. A missing value is not image support, and
        /// a catalog entry is not proof that a question will be answered.
        public var imageInput: Bool
        public var isDefault: Bool
    }

    public var auth: Auth
    public var plan: String?
    /// Nil when the quota is not known.
    public var rateLimits: [RateLimit]?
    public var models: [Model]

    /// A `connection/read` result in its exact shape. Text is bounded and has no control characters.
    static func parse(_ result: [String: Any]) -> AskConnection? {
        guard Set(result.keys) == ["auth", "rate_limits", "models"],
              let auth = MacIngressUpload.closed(result["auth"], ["state", "mode", "plan"]),
              let state = auth["state"] as? String, ["signed_in", "signed_out", "unknown"].contains(state),
              auth["mode"] is NSNull || auth["mode"] is String, auth["plan"] is NSNull || auth["plan"] is String,
              result["rate_limits"] is NSNull || result["rate_limits"] is [[String: Any]],
              let catalog = result["models"] as? [[String: Any]] else { return nil }
        var models: [Model] = []
        for entry in catalog.prefix(64) {
            guard Set(entry.keys) == ["id", "label", "image_input", "default"], let id = entry["id"] as? String,
                  AskWire.isIdentifier(id), let label = AskWire.shown(entry["label"] as? String, limit: 80),
                  let image = MacIngressUpload.boolean(entry["image_input"]),
                  let isDefault = MacIngressUpload.boolean(entry["default"]) else { return nil }
            models.append(Model(id: id, label: label, imageInput: image, isDefault: isDefault))
        }
        var rateLimits: [RateLimit]?
        if let limits = result["rate_limits"] as? [[String: Any]] {
            var parsed: [RateLimit] = []
            for entry in limits.prefix(8) {
                guard Set(entry.keys) == ["label", "used_percent", "resets_at"],
                      let label = AskWire.shown(entry["label"] as? String, limit: 80),
                      let used = entry["used_percent"] as? NSNumber, MacIngressUpload.boolean(used) == nil,
                      used.doubleValue.isFinite, entry["resets_at"] is NSNull || entry["resets_at"] is String else { return nil }
                let resets = entry["resets_at"] as? String
                if let resets, !MacIngressUpload.isUTCTimestamp(resets) { return nil }
                parsed.append(RateLimit(label: label, usedPercent: min(max(used.doubleValue, 0), 100), resetsAt: resets))
            }
            rateLimits = parsed
        }
        // Signed in another way is not the managed ChatGPT subscription.
        let managed = MacIngressUpload.same(auth["mode"], "chatgpt")
        let reported = Auth(rawValue: state) ?? .unknown
        return AskConnection(auth: reported == .signedIn && !managed ? .otherMode : reported,
                             plan: AskWire.shown(auth["plan"] as? String, limit: 80), rateLimits: rateLimits, models: models)
    }
}

/// A completed answer, bound to the request it answers.
public struct AskAnswer: Equatable, Sendable {
    public var requestID: String
    /// Model text: shown as plain text, never run or rendered as markup.
    public var text: String
    public var model: String
    public var latencyMS: Int?
    public var threadID: String?
    public var turnID: String?

    public static let maxTextCharacters = 32_000

    /// An `ask/start` result for exactly `request`: labelled as generated assistance, through the
    /// ChatGPT subscription mode, with a provenance equal in full to the request as it was sent
    /// (without the image bytes).
    static func parse(_ result: [String: Any], request: AskRequest) -> AskAnswer? {
        guard MacIngressUpload.same(result["request_id"], request.requestID), MacIngressUpload.same(result["auth_mode"], "chatgpt"),
              MacIngressUpload.same(result["kind"], "generated_assistance"),
              let text = result["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.unicodeScalars.count <= maxTextCharacters, let model = result["model"] as? String, AskWire.isIdentifier(model),
              let sent = try? DesktopJSON.encode(request.json(includingImage: false)),
              let expected = try? JSONSerialization.jsonObject(with: sent),
              let provenance = result["provenance"], AskWire.sameJSON(provenance, expected) else {
            return nil
        }
        func identifier(_ value: Any?) -> String? {
            guard let text = value as? String, AskWire.isIdentifier(text) else { return nil }
            return text
        }
        return AskAnswer(requestID: request.requestID, text: text, model: model,
                         latencyMS: MacIngressUpload.integer(result["latency_ms"]),
                         threadID: identifier(result["thread_id"]), turnID: identifier(result["turn_id"]))
    }
}

public enum AskWire {
    public static let version = "lc-subscription-ask/1"
    /// A line to the connector is at most 12 MiB, and one from it at most 256 KiB (ADR 0003).
    static let maxRequestLine = 12 * 1024 * 1024
    public static let maxIncomingLine = 256 * 1024
    /// The connector's closed error codes.
    static let errorCodes: Set<String> = ["busy", "unauthenticated", "unsupported_model", "invalid_request", "session_stopped",
                                          "cancelled", "interrupt_unconfirmed", "quota", "failed", "unavailable"]

    /// What one line from the connector is.
    enum Incoming {
        case result(id: String, [String: Any])
        /// `code` is one of `errorCodes`; the connector's message is never shown.
        case error(id: String, code: String)
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
        if let id = object["id"] as? String {
            guard isIdentifier(id) else { return nil }
            if Set(object.keys) == ["id", "result"], let result = object["result"] as? [String: Any] {
                return .result(id: id, result)
            }
            if Set(object.keys) == ["id", "error"], let error = MacIngressUpload.closed(object["error"], ["code", "message"]),
               let code = error["code"] as? String, error["message"] is String {
                // A code outside the closed set is not believed as itself.
                return .error(id: id, code: errorCodes.contains(code) ? code : "unavailable")
            }
            return nil
        }
        guard Set(object.keys) == ["method", "params"], let method = object["method"] as? String,
              let params = object["params"] as? [String: Any] else { return nil }
        return .event(method: method, params)
    }

    /// An identifier from the connector: nonempty, at most 128 code points, no control characters.
    static func isIdentifier(_ text: String) -> Bool {
        !text.isEmpty && text.unicodeScalars.count <= 128 && !text.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7F }
    }

    /// Text from the connector as it may be shown: no control characters, bounded.
    static func shown(_ text: String?, limit: Int) -> String? {
        guard let text else { return nil }
        let cleaned = String(String.UnicodeScalarView(text.unicodeScalars.filter { $0.value >= 0x20 && $0.value != 0x7F }))
            .trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty else { return nil }
        return cleaned.count <= limit ? cleaned : String(cleaned.prefix(limit)) + "…"
    }

    /// The official login page as the connector gave it: https, no user information, and a host that
    /// is exactly openai.com or chatgpt.com or one of their subdomains. Nil for anything else.
    static func loginURL(_ text: String?) -> URL? {
        guard let text, text.utf8.count <= 16_384, !text.unicodeScalars.contains(where: { $0.value <= 0x20 || $0.value == 0x7F }),
              let components = URLComponents(string: text), components.scheme == "https", components.user == nil,
              components.password == nil, let host = components.host?.lowercased(),
              ["openai.com", "chatgpt.com"].contains(where: { host == $0 || host.hasSuffix("." + $0) }),
              components.port == nil || components.port == 443 else { return nil }
        return components.url
    }

    /// Fixed words for the connector's closed error codes. Its own message is never shown.
    static func words(for code: String) -> String {
        switch code {
        case "busy": return "another question is still being answered"
        case "unauthenticated": return "ChatGPT is not signed in"
        case "unsupported_model": return "this model is not listed as taking images"
        case "invalid_request": return "the question or image was refused"
        case "session_stopped": return "this capture has stopped"
        case "cancelled": return "the question was cancelled"
        case "interrupt_unconfirmed": return "the question was cancelled, but whether it was still answered is not known"
        case "quota": return "the subscription's quota does not allow it now"
        case "failed": return "the answer did not complete"
        default: return "the connector is unavailable"
        }
    }

    /// Whether two decoded JSON values are equal in full: the same keys, order of array items,
    /// text bytes, booleans, nulls and numeric values.
    static func sameJSON(_ left: Any, _ right: Any) -> Bool {
        switch (left, right) {
        case (is NSNull, is NSNull):
            return true
        case (let a as String, let b as String):
            return a.utf8.elementsEqual(b.utf8)
        case (let a as NSNumber, let b as NSNumber):
            let (boolA, boolB) = (MacIngressUpload.boolean(a), MacIngressUpload.boolean(b))
            if boolA != nil || boolB != nil { return boolA == boolB }
            return a.doubleValue == b.doubleValue
        case (let a as [Any], let b as [Any]):
            return a.count == b.count && zip(a, b).allSatisfy { sameJSON($0, $1) }
        case (let a as [String: Any], let b as [String: Any]):
            return Set(a.keys) == Set(b.keys) && a.allSatisfy { key, value in b[key].map { sameJSON(value, $0) } ?? false }
        default:
            return false
        }
    }
}
