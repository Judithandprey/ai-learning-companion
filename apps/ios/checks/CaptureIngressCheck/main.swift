// Executed checks for ScreenObserver's first original-byte consumer
// (apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift): OriginalArtifactUpload 0.2.2 sent
// to PUT /v2/process/originals/{artifact_id} (capture_ingress 0.2.4) through an injected transport.
// Builds without the app, on any Mac with Xcode (for example the hosted macos-26 runner):
//
//   xcrun swiftc -target arm64-apple-macos14 \
//     apps/ios/ScreenObserver/Shared/CaptureStore.swift \
//     apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
//     apps/ios/ScreenObserver/ScreenObserver/OriginalUpload.swift \
//     apps/ios/checks/CaptureIngressCheck/main.swift -o capture-ingress-check
//   ./capture-ingress-check FIXTURE_DIR
//   python3 apps/ios/checks/CaptureIngressCheck/validate_fixtures.py FIXTURE_DIR
//
// The originals are real PNG files written by ScreenObserver's own FrameStore in a temporary
// directory. The transport is an in-process test double that plays the server. No network,
// server, device or ReplayKit is involved. FIXTURE_DIR (absent or empty) receives the exact
// request bodies, originals, receipts and error bodies for the Python contract check, but never a
// token. Exits non-zero on any failure.

import CoreImage
import Foundation

var failures = 0

func expect(_ condition: Bool, _ name: String) {
    print((condition ? "PASS " : "FAIL ") + name)
    if !condition { failures += 1 }
}

struct CheckError: Error {
    let message: String
}

// MARK: - The test server

/// Plays the server in-process. Each scripted step answers one request; with no step left it
/// throws, like an unreachable host. It records every request it receives.
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
        let step = steps.removeFirst()
        return try await step(request)
    }
}

func respond(_ status: Int, _ body: Data, to request: URLRequest) -> (Data, URLResponse) {
    (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                           headerFields: ["Content-Type": "application/json"])!)
}

func ingressError(_ code: String, retryable: Bool = false) -> Data {
    Data(#"{"contract_version":"0.2.4","error":"\#(code)","retryable":\#(retryable)}"#.utf8)
}

/// What a correct server does with an exact upload: check the decoded bytes against the body's
/// own artifact reference and the route, then return the binding with status bytes_committed.
let commit: FakeServer.Step = { request in
    guard let body = request.httpBody,
          var object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
          let encoded = object["data_base64"] as? String, let bytes = Data(base64Encoded: encoded),
          let artifact = object["artifact"] as? [String: Any], let artifactID = artifact["artifact_id"] as? String,
          artifact["sha256"] as? String == OriginalUpload.sha256Hex(bytes),
          artifact["byte_length"] as? Int == bytes.count,
          request.url?.path(percentEncoded: true) == OriginalUpload.routePrefix + artifactID else {
        return respond(422, ingressError("invalid_request"), to: request)
    }
    object["data_base64"] = nil
    object["status"] = "bytes_committed"
    let receipt = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    return respond(200, receipt, to: request)
}

/// A correct server's receipt, then changed.
func changedReceipt(_ change: @escaping @Sendable (inout [String: Any]) -> Void) -> FakeServer.Step {
    { request in
        let (data, response) = try await commit(request)
        var object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        change(&object)
        let changed = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        return (changed, response)
    }
}

func reply(_ status: Int, _ body: Data) -> FakeServer.Step {
    { request in respond(status, body, to: request) }
}

// MARK: - Sessions, sources and authorizations

let root = FileManager.default.temporaryDirectory
    .appending(path: "capture-ingress-check-\(UUID().uuidString)", directoryHint: .isDirectory)
var sessionCount = 0

/// A capture session laid out as CaptureSession writes it: `count` real kept PNG frames written by
/// ScreenObserver's FrameStore, and a fresh "started" status.
func makeSession(frames count: Int) throws -> (URL, [KeyframeRecord]) {
    sessionCount += 1
    let name = String(format: "20260929T12%04ldZ-C0FFEE%02ld", sessionCount, sessionCount)
    let session = root.appending(path: name, directoryHint: .isDirectory)
    let frames = session.appending(path: "frames", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: frames, withIntermediateDirectories: true)
    let store = FrameStore(directory: frames, byteCap: 64 * 1024 * 1024)
    var records: [KeyframeRecord] = []
    for sequence in 1...count {
        let image = CIImage(color: CIColor(red: Double(sequence) / 10, green: 0.4, blue: Double(sessionCount) / 40))
            .cropped(to: CGRect(x: 0, y: 0, width: 64, height: 48))
        guard case .kept(let file, let byteLength, let sha256) = store.keep(image, name: String(format: "%08ld.png", sequence)) else {
            throw CheckError(message: "FrameStore did not keep frame \(sequence) of \(name)")
        }
        records.append(KeyframeRecord(
            file: "frames/" + file, sequence: sequence, presentationTime: Double(sequence), hostTime: Double(sequence),
            width: 64, height: 48, orientation: nil, pixelFormat: "BGRA", mediaType: "image/png",
            encoding: FrameStore.encoding, byteLength: byteLength, sha256: sha256))
    }
    writeStatus(session, "started")
    return (session, records)
}

func writeStatus(_ session: URL, _ state: String, updated: Date = Date()) {
    let status = CaptureStatus(session: session.lastPathComponent, state: state, startedWallTime: updated,
                               startedHostTime: 0, updatedWallTime: updated)
    try! CaptureStore.encoder.encode(status).write(to: session.appending(path: "status.json"), options: .atomic)
}

/// Every file under `directory`, with its bytes.
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

/// Makes the session's upload state file and directory read-only, so saving the state fails, or
/// writable again.
func setStateWritable(_ session: URL, _ writable: Bool) throws {
    try FileManager.default.setAttributes([.posixPermissions: writable ? 0o644 : 0o444],
                                          ofItemAtPath: session.appending(path: OriginalUpload.stateFileName).path(percentEncoded: false))
    try FileManager.default.setAttributes([.posixPermissions: writable ? 0o755 : 0o555],
                                          ofItemAtPath: session.path(percentEncoded: false))
}

func frameFiles(_ session: URL) -> [String: Data] {
    snapshot(session.appending(path: "frames", directoryHint: .isDirectory))
}

func enqueueFailure(_ uploader: OriginalUploader, _ record: KeyframeRecord,
                    _ source: OriginalSourceRef) async -> OriginalUploader.Failure? {
    do {
        _ = try await uploader.enqueue(record, source: source)
        return nil
    } catch let failure as OriginalUploader.Failure {
        return failure
    } catch {
        return nil
    }
}

/// Items compared without their attempt times, which the saved ISO 8601 state keeps to the second.
func withoutTimes(_ items: [OriginalUploadItem]) -> [OriginalUploadItem] {
    items.map { item in
        var item = item
        item.lastAttemptWallTime = nil
        return item
    }
}

func savedFailure(_ uploader: OriginalUploader) async -> OriginalUploader.Failure? {
    do {
        _ = try await uploader.saved()
        return nil
    } catch let failure as OriginalUploader.Failure {
        return failure
    } catch {
        return nil
    }
}

/// Size of the session's lock file, which holds the witness mark once the state was created; -1 if
/// it does not exist.
func lockSize(_ session: URL) -> Int {
    let path = session.appending(path: OriginalUpload.lockFileName).path(percentEncoded: false)
    return ((try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? Int) ?? -1
}

func isHalted(_ result: OriginalUploader.PassResult) -> Bool {
    if case .halted = result { return true }
    return false
}

let origin = URL(string: "https://ingress.invalid")!
let tokens = (0..<7).map { "check-token-\($0)-\(UUID().uuidString)" }
func authorization(_ index: Int) -> IngressAuthorization {
    IngressAuthorization(origin: origin, bearerToken: tokens[index])!
}
// "K" lets a receipt with U+212A KELVIN SIGN, canonically equivalent to "K", be checked.
let source = OriginalSourceRef(userID: "user-K1", sourceID: "source-1", sourceVersion: 1)
let otherSource = OriginalSourceRef(userID: "user-K1", sourceID: "source-2", sourceVersion: 1)

// MARK: - Fixtures for the Python contract check

let fixtures = CommandLine.arguments.count > 1
    ? URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    : root.appending(path: "fixtures", directoryHint: .isDirectory)
var manifest: [[String: Any]] = []

func fixture(_ name: String, _ data: Data) -> String {
    try! data.write(to: fixtures.appending(path: name))
    return name
}

func requestFixture(_ name: String, _ request: URLRequest, original: Data) {
    manifest.append([
        "type": "request", "name": name,
        "method": request.httpMethod ?? "",
        "path": request.url?.path(percentEncoded: true) ?? "",
        "content_type": request.value(forHTTPHeaderField: "Content-Type") ?? "",
        "authorization_scheme": request.value(forHTTPHeaderField: "Authorization")?
            .split(separator: " ").first.map(String.init) ?? "",
        "body": fixture("\(name).request.json", request.httpBody ?? Data()),
        "original": fixture("\(name).png", original),
    ])
}

// MARK: - Checks

func runChecks() async throws {
    // A kept original, enqueued, then committed.
    let (s1, r1) = try makeSession(frames: 3)
    let server1 = FakeServer()
    let uploader1 = try OriginalUploader(session: s1, transport: server1)
    let item = try await uploader1.enqueue(r1[0], source: source)
    let artifactID = "so.\(s1.lastPathComponent).00000001"
    expect(item.state == "pending" && item.attempts == 0 && item.binding.contractVersion == "0.2.2"
           && item.binding.kind == "screen_image" && item.binding.source == source
           && item.binding.artifact == OriginalArtifactReference(artifactID: artifactID, sha256: r1[0].sha256,
                                                                 byteLength: r1[0].byteLength, mediaType: "image/png")
           && item.path == "/v2/process/originals/" + artifactID,
           "enqueue binds a kept FrameStore PNG to the supplied source with its exact length, SHA-256, media type, kind, version and route")
    let noRequestsYet = await server1.requests.isEmpty
    expect(FileManager.default.fileExists(atPath: s1.appending(path: OriginalUpload.stateFileName).path(percentEncoded: false))
           && noRequestsYet, "the exact request is recorded durably before anything is sent, and enqueue sends nothing")

    let original1 = try Data(contentsOf: s1.appending(path: r1[0].file))
    await server1.script([commit])
    let pass1 = await uploader1.sendPending(authorization(0))
    let items1 = try await uploader1.saved().items
    let sent1 = await server1.requests
    expect(pass1 == .finished && items1[0].state == "committed" && items1[0].attempts == 1
           && items1[0].receipt != nil && items1[0].lastOutcome == "bytes_committed",
           "a complete matching receipt commits the original")
    let request1 = sent1[0]
    expect(sent1.count == 1 && request1.httpMethod == "PUT"
           && request1.url?.absoluteString == "https://ingress.invalid/v2/process/originals/" + artifactID
           && request1.value(forHTTPHeaderField: "Content-Type") == "application/json"
           && request1.value(forHTTPHeaderField: "Authorization") == "Bearer " + tokens[0]
           && request1.value(forHTTPHeaderField: "Idempotency-Key") == nil,
           "one PUT to the exact route, as JSON, with the supplied bearer token and no Idempotency-Key")
    let body1 = request1.httpBody ?? Data()
    let expectedBody = try JSONSerialization.data(withJSONObject: [
        "contract_version": "0.2.2", "kind": "screen_image",
        "source": ["user_id": "user-K1", "source_id": "source-1", "source_version": 1] as [String: Any],
        "artifact": ["artifact_id": artifactID, "sha256": r1[0].sha256, "byte_length": r1[0].byteLength,
                     "media_type": "image/png"] as [String: Any],
        "data_base64": original1.base64EncodedString(),
    ] as [String: Any], options: [.sortedKeys, .withoutEscapingSlashes])
    expect(body1 == expectedBody,
           "the body is canonical JSON of exactly the binding and the file's bytes (compared with JSONSerialization)")
    expect(body1.count == items1[0].requestByteLength && OriginalUpload.sha256Hex(body1) == items1[0].requestSHA256,
           "the sent body is the recorded request")
    requestFixture("committed", request1, original: original1)

    let again = try await uploader1.enqueue(r1[0], source: source)
    let emptyPass = await uploader1.sendPending(authorization(0))
    let count1 = await server1.requests.count
    expect(again == items1[0] && emptyPass == .finished && count1 == 1,
           "enqueueing a committed original again returns its record, and a pass with nothing pending sends nothing")

    // Lost response, then the same request after a relaunch.
    _ = try await uploader1.enqueue(r1[1], source: source)
    await server1.script([{ request in
        _ = try await commit(request) // The server stores the bytes; the response is lost.
        throw URLError(.networkConnectionLost)
    }])
    let lost = await uploader1.sendPending(authorization(0))
    let afterLost = try await uploader1.saved().items
    let firstTry = await server1.requests.last
    expect(lost == .halted("no response; outcome unknown") && afterLost[1].state == "pending"
           && afterLost[1].attempts == 1 && afterLost[1].lastOutcome?.contains("outcome unknown") == true,
           "a lost response leaves the original pending, with its outcome unknown")
    let server1b = FakeServer()
    let relaunched = try OriginalUploader(session: s1, transport: server1b)
    let relaunchedItems = try await relaunched.saved().items
    expect(withoutTimes(relaunchedItems) == withoutTimes(afterLost),
           "a new uploader, as after a relaunch, reads the same durable state")
    await server1b.script([commit])
    let retry = await relaunched.sendPending(authorization(1))
    let retried = await server1b.requests
    let afterRetry = try await relaunched.saved().items
    expect(retry == .finished && retried.count == 1 && firstTry?.httpBody != nil
           && retried[0].httpBody == firstTry?.httpBody && retried[0].url == firstTry?.url
           && retried[0].value(forHTTPHeaderField: "Authorization") == "Bearer " + tokens[1],
           "the retry after the relaunch sends the byte-identical request to the same route, with the newly supplied token")
    expect(afterRetry[1].state == "committed" && afterRetry[1].attempts == 2,
           "the retried original is committed after its receipt")
    let original1b = try Data(contentsOf: s1.appending(path: r1[1].file))
    requestFixture("lost-response-first", firstTry!, original: original1b)
    requestFixture("lost-response-retry", retried[0], original: original1b)
    manifest.append(["type": "same_request", "first": "lost-response-first.request.json",
                     "second": "lost-response-retry.request.json"])

    // Receipts: only the complete matching one is accepted.
    let binding = items1[0].binding
    let good = try JSONSerialization.jsonObject(with: Data(items1[0].receipt!.utf8)) as! [String: Any]
    func variant(_ change: (inout [String: Any]) -> Void) -> Data {
        var object = good
        change(&object)
        return try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }
    func nested(_ key: String, _ member: String, _ value: Any?) -> Data {
        variant { object in
            var inner = object[key] as! [String: Any]
            inner[member] = value
            object[key] = inner
        }
    }
    let canonical = variant { _ in }
    let pretty = try JSONSerialization.data(withJSONObject: good, options: [.prettyPrinted])
    let receipts: [(String, Data, Bool)] = [
        ("escaped-slashes", canonical, true),
        ("pretty-reordered", pretty, true),
        ("empty", Data(), false),
        ("not-json", Data("bytes_committed".utf8), false),
        ("array", Data("[]".utf8), false),
        ("truncated", canonical.dropLast(12), false),
        ("missing-status", variant { $0["status"] = nil }, false),
        ("missing-sha256", nested("artifact", "sha256", nil), false),
        ("extra-member", variant { $0["live"] = true }, false),
        ("extra-artifact-member", nested("artifact", "frame_time", 1.5), false),
        ("status-received", variant { $0["status"] = "received" }, false),
        ("version-0.2.4", variant { $0["contract_version"] = "0.2.4" }, false),
        ("kind-editable-ink", variant { $0["kind"] = "editable_ink" }, false),
        ("null-source", variant { $0["source"] = NSNull() }, false),
        ("foreign-user", nested("source", "user_id", "user-2"), false),
        ("kelvin-sign-user", nested("source", "user_id", "user-\u{212A}1"), false),
        ("foreign-source", nested("source", "source_id", "source-2"), false),
        ("foreign-version", nested("source", "source_version", 2), false),
        ("version-boolean", nested("source", "source_version", true), false),
        ("length-plus-one", nested("artifact", "byte_length", binding.artifact.byteLength + 1), false),
        ("length-string", nested("artifact", "byte_length", String(binding.artifact.byteLength)), false),
        ("uppercase-sha256", nested("artifact", "sha256", binding.artifact.sha256.uppercased()), false),
        ("other-artifact-id", nested("artifact", "artifact_id", "so.other.00000001"), false),
        ("media-jpeg", nested("artifact", "media_type", "image/jpeg"), false),
        ("ingress-error-body", ingressError("unavailable", retryable: true), false),
    ]
    for (name, data, accept) in receipts {
        let accepted = OriginalUpload.receiptProblem(data, for: binding) == nil
        expect(accepted == accept, "receipt \(name) is \(accept ? "accepted" : "refused")")
        manifest.append(["type": "receipt", "name": name, "request": "committed.request.json",
                         "receipt": fixture("receipt-\(name).json", data),
                         "swift_verdict": accepted ? "accepted" : "rejected"])
    }

    // A refused receipt leaves the original pending and stops that uploader.
    let (s2, r2) = try makeSession(frames: 1)
    let server2 = FakeServer()
    let uploader2 = try OriginalUploader(session: s2, transport: server2)
    _ = try await uploader2.enqueue(r2[0], source: source)
    await server2.script([changedReceipt { object in
        object["source"] = ["user_id": "user-K1", "source_id": "source-2", "source_version": 1] as [String: Any]
    }, commit])
    let foreign = await uploader2.sendPending(authorization(2))
    let foreignItems = try await uploader2.saved().items
    let afterForeign = await uploader2.sendPending(authorization(2))
    let count2 = await server2.requests.count
    expect(isHalted(foreign) && foreignItems[0].state == "pending" && foreignItems[0].receipt == nil,
           "a receipt for another source is refused and the original stays pending")
    expect(isHalted(afterForeign) && count2 == 1, "after a refused receipt, that uploader sends nothing more")
    let uploader2b = try OriginalUploader(session: s2, transport: server2)
    await server2.script([changedReceipt { $0["status"] = nil }])
    let partial = await uploader2b.sendPending(authorization(2))
    let partialItems = try await uploader2b.saved().items
    expect(isHalted(partial) && partialItems[0].state == "pending",
           "a partial receipt (no status) is refused and the original stays pending")
    let uploader2c = try OriginalUploader(session: s2, transport: server2)
    await server2.script([commit])
    let accepted2 = await uploader2c.sendPending(authorization(2))
    let items2 = try await uploader2c.saved().items
    let sent2 = await server2.requests
    expect(accepted2 == .finished && items2[0].state == "committed" && items2[0].attempts == 3
           && sent2.count == 3 && Set(sent2.map { $0.httpBody }).count == 1,
           "the same request, sent a third time, is committed by a matching receipt")

    // An original lost or changed after enqueue is refused and left as it is.
    let (s3, r3) = try makeSession(frames: 3)
    let server3 = FakeServer()
    let uploader3 = try OriginalUploader(session: s3, transport: server3)
    for record in r3 { _ = try await uploader3.enqueue(record, source: source) }
    try FileManager.default.removeItem(at: s3.appending(path: r3[0].file))
    let replacement = try Data(contentsOf: s1.appending(path: r1[2].file))
    try replacement.write(to: s3.appending(path: r3[1].file))
    let untouched = try Data(contentsOf: s3.appending(path: r3[2].file))
    await server3.script([commit])
    let pass3 = await uploader3.sendPending(authorization(3))
    let items3 = try await uploader3.saved().items
    let sent3 = await server3.requests
    expect(items3[0].state == "refused" && items3[0].lastOutcome?.contains("missing") == true,
           "an original lost after enqueue is refused, not sent")
    expect(items3[1].state == "refused" && items3[1].lastOutcome?.contains("no longer matches") == true
           && (try? Data(contentsOf: s3.appending(path: r3[1].file))) == replacement,
           "an original changed after enqueue is refused, not sent, and left as it is")
    expect(pass3 == .finished && sent3.count == 1 && sent3[0].url?.path(percentEncoded: true) == items3[2].path
           && items3[2].state == "committed" && (try? Data(contentsOf: s3.appending(path: r3[2].file))) == untouched,
           "the remaining original is still sent, and stays unchanged")

    // Enqueue refusals change neither the originals nor the state.
    let (s4, r4) = try makeSession(frames: 2)
    let uploader4 = try OriginalUploader(session: s4, transport: FakeServer())
    _ = try await uploader4.enqueue(r4[0], source: source)
    let frames4 = s4.appending(path: "frames", directoryHint: .isDirectory)
    try Data("not a png".utf8).write(to: frames4.appending(path: "00000070.png"))
    var oversize = OriginalUpload.pngSignature
    oversize.append(Data(count: OriginalUpload.maxOriginalBytes + 1 - oversize.count))
    try oversize.write(to: frames4.appending(path: "00000080.png"))
    let before4 = snapshot(s4)
    func record(_ base: KeyframeRecord, file: String? = nil, sha256: String? = nil, byteLength: Int? = nil,
                mediaType: String? = nil) -> KeyframeRecord {
        var record = base
        record.file = file ?? record.file
        record.sha256 = sha256 ?? record.sha256
        record.byteLength = byteLength ?? record.byteLength
        record.mediaType = mediaType ?? record.mediaType
        return record
    }
    let refusals: [(String, KeyframeRecord, OriginalSourceRef, OriginalUploader.Failure)] = [
        ("a record whose SHA-256 differs from the file", record(r4[1], sha256: r4[0].sha256), source, .changed),
        ("a record whose length differs from the file", record(r4[1], byteLength: r4[1].byteLength + 1), source, .changed),
        ("a missing file", record(r4[1], file: "frames/00000099.png"), source, .missing),
        ("a record that is not image/png", record(r4[1], mediaType: "image/jpeg"), source, .notPNG),
        ("a file that is not a PNG", record(r4[1], file: "frames/00000070.png",
                                            sha256: OriginalUpload.sha256Hex(Data("not a png".utf8)), byteLength: 9),
         source, .notPNG),
        ("a file over 32 MiB", record(r4[1], file: "frames/00000080.png", sha256: OriginalUpload.sha256Hex(oversize),
                                      byteLength: oversize.count), source, .oversize),
        ("a path outside frames/", record(r4[1], file: "../status.json"), source, .invalidRecord),
        ("a path with ..", record(r4[1], file: "frames/../status.json"), source, .invalidRecord),
        ("an unpublished staging file", record(r4[1], file: "frames/.staging-x.png"), source, .invalidRecord),
        ("an invalid source identifier",
         r4[1], OriginalSourceRef(userID: "user 1", sourceID: "source-1", sourceVersion: 1), .invalidSource),
        ("source version 0", r4[1], OriginalSourceRef(userID: "user-1", sourceID: "source-1", sourceVersion: 0), .invalidSource),
        ("a second source in the same session", r4[1], otherSource, .otherSource),
    ]
    for (name, record, recordSource, expected) in refusals {
        let failure = await enqueueFailure(uploader4, record, recordSource)
        expect(failure == expected, "enqueue refuses \(name)")
    }
    let items4 = try await uploader4.saved().items
    expect(snapshot(s4) == before4 && items4.count == 1,
           "the refusals left every original and the upload state byte-identical")

    var maximum = OriginalUpload.pngSignature
    maximum.append(Data(count: OriginalUpload.maxOriginalBytes - maximum.count))
    try maximum.write(to: frames4.appending(path: "00000090.png"))
    let maxRecord = record(r4[1], file: "frames/00000090.png", sha256: OriginalUpload.sha256Hex(maximum),
                           byteLength: maximum.count)
    let maxItem = try await uploader4.enqueue(maxRecord, source: source)
    let maxBody = OriginalUpload.requestBody(maxItem.binding, bytes: maximum)
    expect(maxBody != nil && maxBody?.count == maxItem.requestByteLength
           && maxBody.map(OriginalUpload.sha256Hex) == maxItem.requestSHA256,
           "an original of exactly 32 MiB is accepted, with its recorded request")
    if let maxBody {
        var request = URLRequest(url: URL(string: "https://ingress.invalid" + maxItem.path)!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer redacted", forHTTPHeaderField: "Authorization")
        request.httpBody = maxBody
        requestFixture("maximum-size", request, original: maximum)
    }

    // The broadcast finished: nothing is sent, and pending originals stay pending.
    let (s5, r5) = try makeSession(frames: 2)
    let server5 = FakeServer()
    let uploader5 = try OriginalUploader(session: s5, transport: server5)
    for record in r5 { _ = try await uploader5.enqueue(record, source: source) }
    let frames5 = frameFiles(s5)
    writeStatus(s5, "finished")
    await server5.script([commit, commit])
    let pass5 = await uploader5.sendPending(authorization(4))
    let items5 = try await uploader5.saved().items
    let reloaded5 = try OriginalUploader(session: s5, transport: server5)
    let pass5b = await reloaded5.sendPending(authorization(4))
    let stop5 = try await reloaded5.saved().stoppedReason
    let enqueue5 = await enqueueFailure(reloaded5, r5[0], source)
    let count5 = await server5.requests.count
    expect(pass5 == .stopped("the broadcast finished") && count5 == 0 && items5.allSatisfy { $0.state == "pending" },
           "after the broadcast finished nothing is sent, and the originals stay pending")
    expect(pass5b == .stopped("the broadcast finished") && stop5 == "the broadcast finished"
           && enqueue5 == .stopped("the broadcast finished") && frameFiles(s5) == frames5,
           "the stop is durable: after a relaunch nothing is sent or enqueued, and the originals are unchanged")

    // Paused, stale or unreadable status: not live, so nothing is sent, but nothing is stopped.
    let (s6, r6) = try makeSession(frames: 1)
    let server6 = FakeServer()
    let uploader6 = try OriginalUploader(session: s6, transport: server6)
    _ = try await uploader6.enqueue(r6[0], source: source)
    await server6.script([commit])
    writeStatus(s6, "paused")
    let paused = await uploader6.sendPending(authorization(4))
    writeStatus(s6, "started", updated: Date().addingTimeInterval(-60))
    let stale = await uploader6.sendPending(authorization(4))
    try FileManager.default.removeItem(at: s6.appending(path: "status.json"))
    let unreadable = await uploader6.sendPending(authorization(4))
    let count6 = await server6.requests.count
    let stop6 = try await uploader6.saved().stoppedReason
    expect(paused == .halted("the broadcast reported paused") && String(describing: stale).contains("unknown")
           && String(describing: unreadable).contains("unknown") && count6 == 0 && stop6 == nil,
           "paused, stale or unreadable capture status sends nothing and does not stop the session")
    writeStatus(s6, "resumed")
    let resumed = await uploader6.sendPending(authorization(4))
    let items6 = try await uploader6.saved().items
    expect(resumed == .finished && items6[0].state == "committed", "once capture is reported running again, the original is sent")

    // The server reports capture_stopped: the stop is durable and nothing more is sent.
    let (s7, r7) = try makeSession(frames: 2)
    let server7 = FakeServer()
    let uploader7 = try OriginalUploader(session: s7, transport: server7)
    for record in r7 { _ = try await uploader7.enqueue(record, source: source) }
    let stoppedBody = ingressError("capture_stopped")
    await server7.script([reply(409, stoppedBody), commit])
    let pass7 = await uploader7.sendPending(authorization(4))
    let items7 = try await uploader7.saved().items
    writeStatus(s7, "started", updated: Date().addingTimeInterval(-60))
    let reloaded7 = try OriginalUploader(session: s7, transport: server7)
    let pass7b = await reloaded7.sendPending(authorization(4))
    let count7 = await server7.requests.count
    expect(pass7 == .stopped("the server reported capture_stopped") && pass7b == pass7 && count7 == 1
           && items7.allSatisfy { $0.state == "pending" } && items7[0].lastOutcome?.contains("capture_stopped") == true,
           "capture_stopped stops the session durably (reported as stopped after a relaunch, even with stale status); the queue is kept and not drained")
    manifest.append(["type": "ingress_error", "name": "capture_stopped", "status": 409,
                     "body": fixture("error-capture_stopped.json", stoppedBody)])

    // Permission loss: the uploader stops sending; only a new, explicit authorization may send again.
    let (s8, r8) = try makeSession(frames: 2)
    let server8 = FakeServer()
    let uploader8 = try OriginalUploader(session: s8, transport: server8)
    for record in r8 { _ = try await uploader8.enqueue(record, source: source) }
    let forbiddenBody = ingressError("forbidden")
    await server8.script([reply(403, forbiddenBody), commit, commit])
    let pass8 = await uploader8.sendPending(authorization(4))
    let pass8b = await uploader8.sendPending(authorization(4))
    let items8 = try await uploader8.saved().items
    let count8 = await server8.requests.count
    let stop8 = try await uploader8.saved().stoppedReason
    expect(isHalted(pass8) && isHalted(pass8b) && count8 == 1 && items8.allSatisfy { $0.state == "pending" } && stop8 == nil,
           "after 403 forbidden the uploader sends nothing more, and the originals stay pending")
    let reauthorized = try OriginalUploader(session: s8, transport: server8)
    let pass8c = await reauthorized.sendPending(authorization(5))
    let items8c = try await reauthorized.saved().items
    expect(pass8c == .finished && items8c.allSatisfy { $0.state == "committed" },
           "a new uploader with a newly supplied authorization may send them")
    manifest.append(["type": "ingress_error", "name": "forbidden", "status": 403,
                     "body": fixture("error-forbidden.json", forbiddenBody)])
    manifest.append(["type": "ingress_error", "name": "unavailable", "status": 503,
                     "body": fixture("error-unavailable.json", ingressError("unavailable", retryable: true))])

    // Stop while a request is in flight: its late receipt is recorded, and nothing more is sent.
    let (s9, r9) = try makeSession(frames: 2)
    let server9 = FakeServer()
    let uploader9 = try OriginalUploader(session: s9, transport: server9)
    for record in r9 { _ = try await uploader9.enqueue(record, source: source) }
    await server9.script([{ request in
        await uploader9.stop("the learner stopped sharing")
        return try await commit(request)
    }, commit])
    let pass9 = await uploader9.sendPending(authorization(4))
    let items9 = try await uploader9.saved().items
    let reloaded9 = try OriginalUploader(session: s9, transport: server9)
    let pass9b = await reloaded9.sendPending(authorization(4))
    let count9 = await server9.requests.count
    expect(pass9 == .stopped("the learner stopped sharing") && count9 == 1 && items9[0].state == "committed"
           && items9[0].lastOutcome == "bytes_committed (after the stop; nothing more is sent)" && items9[1].state == "pending",
           "a receipt that arrives after the stop is recorded only as bytes_committed, and the next original is not sent")
    expect(pass9b == .stopped("the learner stopped sharing") && count9 == 1,
           "the explicit stop is durable across a relaunch")

    // A second uploader of the same session stops it while the first has a request in flight: the
    // first never erases that stop and sends nothing more.
    let (s12, r12) = try makeSession(frames: 2)
    let server12 = FakeServer()
    let first12 = try OriginalUploader(session: s12, transport: server12)
    for record in r12 { _ = try await first12.enqueue(record, source: source) }
    let second12 = try OriginalUploader(session: s12, transport: FakeServer())
    await server12.script([{ request in
        await second12.stop("stopped by another uploader")
        return try await commit(request)
    }, commit])
    let pass12 = await first12.sendPending(authorization(4))
    let items12 = try await first12.saved().items
    let count12 = await server12.requests.count
    let saved12 = try CaptureStore.decoder.decode(
        OriginalUploadState.self, from: Data(contentsOf: s12.appending(path: OriginalUpload.stateFileName)))
    expect(pass12 == .stopped("stopped by another uploader") && count12 == 1 && items12[1].state == "pending"
           && saved12.stoppedReason == "stopped by another uploader" && saved12.items[0].state == "committed",
           "a stop saved by another uploader of the session is kept, and nothing more is sent")

    // A response from another URL (a followed redirect) counts for nothing; a stop still wins.
    let (s13, r13) = try makeSession(frames: 1)
    let server13 = FakeServer()
    let uploader13 = try OriginalUploader(session: s13, transport: server13)
    _ = try await uploader13.enqueue(r13[0], source: source)
    await server13.script([{ request in
        let (data, _) = try await commit(request)
        var moved = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        moved.host = "elsewhere.invalid"
        return respond(200, data, to: URLRequest(url: moved.url!))
    }, commit])
    let redirected = await uploader13.sendPending(authorization(4))
    let items13 = try await uploader13.saved().items
    let again13 = await uploader13.sendPending(authorization(4))
    let other13 = try OriginalUploader(session: s13, transport: FakeServer())
    await other13.stop("the learner stopped sharing")
    let stopped13 = await uploader13.sendPending(authorization(4))
    let count13 = await server13.requests.count
    expect(isHalted(redirected) && items13[0].state == "pending" && items13[0].receipt == nil
           && isHalted(again13) && count13 == 1,
           "a receipt from another URL is not accepted, the original stays pending and that uploader sends nothing more")
    expect(stopped13 == .stopped("the learner stopped sharing"),
           "a stop saved by another uploader is reported as stopped even when this uploader is disabled")

    // A pass whose task is already cancelled sends nothing.
    let (s14, r14) = try makeSession(frames: 1)
    let server14 = FakeServer()
    let uploader14 = try OriginalUploader(session: s14, transport: server14)
    _ = try await uploader14.enqueue(r14[0], source: source)
    await server14.script([commit])
    let cancelledEarly = Task { () -> OriginalUploader.PassResult in
        while !Task.isCancelled { await Task.yield() }
        return await uploader14.sendPending(authorization(4))
    }
    cancelledEarly.cancel()
    let early = await cancelledEarly.value
    let count14 = await server14.requests.count
    let items14 = try await uploader14.saved().items
    expect(early == .halted("cancelled") && count14 == 0 && items14[0].state == "pending" && items14[0].attempts == 0,
           "a cancelled pass sends nothing and records no attempt")

    // A state corrupted under an already open uploader is never overwritten, and nothing is sent.
    let (s15, r15) = try makeSession(frames: 2)
    let server15 = FakeServer()
    let uploader15 = try OriginalUploader(session: s15, transport: server15)
    _ = try await uploader15.enqueue(r15[0], source: source)
    let state15 = s15.appending(path: OriginalUpload.stateFileName)
    let corrupted = Data("{\"items\": [".utf8)
    try corrupted.write(to: state15)
    await server15.script([commit, commit])
    let pass15 = await uploader15.sendPending(authorization(4))
    let enqueue15 = await enqueueFailure(uploader15, r15[1], source)
    let stop15 = await uploader15.stop("the learner stopped sharing")
    let pass15b = await uploader15.sendPending(authorization(4))
    let count15 = await server15.requests.count
    expect(isHalted(pass15) && enqueue15 == .stateUnreadable && !stop15
           && pass15b == .stopped("the learner stopped sharing") && count15 == 0
           && (try? Data(contentsOf: state15)) == corrupted,
           "a state corrupted under an open uploader is never overwritten; pass, enqueue and stop write nothing, and nothing is sent")

    // A state that disappears under an already open uploader is not recreated, and nothing is sent.
    let (s16, r16) = try makeSession(frames: 2)
    let server16 = FakeServer()
    let uploader16 = try OriginalUploader(session: s16, transport: server16)
    _ = try await uploader16.enqueue(r16[0], source: source)
    let state16 = s16.appending(path: OriginalUpload.stateFileName)
    try FileManager.default.removeItem(at: state16)
    await server16.script([commit])
    let pass16 = await uploader16.sendPending(authorization(4))
    let enqueue16 = await enqueueFailure(uploader16, r16[1], source)
    let count16 = await server16.requests.count
    expect(isHalted(pass16) && enqueue16 == .stateMissing && count16 == 0
           && !FileManager.default.fileExists(atPath: state16.path(percentEncoded: false)),
           "a state that disappears under an open uploader is not recreated, and nothing is sent")

    // Two uploaders opened on the same empty session: fresh, serialized state changes.
    let (s17, r17) = try makeSession(frames: 3)
    let serverA = FakeServer()
    let serverB = FakeServer()
    let uploaderA = try OriginalUploader(session: s17, transport: serverA)
    let uploaderB = try OriginalUploader(session: s17, transport: serverB)
    _ = try await uploaderA.enqueue(r17[0], source: source)
    let rebind = await enqueueFailure(uploaderB, r17[1], otherSource)
    _ = try await uploaderB.enqueue(r17[1], source: source)
    let saved17 = try await uploaderA.saved()
    expect(rebind == .otherSource && saved17.source == source
           && saved17.items.map(\.file) == [r17[0].file, r17[1].file],
           "a second uploader on the same session can neither rebind it nor erase the first uploader's original")
    await serverA.script([commit, commit])
    let passA = await uploaderA.sendPending(authorization(4))
    let passB = await uploaderB.sendPending(authorization(4))
    let countB = await serverB.requests.count
    let committed17 = try await uploaderB.saved().items
    expect(passA == .finished && passB == .finished && countB == 0
           && committed17.allSatisfy { $0.state == "committed" && $0.receipt != nil },
           "the other uploader sees the saved receipts, keeps them and sends nothing again")
    _ = try await uploaderB.enqueue(r17[2], source: source)
    await serverB.script([commit])
    await serverA.script([{ request in
        _ = await uploaderB.sendPending(authorization(5)) // B sends the same original and commits it meanwhile.
        throw URLError(.networkConnectionLost)
    }])
    let lostA = await uploaderA.sendPending(authorization(4))
    let third17 = try await uploaderA.saved().items[2]
    expect(lostA == .halted("no response; outcome unknown") && third17.state == "committed"
           && third17.lastOutcome == "bytes_committed" && third17.attempts == 2,
           "a stale uploader's lost response never overwrites a receipt another uploader saved")

    // A stop saved by another uploader before an attempt prevents every send.
    let (s18, r18) = try makeSession(frames: 2)
    let server18 = FakeServer()
    let first18 = try OriginalUploader(session: s18, transport: server18)
    for record in r18 { _ = try await first18.enqueue(record, source: source) }
    let other18 = try OriginalUploader(session: s18, transport: FakeServer())
    let stopped18 = await other18.stop("stopped by another uploader")
    await server18.script([commit, commit])
    let pass18 = await first18.sendPending(authorization(4))
    let count18 = await server18.requests.count
    let items18 = try await first18.saved().items
    expect(stopped18 && pass18 == .stopped("stopped by another uploader") && count18 == 0
           && items18.allSatisfy { $0.state == "pending" && $0.attempts == 0 },
           "a stop saved by another uploader before any attempt prevents every send, and the queue is kept")

    // A stop that cannot be saved: false until saved, and this uploader still sends nothing.
    let (s19, r19) = try makeSession(frames: 1)
    let server19 = FakeServer()
    let uploader19 = try OriginalUploader(session: s19, transport: server19)
    _ = try await uploader19.enqueue(r19[0], source: source)
    let state19 = s19.appending(path: OriginalUpload.stateFileName)
    let before19 = try Data(contentsOf: state19)
    try setStateWritable(s19, false)
    let firstStop = await uploader19.stop("the learner stopped sharing")
    let secondStop = await uploader19.stop("the learner stopped sharing")
    await server19.script([commit])
    let pass19 = await uploader19.sendPending(authorization(4))
    let unchanged19 = (try? Data(contentsOf: state19)) == before19
    try setStateWritable(s19, true)
    let thirdStop = await uploader19.stop("the learner stopped sharing")
    let relaunched19 = try OriginalUploader(session: s19, transport: server19)
    let saved19 = try await relaunched19.saved()
    let pass19b = await relaunched19.sendPending(authorization(4))
    let count19 = await server19.requests.count
    expect(!firstStop && !secondStop && pass19 == .stopped("the learner stopped sharing") && unchanged19,
           "a stop that cannot be saved returns false, also when repeated, and still forbids this uploader's sends")
    expect(thirdStop && saved19.stoppedReason == "the learner stopped sharing"
           && pass19b == .stopped("the learner stopped sharing") && count19 == 0,
           "a retried stop returns true once saved, and the saved stop survives a relaunch")

    // A refusal that cannot be saved ends the pass as halted, never finished, and sends nothing.
    let (s24, r24) = try makeSession(frames: 1)
    let server24 = FakeServer()
    let uploader24 = try OriginalUploader(session: s24, transport: server24)
    _ = try await uploader24.enqueue(r24[0], source: source)
    try FileManager.default.removeItem(at: s24.appending(path: r24[0].file))
    let state24 = s24.appending(path: OriginalUpload.stateFileName)
    let before24 = try Data(contentsOf: state24)
    try setStateWritable(s24, false)
    await server24.script([commit])
    let pass24 = await uploader24.sendPending(authorization(4))
    let unchanged24 = (try? Data(contentsOf: state24)) == before24
    try setStateWritable(s24, true)
    let count24 = await server24.requests.count
    let item24 = try await uploader24.saved().items[0]
    expect(pass24 == .halted("the upload state could not be read or saved") && count24 == 0 && unchanged24
           && item24.state == "pending",
           "a refusal that cannot be saved ends the pass as halted, sends nothing and leaves the state as it was")

    // A receipt that cannot be saved ends the pass; the next explicit pass sends the same request.
    let (s25, r25) = try makeSession(frames: 1)
    let server25 = FakeServer()
    let uploader25 = try OriginalUploader(session: s25, transport: server25)
    _ = try await uploader25.enqueue(r25[0], source: source)
    await server25.script([{ request in
        let response = try await commit(request)
        try setStateWritable(s25, false) // The server stored the bytes; the receipt cannot be saved.
        return response
    }, commit])
    let pass25 = await uploader25.sendPending(authorization(4))
    try setStateWritable(s25, true)
    let pending25 = try await uploader25.saved().items[0]
    let again25 = await uploader25.sendPending(authorization(4))
    let sent25 = await server25.requests
    let committed25 = try await uploader25.saved().items[0]
    expect(pass25 == .halted("the receipt could not be saved") && pending25.state == "pending"
           && again25 == .finished && committed25.state == "committed" && sent25.count == 2
           && sent25[0].httpBody == sent25[1].httpBody,
           "a receipt that cannot be saved leaves the original pending; the next pass sends the same request and commits it")

    // A cancelled pass on a session another uploader has stopped reports stopped.
    let (s26, r26) = try makeSession(frames: 1)
    let server26 = FakeServer()
    let uploader26 = try OriginalUploader(session: s26, transport: server26)
    _ = try await uploader26.enqueue(r26[0], source: source)
    let stopper26 = try OriginalUploader(session: s26, transport: FakeServer())
    let saved26 = await stopper26.stop("stopped by another uploader")
    await server26.script([commit])
    let cancelled26 = Task { () -> OriginalUploader.PassResult in
        while !Task.isCancelled { await Task.yield() }
        return await uploader26.sendPending(authorization(4))
    }
    cancelled26.cancel()
    let pass26 = await cancelled26.value
    let count26 = await server26.requests.count
    let item26 = try await uploader26.saved().items[0]
    expect(saved26 && pass26 == .stopped("stopped by another uploader") && count26 == 0
           && item26.state == "pending" && item26.attempts == 0,
           "a cancelled pass on a session another uploader has stopped reports stopped and sends nothing")

    // A transport error carrying the token in its domain and description records a fixed category.
    let (s20, r20) = try makeSession(frames: 1)
    let server20 = FakeServer()
    let uploader20 = try OriginalUploader(session: s20, transport: server20)
    _ = try await uploader20.enqueue(r20[0], source: source)
    await server20.script([{ request in
        let token = request.value(forHTTPHeaderField: "Authorization") ?? "missing"
        throw NSError(domain: token, code: 1, userInfo: [NSLocalizedDescriptionKey: token])
    }])
    let pass20 = await uploader20.sendPending(authorization(6))
    let items20 = try await uploader20.saved().items
    let state20 = try Data(contentsOf: s20.appending(path: OriginalUpload.stateFileName))
    expect(pass20 == .halted("no response; outcome unknown")
           && items20[0].lastOutcome == "no response (other error); outcome unknown, still pending"
           && state20.range(of: Data(tokens[6].utf8)) == nil,
           "a transport error whose domain and description carry the token is recorded only as \"other error\"")

    // A receipt with a duplicate member carrying the token: only the canonical receipt is saved.
    let (s21, r21) = try makeSession(frames: 1)
    let server21 = FakeServer()
    let uploader21 = try OriginalUploader(session: s21, transport: server21)
    _ = try await uploader21.enqueue(r21[0], source: source)
    await server21.script([{ request in
        let (data, response) = try await commit(request)
        let token = request.value(forHTTPHeaderField: "Authorization") ?? "missing"
        let smuggled = "{\"kind\":\"" + token + "\"," + String(decoding: data.dropFirst(), as: UTF8.self)
        return (Data(smuggled.utf8), response)
    }])
    let pass21 = await uploader21.sendPending(authorization(6))
    let item21 = try await uploader21.saved().items[0]
    let state21 = try Data(contentsOf: s21.appending(path: OriginalUpload.stateFileName))
    expect(state21.range(of: Data(tokens[6].utf8)) == nil
           && ((pass21 == .finished && item21.state == "committed"
                && item21.receipt == OriginalUpload.canonicalReceipt(item21.binding))
               || (isHalted(pass21) && item21.state == "pending")),
           "a receipt whose duplicate member carries the token never puts it in the state; only the canonical receipt is saved")

    // An uploader that saw the state only while it was unreadable does not recreate it later.
    let (s22, r22) = try makeSession(frames: 2)
    let server22 = FakeServer()
    let watcher22 = try OriginalUploader(session: s22, transport: server22) // Opened before any state exists.
    let writer22 = try OriginalUploader(session: s22, transport: FakeServer())
    _ = try await writer22.enqueue(r22[0], source: source)
    await writer22.stop("the learner stopped sharing")
    let state22 = s22.appending(path: OriginalUpload.stateFileName)
    try Data("{".utf8).write(to: state22)
    let unreadable22 = await watcher22.sendPending(authorization(4))
    try FileManager.default.removeItem(at: state22)
    let enqueue22 = await enqueueFailure(watcher22, r22[1], otherSource)
    let pass22 = await watcher22.sendPending(authorization(4))
    let count22 = await server22.requests.count
    expect(isHalted(unreadable22) && enqueue22 == .stateMissing && isHalted(pass22) && count22 == 0
           && !FileManager.default.fileExists(atPath: state22.path(percentEncoded: false)),
           "an uploader that saw the state only while unreadable neither recreates nor rebinds it after it disappears, and sends nothing")

    // A lost state is refused by uploaders that never saw it: one opened before the state existed,
    // and one opened after the loss (as after a relaunch). The lock file's witness records it.
    let (s27, r27) = try makeSession(frames: 2)
    let server27 = FakeServer()
    let early27 = try OriginalUploader(session: s27, transport: server27) // Opened before any state.
    let writer27 = try OriginalUploader(session: s27, transport: FakeServer())
    _ = try await writer27.enqueue(r27[0], source: source)
    let stopSaved27 = await writer27.stop("the learner stopped sharing")
    let state27 = s27.appending(path: OriginalUpload.stateFileName)
    try FileManager.default.removeItem(at: state27) // Only the state is lost; PNGs, status and lock remain.
    await server27.script([commit, commit])
    let earlySaved27 = await savedFailure(early27)
    let earlyEnqueue27 = await enqueueFailure(early27, r27[1], otherSource)
    let earlyPass27 = await early27.sendPending(authorization(4))
    let late27 = try OriginalUploader(session: s27, transport: server27)
    let lateSaved27 = await savedFailure(late27)
    let lateEnqueue27 = await enqueueFailure(late27, r27[1], source)
    let latePass27 = await late27.sendPending(authorization(4))
    let count27 = await server27.requests.count
    expect(stopSaved27 && earlySaved27 == .stateMissing && earlyEnqueue27 == .stateMissing && isHalted(earlyPass27),
           "an uploader opened before the state existed refuses it once lost: no empty queue, no rebinding, no send")
    expect(lateSaved27 == .stateMissing && lateEnqueue27 == .stateMissing && isHalted(latePass27) && count27 == 0
           && !FileManager.default.fileExists(atPath: state27.path(percentEncoded: false)),
           "an uploader opened after the loss, as after a relaunch, refuses it too; nothing is recreated or sent")

    // Controls: an honestly new session initializes normally and reopens normally.
    let (s28, r28) = try makeSession(frames: 1)
    let server28 = FakeServer()
    let first28 = try OriginalUploader(session: s28, transport: server28)
    let empty28 = try await first28.saved()
    let emptyPass28 = await first28.sendPending(authorization(4))
    let lockBefore28 = lockSize(s28)
    _ = try await first28.enqueue(r28[0], source: source)
    let lockAfter28 = lockSize(s28)
    let reopened28 = try OriginalUploader(session: s28, transport: server28)
    let reopenedItems28 = try await reopened28.saved().items
    await server28.script([commit])
    let pass28 = await reopened28.sendPending(authorization(4))
    expect(empty28.items.isEmpty && empty28.source == nil && emptyPass28 == .finished && lockBefore28 == 0
           && lockAfter28 > 0 && reopenedItems28.count == 1 && pass28 == .finished,
           "a new session starts empty, is witnessed when its state is first created, and reopens and sends normally")

    // A first save that fails withdraws the witness, so the session stays new.
    let (s29, r29) = try makeSession(frames: 1)
    let uploader29 = try OriginalUploader(session: s29, transport: FakeServer())
    _ = try await uploader29.saved() // Creates the (empty) lock file.
    try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: s29.path(percentEncoded: false))
    let failed29 = await enqueueFailure(uploader29, r29[0], source)
    let lockFailed29 = lockSize(s29)
    let absent29 = !FileManager.default.fileExists(atPath: s29.appending(path: OriginalUpload.stateFileName).path(percentEncoded: false))
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: s29.path(percentEncoded: false))
    let retried29 = try await uploader29.enqueue(r29[0], source: source)
    expect(failed29 == .stateNotSaved && lockFailed29 == 0 && absent29 && retried29.state == "pending" && lockSize(s29) > 0,
           "a failed first save leaves no state and no witness, so the new session can still be initialized")

    // A state saved before the witness existed is witnessed when next read, then protected.
    let (s30, r30) = try makeSession(frames: 1)
    let writer30 = try OriginalUploader(session: s30, transport: FakeServer())
    _ = try await writer30.enqueue(r30[0], source: source)
    try Data().write(to: s30.appending(path: OriginalUpload.lockFileName)) // As before the witness.
    let reader30 = try OriginalUploader(session: s30, transport: FakeServer())
    let read30 = try await reader30.saved().items.count
    let repaired30 = lockSize(s30)
    try FileManager.default.removeItem(at: s30.appending(path: OriginalUpload.stateFileName))
    let after30 = try OriginalUploader(session: s30, transport: FakeServer())
    let missing30 = await savedFailure(after30)
    expect(read30 == 1 && repaired30 > 0 && missing30 == .stateMissing,
           "a state without a witness is witnessed when read, so its later loss is refused by a new uploader")

    // An unreadable state saved before the witness existed is witnessed when an open uploader next
    // reads it, so its later loss is refused. (A new uploader refuses it at open instead.)
    let (s31, r31) = try makeSession(frames: 1)
    let writer31 = try OriginalUploader(session: s31, transport: FakeServer())
    _ = try await writer31.enqueue(r31[0], source: source)
    try Data().write(to: s31.appending(path: OriginalUpload.lockFileName)) // As before the witness.
    let reader31 = try OriginalUploader(session: s31, transport: FakeServer()) // Opened while readable.
    let state31 = s31.appending(path: OriginalUpload.stateFileName)
    try Data("{".utf8).write(to: state31)
    let unreadable31 = await savedFailure(reader31)
    let marked31 = lockSize(s31)
    try FileManager.default.removeItem(at: state31)
    let after31 = try OriginalUploader(session: s31, transport: FakeServer())
    let missing31 = await savedFailure(after31)
    expect(unreadable31 == .stateUnreadable && marked31 > 0 && missing31 == .stateMissing,
           "an unreadable state without a witness is witnessed when an open uploader reads it, so its later loss is refused by a new uploader")

    // 413: only the contract's payload_too_large refuses an original for good.
    let (s23, r23) = try makeSession(frames: 2)
    let server23 = FakeServer()
    let uploader23 = try OriginalUploader(session: s23, transport: server23)
    for record in r23 { _ = try await uploader23.enqueue(record, source: source) }
    await server23.script([reply(413, Data("<html>Request Entity Too Large</html>".utf8)),
                           reply(413, ingressError("payload_too_large")), commit])
    let proxy413 = await uploader23.sendPending(authorization(4))
    let afterProxy = try await uploader23.saved().items
    let ingress413 = await uploader23.sendPending(authorization(4))
    let after413 = try await uploader23.saved().items
    expect(proxy413 == .halted("HTTP 413 without a valid IngressError") && afterProxy[0].state == "pending",
           "a 413 that is not the contract's payload_too_large leaves the original pending")
    expect(ingress413 == .finished && after413[0].state == "refused" && after413[1].state == "committed"
           && FileManager.default.fileExists(atPath: s23.appending(path: r23[0].file).path(percentEncoded: false)),
           "413 payload_too_large refuses that original and keeps its file; the next original is still sent")

    // Cancellation while waiting for a response; a second pass cannot run meanwhile.
    let (s10, r10) = try makeSession(frames: 1)
    let server10 = FakeServer()
    let uploader10 = try OriginalUploader(session: s10, transport: server10)
    _ = try await uploader10.enqueue(r10[0], source: source)
    await server10.script([{ request in
        try await Task.sleep(nanoseconds: 60_000_000_000)
        return try await commit(request)
    }, commit])
    let inFlight = Task { await uploader10.sendPending(authorization(4)) }
    var started = false
    for _ in 0..<500 {
        let waiting = await server10.requests.isEmpty
        if !waiting {
            started = true
            break
        }
        try await Task.sleep(nanoseconds: 10_000_000)
    }
    let busy = await uploader10.sendPending(authorization(4))
    let busyCount = await server10.requests.count
    expect(started && busy == .halted("another pass is already running") && busyCount == 1,
           "a second pass while one is in flight sends nothing")
    inFlight.cancel()
    let cancelled = await inFlight.value
    let items10 = try await uploader10.saved().items
    expect(cancelled == .halted("cancelled") && items10[0].state == "pending"
           && items10[0].lastOutcome?.hasPrefix("cancelled while waiting for the response") == true,
           "cancelling the pass leaves the original pending, with its outcome unknown")
    let afterCancel = await uploader10.sendPending(authorization(4))
    let sent10 = await server10.requests
    expect(afterCancel == .finished && sent10.count == 2 && sent10[0].httpBody == sent10[1].httpBody,
           "a later explicit pass sends the same request")

    // An unreadable state file is never replaced.
    let (s11, _) = try makeSession(frames: 1)
    let state11 = s11.appending(path: OriginalUpload.stateFileName)
    try Data("{not json".utf8).write(to: state11)
    do {
        _ = try OriginalUploader(session: s11, transport: FakeServer())
        expect(false, "an unreadable upload state is refused")
    } catch let failure as OriginalUploader.Failure {
        expect(failure == .stateUnreadable && (try? Data(contentsOf: state11)) == Data("{not json".utf8),
               "an unreadable upload state is refused and left as it is")
    }

    // Authorization: a bare https origin and a well-formed bearer token, never shown.
    let badOrigins = ["http://ingress.invalid", "https://ingress.invalid/api", "https://user@ingress.invalid",
                      "https://ingress.invalid?x=1", "https://ingress.invalid/#f", "HTTPS://ingress.invalid",
                      "https://Ingress.invalid"]
    let badTokens = ["", "a b", "a\r\nX-Other: 1", "to=ken", "tök"]
    expect(badOrigins.allSatisfy { IngressAuthorization(origin: URL(string: $0)!, bearerToken: "t") == nil }
           && badTokens.allSatisfy { IngressAuthorization(origin: origin, bearerToken: $0) == nil }
           && IngressAuthorization(origin: URL(string: "https://ingress.invalid:8443/")!, bearerToken: "a.b-c_d~e+f/g==") != nil,
           "only a bare, lowercase https origin and a well-formed bearer token are accepted")
    let shown = authorization(0)
    var dumped = ""
    dump(shown, to: &dumped)
    expect(![String(describing: shown), String(reflecting: shown), dumped].contains { $0.contains(tokens[0]) },
           "an authorization's descriptions never show its token")
}

// MARK: - Run

do {
    try FileManager.default.createDirectory(at: fixtures, withIntermediateDirectories: true)
    let existing = try FileManager.default.contentsOfDirectory(atPath: fixtures.path(percentEncoded: false))
    guard existing.isEmpty else {
        print("FAIL the fixture directory \(fixtures.path(percentEncoded: false)) must be absent or empty")
        exit(2)
    }
} catch {
    print("FAIL the fixture directory could not be created: \(error)")
    exit(2)
}

// No top-level await: the checks run in a Task while the main thread waits, so top-level code
// stays nonisolated (Swift 5 language mode).
let finished = DispatchSemaphore(value: 0)
Task {
    do {
        try await runChecks()
    } catch {
        expect(false, "the checks ran to completion (\(error))")
    }
    finished.signal()
}
finished.wait()

try! JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
    .write(to: fixtures.appending(path: "manifest.json"))
let persisted = snapshot(root).merging(snapshot(fixtures)) { current, _ in current }
expect(!persisted.values.contains { data in tokens.contains { data.range(of: Data($0.utf8)) != nil } },
       "no token is written to any upload state, capture file or fixture (\(persisted.count) files)")
// Remove the temporary sessions; keep the fixtures.
let keptName: String? = CommandLine.arguments.count > 1 ? nil : "fixtures"
for entry in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    where entry.lastPathComponent != keptName {
    try? FileManager.default.removeItem(at: entry)
}

print("fixtures: \(fixtures.path(percentEncoded: false))")
if failures > 0 {
    print("\(failures) capture ingress check(s) failed")
    exit(1)
}
print("all capture ingress checks passed")
