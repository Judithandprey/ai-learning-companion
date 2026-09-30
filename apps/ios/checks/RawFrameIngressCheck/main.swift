// Executed checks for ScreenObserver's raw-frame process batches
// (apps/ios/ScreenObserver/ScreenObserver/RawFrameIngress.swift): one kept frame's metadata sent as
// RawFrameBatchRequest 0.2.6 to POST /v2/process/raw-frames:batch, after its original was committed.
// Builds without the app on any Mac with Xcode, for example the hosted macos-26 runner:
//
//   xcrun swiftc -target arm64-apple-macos14 \
//     apps/ios/ScreenObserver/Shared/CaptureStore.swift \
//     apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
//     apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift \
//     apps/ios/ScreenObserver/ScreenObserver/RawCaptureFrame.swift \
//     apps/ios/ScreenObserver/ScreenObserver/RawFrameIngress.swift \
//     apps/ios/checks/RawFrameIngressCheck/main.swift -o raw-frame-ingress-check
//   ./raw-frame-ingress-check FIXTURE_DIR
//   python3 apps/ios/checks/RawFrameIngressCheck/validate_raw_ingress.py FIXTURE_DIR
//
// The originals are real PNGs kept by ScreenObserver's FrameStore, committed through the real
// OriginalUploader. The transport is an in-process test double that plays the service, so no
// network, server, device or ReplayKit is involved. FIXTURE_DIR (absent or empty) receives the
// exact request bodies, acknowledgements and error bodies for the Python contract check, but never
// a token. Exits non-zero on any failure.

import CoreImage
import Foundation

var failures = 0

func expect(_ condition: Bool, _ name: String) {
    print((condition ? "PASS " : "FAIL ") + name)
    if !condition { failures += 1 }
}

let root = FileManager.default.temporaryDirectory
    .appending(path: "raw-frame-ingress-check-\(UUID().uuidString)", directoryHint: .isDirectory)
let fixtures = CommandLine.arguments.count > 1
    ? URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    : root.appending(path: "fixtures", directoryHint: .isDirectory)
var manifest: [[String: Any]] = []
let tokens = (0..<4).map { "raw-check-token-\($0)-\(UUID().uuidString)" }
let origin = URL(string: "https://ingress.invalid")!
let source = OriginalSourceRef(userID: "user-1", sourceID: "display-source-1", sourceVersion: 1)
let receivedAt = "2026-09-30T05:00:00.123456Z"

func authorization(_ index: Int) -> IngressAuthorization {
    IngressAuthorization(origin: origin, bearerToken: tokens[index])!
}

func identity(frame: Int, clockDomain: String? = "callback-clock-1") -> RawFrameIdentity {
    RawFrameIdentity(frameID: "raw-frame-\(frame)", source: source, deviceID: "ipad-1", sessionID: "learning-session-1",
                     streamID: "capture-stream-1", callbackClockDomain: clockDomain)
}

func profile(_ n: Int, key: String? = nil, sequence: Int? = nil, mode: String = "live") -> RawFrameRecordProfile {
    RawFrameRecordProfile(recordID: "raw-record-\(n)", sequence: sequence ?? 100 + n, batchID: "raw-batch-\(n)",
                          idempotencyKey: key ?? "raw-key-\(n)", deliveryMode: mode)
}

// MARK: - The test service

actor FakeServer: IngressTransport {
    typealias Step = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    private var steps: [Step] = []
    private(set) var requests: [URLRequest] = []

    func script(_ steps: [Step]) {
        self.steps = steps
    }

    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        requests.append(request)
        guard !steps.isEmpty else { throw URLError(.cannotConnectToHost) }
        return try await steps.removeFirst()(request)
    }
}

func respond(_ status: Int, _ body: Data, to request: URLRequest) -> (Data, URLResponse) {
    (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                           headerFields: ["Content-Type": "application/json"])!)
}

func rawError(_ code: String, retryable: Bool = false) -> Data {
    Data(#"{"contract_version":"0.2.6","error":"\#(code)","retryable":\#(retryable)}"#.utf8)
}

/// Commits an original upload: echoes its binding with status bytes_committed.
let commitOriginal: FakeServer.Step = { request in
    var object = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
    object["data_base64"] = nil
    object["status"] = "bytes_committed"
    let receipt = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    return respond(200, receipt, to: request)
}

/// The verified ProcessBatchAck a correct service returns for a raw-frame batch request.
func ackObject(for body: Data, disposition: String = "accepted") -> [String: Any] {
    let request = try! JSONSerialization.jsonObject(with: body) as! [String: Any]
    let batch = request["batch"] as! [String: Any]
    let record = (batch["records"] as! [[String: Any]])[0]
    var artifact = (record["artifacts"] as! [[String: Any]])[0]
    artifact["status"] = "verified"
    let receipt: [String: Any] = ["record_id": record["record_id"]!, "sequence": record["sequence"]!,
                                  "disposition": disposition, "received_at": receivedAt,
                                  "envelope": "committed", "artifacts": [artifact]]
    return ["contract_version": "0.2.0", "batch_id": batch["batch_id"]!,
            "user_id": (record["source"] as! [String: Any])["user_id"]!, "device_id": batch["device_id"]!,
            "session_id": batch["session_id"]!, "stream_id": batch["stream_id"]!, "acknowledged": [receipt]]
}

func ackStep(disposition: String = "accepted") -> FakeServer.Step {
    { request in
        let ack = try JSONSerialization.data(withJSONObject: ackObject(for: request.httpBody!, disposition: disposition),
                                             options: [.sortedKeys])
        return respond(200, ack, to: request)
    }
}

func reply(_ status: Int, _ body: Data) -> FakeServer.Step {
    { request in respond(status, body, to: request) }
}

// MARK: - Sessions

final class ResultBox<T>: @unchecked Sendable {
    var result: Result<T, Error>?
}

var sessionCount = 0

func writeStatus(_ session: URL, _ state: String = "started") throws {
    let status = CaptureStatus(session: session.lastPathComponent, state: state, startedWallTime: Date(timeIntervalSince1970: 1_790_000_000),
                               startedHostTime: 1000, updatedWallTime: Date())
    try CaptureStore.encoder.encode(status).write(to: session.appending(path: "status.json"), options: .atomic)
}

/// A capture session with `count` kept PNG frames and a fresh "started" status.
func makeSession(frames count: Int) throws -> (URL, [KeyframeRecord]) {
    sessionCount += 1
    let session = root.appending(path: String(format: "20260930T05%04ldZ-B0B0B0%02ld", sessionCount, sessionCount),
                                 directoryHint: .isDirectory)
    let frames = session.appending(path: "frames", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: frames, withIntermediateDirectories: true)
    let store = FrameStore(directory: frames, byteCap: 16 << 20)
    var records: [KeyframeRecord] = []
    for n in 1...count {
        let image = CIImage(color: CIColor(red: Double(n) / 10, green: 0.5, blue: Double(sessionCount) / 60))
            .cropped(to: CGRect(x: 0, y: 0, width: 64, height: 48))
        guard case .kept(let file, let byteLength, let sha256) = store.keep(image, name: String(format: "%08ld.png", n)) else {
            throw CocoaError(.fileWriteUnknown)
        }
        records.append(KeyframeRecord(file: "frames/" + file, sequence: 40 + n, presentationTime: Double(n) / 4,
                                      hostTime: 1000 + Double(n), width: 64, height: 48, orientation: 6,
                                      pixelFormat: "BGRA", mediaType: "image/png", encoding: FrameStore.encoding,
                                      byteLength: byteLength, sha256: sha256))
    }
    try writeStatus(session)
    return (session, records)
}

/// A session whose originals are committed through the real uploader, with each frame's batch
/// enqueued (unless `enqueue` is false).
func prepared(frames count: Int, enqueue: Bool = true) async throws -> (URL, [KeyframeRecord], OriginalUploader, FakeServer) {
    let (session, records) = try makeSession(frames: count)
    let server = FakeServer()
    let uploader = try OriginalUploader(session: session, transport: server)
    for record in records { _ = try await uploader.enqueue(record, source: source) }
    await server.script(Array(repeating: commitOriginal, count: count))
    _ = await uploader.sendPending(authorization(0))
    if enqueue {
        for (n, record) in records.enumerated() {
            _ = try await uploader.enqueueFrameBatch(record, identity: identity(frame: n + 1), profile: profile(n + 1))
        }
    }
    return (session, records, uploader, server)
}

func batches(_ uploader: OriginalUploader) async throws -> [RawFrameBatchItem] {
    try await uploader.saved().frameBatches ?? []
}

func isHalted(_ result: OriginalUploader.PassResult) -> Bool {
    if case .halted = result { return true }
    return false
}

func snapshot(_ directory: URL) -> [String: Data] {
    var files: [String: Data] = [:]
    let walker = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey])
    while let url = walker?.nextObject() as? URL {
        if (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true {
            files[url.path(percentEncoded: false)] = try? Data(contentsOf: url)
        }
    }
    return files
}

func fixture(_ name: String, _ data: Data) -> String {
    try! data.write(to: fixtures.appending(path: name))
    return name
}

// MARK: - Checks

/// Returns the committed request body, which request-live.json holds.
func checkCommitAndReopen() async throws -> Data {
    let (session, records, uploader, server) = try await prepared(frames: 1)
    let originalRequests = await server.requests
    expect(originalRequests.count == 1 && originalRequests[0].httpMethod == "PUT"
           && originalRequests[0].value(forHTTPHeaderField: "Idempotency-Key") == nil,
           "the original is still committed by the unchanged PUT, without an Idempotency-Key")
    let item = try await batches(uploader)[0]
    let body = Data(item.request.utf8)
    let request = try JSONSerialization.jsonObject(with: body) as! [String: Any]
    let batch = request["batch"] as! [String: Any]
    let record = (batch["records"] as! [[String: Any]])[0]
    let evidence = record["evidence"] as! [String: Any]
    let frame = (request["frames"] as! [[String: Any]])[0]
    let committed = try await uploader.saved().items[0]
    let frameJSON = try RawCaptureFrame.json(record: records[0], localSession: session.lastPathComponent,
                                             status: CaptureStore.decoder.decode(CaptureStatus.self, from: Data(contentsOf: session.appending(path: "status.json"))),
                                             identity: identity(frame: 1), binding: committed.binding)
    expect(request["contract_version"] as? String == "0.2.6" && batch["contract_version"] as? String == "0.2.0"
           && batch["batch_id"] as? String == "raw-batch-1" && batch["delivery_mode"] as? String == "live"
           && batch["stream_id"] as? String == "capture-stream-1" && body.range(of: frameJSON) != nil,
           "the request is RawFrameBatchRequest 0.2.6 around ProcessBatch 0.2.0, with the mapper's frame embedded byte for byte")
    expect(record["record_id"] as? String == "raw-record-1" && record["sequence"] as? Int == 101 && frame["buffer_sequence"] as? Int == 41
           && (record["scope"] as? [String: Any])?["kind"] as? String == "provisional_session"
           && record["surface"] as? String == "external_app" && record["method"] as? String == "visual"
           && (record["causal_parents"] as? [Any])?.isEmpty == true && record["frame_id"] as? String == "raw-frame-1"
           && record["observed_at"] is NSNull && record["media_position"] is NSNull,
           "one framed provisional_session record: external_app, visual, no parents, the caller's sequence (not the buffer's)")
    expect(evidence["coverage"] as? String == "observed_samples" && evidence["limitations"] as? [String] == ["sample_only", "unsupported_history"]
           && evidence["from_clock_ms"] is NSNull && evidence["through_clock_ms"] is NSNull
           && (evidence["missing_sequences"] as? [Any])?.isEmpty == true
           && NSDictionary(dictionary: record["clock"] as! [String: Any]).isEqual(to: (frame["timing"] as! [String: Any])["callback_clock"] as! [String: Any])
           && NSArray(array: record["artifacts"] as! [Any]).isEqual(to: [frame["artifact"]!]),
           "sampled pixels only: observed_samples, sample_only and unsupported_history, unknown bounds; clock and artifact bound exactly")

    await server.script([ackStep()])
    let pass = await uploader.sendFrameBatches(authorization(1))
    let sent = await server.requests
    let after = try await batches(uploader)[0]
    let post = sent.last!
    expect(pass == .finished && after.state == "committed" && after.attempts == 1 && after.ack != nil,
           "a verified ProcessBatchAck commits the batch")
    expect(sent.count == 2 && post.httpMethod == "POST"
           && post.url?.absoluteString == "https://ingress.invalid/v2/process/raw-frames:batch"
           && post.value(forHTTPHeaderField: "Idempotency-Key") == "raw-key-1"
           && post.value(forHTTPHeaderField: "Content-Type") == "application/json"
           && post.value(forHTTPHeaderField: "Authorization") == "Bearer " + tokens[1] && post.httpBody == body,
           "one POST to the exact route with the Idempotency-Key, JSON, the supplied token and the recorded body")
    let stored = try JSONSerialization.jsonObject(with: Data(after.ack!.utf8)) as! [String: Any]
    expect(NSDictionary(dictionary: stored).isEqual(to: ackObject(for: body)),
           "the stored acknowledgement is the validated one, in canonical form")

    let reopened = try OriginalUploader(session: session, transport: server)
    let again = await reopened.sendFrameBatches(authorization(1))
    let count = await server.requests.count
    let reread = try await batches(reopened)
    expect(again == .finished && count == 2 && reread == [after],
           "after reopening, the committed batch and its acknowledgement are read back and nothing is sent again")

    let bindingObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(committed.binding))
    // The actual recorded original PUT body (no headers), so the fixture keeps the exact PNG bytes.
    manifest.append(["type": "request", "name": "live", "body": fixture("request-live.json", body),
                     "original": fixture("original-live.json", originalRequests[0].httpBody ?? Data()),
                     "user_id": "user-1", "binding": bindingObject, "posted": true,
                     "idempotency_key": post.value(forHTTPHeaderField: "Idempotency-Key") ?? "",
                     "method": post.httpMethod ?? "", "path": post.url?.path(percentEncoded: true) ?? ""])
    return body
}

func checkEligibilityAndIdentity() async throws {
    let (session, records, uploader, _) = try await prepared(frames: 3, enqueue: false)
    let (pendingSession, pendingRecords) = try makeSession(frames: 1)
    let pendingUploader = try OriginalUploader(session: pendingSession, transport: FakeServer())
    _ = try await pendingUploader.enqueue(pendingRecords[0], source: source) // Enqueued, never committed.
    var notCommitted: Error?
    do {
        _ = try await pendingUploader.enqueueFrameBatch(pendingRecords[0], identity: identity(frame: 9), profile: profile(9))
    } catch {
        notCommitted = error
    }
    expect((notCommitted as? RawFrameIngress.Failure) == .originalNotCommitted,
           "a frame whose original is not committed is not eligible")

    let first = try await uploader.enqueueFrameBatch(records[0], identity: identity(frame: 1), profile: profile(1))
    let same = try await uploader.enqueueFrameBatch(records[0], identity: identity(frame: 1), profile: profile(1))
    let before = snapshot(session)
    func refusal(_ record: KeyframeRecord, _ frame: Int, _ profile: RawFrameRecordProfile) async -> String {
        do {
            _ = try await uploader.enqueueFrameBatch(record, identity: identity(frame: frame), profile: profile)
            return "none"
        } catch RawFrameIngress.Failure.otherIdentity {
            return "identity"
        } catch RawFrameIngress.Failure.profile {
            return "profile"
        } catch {
            return "other"
        }
    }
    let otherKey = await refusal(records[0], 1, profile(1, key: "raw-key-other"))
    let reusedKey = await refusal(records[1], 2, profile(2, key: "raw-key-1"))
    let reusedSequence = await refusal(records[1], 2, profile(2, sequence: 101))
    let invalidKey = await refusal(records[2], 3, profile(3, key: "raw key"))
    let zeroSequence = await refusal(records[2], 3, profile(3, sequence: 0))
    let badMode = await refusal(records[2], 3, profile(3, mode: "replay"))
    expect(same == first && otherKey == "identity" && reusedKey == "identity" && reusedSequence == "identity",
           "the same frame and identity return the record; another key for it, or a reused key or sequence, is refused")
    expect(invalidKey == "profile" && zeroSequence == "profile" && badMode == "profile" && snapshot(session) == before,
           "an invalid key, sequence 0 or an unknown delivery mode is refused, and the refusals change no file")
}

/// `body` is the request that request-live.json holds, so every fixture pairs with its own request.
func checkAckMatrix(_ body: Data) {
    let good = ackObject(for: body)
    func variant(_ change: (inout [String: Any]) -> Void) -> Data {
        var object = good
        change(&object)
        return try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }
    func receipt(_ change: @escaping (inout [String: Any]) -> Void) -> Data {
        variant { object in
            var receipt = (object["acknowledged"] as! [[String: Any]])[0]
            change(&receipt)
            object["acknowledged"] = [receipt]
        }
    }
    func artifact(_ change: @escaping (inout [String: Any]) -> Void) -> Data {
        receipt { receipt in
            var artifact = (receipt["artifacts"] as! [[String: Any]])[0]
            change(&artifact)
            receipt["artifacts"] = [artifact]
        }
    }
    let pretty = try! JSONSerialization.data(withJSONObject: good, options: [.prettyPrinted])
    let cases: [(String, Data, Bool)] = [
        ("canonical", variant { _ in }, true),
        ("pretty-reordered", pretty, true),
        ("duplicate-disposition", receipt { $0["disposition"] = "duplicate" }, true),
        ("whole-second-received-at", receipt { $0["received_at"] = "2026-09-30T05:00:00Z" }, true),
        ("empty", Data(), false),
        ("not-json", Data("committed".utf8), false),
        ("error-body", rawError("unavailable", retryable: true), false),
        ("other-version", variant { $0["contract_version"] = "0.2.6" }, false),
        ("extra-member", variant { $0["live"] = true }, false),
        ("other-batch", variant { $0["batch_id"] = "raw-batch-9" }, false),
        ("other-owner", variant { $0["user_id"] = "user-2" }, false),
        ("other-device", variant { $0["device_id"] = "ipad-2" }, false),
        ("other-session", variant { $0["session_id"] = "learning-session-2" }, false),
        ("other-stream", variant { $0["stream_id"] = "capture-stream-2" }, false),
        ("no-receipt", variant { $0["acknowledged"] = [] as [Any] }, false),
        ("extra-receipt", variant { $0["acknowledged"] = ($0["acknowledged"] as! [Any]) + ($0["acknowledged"] as! [Any]) }, false),
        ("other-record", receipt { $0["record_id"] = "raw-record-9" }, false),
        ("other-sequence", receipt { $0["sequence"] = 999 }, false),
        ("boolean-sequence", receipt { $0["sequence"] = true }, false),
        ("envelope-not-committed", receipt { $0["envelope"] = "pending" }, false),
        ("unknown-disposition", receipt { $0["disposition"] = "rejected" }, false),
        ("malformed-received-at", receipt { $0["received_at"] = "yesterday" }, false),
        ("received-at-with-text", receipt { $0["received_at"] = "2026-09-30T05:00:00Z extra" }, false),
        ("impossible-received-at", receipt { $0["received_at"] = "2026-02-30T05:00:00Z" }, false),
        ("lowercase-t-received-at", receipt { $0["received_at"] = "2026-09-30t05:00:00Z" }, true),
        ("ten-fraction-digits-received-at", receipt { $0["received_at"] = "2026-09-30T05:00:00.1234567890Z" }, true),
        ("lowercase-z-received-at", receipt { $0["received_at"] = "2026-09-30T05:00:00z" }, false),
        ("offset-received-at", receipt { $0["received_at"] = "2026-09-30T05:00:00+00:00" }, false),
        ("leap-second-received-at", receipt { $0["received_at"] = "2026-09-30T23:59:60Z" }, false),
        ("year-zero-received-at", receipt { $0["received_at"] = "0000-09-30T05:00:00Z" }, false),
        ("pending-artifact", artifact { $0["status"] = "pending" }, false),
        ("other-artifact-hash", artifact { $0["sha256"] = String(repeating: "0", count: 64) }, false),
        ("other-artifact-length", artifact { $0["byte_length"] = 1 }, false),
        ("extra-artifact-member", artifact { $0["note"] = "x" }, false),
        ("no-artifact", receipt { $0["artifacts"] = [] as [Any] }, false),
    ]
    var agree = true
    for (name, data, accept) in cases {
        let accepted: Bool
        if case .success = OriginalUpload.acceptedFrameBatchAck(data, request: body) { accepted = true } else { accepted = false }
        agree = agree && accepted == accept
        if accepted != accept { print("  mismatch: \(name)") }
        manifest.append(["type": "ack", "name": name, "request": "request-live.json",
                         "ack": fixture("ack-\(name).json", data), "swift_verdict": accepted ? "accepted" : "rejected"])
    }
    expect(agree, "all \(cases.count) acknowledgement variants: only the complete, verified one for this batch is accepted")
}

func checkWrongAckAndRetry() async throws {
    let (session, _, uploader, server) = try await prepared(frames: 1)
    await server.script([{ request in
        var ack = ackObject(for: request.httpBody!)
        var receipt = (ack["acknowledged"] as! [[String: Any]])[0]
        var artifact = (receipt["artifacts"] as! [[String: Any]])[0]
        artifact["status"] = "pending"
        receipt["artifacts"] = [artifact]
        ack["acknowledged"] = [receipt]
        return respond(200, try JSONSerialization.data(withJSONObject: ack), to: request)
    }, ackStep()])
    let pending = await uploader.sendFrameBatches(authorization(1))
    let afterPending = await uploader.sendFrameBatches(authorization(1))
    let pendingItem = try await batches(uploader)[0]
    let countAfterPending = await server.requests.count
    expect(isHalted(pending) && isHalted(afterPending) && pendingItem.state == "pending" && pendingItem.ack == nil && countAfterPending == 2,
           "an acknowledgement with a pending artifact is not success; that uploader then sends nothing more")

    await server.script([{ request in
        _ = try await ackStep()(request) // The service commits; the response is lost.
        throw URLError(.networkConnectionLost)
    }])
    let relaunched = try OriginalUploader(session: session, transport: server)
    let lost = await relaunched.sendFrameBatches(authorization(2))
    let lostItem = try await batches(relaunched)[0]
    let later = try OriginalUploader(session: session, transport: server)
    await server.script([ackStep(disposition: "duplicate")])
    let retry = await later.sendFrameBatches(authorization(3))
    let sent = await server.requests
    let final = try await batches(later)[0]
    let posts = sent.filter { $0.httpMethod == "POST" }
    expect(lost == .halted("no response; outcome unknown") && lostItem.state == "pending"
           && retry == .finished && final.state == "committed" && final.attempts == 3,
           "after a lost response and a relaunch, the retry is committed by the service's duplicate acknowledgement")
    expect(posts.count == 3 && Set(posts.map { $0.httpBody }).count == 1
           && Set(posts.map { $0.value(forHTTPHeaderField: "Idempotency-Key") ?? "" }) == ["raw-key-1"],
           "every attempt sends the unchanged envelope with the same Idempotency-Key")
}

func checkErrors() async throws {
    let (_, _, uploader, server) = try await prepared(frames: 4)
    let conflict = rawError("idempotency_conflict")
    await server.script([reply(409, conflict), reply(409, rawError("record_conflict")),
                         reply(409, rawError("dependency_missing", retryable: true))])
    let pass = await uploader.sendFrameBatches(authorization(1))
    let items = try await batches(uploader)
    expect(isHalted(pass) && items[0].state == "refused" && items[1].state == "refused" && items[2].state == "pending"
           && items[3].state == "pending" && items[3].attempts == 0,
           "idempotency_conflict and record_conflict refuse that batch for good; dependency_missing keeps it pending and ends the pass")
    await server.script([reply(413, Data("<html>too large</html>".utf8)), reply(409, rawError("capture_stopped"))])
    let proxy = await uploader.sendFrameBatches(authorization(1))
    let stopped = await uploader.sendFrameBatches(authorization(1))
    let afterStop = await uploader.sendFrameBatches(authorization(1))
    let requests = await server.requests.filter { $0.httpMethod == "POST" }.count
    let stop = try await uploader.saved().stoppedReason
    expect(isHalted(proxy) && stopped == .stopped("the service reported capture_stopped") && afterStop == stopped
           && requests == 5 && stop == "the service reported capture_stopped",
           "a proxy 413 stays pending; capture_stopped stops the session durably and nothing more is sent")
    for (name, data, status) in [("idempotency_conflict", conflict, 409), ("capture_stopped", rawError("capture_stopped"), 409),
                                 ("unavailable", rawError("unavailable", retryable: true), 503)] {
        manifest.append(["type": "error", "name": name, "status": status, "body": fixture("error-\(name).json", data)])
    }
}

func checkStopAndCancel() async throws {
    let (session, _, uploader, server) = try await prepared(frames: 2)
    let other = try OriginalUploader(session: session, transport: FakeServer())
    await other.stop("the learner stopped sharing")
    await server.script([ackStep(), ackStep()])
    let stopped = await uploader.sendFrameBatches(authorization(1))
    let posts = await server.requests.filter { $0.httpMethod == "POST" }.count
    let items = try await batches(uploader)
    let originals = try await uploader.saved().items
    expect(stopped == .stopped("the learner stopped sharing") && posts == 0 && items.allSatisfy { $0.state == "pending" && $0.attempts == 0 }
           && originals.allSatisfy { $0.state == "committed" },
           "after a saved Stop nothing is sent; the batches stay pending locally and their committed originals are kept")

    let (_, _, uploader2, server2) = try await prepared(frames: 2)
    await server2.script([{ request in
        await uploader2.stop("the learner stopped sharing")
        return try await ackStep()(request)
    }, ackStep()])
    let late = await uploader2.sendFrameBatches(authorization(1))
    let lateItems = try await batches(uploader2)
    let latePosts = await server2.requests.filter { $0.httpMethod == "POST" }.count
    expect(late == .stopped("the learner stopped sharing") && latePosts == 1 && lateItems[0].state == "committed"
           && lateItems[0].lastOutcome == "committed (after the stop; nothing more is sent)" && lateItems[1].state == "pending",
           "an acknowledgement that arrives after the Stop is recorded, and the next batch is not sent")

    let (_, _, uploader3, server3) = try await prepared(frames: 1)
    await server3.script([ackStep()])
    let early = Task { () -> OriginalUploader.PassResult in
        while !Task.isCancelled { await Task.yield() }
        return await uploader3.sendFrameBatches(authorization(1))
    }
    early.cancel()
    let cancelled = await early.value
    let cancelledPosts = await server3.requests.filter { $0.httpMethod == "POST" }.count
    let cancelledItem = try await batches(uploader3)[0]
    expect(cancelled == .halted("cancelled") && cancelledPosts == 0 && cancelledItem.attempts == 0,
           "a cancelled pass sends nothing and records no attempt")
}

func checkStateAndTokens() async throws {
    let (session, _, uploader, server) = try await prepared(frames: 1)
    let state = session.appending(path: OriginalUpload.stateFileName)
    let corrupted = Data("{".utf8)
    let saved = try Data(contentsOf: state)
    try corrupted.write(to: state)
    await server.script([ackStep()])
    let pass = await uploader.sendFrameBatches(authorization(1))
    let posts = await server.requests.filter { $0.httpMethod == "POST" }.count
    expect(isHalted(pass) && posts == 0 && (try? Data(contentsOf: state)) == corrupted,
           "a corrupted state is left as it is and nothing is sent")
    try FileManager.default.removeItem(at: state)
    let reopened = try OriginalUploader(session: session, transport: server)
    let lost = await reopened.sendFrameBatches(authorization(1))
    let lostPosts = await server.requests.filter { $0.httpMethod == "POST" }.count
    expect(isHalted(lost) && lostPosts == 0 && !FileManager.default.fileExists(atPath: state.path(percentEncoded: false)),
           "a lost state is refused by a new uploader (witness); it is not recreated and nothing is sent")
    try saved.write(to: state)

    let (tokenSession, _, tokenUploader, tokenServer) = try await prepared(frames: 2)
    await tokenServer.script([{ request in
        let token = request.value(forHTTPHeaderField: "Authorization") ?? "missing"
        throw NSError(domain: token, code: 1, userInfo: [NSLocalizedDescriptionKey: token])
    }])
    let failed = await tokenUploader.sendFrameBatches(authorization(3))
    let failedItem = try await batches(tokenUploader)[0]
    let second = try OriginalUploader(session: tokenSession, transport: tokenServer)
    await tokenServer.script([ackStep(), { request in
        let (data, response) = try await ackStep()(request)
        let token = request.value(forHTTPHeaderField: "Authorization") ?? "missing"
        return (Data(("{\"user_id\":\"" + token + "\"," + String(decoding: data.dropFirst(), as: UTF8.self)).utf8), response)
    }])
    _ = await second.sendFrameBatches(authorization(3))
    let items = try await batches(second)
    let stateBytes = try Data(contentsOf: tokenSession.appending(path: OriginalUpload.stateFileName))
    expect(failed == .halted("no response; outcome unknown") && failedItem.lastOutcome == "no response (other error); outcome unknown, still pending"
           && items[0].state == "committed" && stateBytes.range(of: Data(tokens[3].utf8)) == nil,
           "a transport error or an acknowledgement carrying the token never puts it in the state")

    let (_, _, redirectUploader, redirectServer) = try await prepared(frames: 1)
    await redirectServer.script([{ request in
        let (data, _) = try await ackStep()(request)
        var moved = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        moved.host = "elsewhere.invalid"
        return respond(200, data, to: URLRequest(url: moved.url!))
    }])
    let redirected = await redirectUploader.sendFrameBatches(authorization(1))
    let redirectedItem = try await batches(redirectUploader)[0]
    expect(isHalted(redirected) && redirectedItem.state == "pending" && redirectedItem.ack == nil,
           "an acknowledgement from another URL (a followed redirect) is not success")

    let (pausedSession, _, pausedUploader, pausedServer) = try await prepared(frames: 1)
    try writeStatus(pausedSession, "paused")
    let paused = await pausedUploader.sendFrameBatches(authorization(1))
    let pausedPosts = await pausedServer.requests.filter { $0.httpMethod == "POST" }.count
    expect(paused == .halted("the broadcast reported paused") && pausedPosts == 0,
           "while capture is not reported running, nothing is sent")
}

func checkUnknownClockRequest() async throws {
    let (session, records) = try makeSession(frames: 1)
    let server = FakeServer()
    let uploader = try OriginalUploader(session: session, transport: server)
    _ = try await uploader.enqueue(records[0], source: source)
    await server.script([commitOriginal])
    _ = await uploader.sendPending(authorization(0))
    let originalBody = await server.requests.first?.httpBody ?? Data()
    let item = try await uploader.enqueueFrameBatch(records[0], identity: identity(frame: 1, clockDomain: nil),
                                                    profile: profile(1, mode: "historical"))
    let request = try JSONSerialization.jsonObject(with: Data(item.request.utf8)) as! [String: Any]
    let batch = request["batch"] as! [String: Any]
    let record = (batch["records"] as! [[String: Any]])[0]
    expect(record["clock"] is NSNull && batch["delivery_mode"] as? String == "historical",
           "without a callback clock domain the record clock stays unknown (null); the delivery mode is the caller's")
    let binding = try await uploader.saved().items[0].binding
    let bindingObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(binding))
    // Built and enqueued, not POSTed: its method and path are the builder's constants.
    manifest.append(["type": "request", "name": "historical-unknown-clock",
                     "body": fixture("request-historical-unknown-clock.json", Data(item.request.utf8)),
                     "original": fixture("original-historical-unknown-clock.json", originalBody),
                     "user_id": "user-1", "binding": bindingObject, "posted": false,
                     "idempotency_key": item.idempotencyKey, "method": "POST", "path": OriginalUpload.rawFrameBatchRoute])
}

/// Error bodies that break the 0.2.6 status, code and retryable rules count as no valid error:
/// nothing becomes refused or stopped, and the exact envelope and key stay pending.
func checkInvalidErrors() async throws {
    let (_, _, uploader, server) = try await prepared(frames: 1)
    let invalid: [(String, Int, Data)] = [
        ("record_conflict-retryable", 409, rawError("record_conflict", retryable: true)),
        ("idempotency_conflict-retryable", 409, rawError("idempotency_conflict", retryable: true)),
        ("payload_too_large-retryable", 413, rawError("payload_too_large", retryable: true)),
        ("capture_stopped-retryable", 409, rawError("capture_stopped", retryable: true)),
        ("record_conflict-as-413", 413, rawError("record_conflict")),
    ]
    await server.script(invalid.map { reply($0.1, $0.2) })
    var results: [OriginalUploader.PassResult] = []
    for _ in invalid { results.append(await uploader.sendFrameBatches(authorization(1))) }
    let item = try await batches(uploader)[0]
    let stop = try await uploader.saved().stoppedReason
    let bodies = await server.requests.filter { $0.httpMethod == "POST" }.map { $0.httpBody }
    // The last reply is the status mismatch: without the status binding it would read "HTTP 413 record_conflict".
    expect(results.allSatisfy(isHalted) && item.state == "pending" && item.attempts == invalid.count && stop == nil
           && bodies.count == invalid.count && Set(bodies).count == 1
           && results.last == .halted("HTTP 413 without a valid RawIngressError"),
           "an error body breaking the status, code or retryable rules is no valid error: still pending, no Stop, same envelope")
    for (name, status, data) in invalid {
        manifest.append(["type": "invalid_error", "name": name, "status": status, "body": fixture("invalid-error-\(name).json", data)])
    }
}

func editState(_ session: URL, _ change: (inout [String: Any]) -> Void) throws {
    let url = session.appending(path: OriginalUpload.stateFileName)
    var object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    change(&object)
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]).write(to: url)
}

func savedFailure(_ uploader: OriginalUploader) async -> OriginalUploader.Failure? {
    do {
        _ = try await uploader.saved()
        return nil
    } catch {
        return error as? OriginalUploader.Failure
    }
}

func lockText(_ session: URL) -> String {
    String(decoding: (try? Data(contentsOf: session.appending(path: OriginalUpload.lockFileName))) ?? Data(), as: UTF8.self)
}

/// Once raw-frame batches were recorded, a state that lost them is refused by every uploader: nothing
/// is sent, no new identity is admitted, the file is not rewritten, and a saved Stop stays.
func checkLostFrameBatchHistory() async throws {
    var refusedEverywhere = true
    for (variant, commit) in [("removed", false), ("null", true), ("empty", false), ("removed-committed", true)] {
        let (session, records, stale, server) = try await prepared(frames: 1)
        if commit {
            await server.script([ackStep()])
            _ = await stale.sendFrameBatches(authorization(1))
        }
        try editState(session) { state in
            switch variant {
            case "null": state["frameBatches"] = NSNull()
            case "empty": state["frameBatches"] = [] as [Any]
            default: state["frameBatches"] = nil
            }
        }
        let before = snapshot(session)
        let postsBefore = await server.requests.filter { $0.httpMethod == "POST" }.count
        let reopened = try OriginalUploader(session: session, transport: server)
        await server.script([ackStep(), ackStep()])
        let stalePass = await stale.sendFrameBatches(authorization(1))
        let reopenedPass = await reopened.sendFrameBatches(authorization(1))
        let saved = await savedFailure(reopened)
        var reenqueued: Error?
        do {
            _ = try await reopened.enqueueFrameBatch(records[0], identity: identity(frame: 2), profile: profile(2))
        } catch {
            reenqueued = error
        }
        let postsAfter = await server.requests.filter { $0.httpMethod == "POST" }.count
        refusedEverywhere = refusedEverywhere && isHalted(stalePass) && isHalted(reopenedPass)
            && saved == .frameBatchesMissing && (reenqueued as? OriginalUploader.Failure) == .frameBatchesMissing
            && postsAfter == postsBefore && snapshot(session) == before
    }
    expect(refusedEverywhere,
           "a removed, null or empty batch list (pending or committed) is refused by stale and reopened uploaders: no POST, no new identity, no rewrite")

    let (stopSession, stopRecords, stopper, stopServer) = try await prepared(frames: 1)
    await stopper.stop("the learner stopped sharing")
    try editState(stopSession) { $0["frameBatches"] = nil }
    let stoppedPass = await stopper.sendFrameBatches(authorization(1))
    let fresh = try OriginalUploader(session: stopSession, transport: stopServer)
    let freshPass = await fresh.sendFrameBatches(authorization(1))
    var freshEnqueue: Error?
    do {
        _ = try await fresh.enqueueFrameBatch(stopRecords[0], identity: identity(frame: 2), profile: profile(2))
    } catch {
        freshEnqueue = error
    }
    let stopPosts = await stopServer.requests.filter { $0.httpMethod == "POST" }.count
    let stopText = String(decoding: try Data(contentsOf: stopSession.appending(path: OriginalUpload.stateFileName)), as: UTF8.self)
    expect(stoppedPass == .stopped("the learner stopped sharing") && isHalted(freshPass) && freshEnqueue != nil && stopPosts == 0
           && stopText.contains("the learner stopped sharing"),
           "with a saved Stop and lost batches, nothing is sent or admitted and the Stop stays in the file")

    let (oldSession, oldRecords, oldUploader, _) = try await prepared(frames: 1, enqueue: false)
    let oldMarked = lockText(oldSession).contains("raw-frame batches")
    let admitted = try await oldUploader.enqueueFrameBatch(oldRecords[0], identity: identity(frame: 1), profile: profile(1))
    expect(!oldMarked && admitted.state == "pending" && lockText(oldSession).contains("raw-frame batches"),
           "an honestly old originals-only state admits its first batch, and the lock then records that batches exist")

    let (markSession, _, _, markServer) = try await prepared(frames: 1)
    try Data("original-uploads.json has been created for this capture session\n".utf8)
        .write(to: markSession.appending(path: OriginalUpload.lockFileName)) // As saved before this mark existed.
    let reader = try OriginalUploader(session: markSession, transport: markServer)
    let readBack = try await reader.saved().frameBatches?.count
    try editState(markSession) { $0["frameBatches"] = nil }
    let laterUploader = try OriginalUploader(session: markSession, transport: markServer)
    let later = await savedFailure(laterUploader)
    expect(readBack == 1 && later == .frameBatchesMissing,
           "batches saved before this mark existed are marked when read, so their later loss is refused too")

    var malformedRefused = true
    let edits: [(String, (inout [String: Any]) -> Void)] = [
        ("an unknown state", { state in
            var items = state["frameBatches"] as! [[String: Any]]
            items[0]["state"] = "commited"
            state["frameBatches"] = items
        }),
        ("a damaged request", { state in
            var items = state["frameBatches"] as! [[String: Any]]
            items[0]["request"] = (items[0]["request"] as! String) + " "
            state["frameBatches"] = items
        }),
        ("a committed batch without its acknowledgement", { state in
            var items = state["frameBatches"] as! [[String: Any]]
            items[0]["state"] = "committed"
            state["frameBatches"] = items
        }),
    ]
    for (_, edit) in edits {
        let (session, _, _, server) = try await prepared(frames: 1)
        try editState(session, edit)
        let before = snapshot(session)
        let uploader = try OriginalUploader(session: session, transport: server)
        await server.script([ackStep()])
        let pass = await uploader.sendFrameBatches(authorization(1))
        let failure = await savedFailure(uploader)
        let posts = await server.requests.filter { $0.httpMethod == "POST" }.count
        malformedRefused = malformedRefused && isHalted(pass) && failure == .stateUnreadable && posts == 0 && snapshot(session) == before
    }
    expect(malformedRefused,
           "a saved batch with an unknown state, a damaged request or a commit without acknowledgement is refused, unsent and left as it is")
}

/// A committed batch's saved acknowledgement must stay exactly the canonical, verified ACK for its
/// request. Any other saved form halts every operation: nothing is sent or rewritten, and a saved
/// Stop stays.
func checkSavedAcknowledgements() async throws {
    let (session, _, uploader, server) = try await prepared(frames: 1)
    await server.script([ackStep()])
    _ = await uploader.sendFrameBatches(authorization(1))
    let reopened = try OriginalUploader(session: session, transport: server)
    let postsBefore = await server.requests.filter { $0.httpMethod == "POST" }.count
    let pass = await reopened.sendFrameBatches(authorization(1))
    let reread = try await reopened.saved().frameBatches?.first
    let postsAfter = await server.requests.filter { $0.httpMethod == "POST" }.count
    expect(reread?.state == "committed" && reread?.ack != nil && pass == .finished && postsAfter == postsBefore,
           "a valid committed batch reopens as committed with its acknowledgement and is not sent again")

    func receipt(_ ack: inout [String: Any], _ change: (inout [String: Any]) -> Void) {
        var receipt = (ack["acknowledged"] as! [[String: Any]])[0]
        change(&receipt)
        ack["acknowledged"] = [receipt]
    }
    let corruptions: [(String, (inout [String: Any]) -> Void)] = [
        ("a pending artifact", { ack in receipt(&ack) { receipt in
            var artifact = (receipt["artifacts"] as! [[String: Any]])[0]
            artifact["status"] = "pending"
            receipt["artifacts"] = [artifact]
        } }),
        ("no artifacts", { ack in receipt(&ack) { $0["artifacts"] = [] as [Any] } }),
        ("another owner", { ack in ack["user_id"] = "user-2" }),
        ("an invalid received_at", { ack in receipt(&ack) { $0["received_at"] = "yesterday" } }),
        ("a reformatted acknowledgement", { _ in }),
    ]
    var refused = true
    for (index, (_, corrupt)) in corruptions.enumerated() {
        let (session, _, uploader, server) = try await prepared(frames: 1)
        await server.script([ackStep()])
        _ = await uploader.sendFrameBatches(authorization(1))
        if index == 0 { await uploader.stop("the learner stopped sharing") }
        try editState(session) { state in
            var items = state["frameBatches"] as! [[String: Any]]
            var ack = try! JSONSerialization.jsonObject(with: Data((items[0]["ack"] as! String).utf8)) as! [String: Any]
            corrupt(&ack)
            items[0]["ack"] = String(decoding: try! JSONSerialization.data(withJSONObject: ack, options: [.prettyPrinted]), as: UTF8.self)
            state["frameBatches"] = items
        }
        let before = snapshot(session)
        let postsBefore = await server.requests.filter { $0.httpMethod == "POST" }.count
        let reopened = try OriginalUploader(session: session, transport: server)
        await server.script([ackStep()])
        let pass = await reopened.sendFrameBatches(authorization(1))
        let failure = await savedFailure(reopened)
        let postsAfter = await server.requests.filter { $0.httpMethod == "POST" }.count
        let stateText = String(decoding: try Data(contentsOf: session.appending(path: OriginalUpload.stateFileName)), as: UTF8.self)
        let stopKept = index != 0 || stateText.contains("the learner stopped sharing")
        refused = refused && isHalted(pass) && failure == .stateUnreadable && postsAfter == postsBefore
            && snapshot(session) == before && stopKept
    }
    expect(refused,
           "a saved acknowledgement with a pending or missing artifact, another owner, an invalid time or another form halts: no POST, no rewrite, Stop kept")
}

func runChecks() async throws {
    let live = try await checkCommitAndReopen()
    try await checkEligibilityAndIdentity()
    checkAckMatrix(live)
    try await checkWrongAckAndRetry()
    try await checkErrors()
    try await checkInvalidErrors()
    try await checkLostFrameBatchHistory()
    try await checkSavedAcknowledgements()
    try await checkStopAndCancel()
    try await checkStateAndTokens()
    try await checkUnknownClockRequest()
}

// MARK: - Run

do {
    try FileManager.default.createDirectory(at: fixtures, withIntermediateDirectories: true)
    guard try FileManager.default.contentsOfDirectory(atPath: fixtures.path(percentEncoded: false)).isEmpty else {
        print("FAIL the fixture directory \(fixtures.path(percentEncoded: false)) must be absent or empty")
        exit(2)
    }
} catch {
    print("FAIL the fixture directory could not be created: \(error)")
    exit(2)
}

// No top-level await: the checks run in a detached task while the main thread waits.
let box = ResultBox<Void>()
let finished = DispatchSemaphore(value: 0)
Task.detached {
    do {
        try await runChecks()
        box.result = .success(())
    } catch {
        box.result = .failure(error)
    }
    finished.signal()
}
finished.wait()
if case .failure(let error) = box.result {
    expect(false, "the checks ran to completion (\(error))")
}

try! JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
    .write(to: fixtures.appending(path: "manifest.json"))
let persisted = snapshot(root).merging(snapshot(fixtures)) { current, _ in current }
expect(!persisted.values.contains { data in tokens.contains { data.range(of: Data($0.utf8)) != nil } },
       "no token is written to any upload state, capture file or fixture (\(persisted.count) files)")
let keptName: String? = CommandLine.arguments.count > 1 ? nil : "fixtures"
for entry in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    where entry.lastPathComponent != keptName {
    try? FileManager.default.removeItem(at: entry)
}
print("fixtures: \(fixtures.path(percentEncoded: false))")
if failures > 0 {
    print("\(failures) raw frame ingress check(s) failed")
    exit(1)
}
print("all raw frame ingress checks passed")
