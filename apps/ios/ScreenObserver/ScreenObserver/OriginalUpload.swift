import CryptoKit
import Foundation

// Sends kept ScreenObserver keyframes, byte for byte, as `OriginalArtifactUpload` 0.2.2 to
// `PUT /v2/process/originals/{artifact_id}` (capture_ingress 0.2.4). An original counts as stored
// only after the complete matching `OriginalArtifactReceipt`.
//
// This is a bounded first consumer. Nothing in the app calls it yet, and the broadcast extension
// does not include it, so the capture-only, no-send UI is unchanged until activation is reviewed.
// It has no default endpoint or credential. The caller supplies the registered source version, a
// current authorization and the transport, and starts every pass explicitly. There is no
// automatic retry.
//
// Durable state is one file in the capture session, `original-uploads.json`. It holds the source
// and, for each original, its complete binding, route path, request length and SHA-256, attempts,
// last outcome and validated receipt. It never holds the bearer token or a second copy of the
// bytes. A retry, after a lost response or a relaunch, rebuilds the request from the unchanged
// original and sends it only if it is byte-identical to the recorded request.
//
// Stop is permanent for the session. It happens when the broadcast finishes, when the server
// reports `capture_stopped`, or when `stop` is called. Pending originals then stay on disk and stay
// pending in the state; they are not sent later, because capture_ingress 0.2.4 refuses
// shared-display original PUTs after a stop, including exact replays. A response that arrives after
// a stop is recorded for what it is, and nothing more is sent.
//
// `bytes_committed` means the server stored these bytes durably. It is not a frame or process ACK,
// not AI input and not a live view. The artifact ID is an opaque local name. It is not a process
// sequence, and nothing here maps presentation time or server time to frame or course time.

/// Contract constants and pure checks. Foundation and CryptoKit only, so they are also checked on
/// a Mac (apps/ios/checks/CaptureIngressCheck).
enum OriginalUpload {
    static let contractVersion = "0.2.2"
    static let kind = "screen_image"
    static let mediaType = "image/png"
    /// The original_artifact 0.2.2 transport ceiling for one original. A larger original is
    /// reported as unavailable, never cut.
    static let maxOriginalBytes = 32 * 1024 * 1024
    static let maxSafeInteger = 9_007_199_254_740_991
    static let routePrefix = "/v2/process/originals/"
    static let stateFileName = "original-uploads.json"
    static let pngSignature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    static let ingressErrorCodes: Set<String> = [
        "invalid_json", "unauthenticated", "forbidden", "capability_required", "not_found",
        "source_identity_conflict", "record_conflict", "idempotency_conflict", "dependency_missing",
        "stale_scope", "capture_stopped", "unsupported_source", "payload_too_large",
        "unsupported_media_type", "unsupported_version", "invalid_request", "unavailable",
    ]

    static func isAlphanumeric(_ byte: UInt8) -> Bool {
        (0x30...0x39).contains(byte) || (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte)
    }

    /// The contract's `Identifier`: 1–128 ASCII characters from `[A-Za-z0-9_.:-]`, starting with
    /// a letter or digit.
    static func isIdentifier(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        guard (1...128).contains(bytes.count), isAlphanumeric(bytes[0]) else { return false }
        return bytes.allSatisfy { isAlphanumeric($0) || "_.:-".utf8.contains($0) }
    }

    /// An identifier that is also a plain URL path segment (no `:`), as minted for artifacts.
    static func isPathSafeIdentifier(_ value: String) -> Bool {
        isIdentifier(value) && !value.contains(":")
    }

    static func isSHA256Hex(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Error domain and code only. Descriptions are never recorded, because an injected transport
    /// could put anything in them.
    static func errorCode(_ error: Error) -> String {
        let error = error as NSError
        return "\(error.domain) \(error.code)"
    }

    enum ReadOutcome {
        case bytes(Data)
        case missing
        case oversize
        case unreadable(String)
    }

    /// Reads the file once, at most `maxOriginalBytes + 1` bytes. Callers check and encode these
    /// same bytes, so nothing can change between the check and the encoding.
    static func readOriginal(at url: URL) -> ReadOutcome {
        let handle: FileHandle
        do {
            handle = try FileHandle(forReadingFrom: url)
        } catch {
            return FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
                ? .unreadable(errorCode(error)) : .missing
        }
        defer { try? handle.close() }
        var data = Data()
        do {
            while data.count <= maxOriginalBytes,
                  let chunk = try handle.read(upToCount: min(1 << 20, maxOriginalBytes + 1 - data.count)),
                  !chunk.isEmpty {
                data.append(chunk)
            }
        } catch {
            return .unreadable(errorCode(error))
        }
        return data.count > maxOriginalBytes ? .oversize : .bytes(data)
    }

    /// The exact request body: canonical JSON with sorted keys and no whitespace, which is what the
    /// Python contract's `canonical_request` gives for it. It is built only from fields checked
    /// here, all plain ASCII that needs no escaping. Returns nil if any field is outside the
    /// contract or `bytes` are not the bound original.
    static func requestBody(_ binding: OriginalArtifactBinding, bytes: Data) -> Data? {
        let source = binding.source
        let artifact = binding.artifact
        guard binding.contractVersion == contractVersion, binding.kind == kind,
              artifact.mediaType == mediaType, source.isValid,
              isPathSafeIdentifier(artifact.artifactID), isSHA256Hex(artifact.sha256),
              (1...maxOriginalBytes).contains(bytes.count), artifact.byteLength == bytes.count,
              sha256Hex(bytes) == artifact.sha256 else { return nil }
        var body = Data(#"{"artifact":{"artifact_id":"\#(artifact.artifactID)","byte_length":\#(artifact.byteLength),"media_type":"\#(artifact.mediaType)","sha256":"\#(artifact.sha256)"},"contract_version":"\#(binding.contractVersion)","data_base64":""#.utf8)
        body.append(bytes.base64EncodedData())
        body.append(Data(#"","kind":"\#(binding.kind)","source":{"source_id":"\#(source.sourceID)","source_version":\#(source.sourceVersion),"user_id":"\#(source.userID)"}}"#.utf8))
        return body
    }

    /// Why `data` is not exactly the `OriginalArtifactReceipt` for `binding`, or nil when it is.
    /// Member order and whitespace may differ; members, JSON types and values may not.
    static func receiptProblem(_ data: Data, for binding: OriginalArtifactBinding) -> String? {
        guard data.count <= 64 * 1024 else { return "the receipt is larger than any valid receipt" }
        guard let receipt = try? JSONSerialization.jsonObject(with: data) else {
            return "the receipt is not a JSON object"
        }
        let source = binding.source
        let artifact = binding.artifact
        let expected: [String: Any] = [
            "contract_version": binding.contractVersion,
            "source": ["user_id": source.userID, "source_id": source.sourceID,
                       "source_version": source.sourceVersion] as [String: Any],
            "artifact": ["artifact_id": artifact.artifactID, "sha256": artifact.sha256,
                         "byte_length": artifact.byteLength, "media_type": artifact.mediaType] as [String: Any],
            "kind": binding.kind,
            "status": "bytes_committed",
        ]
        return sameJSON(receipt, expected) ? nil
            : "the receipt does not exactly match this original's version, source, artifact, kind and bytes_committed status"
    }

    /// Compares parsed JSON with expected strings, integers and objects, exactly: the same member
    /// names, no booleans for integers, no numbers for strings.
    private static func sameJSON(_ value: Any, _ expected: Any) -> Bool {
        switch expected {
        case let expected as [String: Any]:
            guard let object = value as? [String: Any], Set(object.keys) == Set(expected.keys) else { return false }
            return expected.allSatisfy { key, member in object[key].map { sameJSON($0, member) } ?? false }
        case let expected as String:
            return (value as? String) == expected
        case let expected as Int:
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return false }
            return number.stringValue == String(expected)
        default:
            return false
        }
    }

    /// The error code of a well-formed `IngressError` 0.2.4 body, or nil.
    static func ingressErrorCode(_ data: Data) -> String? {
        guard data.count <= 4096,
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              Set(object.keys) == ["contract_version", "error", "retryable"],
              object["contract_version"] as? String == "0.2.4",
              let retryable = object["retryable"] as? NSNumber, CFGetTypeID(retryable) == CFBooleanGetTypeID(),
              let code = object["error"] as? String, ingressErrorCodes.contains(code) else { return nil }
        return code
    }
}

// MARK: - Contract shapes

/// The exact `SourceRef` of an already registered shared-display source version, supplied by the
/// caller. This app never creates, infers or registers one.
struct OriginalSourceRef: Codable, Equatable {
    let userID: String
    let sourceID: String
    let sourceVersion: Int

    enum CodingKeys: String, CodingKey {
        case userID = "user_id", sourceID = "source_id", sourceVersion = "source_version"
    }

    var isValid: Bool {
        OriginalUpload.isIdentifier(userID) && OriginalUpload.isIdentifier(sourceID)
            && (1...OriginalUpload.maxSafeInteger).contains(sourceVersion)
    }
}

/// The 0.2.2 `ArtifactReference`.
struct OriginalArtifactReference: Codable, Equatable {
    let artifactID: String
    let sha256: String
    let byteLength: Int
    let mediaType: String

    enum CodingKeys: String, CodingKey {
        case artifactID = "artifact_id", sha256, byteLength = "byte_length", mediaType = "media_type"
    }
}

/// The 0.2.2 `OriginalArtifactBinding`: one original bound to one source version.
struct OriginalArtifactBinding: Codable, Equatable {
    let contractVersion: String
    let source: OriginalSourceRef
    let artifact: OriginalArtifactReference
    let kind: String

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version", source, artifact, kind
    }
}

// MARK: - Transport and authorization

/// Sends one request and returns the response. The caller injects it: an explicitly configured
/// `URLSession` (an ephemeral one keeps no cookies or credentials) or a test double.
protocol IngressTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: IngressTransport {
    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await data(for: request)
    }
}

/// The current authorization for a pass, supplied explicitly by the caller and held only in
/// memory. It is never written to the state, and its descriptions never show the token.
struct IngressAuthorization: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    let origin: URL
    fileprivate let bearerToken: String

    /// nil unless `origin` is a bare https origin (no path, query, fragment or user) and the token
    /// is a non-empty RFC 6750 bearer token.
    init?(origin: URL, bearerToken: String) {
        guard let parts = URLComponents(url: origin, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              ["", "/"].contains(parts.percentEncodedPath),
              Self.isBearerToken(bearerToken) else { return nil }
        self.origin = origin
        self.bearerToken = bearerToken
    }

    var description: String { "IngressAuthorization(origin: \(origin.absoluteString), bearer token not shown)" }
    var debugDescription: String { description }
    var customMirror: Mirror { Mirror(self, children: ["origin": origin]) }

    fileprivate func request(path: String, body: Data) -> URLRequest? {
        guard path.hasPrefix(OriginalUpload.routePrefix),
              OriginalUpload.isPathSafeIdentifier(String(path.dropFirst(OriginalUpload.routePrefix.count))),
              var parts = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { return nil }
        parts.percentEncodedPath = path
        guard let url = parts.url else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "PUT"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer " + bearerToken, forHTTPHeaderField: "Authorization")
        request.httpBody = body
        return request
    }

    private static func isBearerToken(_ token: String) -> Bool {
        let bytes = Array(token.utf8)
        let body = bytes.prefix { $0 != UInt8(ascii: "=") }
        guard !body.isEmpty, bytes.count <= 8192,
              bytes.dropFirst(body.count).allSatisfy({ $0 == UInt8(ascii: "=") }) else { return false }
        return body.allSatisfy { OriginalUpload.isAlphanumeric($0) || "-._~+/".utf8.contains($0) }
    }
}

// MARK: - Durable state

/// One original's upload record.
struct OriginalUploadItem: Codable, Equatable {
    /// The kept frame, relative to the session directory.
    let file: String
    let path: String
    let binding: OriginalArtifactBinding
    let requestByteLength: Int
    let requestSHA256: String
    /// pending, committed or refused. A refused original stays on disk; it cannot be sent as recorded.
    var state: String
    var attempts: Int
    var lastAttemptWallTime: Date?
    /// Never includes a token or a transport's error description.
    var lastOutcome: String?
    /// The validated receipt body, as received.
    var receipt: String?
}

struct OriginalUploadState: Codable {
    /// The one registered source version this session's originals are bound to.
    var source: OriginalSourceRef?
    /// Set once. No original of this session is sent after it.
    var stoppedReason: String?
    var stoppedWallTime: Date?
    var items: [OriginalUploadItem]
}

// MARK: - Uploader

/// The uploader for one capture session directory. One pass runs at a time; cancel the task that
/// runs `sendPending` to abandon a request in flight, which then stays pending.
actor OriginalUploader {
    enum Failure: Error, Equatable {
        case stateUnreadable
        case stateNotSaved
        case stopped(String)
        case invalidSource
        case otherSource
        case invalidRecord
        case missing
        case unreadable(String)
        case oversize
        case changed
        case notPNG
    }

    enum PassResult: Equatable {
        /// No original that was pending at the start is left to try in this pass.
        case finished
        /// Pending originals remain; a later explicit pass may send them.
        case halted(String)
        /// The session is stopped; its pending originals are never sent.
        case stopped(String)
    }

    let session: URL
    private let transport: IngressTransport
    private var state: OriginalUploadState
    private var passRunning = false
    /// Set after an authorization, source or receipt failure: this instance sends nothing more.
    private var disabledReason: String?

    init(session: URL, transport: IngressTransport) throws {
        self.session = session
        self.transport = transport
        let url = session.appending(path: OriginalUpload.stateFileName)
        if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
            // An unreadable state is never replaced: it may record committed or pending originals.
            guard let data = try? Data(contentsOf: url),
                  let saved = try? CaptureStore.decoder.decode(OriginalUploadState.self, from: data) else {
                throw Failure.stateUnreadable
            }
            state = saved
        } else {
            state = OriginalUploadState(items: [])
        }
    }

    var items: [OriginalUploadItem] { state.items }
    var stoppedReason: String? { state.stoppedReason }

    /// Binds one kept keyframe of this session to the session's registered source version and
    /// records its exact request before anything can be sent. Enqueueing the same file again
    /// returns its existing record.
    func enqueue(_ record: KeyframeRecord, source: OriginalSourceRef) throws -> OriginalUploadItem {
        if let reason = stopReason() { throw Failure.stopped(reason) }
        guard source.isValid else { throw Failure.invalidSource }
        if let pinned = state.source, pinned != source { throw Failure.otherSource }
        let parts = record.file.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0] == "frames", parts[1].hasSuffix(".png"), !parts[1].hasPrefix(".") else {
            throw Failure.invalidRecord
        }
        if let existing = state.items.first(where: { $0.file == record.file }) { return existing }
        guard record.mediaType == OriginalUpload.mediaType else { throw Failure.notPNG }
        let artifactID = "so.\(session.lastPathComponent).\(parts[1].dropLast(4))"
        guard OriginalUpload.isPathSafeIdentifier(artifactID) else { throw Failure.invalidRecord }
        let bytes = try checkedOriginal(record.file, sha256: record.sha256, byteLength: record.byteLength)
        let binding = OriginalArtifactBinding(
            contractVersion: OriginalUpload.contractVersion, source: source,
            artifact: OriginalArtifactReference(artifactID: artifactID, sha256: record.sha256,
                                                byteLength: bytes.count, mediaType: OriginalUpload.mediaType),
            kind: OriginalUpload.kind)
        guard let body = OriginalUpload.requestBody(binding, bytes: bytes) else { throw Failure.invalidRecord }
        let item = OriginalUploadItem(file: record.file, path: OriginalUpload.routePrefix + artifactID,
                                      binding: binding, requestByteLength: body.count,
                                      requestSHA256: OriginalUpload.sha256Hex(body), state: "pending", attempts: 0)
        let previous = state
        state.source = source
        state.items.append(item)
        guard save() else {
            state = previous
            throw Failure.stateNotSaved
        }
        return item
    }

    /// Stops the session for good: nothing more is sent, and pending originals stay on disk and
    /// pending. Returns false if the stop could not be saved; this instance stops regardless.
    @discardableResult
    func stop(_ reason: String) -> Bool {
        recordStop(reason)
    }

    /// Tries each pending original once, in order, while the session is live and nothing has
    /// failed. The request is recorded as attempted before it is sent.
    func sendPending(_ authorization: IngressAuthorization) async -> PassResult {
        guard !passRunning else { return .halted("another pass is already running") }
        passRunning = true
        defer { passRunning = false }
        for index in state.items.indices where state.items[index].state == "pending" {
            if let reason = durableStop() { return .stopped(reason) }
            if let reason = disabledReason { return .halted(reason) }
            if Task.isCancelled { return .halted("cancelled") }
            switch liveness() {
            case .finished:
                recordStop("the broadcast finished")
                return endOfPass("the broadcast finished")
            case .notLive(let reason):
                return .halted(reason)
            case .live:
                break
            }

            let item = state.items[index]
            let bytes: Data
            do {
                bytes = try checkedOriginal(item.file, sha256: item.binding.artifact.sha256,
                                            byteLength: item.binding.artifact.byteLength)
            } catch Failure.unreadable(let code) {
                note(index, "not sent: the original could not be read (\(code)); still pending")
                return .halted("an original could not be read")
            } catch {
                refuse(index, "not sent: " + Self.describe(error) + "; the local file is left as it is")
                continue
            }
            guard let body = OriginalUpload.requestBody(item.binding, bytes: bytes),
                  body.count == item.requestByteLength, OriginalUpload.sha256Hex(body) == item.requestSHA256 else {
                refuse(index, "not sent: the rebuilt request differs from the recorded one, and nothing different is sent under this artifact ID")
                continue
            }
            guard let request = authorization.request(path: item.path, body: body) else {
                note(index, "not sent: no request could be built for the recorded path; still pending")
                return .halted("no request could be built")
            }
            // Reading and encoding an original takes time: check cancellation again just before
            // sending. A stop saved meanwhile is adopted when the attempt is saved, below.
            if Task.isCancelled {
                note(index, "cancelled before sending; still pending")
                return .halted("cancelled")
            }

            let previous = state.items[index]
            state.items[index].attempts += 1
            state.items[index].lastAttemptWallTime = Date()
            state.items[index].lastOutcome = "sent; no response recorded"
            guard save() else {
                state.items[index] = previous
                return .halted("the upload state could not be saved, so nothing was sent")
            }
            if let reason = state.stoppedReason {
                // Another uploader stopped the session while this attempt was being recorded.
                state.items[index] = previous
                save()
                return .stopped(reason)
            }

            let response: (Data, URLResponse)
            do {
                response = try await transport.send(request)
                _ = durableStop() // Another uploader may have stopped the session meanwhile.
            } catch {
                _ = durableStop()
                // The server may or may not have stored the bytes; the same request is sent next time.
                let cancelled = Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled
                note(index, (cancelled ? "cancelled while waiting for the response"
                                       : "no response (\(OriginalUpload.errorCode(error)))")
                            + "; outcome unknown, still pending" + afterStop())
                return endOfPass(cancelled ? "cancelled" : "no response; outcome unknown")
            }
            if let end = handle(response, to: request, at: index) { return end }
        }
        return state.stoppedReason.map { PassResult.stopped($0) } ?? .finished
    }

    // MARK: - Private

    /// Records one response. Returns how the pass ends, or nil to continue with the next original.
    private func handle(_ response: (Data, URLResponse), to request: URLRequest, at index: Int) -> PassResult? {
        let (data, urlResponse) = response
        guard let http = urlResponse as? HTTPURLResponse else {
            note(index, "not an HTTP response; still pending" + afterStop())
            return endOfPass("not an HTTP response")
        }
        // A followed redirect may have taken the body elsewhere; the transport must not follow
        // redirects, and a response from another URL counts for nothing.
        guard http.url == request.url else {
            let reason = "the response came from another URL (a redirect was followed); outcome unknown"
            disabledReason = reason
            note(index, reason + "; still pending" + afterStop())
            return endOfPass(reason)
        }
        if http.statusCode == 200 {
            if let problem = OriginalUpload.receiptProblem(data, for: state.items[index].binding) {
                note(index, "HTTP 200 refused: \(problem); still pending" + afterStop())
                let reason = "the server returned a receipt that does not match: \(problem)"
                disabledReason = reason
                return endOfPass(reason)
            }
            state.items[index].state = "committed"
            state.items[index].receipt = String(decoding: data, as: UTF8.self)
            note(index, "bytes_committed" + afterStop())
            return state.stoppedReason.map { PassResult.stopped($0) }
        }
        let code = OriginalUpload.ingressErrorCode(data)
        let outcome = "HTTP \(http.statusCode) \(code ?? "without a valid IngressError")"
        switch (http.statusCode, code) {
        case (409, "capture_stopped"?):
            note(index, outcome + "; still pending and not sent again")
            recordStop("the server reported capture_stopped")
            return endOfPass(outcome)
        case (409, "record_conflict"?), (413, _):
            state.items[index].state = "refused"
            note(index, outcome + "; the server cannot accept this original as recorded; the local file is kept" + afterStop())
            return state.stoppedReason.map { PassResult.stopped($0) }
        case (401, _), (403, _), (404, _), (409, "stale_scope"?), (409, "unsupported_source"?):
            disabledReason = outcome + "; a new, current authorization or source is needed"
            note(index, outcome + "; still pending" + afterStop())
            return endOfPass(outcome)
        default:
            note(index, outcome + "; still pending" + afterStop())
            return endOfPass(outcome)
        }
    }

    private enum Liveness {
        case live
        case finished
        case notLive(String)
    }

    /// Whether the broadcast is running, from the status the extension saves. Stale or unreadable
    /// status means unknown, which is not live.
    private func liveness() -> Liveness {
        guard let data = try? Data(contentsOf: session.appending(path: "status.json")),
              let status = try? CaptureStore.decoder.decode(CaptureStatus.self, from: data),
              status.session == session.lastPathComponent else {
            return .notLive("the session status cannot be read, so whether capture is running is unknown")
        }
        switch status.state {
        case "finished":
            return .finished
        case "started", "resumed":
            let age = Date().timeIntervalSince(status.updatedWallTime)
            return age <= CaptureStatus.staleAfter ? .live
                : .notLive("no status update for \(Int(age)) s, so whether capture is running is unknown")
        default:
            return .notLive("the broadcast reported \(status.state)")
        }
    }

    /// The session's stop, first recording one if the broadcast has finished.
    private func stopReason() -> String? {
        if durableStop() == nil, case .finished = liveness() {
            recordStop("the broadcast finished")
        }
        return state.stoppedReason
    }

    /// The session's stop, adopting one that another uploader of this session has saved. One
    /// uploader per session is intended; a second one can never erase a stop or send after it.
    private func durableStop() -> String? {
        if state.stoppedReason == nil, let saved = savedState(), let reason = saved.stoppedReason {
            state.stoppedReason = reason
            state.stoppedWallTime = saved.stoppedWallTime
        }
        return state.stoppedReason
    }

    private func savedState() -> OriginalUploadState? {
        guard let data = try? Data(contentsOf: session.appending(path: OriginalUpload.stateFileName)) else { return nil }
        return try? CaptureStore.decoder.decode(OriginalUploadState.self, from: data)
    }

    @discardableResult
    private func recordStop(_ reason: String) -> Bool {
        guard durableStop() == nil else { return true }
        state.stoppedReason = reason
        state.stoppedWallTime = Date()
        return save()
    }

    private func endOfPass(_ reason: String) -> PassResult {
        state.stoppedReason.map { PassResult.stopped($0) } ?? .halted(reason)
    }

    private func afterStop() -> String {
        state.stoppedReason == nil ? "" : " (after the stop; nothing more is sent)"
    }

    /// Reads the original once and checks those same bytes, which are the ones encoded.
    private func checkedOriginal(_ file: String, sha256: String, byteLength: Int) throws -> Data {
        switch OriginalUpload.readOriginal(at: session.appending(path: file)) {
        case .missing:
            throw Failure.missing
        case .oversize:
            throw Failure.oversize
        case .unreadable(let code):
            throw Failure.unreadable(code)
        case .bytes(let bytes):
            guard bytes.count == byteLength, OriginalUpload.sha256Hex(bytes) == sha256 else { throw Failure.changed }
            guard bytes.starts(with: OriginalUpload.pngSignature) else { throw Failure.notPNG }
            return bytes
        }
    }

    private func refuse(_ index: Int, _ outcome: String) {
        state.items[index].state = "refused"
        note(index, outcome)
    }

    private func note(_ index: Int, _ outcome: String) {
        state.items[index].lastOutcome = outcome
        save()
    }

    /// Writes the whole state, first adopting any stop already saved by another uploader of this
    /// session, so a stop is never erased.
    @discardableResult
    private func save() -> Bool {
        _ = durableStop()
        guard let data = try? CaptureStore.encoder.encode(state) else { return false }
        do {
            try data.write(to: session.appending(path: OriginalUpload.stateFileName), options: .atomic)
            return true
        } catch {
            return false
        }
    }

    private static func describe(_ error: Error) -> String {
        switch error as? Failure {
        case .missing?: return "the original file is missing"
        case .changed?: return "the original file no longer matches its recorded length and SHA-256"
        case .oversize?: return "the original exceeds the 32 MiB transport bound and is unavailable for upload"
        case .notPNG?: return "the original is not a PNG"
        default: return "the original could not be checked"
        }
    }
}
