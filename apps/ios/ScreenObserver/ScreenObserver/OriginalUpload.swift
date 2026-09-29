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
// Durable state is one file in the capture session, `original-uploads.json`, changed only under an
// exclusive lock on `original-uploads.lock` (see `OriginalUploader`). It holds the source and, for
// each original, its complete binding, route path, request length and SHA-256, attempts, last
// outcome and validated receipt (in canonical form, never the received bytes). It never holds the bearer token, a transport's error text or a
// second copy of the bytes. A retry, after a lost response or a relaunch, rebuilds the request from
// the unchanged original and sends it only if it is byte-identical to the recorded request. An
// unreadable or vanished state is never overwritten; nothing is written or sent instead.
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
    static let lockFileName = "original-uploads.lock"
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

    /// A fixed category and numeric code. Error domains and descriptions are never recorded, because
    /// an injected transport could put anything in them, even the request's token.
    static func errorCategory(_ error: Error) -> String {
        let error = error as NSError
        let categories = [NSURLErrorDomain: "URL error", NSCocoaErrorDomain: "file error",
                          NSPOSIXErrorDomain: "POSIX error"]
        guard let category = categories[error.domain] else { return "other error" }
        return "\(category) \(error.code)"
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
                ? .unreadable(errorCategory(error)) : .missing
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
            return .unreadable(errorCategory(error))
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

    /// The canonical `OriginalArtifactReceipt` for `binding`, built only from its checked ASCII
    /// fields. After a received receipt matches, this is what is saved, never the received bytes,
    /// which could carry any text (for example in a duplicate member).
    static func canonicalReceipt(_ binding: OriginalArtifactBinding) -> String {
        let source = binding.source
        let artifact = binding.artifact
        return #"{"artifact":{"artifact_id":"\#(artifact.artifactID)","byte_length":\#(artifact.byteLength),"media_type":"\#(artifact.mediaType)","sha256":"\#(artifact.sha256)"},"contract_version":"\#(binding.contractVersion)","kind":"\#(binding.kind)","source":{"source_id":"\#(source.sourceID)","source_version":\#(source.sourceVersion),"user_id":"\#(source.userID)"},"status":"bytes_committed"}"#
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
    /// names, no booleans for integers, no numbers for strings, and strings equal byte for byte
    /// (Swift's `==` would accept canonically equivalent text, such as U+212A for "K").
    private static func sameJSON(_ value: Any, _ expected: Any) -> Bool {
        switch expected {
        case let expected as [String: Any]:
            guard let object = value as? [String: Any], Set(object.keys) == Set(expected.keys) else { return false }
            return expected.allSatisfy { key, member in object[key].map { sameJSON($0, member) } ?? false }
        case let expected as String:
            return (value as? String)?.utf8.elementsEqual(expected.utf8) ?? false
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

    /// nil unless `origin` is a bare https origin (lowercase; no path, query, fragment or user), so
    /// responses can be matched to it exactly, and the token is a non-empty RFC 6750 bearer token.
    init?(origin: URL, bearerToken: String) {
        guard let parts = URLComponents(url: origin, resolvingAgainstBaseURL: false),
              parts.scheme == "https", let host = parts.host, !host.isEmpty, host == host.lowercased(),
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
    /// The validated receipt in canonical form, rebuilt from the binding; never the received bytes.
    var receipt: String?
}

struct OriginalUploadState: Codable, Equatable {
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
///
/// Every change of `original-uploads.json`, and every read an operation acts on, happens under an
/// exclusive `flock` on `original-uploads.lock`, on the current saved state, never on a copy kept
/// in memory. (Opening an uploader only checks, without the lock, that an existing file is
/// readable; files are replaced by atomic rename, so it sees a whole file.) Uploaders of
/// the same session, in this process or another, therefore cannot erase each other's originals,
/// receipts or stop, or bind the session to a second source. A committed or refused original is
/// final. An unreadable state, or one that has vanished after it was created (recorded durably by
/// a witness mark in the lock file), is never written or recreated: every operation fails instead. The lock is held only for these short reads and writes,
/// never across a network request.
///
/// The attempt record, made under the lock, orders a send against a stop: a stop saved before it
/// prevents the send; a stop saved after it lets the request already on its way finish, and its
/// late response is recorded without anything more being sent.
actor OriginalUploader {
    enum Failure: Error, Equatable {
        case stateUnreadable
        case stateMissing
        case stateNotSaved
        case stateUnavailable(String)
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

    private enum Liveness {
        case live
        case finished
        case notLive(String)
    }

    private enum AttemptGate {
        case send
        case stopped(String)
        case notPending
    }

    let session: URL
    private let transport: IngressTransport
    private var passRunning = false
    /// Set once this uploader has seen or written the state file; after that, a missing file means
    /// lost history, not a new session. The lock file's witness mark records the same for every
    /// uploader, including ones that never saw the file (see `isWitnessed`).
    private var stateExists = false
    /// Set after an authorization, source or receipt failure: this instance sends nothing more.
    private var disabledReason: String?
    /// A stop known to this instance. It forbids sending even when it could not be saved.
    private var localStopReason: String?

    init(session: URL, transport: IngressTransport) throws {
        self.session = session
        self.transport = transport
        let url = session.appending(path: OriginalUpload.stateFileName)
        if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
            // An unreadable state is never replaced: it may record committed or pending originals.
            guard let data = try? Data(contentsOf: url),
                  (try? CaptureStore.decoder.decode(OriginalUploadState.self, from: data)) != nil else {
                throw Failure.stateUnreadable
            }
            stateExists = true
        }
    }

    /// The current saved state, read under the lock.
    func saved() throws -> OriginalUploadState {
        try withLockedState { $0 }
    }

    /// Binds one kept keyframe of this session to the session's registered source version and
    /// records its exact request before anything can be sent. Enqueueing the same file again
    /// returns its existing record.
    func enqueue(_ record: KeyframeRecord, source: OriginalSourceRef) throws -> OriginalUploadItem {
        if let reason = localStopReason { throw Failure.stopped(reason) }
        guard source.isValid else { throw Failure.invalidSource }
        let parts = record.file.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0] == "frames", parts[1].hasSuffix(".png"), !parts[1].hasPrefix(".") else {
            throw Failure.invalidRecord
        }
        if let existing = try withLockedState({ try Self.admit(record.file, source: source, in: $0) }) {
            return existing
        }
        if case .finished = liveness() {
            stop("the broadcast finished")
            throw Failure.stopped(localStopReason ?? "the broadcast finished")
        }
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
        // Checked again on the current state: another uploader may have acted meanwhile.
        return try withLockedState { state in
            if let existing = try Self.admit(record.file, source: source, in: state) { return existing }
            state.source = source
            state.items.append(item)
            return item
        }
    }

    /// Stops the session for good: nothing more is sent, and pending originals stay on disk and
    /// pending. Returns true only once the stop is saved (or was already saved); otherwise call it
    /// again. This instance sends nothing more either way.
    @discardableResult
    func stop(_ reason: String) -> Bool {
        if localStopReason == nil { localStopReason = reason }
        do {
            localStopReason = try withLockedState { state -> String in
                if state.stoppedReason == nil {
                    state.stoppedReason = reason
                    state.stoppedWallTime = Date()
                }
                return state.stoppedReason ?? reason
            }
            return true
        } catch {
            return false
        }
    }

    /// Tries each pending original once, in order, while the session is live and nothing has
    /// failed.
    func sendPending(_ authorization: IngressAuthorization) async -> PassResult {
        guard !passRunning else { return .halted("another pass is already running") }
        if let reason = localStopReason { return .stopped(reason) }
        passRunning = true
        defer { passRunning = false }
        let files: [String]
        do {
            files = try withLockedState { state in state.items.filter { $0.state == "pending" }.map(\.file) }
        } catch {
            return .halted(Self.describe(error))
        }
        for file in files {
            if let reason = localStopReason { return .stopped(reason) }
            if let reason = disabledReason { return endOfPass(reason) }
            if Task.isCancelled { return endOfPass("cancelled") }
            switch liveness() {
            case .finished:
                stop("the broadcast finished")
                return .stopped(localStopReason ?? "the broadcast finished")
            case .notLive(let reason):
                return endOfPass(reason)
            case .live:
                break
            }

            let current: (stop: String?, item: OriginalUploadItem?)
            do {
                current = try withLockedState { state in (state.stoppedReason, state.items.first { $0.file == file }) }
            } catch {
                return .halted(Self.describe(error))
            }
            if let reason = current.stop {
                localStopReason = reason
                return .stopped(reason)
            }
            guard let item = current.item, item.state == "pending" else { continue } // Done by another uploader.

            let bytes: Data
            do {
                bytes = try checkedOriginal(item.file, sha256: item.binding.artifact.sha256,
                                            byteLength: item.binding.artifact.byteLength)
            } catch Failure.unreadable(let category) {
                update(file) { $0.lastOutcome = "not sent: the original could not be read (\(category)); still pending" }
                return endOfPass("an original could not be read")
            } catch {
                guard update(file, {
                    $0.state = "refused"
                    $0.lastOutcome = "not sent: " + Self.describe(error) + "; the local file is left as it is"
                }) else { return endOfPass("the upload state could not be read or saved") }
                continue
            }
            guard let body = OriginalUpload.requestBody(item.binding, bytes: bytes),
                  body.count == item.requestByteLength, OriginalUpload.sha256Hex(body) == item.requestSHA256 else {
                guard update(file, {
                    $0.state = "refused"
                    $0.lastOutcome = "not sent: the rebuilt request differs from the recorded one, and nothing different is sent under this artifact ID"
                }) else { return endOfPass("the upload state could not be read or saved") }
                continue
            }
            guard let request = authorization.request(path: item.path, body: body) else {
                update(file) { $0.lastOutcome = "not sent: no request could be built for the recorded path; still pending" }
                return endOfPass("no request could be built")
            }
            // Reading and encoding an original takes time: check cancellation again just before
            // sending. A stop saved meanwhile is found by the attempt record below.
            if Task.isCancelled {
                update(file) { $0.lastOutcome = "cancelled before sending; still pending" }
                return endOfPass("cancelled")
            }

            let gate: AttemptGate
            do {
                gate = try withLockedState { state in
                    if let reason = state.stoppedReason { return .stopped(reason) }
                    guard let index = state.items.firstIndex(where: { $0.file == file }),
                          state.items[index].state == "pending" else { return .notPending }
                    state.items[index].attempts += 1
                    state.items[index].lastAttemptWallTime = Date()
                    state.items[index].lastOutcome = "sent; no response recorded"
                    return .send
                }
            } catch {
                return .halted(Self.describe(error) + ", so nothing was sent")
            }
            switch gate {
            case .stopped(let reason):
                localStopReason = reason
                return .stopped(reason)
            case .notPending:
                continue
            case .send:
                break
            }

            let response: (Data, URLResponse)
            do {
                response = try await transport.send(request)
            } catch {
                // The server may or may not have stored the bytes; the same request is sent next time.
                let cancelled = Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled
                let outcome = cancelled ? "cancelled while waiting for the response"
                                        : "no response (\(OriginalUpload.errorCategory(error)))"
                pending(file, outcome + "; outcome unknown, still pending")
                return endOfPass(cancelled ? "cancelled" : "no response; outcome unknown")
            }
            if let end = handle(response, to: request, item: item) { return end }
        }
        return currentStop().map { PassResult.stopped($0) } ?? .finished
    }

    // MARK: - Private

    /// Records one response. Returns how the pass ends, or nil to continue with the next original.
    private func handle(_ response: (Data, URLResponse), to request: URLRequest, item: OriginalUploadItem) -> PassResult? {
        let (data, urlResponse) = response
        guard let http = urlResponse as? HTTPURLResponse else {
            pending(item.file, "not an HTTP response; still pending")
            return endOfPass("not an HTTP response")
        }
        // A followed redirect may have taken the body elsewhere; the transport must not follow
        // redirects, and a response from another URL counts for nothing.
        guard http.url == request.url else {
            let reason = "the response came from another URL (a redirect was followed); outcome unknown"
            disabledReason = reason
            pending(item.file, reason + "; still pending")
            return endOfPass(reason)
        }
        if http.statusCode == 200 {
            if let problem = OriginalUpload.receiptProblem(data, for: item.binding) {
                let reason = "the server returned a receipt that does not match: \(problem)"
                disabledReason = reason
                pending(item.file, "HTTP 200 refused: \(problem); still pending")
                return endOfPass(reason)
            }
            let receipt = OriginalUpload.canonicalReceipt(item.binding)
            let suffix = afterStop()
            guard update(item.file, { item in
                item.state = "committed"
                item.receipt = receipt
                item.lastOutcome = "bytes_committed" + suffix
            }) else {
                // The server stored the bytes; the same request is sent again next time.
                return endOfPass("the receipt could not be saved")
            }
            return currentStop().map { PassResult.stopped($0) }
        }
        let code = OriginalUpload.ingressErrorCode(data)
        let outcome = "HTTP \(http.statusCode) \(code ?? "without a valid IngressError")"
        switch (http.statusCode, code) {
        case (409, "capture_stopped"?):
            pending(item.file, outcome + "; still pending and not sent again")
            stop("the server reported capture_stopped")
            return .stopped(localStopReason ?? "the server reported capture_stopped")
        case (409, "record_conflict"?), (413, "payload_too_large"?):
            let suffix = afterStop()
            guard update(item.file, {
                $0.state = "refused"
                $0.lastOutcome = outcome + "; the server cannot accept this original as recorded; the local file is kept" + suffix
            }) else { return endOfPass("the upload state could not be read or saved") }
            return currentStop().map { PassResult.stopped($0) }
        case (401, _), (403, _), (404, _), (409, "stale_scope"?), (409, "unsupported_source"?):
            disabledReason = outcome + "; a new, current authorization or source is needed"
            pending(item.file, outcome + "; still pending")
            return endOfPass(outcome)
        default:
            pending(item.file, outcome + "; still pending")
            return endOfPass(outcome)
        }
    }

    /// Runs `change` on the current saved state while holding the session's exclusive lock, and
    /// saves the result if it changed. A throwing `change` saves nothing.
    private func withLockedState<T>(_ change: (inout OriginalUploadState) throws -> T) throws -> T {
        let lockPath = session.appending(path: OriginalUpload.lockFileName).path(percentEncoded: false)
        let descriptor = open(lockPath, O_RDWR | O_CREAT | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw Failure.stateUnavailable("the state lock could not be opened (errno \(errno))") }
        defer { close(descriptor) }
        while flock(descriptor, LOCK_EX) != 0 {
            guard errno == EINTR else { throw Failure.stateUnavailable("the state lock could not be taken (errno \(errno))") }
        }
        defer { flock(descriptor, LOCK_UN) }

        let url = session.appending(path: OriginalUpload.stateFileName)
        let witnessed = try Self.isWitnessed(descriptor)
        let created = FileManager.default.fileExists(atPath: url.path(percentEncoded: false))
        let saved: OriginalUploadState
        if created {
            stateExists = true // Seen: from now on a missing file means lost history.
            // An existing file, readable or not, proves the state was created; one saved before the
            // witness existed is marked now. (A new uploader refuses an unreadable file at open.)
            if !witnessed { try Self.witness(descriptor) }
            guard let data = try? Data(contentsOf: url),
                  let decoded = try? CaptureStore.decoder.decode(OriginalUploadState.self, from: data) else {
                throw Failure.stateUnreadable
            }
            saved = decoded
        } else if stateExists || witnessed {
            throw Failure.stateMissing
        } else {
            saved = OriginalUploadState(items: []) // An honestly new session.
        }
        var next = saved
        let result = try change(&next)
        if next != saved {
            // The witness is recorded before the state is first created and withdrawn if recording
            // it or that creation fails, so a new session stays new. If the app is interrupted in
            // between (killed, crash, power loss), the mark stays without a state: the session is
            // then refused as uncertain, never treated as new.
            do {
                if !created { try Self.witness(descriptor) }
                try CaptureStore.encoder.encode(next).write(to: url, options: .atomic)
            } catch {
                if !created {
                    _ = ftruncate(descriptor, 0)
                    _ = fsync(descriptor)
                }
                throw Failure.stateNotSaved
            }
            stateExists = true
        }
        return result
    }

    /// Whether this session's state was ever created. The lock file itself is the durable witness:
    /// empty until the state is first created, then holding a fixed mark. So any uploader, including
    /// one opened after a relaunch or before the state existed, treats a missing state as lost
    /// history, never as a new session. The session looks new again only if the lock file is lost
    /// as well, or if a state saved before the witness existed is lost before any operation reads
    /// it under the lock (or is unreadable whenever an uploader is opened).
    private static func isWitnessed(_ descriptor: Int32) throws -> Bool {
        var info = stat()
        guard fstat(descriptor, &info) == 0 else {
            throw Failure.stateUnavailable("the state lock could not be inspected (errno \(errno))")
        }
        return info.st_size > 0
    }

    private static func witness(_ descriptor: Int32) throws {
        let mark = Data("original-uploads.json has been created for this capture session\n".utf8)
        let written = mark.withUnsafeBytes { pwrite(descriptor, $0.baseAddress, $0.count, 0) }
        guard written == mark.count, fsync(descriptor) == 0 else {
            throw Failure.stateUnavailable("the state lock could not record that the state exists (errno \(errno))")
        }
    }

    /// The existing record for `file`, or nil if it may be added; throws if the session is stopped
    /// or bound to another source.
    private static func admit(_ file: String, source: OriginalSourceRef,
                              in state: OriginalUploadState) throws -> OriginalUploadItem? {
        if let reason = state.stoppedReason { throw Failure.stopped(reason) }
        if let pinned = state.source, pinned != source { throw Failure.otherSource }
        return state.items.first { $0.file == file }
    }

    /// Changes one pending original in the saved state. A committed or refused original is final,
    /// so another uploader's result is never overwritten. Returns false if the state could not be
    /// read or saved.
    @discardableResult
    private func update(_ file: String, _ change: (inout OriginalUploadItem) -> Void) -> Bool {
        do {
            try withLockedState { state in
                guard let index = state.items.firstIndex(where: { $0.file == file }),
                      state.items[index].state == "pending" else { return }
                change(&state.items[index])
            }
            return true
        } catch {
            return false
        }
    }

    /// Records the outcome of an original that stays pending.
    private func pending(_ file: String, _ outcome: String) {
        let suffix = afterStop()
        update(file) { $0.lastOutcome = outcome + suffix }
    }

    /// The session's stop, known locally or saved by any uploader.
    private func currentStop() -> String? {
        if localStopReason == nil, let saved = try? withLockedState({ $0.stoppedReason }) {
            localStopReason = saved
        }
        return localStopReason
    }

    private func endOfPass(_ reason: String) -> PassResult {
        currentStop().map { PassResult.stopped($0) } ?? .halted(reason)
    }

    private func afterStop() -> String {
        currentStop() == nil ? "" : " (after the stop; nothing more is sent)"
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

    /// Reads the original once and checks those same bytes, which are the ones encoded.
    private func checkedOriginal(_ file: String, sha256: String, byteLength: Int) throws -> Data {
        switch OriginalUpload.readOriginal(at: session.appending(path: file)) {
        case .missing:
            throw Failure.missing
        case .oversize:
            throw Failure.oversize
        case .unreadable(let category):
            throw Failure.unreadable(category)
        case .bytes(let bytes):
            guard bytes.count == byteLength, OriginalUpload.sha256Hex(bytes) == sha256 else { throw Failure.changed }
            guard bytes.starts(with: OriginalUpload.pngSignature) else { throw Failure.notPNG }
            return bytes
        }
    }

    private static func describe(_ error: Error) -> String {
        switch error as? Failure {
        case .missing?: return "the original file is missing"
        case .changed?: return "the original file no longer matches its recorded length and SHA-256"
        case .oversize?: return "the original exceeds the 32 MiB transport bound and is unavailable for upload"
        case .notPNG?: return "the original is not a PNG"
        case .stateUnreadable?: return "the upload state cannot be read; it is left as it is"
        case .stateMissing?: return "the upload state has disappeared; it is not recreated"
        case .stateNotSaved?: return "the upload state could not be saved"
        case .stateUnavailable(let reason)?: return reason
        default: return "the original could not be checked"
        }
    }
}
