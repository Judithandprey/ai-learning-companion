import CFNetwork
import Foundation

// Sends one prepared Mac batch through the released routes of the local capture host:
//   1. every original, one by one: PUT /v2/process/originals/{artifact_id} (OriginalArtifactUpload
//      0.2.2, errors IngressError 0.2.4), believed only with its exact bytes_committed receipt;
//   2. then the batch: POST /v2/process/macos-frames:batch with the prepared bytes and key
//      (errors MacOSIngressError 0.2.12), believed only with a fully corresponding ProcessBatchAck
//      0.2.0 whose every artifact is verified.
// Everything is validated locally first, and every original is read before anything is sent.
//
// Only two answers are believed: an exactly corresponding 200, or a closed typed error in the
// route's own version whose code is released for its status and whose `retryable` is what the
// service sends. Anything else (no answer, a timeout, a redirect, 503 unavailable, a malformed or
// non-corresponding 200, an oversized reply) leaves that send in doubt: it may have committed. It
// is resent with the same bytes (and key), a bounded number of times. Once a send is in doubt, a
// later refusal, expiry, Stop or cancellation never turns it into a refusal.
//
// The caller's Stop and task cancellation prevent every new send; a request already on its way is
// let finish (Stop) or abandoned (cancellation, then in doubt). Nothing retained is changed or
// deleted, whatever the outcome. Results carry fixed words, HTTP statuses, released error codes
// and host-supplied artifact IDs only: never the token or text from the network.
//
// This is a callable seam. It registers no stream or source, starts nothing, persists nothing and
// is wired to no Start or Stop: the trusted caller supplies current authority and explicit Start,
// keeps any doubt across calls, and resends the same prepared batch.

/// The local capture host's authority, snapshotted by value. The token never appears in a
/// description, a mirror or a result.
public struct MacIngressAuthority: Sendable, CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    /// Exactly `http://127.0.0.1:<port>`: the host binds numeric IPv4 loopback only.
    public let origin: String
    fileprivate let token: String
    public let expiresAt: Date
    public let userID: String
    public let incarnation: CaptureIncarnation

    /// Refuses, with a fixed reason, an origin other than numeric loopback on an explicit port
    /// (not 80), or a token the host could not have issued.
    public init(origin: String, token: String, expiresAt: Date, userID: String, incarnation: CaptureIncarnation) throws {
        guard let exact = Self.loopbackOrigin(origin) else {
            throw MappingRefusal("the origin is not http://127.0.0.1:<port> with an explicit port other than 80")
        }
        guard Self.isHostToken(token) else {
            throw MappingRefusal("the token is not a 32–4096 character bearer of the host's alphabet")
        }
        try DesktopIngress.identifiers([("user ID", userID), ("device ID", incarnation.deviceID),
                                        ("session ID", incarnation.sessionID), ("stream ID", incarnation.streamID)])
        self.origin = exact
        self.token = token
        self.expiresAt = expiresAt
        self.userID = userID
        self.incarnation = incarnation
    }

    public var description: String { "MacIngressAuthority(\(origin), user \(userID), token hidden)" }
    public var debugDescription: String { description }
    public var customMirror: Mirror {
        Mirror(self, children: ["origin": origin, "userID": userID, "expiresAt": expiresAt, "incarnation": incarnation])
    }

    static func loopbackOrigin(_ text: String) -> String? {
        let value = text.hasSuffix("/") ? String(text.dropLast()) : text
        let prefix = "http://127.0.0.1:"
        guard value.hasPrefix(prefix) else { return nil }
        let port = value.utf8.dropFirst(prefix.utf8.count)
        guard (1...5).contains(port.count), port.allSatisfy({ (0x30...0x39).contains($0) }), port.first != 0x30,
              let number = Int(String(decoding: port, as: UTF8.self)), (1...65_535).contains(number), number != 80 else {
            return nil
        }
        return value
    }

    static let tokenPunctuation: Set<UInt8> = Set("._~+/-".utf8)

    /// `[A-Za-z0-9._~+/-]+=*`, 32–4096 characters, as the host's startup accepts.
    static func isHostToken(_ token: String) -> Bool {
        let bytes = Array(token.utf8)
        guard (32...4096).contains(bytes.count) else { return false }
        let equals = UInt8(ascii: "=")
        let body = bytes.prefix { $0 != equals }
        guard !body.isEmpty, bytes.dropFirst(body.count).allSatisfy({ $0 == equals }) else { return false }
        for byte in body {
            let digit = (0x30...0x39).contains(byte)
            let letter = (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte)
            guard digit || letter || tokenPunctuation.contains(byte) else { return false }
        }
        return true
    }
}

/// Engineering defaults, not contract values: attempts per request (clamped to 1…10) and the
/// linear pause between them (clamped to 0…60 s).
public struct MacUploadOptions: Sendable {
    public let attempts: Int
    public let pause: Double
    public let now: @Sendable () -> Date

    public init(attempts: Int = 3, pause: Double = 0.5, now: @escaping @Sendable () -> Date = { Date() }) {
        self.attempts = min(max(attempts, 1), 10)
        self.pause = pause.isFinite ? min(max(pause, 0), 60) : 0.5
        self.now = now
    }
}

public enum MacIngressStage: String, Equatable, Sendable {
    case local, original, batch
}

public enum MacIngressCancel: String, Equatable, Sendable {
    /// The caller's Stop: nothing new is sent after it.
    case stopped
    /// The calling task was cancelled.
    case taskCancelled
}

/// The verified ProcessBatchAck 0.2.0.
public struct MacIngressAck: Equatable, Sendable {
    public struct Receipt: Equatable, Sendable {
        public let recordID: String
        public let sequence: Int
        /// accepted, or duplicate: committed earlier with identical content.
        public let disposition: String
        public let receivedAt: String
        public let artifacts: [PNGReference]
    }

    public let batchID: String
    public let receipts: [Receipt]
}

public enum MacIngressResult: Equatable, Sendable {
    /// Every original's receipt and the batch ACK corresponded exactly: committed by the service.
    /// This says nothing about AI receipt, presentation or an external archive.
    case committed(MacIngressAck, originals: [String])
    /// Known not taken at `stage` by this call; `originals` were committed before it.
    case refused(stage: MacIngressStage, reason: String, status: Int?, code: String?, originals: [String])
    /// Not known whether the send in doubt (an artifact ID, or "batch") took effect. Resend the same
    /// prepared batch with current authority; never re-map it under new identities.
    case unknown(stage: MacIngressStage, reason: String, status: Int?, code: String?, inDoubt: String?, originals: [String])
    /// Stopped or cancelled before finishing; `inDoubt` is a send that may have taken effect.
    case cancelled(stage: MacIngressStage, cause: MacIngressCancel, inDoubt: String?, originals: [String])
}

/// One HTTP exchange. `body` is nil when the reply was longer than the limit asked for.
public struct MacHTTPReply: Sendable {
    public let status: Int
    public let body: Data?
    public let url: URL?

    public init(status: Int, body: Data?, url: URL?) {
        self.status = status
        self.body = body
        self.url = url
    }
}

/// Sends one request without following redirects and reads at most `responseLimit` bytes of a 200
/// reply (a reply with another status may be read to less; see `LoopbackHTTPTransport`).
public protocol MacIngressTransport: Sendable {
    func send(_ request: URLRequest, responseLimit: Int) async throws -> MacHTTPReply
}

public enum MacIngressUpload {
    static let putPath = "/v2/process/originals/"
    static let batchPath = "/v2/process/macos-frames:batch"
    static let receiptLimit = 64 * 1024
    static let errorLimit = 4096
    static let ackLimit = 4 * 1024 * 1024
    /// Released status → codes of IngressError 0.2.4 and MacOSIngressError 0.2.12.
    static let codes: [Int: Set<String>] = [
        400: ["invalid_json"], 401: ["unauthenticated"], 403: ["forbidden", "capability_required"], 404: ["not_found"],
        409: ["source_identity_conflict", "record_conflict", "idempotency_conflict", "dependency_missing", "stale_scope",
              "capture_stopped", "unsupported_source"],
        413: ["payload_too_large"], 415: ["unsupported_media_type"], 422: ["unsupported_version", "invalid_request"],
        503: ["unavailable"],
    ]

    /// Uploads every original, then the batch. Never throws; see `MacIngressResult`.
    public static func upload(_ prepared: PreparedMacBatch, authority: MacIngressAuthority, transport: MacIngressTransport,
                              options: MacUploadOptions = MacUploadOptions(),
                              shouldStop: @escaping @Sendable () -> Bool = { false }) async -> MacIngressResult {
        var sender = Sender(authority: authority, transport: transport, options: options, shouldStop: shouldStop)
        if Task.isCancelled { return .cancelled(stage: .local, cause: .taskCancelled, inDoubt: nil, originals: []) }
        if shouldStop() { return .cancelled(stage: .local, cause: .stopped, inDoubt: nil, originals: []) }
        if let problem = localProblem(prepared, authority: authority, now: options.now()) {
            return .refused(stage: .local, reason: problem, status: nil, code: nil, originals: [])
        }
        // Every original is read under the retained-file policy before anything is sent.
        for original in prepared.originals {
            if case .failure(let refusal) = read(original, in: prepared.sessionDirectory) {
                return .refused(stage: .local, reason: refusal.reason, status: nil, code: nil, originals: [])
            }
        }
        for original in prepared.originals {
            let id = original.binding.artifact.artifactID
            // Read again at send time; a file changed since is never sent under this ID.
            let bytes: Data
            switch read(original, in: prepared.sessionDirectory) {
            case .success(let data): bytes = data
            case .failure(let refusal):
                return .refused(stage: .original, reason: refusal.reason, status: nil, code: nil, originals: sender.committed)
            }
            let body: Data
            do {
                body = try uploadBody(original.binding, bytes: bytes)
            } catch {
                return .refused(stage: .original, reason: "the upload of \(id) cannot be encoded", status: nil, code: nil,
                                originals: sender.committed)
            }
            let request = sender.request(method: "PUT", path: putPath + pathSegment(id), body: body, key: nil)
            let outcome = await sender.exchange(id, stage: .original, request: request, limit: receiptLimit,
                                                errorVersion: "0.2.4") { receiptMatches($0, binding: original.binding) }
            if let settled = outcome.result(stage: .original, originals: sender.committed) { return settled }
            sender.committed.append(id)
        }
        let request = sender.request(method: "POST", path: batchPath, body: prepared.body, key: prepared.idempotencyKey)
        var ack: MacIngressAck?
        let outcome = await sender.exchange("batch", stage: .batch, request: request, limit: ackLimit, errorVersion: "0.2.12") {
            ack = verifiedAck($0, prepared: prepared, userID: authority.userID)
            return ack != nil
        }
        if let settled = outcome.result(stage: .batch, originals: sender.committed) { return settled }
        guard let ack else {
            return .unknown(stage: .batch, reason: "the ACK was not kept", status: 200, code: nil, inDoubt: "batch",
                            originals: sender.committed)
        }
        return .committed(ack, originals: sender.committed)
    }

    // MARK: - Local checks

    static func localProblem(_ prepared: PreparedMacBatch, authority: MacIngressAuthority, now: Date) -> String? {
        guard authority.expiresAt > now else { return "the bearer has expired" }
        guard authority.userID == prepared.source.userID else { return "the authority's user is not the batch source's owner" }
        guard authority.incarnation == prepared.incarnation else { return "the authority is for another capture incarnation" }
        guard DesktopIngress.isIdentifier(prepared.idempotencyKey) else { return "the Idempotency-Key is not a contract Identifier" }
        guard (1...DesktopIngress.maxBodyBytes).contains(prepared.body.count) else {
            return "the batch is not 1 to \(DesktopIngress.maxBodyBytes) bytes"
        }
        // Every referenced artifact has exactly one planned original with identical facts, and nothing
        // unreferenced is uploaded.
        var planned: [String: PlannedOriginal] = [:]
        for original in prepared.originals {
            let binding = original.binding
            let kindMatches = binding.kind == "editable_ink" ? binding.artifact.mediaType == "application/json"
                : binding.kind == "screen_image" && binding.artifact.mediaType == "image/png"
            guard binding.contractVersion == "0.2.2", kindMatches, binding.source == prepared.source,
                  DesktopIngress.isIdentifier(binding.artifact.artifactID),
                  (1...DesktopIngress.maxPNGBytes).contains(binding.artifact.byteLength),
                  planned.updateValue(original, forKey: binding.artifact.artifactID) == nil else {
                return "the planned original \(binding.artifact.artifactID) is not one released 0.2.2 binding of this source"
            }
        }
        var referenced: Set<String> = []
        for record in prepared.records {
            for artifact in record.artifacts {
                guard planned[artifact.artifactID]?.binding.artifact == artifact else {
                    return "record \(record.recordID) names \(artifact.artifactID) without its planned original"
                }
                referenced.insert(artifact.artifactID)
            }
        }
        guard referenced.count == planned.count else { return "an original is planned that no record references" }
        return nil
    }

    static func read(_ original: PlannedOriginal, in directory: URL) -> Result<Data, MappingRefusal> {
        let artifact = original.binding.artifact
        if original.binding.kind == "editable_ink" {
            return RetainedOriginal.inkOriginal(file: original.file, sha256: artifact.sha256, byteLength: artifact.byteLength,
                                                in: directory)
        }
        let folder = original.file.hasPrefix("composed/") ? "composed" : "frames"
        return RetainedOriginal.read(file: original.file, sequence: original.callbackSequence, sha256: artifact.sha256,
                                     byteLength: artifact.byteLength, in: directory, folder: folder)
    }

    /// OriginalArtifactUpload 0.2.2 with canonical padded base64 of exactly these bytes.
    static func uploadBody(_ binding: OriginalBinding, bytes: Data) throws -> Data {
        try DesktopJSON.encode(.object([
            "contract_version": .string(binding.contractVersion),
            "source": try DesktopIngress.sourceJSON(binding.source),
            "artifact": try MacIngressBatch.referenceJSON(binding.artifact),
            "kind": .string(binding.kind),
            "data_base64": .string(bytes.base64EncodedString()),
        ]))
    }

    /// An Identifier as one path segment; `:` is percent-encoded, which the route decodes once.
    static func pathSegment(_ id: String) -> String {
        id.replacingOccurrences(of: ":", with: "%3A")
    }

    // MARK: - Believed answers

    /// A body as one JSON object: text starting with `{` and holding no NUL byte, which excludes
    /// UTF-16 and UTF-32 (JSONSerialization would otherwise detect and accept them).
    static func object(_ data: Data) -> [String: Any]? {
        guard data.first == UInt8(ascii: "{"), !data.contains(0),
              let value = try? JSONSerialization.jsonObject(with: data, options: []) else { return nil }
        return value as? [String: Any]
    }

    static func closed(_ value: Any?, _ keys: Set<String>) -> [String: Any]? {
        guard let object = value as? [String: Any], Set(object.keys) == keys else { return nil }
        return object
    }

    static func text(_ value: Any?) -> String? {
        value as? String
    }

    /// A JSON integer: an NSNumber that is neither a Boolean nor a floating-point lexeme.
    static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              !CFNumberIsFloatType(number as CFNumber) else { return nil }
        return number.intValue
    }

    static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }

    /// Byte equality: Swift's `==` would accept canonically equivalent text.
    static func same(_ value: Any?, _ expected: String) -> Bool {
        guard let string = value as? String else { return false }
        return string.utf8.elementsEqual(expected.utf8)
    }

    static func sameSource(_ value: Any?, _ source: SourceReference) -> Bool {
        guard let object = closed(value, ["user_id", "source_id", "source_version"]) else { return false }
        return same(object["user_id"], source.userID) && same(object["source_id"], source.sourceID)
            && integer(object["source_version"]) == source.sourceVersion
    }

    static func sameArtifact(_ object: [String: Any], _ artifact: PNGReference) -> Bool {
        same(object["artifact_id"], artifact.artifactID) && same(object["sha256"], artifact.sha256)
            && integer(object["byte_length"]) == artifact.byteLength && same(object["media_type"], artifact.mediaType)
    }

    /// OriginalArtifactReceipt 0.2.2 echoing exactly the binding sent, with `bytes_committed`.
    static func receiptMatches(_ data: Data, binding: OriginalBinding) -> Bool {
        guard let receipt = closed(object(data), ["contract_version", "source", "artifact", "kind", "status"]),
              same(receipt["contract_version"], "0.2.2"), same(receipt["status"], "bytes_committed"),
              same(receipt["kind"], binding.kind), sameSource(receipt["source"], binding.source),
              let artifact = closed(receipt["artifact"], ["artifact_id", "sha256", "byte_length", "media_type"]) else {
            return false
        }
        return sameArtifact(artifact, binding.artifact)
    }

    /// ProcessBatchAck 0.2.0 for exactly the records sent, each once, every artifact verified.
    static func verifiedAck(_ data: Data, prepared: PreparedMacBatch, userID: String) -> MacIngressAck? {
        let keys: Set<String> = ["contract_version", "batch_id", "user_id", "device_id", "session_id", "stream_id", "acknowledged"]
        guard let ack = closed(object(data), keys), same(ack["contract_version"], "0.2.0"),
              same(ack["batch_id"], prepared.batchID), same(ack["user_id"], userID),
              same(ack["device_id"], prepared.incarnation.deviceID), same(ack["session_id"], prepared.incarnation.sessionID),
              same(ack["stream_id"], prepared.incarnation.streamID),
              let acknowledged = ack["acknowledged"] as? [Any], acknowledged.count == prepared.records.count else {
            return nil
        }
        var records: [String: PreparedRecord] = [:]
        for record in prepared.records {
            records[record.recordID] = record
        }
        var seen: Set<String> = []
        var receipts: [MacIngressAck.Receipt] = []
        let receiptKeys: Set<String> = ["record_id", "sequence", "disposition", "received_at", "envelope", "artifacts"]
        let artifactKeys: Set<String> = ["artifact_id", "sha256", "byte_length", "media_type", "status"]
        for item in acknowledged {
            guard let receipt = closed(item, receiptKeys), let recordID = text(receipt["record_id"]),
                  let record = records[recordID], same(receipt["record_id"], record.recordID),
                  seen.insert(record.recordID).inserted, integer(receipt["sequence"]) == record.sequence,
                  same(receipt["envelope"], "committed"), let disposition = text(receipt["disposition"]),
                  same(disposition, "accepted") || same(disposition, "duplicate"),
                  let receivedAt = text(receipt["received_at"]), isUTCTimestamp(receivedAt),
                  let artifacts = receipt["artifacts"] as? [Any], artifacts.count == record.artifacts.count else {
                return nil
            }
            var listed: Set<String> = []
            for entry in artifacts {
                guard let artifact = closed(entry, artifactKeys), same(artifact["status"], "verified"),
                      let id = text(artifact["artifact_id"]),
                      let expected = record.artifacts.first(where: { $0.artifactID.utf8.elementsEqual(id.utf8) }),
                      listed.insert(expected.artifactID).inserted, sameArtifact(artifact, expected) else {
                    return nil
                }
            }
            receipts.append(MacIngressAck.Receipt(recordID: record.recordID, sequence: record.sequence, disposition: disposition,
                                                  receivedAt: receivedAt, artifacts: record.artifacts))
        }
        return MacIngressAck(batchID: prepared.batchID, receipts: receipts)
    }

    /// A closed typed error in the route's version, with a code released for its status and the
    /// `retryable` the service sends; nil for anything else.
    static func typedError(status: Int, body: Data?, version: String) -> String? {
        guard let body, body.count <= errorLimit,
              let error = closed(object(body), ["contract_version", "error", "retryable"]),
              same(error["contract_version"], version), let code = text(error["error"]),
              codes[status]?.contains(code) == true, let retryable = boolean(error["retryable"]),
              retryable == (code == "unavailable" || code == "dependency_missing") else {
            return nil
        }
        return code
    }

    /// RFC 3339 date-time in UTC as UtcTimestamp accepts it: a real calendar date, 00–23 hours,
    /// 00–59 minutes and seconds (no leap second), an optional fraction of any length, and a final
    /// `Z`. `T` may be lowercase.
    public static func isUTCTimestamp(_ text: String) -> Bool {
        let bytes = Array(text.utf8)
        guard bytes.count >= 20, bytes.last == UInt8(ascii: "Z") else { return false }
        func number(_ from: Int, _ count: Int) -> Int? {
            var value = 0
            for byte in bytes[from..<(from + count)] {
                guard (0x30...0x39).contains(byte) else { return nil }
                value = value * 10 + Int(byte - 0x30)
            }
            return value
        }
        guard let year = number(0, 4), bytes[4] == UInt8(ascii: "-"), let month = number(5, 2), bytes[7] == UInt8(ascii: "-"),
              let day = number(8, 2), bytes[10] == UInt8(ascii: "T") || bytes[10] == UInt8(ascii: "t"),
              let hour = number(11, 2), bytes[13] == UInt8(ascii: ":"), let minute = number(14, 2),
              bytes[16] == UInt8(ascii: ":"), let second = number(17, 2) else {
            return false
        }
        var index = 19
        if bytes[index] == UInt8(ascii: ".") {
            index += 1
            let start = index
            while index < bytes.count - 1, (0x30...0x39).contains(bytes[index]) {
                index += 1
            }
            guard index > start else { return false }
        }
        guard index == bytes.count - 1, year >= 1, (1...12).contains(month), hour <= 23, minute <= 59, second <= 59 else {
            return false
        }
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return (1...days[month - 1]).contains(day)
    }

    // MARK: - Sending

    /// How one request settled.
    enum Settled {
        case accepted
        case refused(status: Int, code: String)
        /// A typed dependency_missing: retry only after the dependency is resolved, not here.
        case dependency(status: Int)
        /// `code` is a believed typed `unavailable` on the last attempt, else nil.
        case exhausted(reason: String, status: Int?, code: String?)
        case expired
        case cancelled(MacIngressCancel)
    }

    struct Outcome {
        let settled: Settled
        let what: String
        /// Whether a send of this request may have taken effect without a believed answer.
        let inDoubt: Bool

        /// The call's result when this request did not succeed.
        func result(stage: MacIngressStage, originals: [String]) -> MacIngressResult? {
            let doubt = inDoubt ? what : nil
            switch settled {
            case .accepted:
                return nil
            case .refused(let status, let code):
                if inDoubt {
                    return .unknown(stage: stage, reason: "\(what) was in doubt before this refusal; whether it took effect is not known",
                                    status: status, code: code, inDoubt: what, originals: originals)
                }
                return .refused(stage: stage, reason: "\(what) was refused", status: status, code: code, originals: originals)
            case .dependency(let status):
                return .unknown(stage: stage, reason: "\(what) waits for a dependency the service does not have yet",
                                status: status, code: "dependency_missing", inDoubt: doubt, originals: originals)
            case .exhausted(let reason, let status, let code):
                return .unknown(stage: stage, reason: reason, status: status, code: code, inDoubt: what, originals: originals)
            case .expired:
                if inDoubt {
                    return .unknown(stage: stage, reason: "the bearer expired while \(what) was in doubt; send the same batch again with a new bearer",
                                    status: nil, code: nil, inDoubt: what, originals: originals)
                }
                return .refused(stage: stage, reason: "the bearer has expired", status: nil, code: nil, originals: originals)
            case .cancelled(let cause):
                return .cancelled(stage: stage, cause: cause, inDoubt: doubt, originals: originals)
            }
        }
    }

    struct Sender {
        let authority: MacIngressAuthority
        let transport: MacIngressTransport
        let options: MacUploadOptions
        let shouldStop: @Sendable () -> Bool
        var committed: [String] = []

        func request(method: String, path: String, body: Data, key: String?) -> URLRequest {
            // The origin was checked to be exactly http://127.0.0.1:<port>, and the path is ASCII.
            var request = URLRequest(url: URL(string: authority.origin + path)!, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
            request.httpMethod = method
            request.httpShouldHandleCookies = false
            request.setValue("Bearer " + authority.token, forHTTPHeaderField: "Authorization")
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if let key {
                request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
            }
            request.httpBody = body
            return request
        }

        /// Sends one request until it is believed, refused, stopped, expired or out of attempts, with
        /// the same bytes and headers on every attempt.
        func exchange(_ what: String, stage: MacIngressStage, request: URLRequest, limit: Int, errorVersion: String,
                      accepts: (Data) -> Bool) async -> Outcome {
            var inDoubt = false
            var lastReason = "no attempt was made"
            var lastStatus: Int?
            var lastCode: String?
            for attempt in 1...options.attempts {
                if Task.isCancelled { return Outcome(settled: .cancelled(.taskCancelled), what: what, inDoubt: inDoubt) }
                if shouldStop() { return Outcome(settled: .cancelled(.stopped), what: what, inDoubt: inDoubt) }
                if options.now() >= authority.expiresAt { return Outcome(settled: .expired, what: what, inDoubt: inDoubt) }
                let reply: MacHTTPReply
                do {
                    reply = try await transport.send(request, responseLimit: limit)
                } catch {
                    if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled {
                        return Outcome(settled: .cancelled(.taskCancelled), what: what, inDoubt: true)
                    }
                    inDoubt = true
                    lastStatus = nil
                    lastCode = nil
                    lastReason = "\(what) got no answer (\(MacIngressUpload.errorName(error)))"
                    if attempt < options.attempts {
                        let resumed = await pause(attempt)
                        if !resumed { return Outcome(settled: .cancelled(.taskCancelled), what: what, inDoubt: true) }
                    }
                    continue
                }
                let code = reply.status == 200 ? nil
                    : MacIngressUpload.typedError(status: reply.status, body: reply.body, version: errorVersion)
                if reply.url != nil, reply.url != request.url {
                    inDoubt = true
                    lastStatus = reply.status
                    lastCode = nil
                    lastReason = "\(what) was answered from another URL, which is not believed"
                } else if reply.status == 200, let body = reply.body, accepts(body) {
                    return Outcome(settled: .accepted, what: what, inDoubt: false)
                } else if let code, code != "unavailable" {
                    if code == "dependency_missing" {
                        return Outcome(settled: .dependency(status: reply.status), what: what, inDoubt: inDoubt)
                    }
                    return Outcome(settled: .refused(status: reply.status, code: code), what: what, inDoubt: inDoubt)
                } else {
                    inDoubt = true
                    lastStatus = reply.status
                    lastCode = code
                    lastReason = MacIngressUpload.unbelieved(what, status: reply.status, body: reply.body)
                }
                if attempt < options.attempts {
                    let resumed = await pause(attempt)
                    if !resumed { return Outcome(settled: .cancelled(.taskCancelled), what: what, inDoubt: true) }
                }
            }
            return Outcome(settled: .exhausted(reason: lastReason + " after \(options.attempts) attempts", status: lastStatus,
                                               code: lastCode), what: what, inDoubt: inDoubt)
        }

        /// A linear pause; false when the task was cancelled during it.
        func pause(_ attempt: Int) async -> Bool {
            let seconds = options.pause * Double(attempt)
            guard seconds > 0 else { return !Task.isCancelled }
            do {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return true
            } catch {
                return false
            }
        }
    }

    /// Why an answer is not believed, in fixed words.
    static func unbelieved(_ what: String, status: Int, body: Data?) -> String {
        if (300...399).contains(status) { return "\(what) was answered with redirect \(status), which is not followed" }
        if body == nil { return "\(what) was answered \(status) with more than the expected reply length" }
        if status == 200 { return "\(what) was answered 200 with a reply that does not correspond to it" }
        if status == 503 { return "\(what) was answered 503: the service is unavailable" }
        return "\(what) was answered \(status) with a reply that is not a released error for it"
    }

    /// An error named from fixed words only: never its description, domain text or URL.
    static func errorName(_ error: Error) -> String {
        if let url = error as? URLError { return "URLError \(url.code.rawValue)" }
        if error is CancellationError { return "cancelled" }
        return "other error"
    }
}

/// URLSession over numeric loopback: ephemeral, with no cookies, cache, credential storage or proxy,
/// no redirect followed, explicit timeouts (engineering defaults), and bounded reads.
public final class LoopbackHTTPTransport: MacIngressTransport, @unchecked Sendable {
    let session: URLSession

    public convenience init(requestTimeout: TimeInterval = 60, resourceTimeout: TimeInterval = 300) {
        self.init(configuration: Self.configuration(requestTimeout: requestTimeout, resourceTimeout: resourceTimeout))
    }

    init(configuration: URLSessionConfiguration) {
        session = URLSession(configuration: configuration, delegate: RedirectRefusal(), delegateQueue: nil)
    }

    deinit {
        session.finishTasksAndInvalidate()
    }

    static func configuration(requestTimeout: TimeInterval, resourceTimeout: TimeInterval) -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCredentialStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = requestTimeout
        configuration.timeoutIntervalForResource = resourceTimeout
        // No proxy of any kind: the request goes to the loopback host itself.
        let noProxy: [AnyHashable: Any] = [
            kCFNetworkProxiesHTTPEnable as String: 0,
            kCFNetworkProxiesHTTPSEnable as String: 0,
            kCFNetworkProxiesSOCKSEnable as String: 0,
            kCFNetworkProxiesProxyAutoConfigEnable as String: 0,
        ]
        configuration.connectionProxyDictionary = noProxy
        return configuration
    }

    public func send(_ request: URLRequest, responseLimit: Int) async throws -> MacHTTPReply {
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            bytes.task.cancel()
            throw URLError(.badServerResponse)
        }
        // A reply other than 200 is believed only as a typed error of at most `errorLimit` bytes.
        let limit = http.statusCode == 200 ? responseLimit : min(responseLimit, MacIngressUpload.errorLimit + 1)
        var body = Data()
        for try await byte in bytes {
            guard body.count < limit else {
                bytes.task.cancel()
                return MacHTTPReply(status: http.statusCode, body: nil, url: http.url)
            }
            body.append(byte)
        }
        return MacHTTPReply(status: http.statusCode, body: body, url: http.url)
    }
}

/// Delivers a redirect as the answer instead of following it, so no credential goes elsewhere.
final class RedirectRefusal: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}
