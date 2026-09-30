import CryptoKit
import Darwin
import Foundation
import XCTest
@testable import DesktopCapture

/// The Mac 0.2.12 batch builder and uploader on the synthetic retained session of the Mac
/// retained-frame tests (real recorder, composer and FrameStore; synthetic pixels and identities).
/// The "host" here is an in-process stand-in that answers like the released routes; it is not
/// HTTP, not the Backend and not a Mac capture host. One test runs the real URLSession transport
/// against a URLProtocol stand-in, which exercises headers, bounded reads and redirects inside the
/// loading system, not a socket. With COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR set to a new
/// directory, the session and the exact exchanged bytes are kept for checks/validate_mac_upload.py.
extension DesktopCaptureTests {
    static let uploadToken = "synthetic-host-bearer-0123456789abcdef-XYZ"
    static let uploadOrigin = "http://127.0.0.1:48123"

    // MARK: - Stand-in host

    /// One request as the stand-in received it.
    struct SentRequest: Sendable {
        let method: String
        let path: String
        let headers: [String: String]
        let body: Data
    }

    /// Answers like the released routes unless `script` returns another reply for a request.
    final class StandInHost: MacIngressTransport, @unchecked Sendable {
        typealias Script = @Sendable (SentRequest, Int) async throws -> MacHTTPReply?
        private let lock = NSLock()
        private var requests: [SentRequest] = []
        private var committed: [String: Data] = [:]
        /// Every reply as given, in request order: its actual status and body.
        private var answers: [(status: Int, body: Data?)] = []
        let script: Script?

        init(script: Script? = nil) {
            self.script = script
        }

        var sent: [SentRequest] { lock.withLock { requests } }
        var replies: [(status: Int, body: Data?)] { lock.withLock { answers } }

        func send(_ request: URLRequest, responseLimit: Int) async throws -> MacHTTPReply {
            let sent = SentRequest(method: request.httpMethod ?? "", path: request.url?.path(percentEncoded: true) ?? "",
                                   headers: request.allHTTPHeaderFields ?? [:], body: request.httpBody ?? Data())
            let index: Int = lock.withLock {
                requests.append(sent)
                return requests.count - 1
            }
            let reply: MacHTTPReply
            if let script, let scripted = try await script(sent, index) {
                reply = scripted
            } else {
                reply = honest(sent)
            }
            lock.withLock { answers.append((status: reply.status, body: reply.body)) }
            if let body = reply.body, body.count > responseLimit {
                return MacHTTPReply(status: reply.status, body: nil, url: reply.url)
            }
            return reply
        }

        /// A released-route answer: an exact receipt for an intact upload, and an ACK for a batch
        /// whose every artifact was uploaded.
        func honest(_ sent: SentRequest) -> MacHTTPReply {
            guard let body = try? JSONSerialization.jsonObject(with: sent.body) as? [String: Any] else {
                return DesktopCaptureTests.typed(400, "invalid_json", version: sent.method == "PUT" ? "0.2.4" : "0.2.12")
            }
            if sent.method == "PUT" {
                guard let artifact = body["artifact"] as? [String: Any], let id = artifact["artifact_id"] as? String,
                      let encoded = body["data_base64"] as? String, let bytes = Data(base64Encoded: encoded),
                      SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == artifact["sha256"] as? String,
                      bytes.count == artifact["byte_length"] as? Int else {
                    return DesktopCaptureTests.typed(422, "invalid_request", version: "0.2.4")
                }
                lock.withLock { committed[id] = bytes }
                var receipt = body
                receipt["data_base64"] = nil
                receipt["status"] = "bytes_committed"
                return DesktopCaptureTests.json(200, receipt)
            }
            guard let batch = body["batch"] as? [String: Any], let records = batch["records"] as? [[String: Any]] else {
                return DesktopCaptureTests.typed(422, "invalid_request", version: "0.2.12")
            }
            var acknowledged: [[String: Any]] = []
            for record in records {
                var artifacts: [[String: Any]] = []
                for artifact in (record["artifacts"] as? [[String: Any]]) ?? [] {
                    guard let id = artifact["artifact_id"] as? String, lock.withLock({ committed[id] }) != nil else {
                        return DesktopCaptureTests.typed(409, "dependency_missing", version: "0.2.12")
                    }
                    var verified = artifact
                    verified["status"] = "verified"
                    artifacts.append(verified)
                }
                let receipt: [String: Any] = [
                    "record_id": record["record_id"] ?? NSNull(), "sequence": record["sequence"] ?? NSNull(),
                    "disposition": "accepted", "received_at": "2026-09-30T19:40:00.123456Z", "envelope": "committed",
                    "artifacts": artifacts,
                ]
                acknowledged.append(receipt)
            }
            let owner = ((records.first?["source"] as? [String: Any])?["user_id"] as? String) ?? ""
            let ack: [String: Any] = [
                "contract_version": "0.2.0", "batch_id": batch["batch_id"] ?? NSNull(), "user_id": owner,
                "device_id": batch["device_id"] ?? NSNull(), "session_id": batch["session_id"] ?? NSNull(),
                "stream_id": batch["stream_id"] ?? NSNull(), "acknowledged": acknowledged,
            ]
            return DesktopCaptureTests.json(200, ack)
        }
    }

    /// The ACK the released route gives for exactly this prepared batch.
    static func ackObject(_ prepared: PreparedMacBatch, userID: String) -> [String: Any] {
        var acknowledged: [[String: Any]] = []
        for record in prepared.records {
            var artifacts: [[String: Any]] = []
            for artifact in record.artifacts {
                artifacts.append(["artifact_id": artifact.artifactID, "sha256": artifact.sha256, "byte_length": artifact.byteLength,
                                  "media_type": artifact.mediaType, "status": "verified"])
            }
            acknowledged.append(["record_id": record.recordID, "sequence": record.sequence, "disposition": "accepted",
                                 "received_at": "2026-09-30T19:40:00.123456Z", "envelope": "committed", "artifacts": artifacts])
        }
        return ["contract_version": "0.2.0", "batch_id": prepared.batchID, "user_id": userID,
                "device_id": prepared.incarnation.deviceID, "session_id": prepared.incarnation.sessionID,
                "stream_id": prepared.incarnation.streamID, "acknowledged": acknowledged]
    }

    static func json(_ status: Int, _ object: Any) -> MacHTTPReply {
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data()
        return MacHTTPReply(status: status, body: data, url: nil)
    }

    static func typed(_ status: Int, _ code: String, version: String, retryable: Bool? = nil) -> MacHTTPReply {
        let flag = retryable ?? (code == "unavailable" || code == "dependency_missing")
        return json(status, ["contract_version": version, "error": code, "retryable": flag])
    }

    // MARK: - Plan and authority

    /// Every kept frame of the Mac session, with Process identities that are not callback ordinals.
    func ingressPlan(_ session: RetainedSession, key: String = "synthetic-mac-upload-key-1") -> MacIngressPlan {
        let entries = macPlan(session).entries.map { entry -> MacIngressPlan.Entry in
            .frame(entry, record: RecordIdentity(recordID: "synthetic-mac-record-\(entry.callbackSequence)",
                                                 sequence: 100 + entry.callbackSequence))
        }
        return MacIngressPlan(batchID: "synthetic-mac-batch-1", idempotencyKey: key, deliveryMode: "live",
                              incarnation: macIncarnation, source: macSource, nativeSessionID: session.status.session,
                              displayID: 7, entries: entries)
    }

    func uploadAuthority(expires: Date = Date(timeIntervalSinceNow: 3600)) throws -> MacIngressAuthority {
        try MacIngressAuthority(origin: Self.uploadOrigin, token: Self.uploadToken, expiresAt: expires,
                                userID: macSource.userID, incarnation: macIncarnation)
    }

    /// A copy of a retained session that one test may change.
    func sessionCopy(_ directory: URL, _ name: String) throws -> URL {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let copy = root.appending(path: name, directoryHint: .isDirectory)
        try FileManager.default.copyItem(at: directory, to: copy)
        return copy
    }

    func decodedObject(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Building the batch

    func testPreparesTheExactMacBatchWithImmutableInkReferences() throws {
        let directory = try writeMacSession(root: root.appending(path: "prepare", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let prepared = try MacIngressBatch.prepare(ingressPlan(session), session: session)
        XCTAssertEqual(try MacIngressBatch.prepare(ingressPlan(session), session: session).body, prepared.body,
                       "the same session and plan give the same bytes")

        let request = try decodedObject(prepared.body)
        XCTAssertEqual(request["contract_version"] as? String, "0.2.12")
        let batch = try XCTUnwrap(request["batch"] as? [String: Any])
        XCTAssertEqual(batch["contract_version"] as? String, "0.2.0")
        XCTAssertEqual(batch["delivery_mode"] as? String, "live")
        XCTAssertEqual(batch["stream_id"] as? String, macIncarnation.streamID)
        let records = try XCTUnwrap(batch["records"] as? [[String: Any]])
        XCTAssertEqual(records.compactMap { $0["sequence"] as? Int }, Array(101...108), "the caller's sequences, not callbacks")
        XCTAssertEqual(records.compactMap { $0["frame_id"] as? String }, (1...8).map { "synthetic-mac-frame-\($0)" })
        for record in records {
            XCTAssertTrue(record["observed_at"] is NSNull && record["clock"] is NSNull && record["media_position"] is NSNull)
            XCTAssertEqual(record["surface"] as? String, "external_app")
            XCTAssertEqual(record["method"] as? String, "visual")
            XCTAssertEqual((record["scope"] as? [String: Any])?["kind"] as? String, "provisional_session")
        }

        // Raw, then a composed image with its own ID, then the frame's immutable ink original.
        func ids(_ index: Int) -> [String] {
            ((records[index]["artifacts"] as? [[String: Any]]) ?? []).compactMap { $0["artifact_id"] as? String }
        }
        func original(_ sequence: Int) throws -> InkOriginalRecord? {
            guard case .composed(let record, _)? = session.outcomes[sequence] else { return nil }
            return record.inkOriginal
        }
        let firstSHA = try XCTUnwrap(try original(2)?.sha256)
        let reopenedSHA = try XCTUnwrap(try original(6)?.sha256)
        let firstInk = "synthetic-mac-ink-" + String(firstSHA.prefix(12))
        let reopenedInk = "synthetic-mac-ink-" + String(reopenedSHA.prefix(12))
        XCTAssertEqual(ids(0), ["synthetic-mac-raw-1"])
        XCTAssertEqual(ids(1), ["synthetic-mac-raw-2", firstInk])
        XCTAssertEqual(ids(2), ["synthetic-mac-raw-3", "synthetic-mac-composed-3", firstInk])
        XCTAssertEqual(ids(3), ["synthetic-mac-raw-4", "synthetic-mac-composed-4"], "not recorded: no ink reference")
        XCTAssertEqual(ids(4), ["synthetic-mac-raw-5", "synthetic-mac-composed-5"], "unavailable: no ink reference")
        XCTAssertEqual(ids(5), ["synthetic-mac-raw-6", "synthetic-mac-composed-6", reopenedInk])
        XCTAssertEqual(ids(6), ["synthetic-mac-raw-7"])
        XCTAssertEqual(ids(7), ["synthetic-mac-raw-8"])

        // The descriptors are the mapper's, unchanged.
        let mapping = try MacRetainedFrames.map(macPlan(session), session: session)
        let frames = try XCTUnwrap(request["frames"] as? [Any])
        let expectedFrames = try decodedObject(try DesktopJSON.encode(.object(["frames": .array(mapping.described.map(\.frame))])))
        XCTAssertEqual(frames as NSArray, try XCTUnwrap(expectedFrames["frames"] as? [Any]) as NSArray)

        // Each distinct original once, with its retained file; ink only from ink-originals/.
        XCTAssertEqual(prepared.originals.count, 14)
        XCTAssertEqual(Set(prepared.originals.map(\.binding.artifact.artifactID)).count, 14)
        let inks = prepared.originals.filter { $0.binding.kind == "editable_ink" }
        XCTAssertEqual(inks.map(\.binding.artifact.artifactID), [firstInk, reopenedInk])
        XCTAssertEqual(inks.map(\.file), [try XCTUnwrap(try original(2)?.file), try XCTUnwrap(try original(6)?.file)])
        XCTAssertTrue(inks.allSatisfy { $0.file.hasPrefix("ink-originals/") && $0.binding.artifact.mediaType == "application/json" })
        XCTAssertEqual(prepared.originals.first { $0.binding.artifact.artifactID == "synthetic-mac-composed-3" }?.file,
                       "composed/00000003.png")
        XCTAssertEqual(prepared.records.map(\.recordID), (1...8).map { "synthetic-mac-record-\($0)" })
        XCTAssertTrue(prepared.unrepresented.contains { $0.hasPrefix("ink originals: 3 composed frames keep one [") })

        // Refusals: nothing is prepared.
        var badKey = ingressPlan(session)
        badKey.idempotencyKey = "-leading-dash"
        XCTAssertThrowsError(try MacIngressBatch.prepare(badKey, session: session))
        var badMode = ingressPlan(session)
        badMode.deliveryMode = "replay"
        XCTAssertThrowsError(try MacIngressBatch.prepare(badMode, session: session))
        var repeated = ingressPlan(session)
        if case .frame(let entry, _) = repeated.entries[1] {
            repeated.entries[1] = .frame(entry, record: RecordIdentity(recordID: "synthetic-mac-record-2", sequence: 101))
        }
        XCTAssertThrowsError(try MacIngressBatch.prepare(repeated, session: session)) { error in
            XCTAssertTrue("\(error)".contains("must be unique"), "\(error)")
        }
        var legacyInk = ingressPlan(session)
        if case .frame(var entry, let record) = legacyInk.entries[3], case .frame(let inked, _) = legacyInk.entries[2] {
            entry.inkOriginal = inked.inkOriginal
            legacyInk.entries[3] = .frame(entry, record: record)
        }
        XCTAssertThrowsError(try MacIngressBatch.prepare(legacyInk, session: session)) { error in
            XCTAssertTrue("\(error)".contains("cannot be described") && "\(error)".contains("no retained ink original"), "\(error)")
        }

        // A native gap becomes a frameless coverage record; one the session does not hold is refused.
        let gap = NativeGap(kind: "no_callbacks", firstCallback: nil, lastCallback: nil, fromHost: 104, toHost: 104.4, open: false)
        var withGap = RetainedSession(directory: session.directory, status: session.status, startedWallText: session.startedWallText,
                                      frames: session.frames, gaps: [gap], notes: session.notes)
        withGap.outcomes = session.outcomes
        withGap.captureFilter = session.captureFilter
        var gapPlan = ingressPlan(withGap)
        gapPlan.entries.append(.gap(gap, record: RecordIdentity(recordID: "synthetic-mac-gap-1", sequence: 200)))
        let gapped = try MacIngressBatch.prepare(gapPlan, session: withGap)
        let gapRecord = try XCTUnwrap(((try decodedObject(gapped.body))["batch"] as? [String: Any])?["records"] as? [[String: Any]]).last
        XCTAssertTrue(gapRecord?["frame_id"] is NSNull)
        XCTAssertEqual((gapRecord?["artifacts"] as? [Any])?.count, 0)
        XCTAssertEqual((gapRecord?["evidence"] as? [String: Any])?["coverage"] as? String, "unknown")
        XCTAssertTrue(gapped.unrepresented.contains { $0.hasPrefix("record synthetic-mac-gap-1: native gap no_callbacks") })
        XCTAssertThrowsError(try MacIngressBatch.prepare(gapPlan, session: session)) { error in
            XCTAssertTrue("\(error)".contains("not one of this session's retained gaps"), "\(error)")
        }
        // A gap-only batch still reports the session's facts.
        var gapOnly = gapPlan
        gapOnly.entries = [.gap(gap, record: RecordIdentity(recordID: "synthetic-mac-gap-1", sequence: 200))]
        let gapOnlyPrepared = try MacIngressBatch.prepare(gapOnly, session: withGap)
        XCTAssertTrue(gapOnlyPrepared.originals.isEmpty)
        XCTAssertTrue(gapOnlyPrepared.unrepresented.contains { $0.hasPrefix("capture_filter: ") })
        XCTAssertTrue(gapOnlyPrepared.unrepresented.contains { $0.hasPrefix("kept callbacks 1, 2, 3, 4, 5, 6, 7, 8 are not described") })
        XCTAssertTrue(gapOnlyPrepared.unrepresented.contains { $0.hasPrefix("record synthetic-mac-gap-1: native gap no_callbacks") })
        XCTAssertEqual(MacIngressUpload.pathSegment("synthetic:mac:raw-1"), "synthetic%3Amac%3Araw-1")
    }

    // MARK: - Uploading

    func testUploadsEveryOriginalThenTheExactBatch() async throws {
        let fixtureDirectory = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
        let output = fixtureDirectory ?? root.appending(path: "mac-upload", directoryHint: .isDirectory)
        guard !FileManager.default.fileExists(atPath: output.path(percentEncoded: false)) else {
            XCTFail("fixtures are written only to a new directory: \(output.path(percentEncoded: false))")
            return
        }
        let directory = try writeMacSession(root: output.appending(path: "native", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let plan = ingressPlan(session)
        let prepared = try MacIngressBatch.prepare(plan, session: session)
        let host = StandInHost()
        let result = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: host,
                                                   options: MacUploadOptions(attempts: 3, pause: 0))
        guard case .committed(let ack, let originals) = result else { return XCTFail("\(result)") }
        let expectedIDs = prepared.originals.map(\.binding.artifact.artifactID)
        XCTAssertEqual(originals, expectedIDs)
        XCTAssertEqual(ack.receipts.map(\.recordID), prepared.records.map(\.recordID))
        XCTAssertEqual(ack.receipts.map(\.disposition), Array(repeating: "accepted", count: 8))

        // Every original first, one by one, then the batch; exact headers and bytes.
        let sent = host.sent
        XCTAssertEqual(sent.map(\.method), Array(repeating: "PUT", count: 14) + ["POST"])
        let inkBytes = try Data(contentsOf: directory.appending(path: "ink/ink.json"))
        for (index, original) in prepared.originals.enumerated() {
            let put = sent[index]
            XCTAssertEqual(put.path, "/v2/process/originals/" + original.binding.artifact.artifactID)
            XCTAssertEqual(put.headers["Authorization"], "Bearer " + Self.uploadToken)
            XCTAssertEqual(put.headers["Content-Type"], "application/json; charset=utf-8")
            XCTAssertNil(put.headers["Idempotency-Key"])
            XCTAssertNil(put.headers["Origin"])
            let body = try decodedObject(put.body)
            XCTAssertEqual(Set(body.keys), ["contract_version", "source", "artifact", "kind", "data_base64"])
            XCTAssertEqual(body["contract_version"] as? String, "0.2.2")
            XCTAssertEqual(body["kind"] as? String, original.binding.kind)
            let bytes = try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(body["data_base64"] as? String)))
            XCTAssertEqual(bytes, try Data(contentsOf: directory.appending(path: original.file)), original.file)
            if original.binding.kind == "editable_ink" {
                XCTAssertNotEqual(bytes, inkBytes, "the mutable ink.json is never sent as the original")
            }
        }
        let post = try XCTUnwrap(sent.last)
        XCTAssertEqual(post.path, "/v2/process/macos-frames:batch")
        XCTAssertEqual(post.body, prepared.body, "the prepared bytes, unchanged")
        XCTAssertEqual(post.headers["Idempotency-Key"], prepared.idempotencyKey)
        XCTAssertEqual(post.headers["Authorization"], "Bearer " + Self.uploadToken)

        // UtcTimestamp verdicts for the checker to compare with the released validator.
        var corpus: [[String: Any]] = []
        for text in Self.utcCorpus() {
            corpus.append(["text": text, "swift_valid": MacIngressUpload.isUTCTimestamp(text)])
        }

        // Fixture: the session, the plan's identities and every exchanged byte.
        try FileManager.default.createDirectory(at: output.appending(path: "exchanges", directoryHint: .isDirectory),
                                                withIntermediateDirectories: true)
        var exchanges: [[String: Any]] = []
        let replies = host.replies
        XCTAssertEqual(replies.count, sent.count)
        XCTAssertEqual(replies.map { $0.status }, Array(repeating: 200, count: sent.count), "every reply of this transcript was 200")
        for (index, request) in sent.enumerated() {
            let requestFile = String(format: "exchanges/%02d-request.json", index)
            let replyFile = String(format: "exchanges/%02d-reply.json", index)
            try request.body.write(to: output.appending(path: requestFile), options: .withoutOverwriting)
            try (replies[index].body ?? Data()).write(to: output.appending(path: replyFile), options: .withoutOverwriting)
            var headers = request.headers
            headers["Authorization"] = headers["Authorization"] == "Bearer " + Self.uploadToken ? "Bearer <synthetic token>" : "<other>"
            exchanges.append(["method": request.method, "path": request.path, "headers": headers, "request_file": requestFile,
                              "status": replies[index].status, "reply_file": replyFile])
        }
        let planned: [[String: Any]] = prepared.originals.map { original in
            ["artifact_id": original.binding.artifact.artifactID, "kind": original.binding.kind, "file": original.file,
             "sha256": original.binding.artifact.sha256, "byte_length": original.binding.artifact.byteLength,
             "media_type": original.binding.artifact.mediaType]
        }
        // The plan's identities and key, as the caller supplied them (not the builder's output).
        let identities: [[String: Any]] = plan.entries.map { entry -> [String: Any] in
            switch entry {
            case .frame(_, let record), .gap(_, let record):
                return ["record_id": record.recordID, "sequence": record.sequence]
            }
        }
        let manifest: [String: Any] = [
            "generator": "DesktopCaptureTests.testUploadsEveryOriginalThenTheExactBatch",
            "synthetic": "synthetic session pixels, identities, authority and stand-in replies; real Swift recorder, composer, mapper, batch builder and uploader; in-process stand-in host, not HTTP or the Backend",
            "native_session": "native/\(session.status.session)",
            "user_id": macSource.userID, "idempotency_key": plan.idempotencyKey, "request_file": "request.json",
            "records": identities, "originals": planned, "exchanges": exchanges, "result": "committed",
            "committed_originals": originals, "utc_corpus": corpus,
        ]
        try prepared.body.write(to: output.appending(path: "request.json"), options: .withoutOverwriting)
        let data = try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys])
        try data.write(to: output.appending(path: "manifest.json"), options: .withoutOverwriting)
    }

    func testUnbelievedAnswersStayInDoubtAndResendTheSameBytes() async throws {
        let directory = try writeMacSession(root: root.appending(path: "doubt", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let prepared = try MacIngressBatch.prepare(ingressPlan(session), session: session)
        let authority = try uploadAuthority()
        let options = MacUploadOptions(attempts: 3, pause: 0)
        let putCount = prepared.originals.count

        func run(_ script: @escaping StandInHost.Script) async -> (MacIngressResult, [SentRequest]) {
            let host = StandInHost(script: script)
            let result = await MacIngressUpload.upload(prepared, authority: authority, transport: host, options: options)
            return (result, host.sent)
        }
        let userID = macSource.userID
        /// The honest ACK with one change.
        func alteredAck(_ change: (inout [String: Any]) -> Void) -> MacHTTPReply {
            var ack = Self.ackObject(prepared, userID: userID)
            change(&ack)
            return Self.json(200, ack)
        }

        // A receipt that does not correspond, then the exact one: committed, same bytes resent.
        let (wrongReceipt, wrongSent) = await run { sent, index in
            guard index == 0 else { return nil }
            var receipt = try JSONSerialization.jsonObject(with: sent.body) as? [String: Any] ?? [:]
            receipt["data_base64"] = nil
            receipt["status"] = "bytes_committed"
            receipt["kind"] = "editable_ink"
            return Self.json(200, receipt)
        }
        guard case .committed = wrongReceipt else { return XCTFail("\(wrongReceipt)") }
        XCTAssertEqual(wrongSent[0].body, wrongSent[1].body)
        XCTAssertEqual(wrongSent[0].path, wrongSent[1].path)

        // No answer for the batch, then an ACK: committed; the same bytes and key each time.
        let (timedOut, timedSent) = await run { _, index in
            if index == putCount { throw URLError(.timedOut) }
            return nil
        }
        guard case .committed = timedOut else { return XCTFail("\(timedOut)") }
        XCTAssertEqual(timedSent[putCount].body, timedSent[putCount + 1].body)
        XCTAssertEqual(timedSent[putCount].headers["Idempotency-Key"], timedSent[putCount + 1].headers["Idempotency-Key"])

        // ACKs that do not correspond stay in doubt after every attempt, never refused.
        let badAcks: [(String, (inout [String: Any]) -> Void)] = [
            ("a missing record", { ack in
                var acknowledged = ack["acknowledged"] as? [Any] ?? []
                acknowledged.removeLast()
                ack["acknowledged"] = acknowledged
            }),
            ("an impossible date", { ack in
                var acknowledged = ack["acknowledged"] as? [[String: Any]] ?? []
                acknowledged[0]["received_at"] = "2026-02-30T12:00:00Z"
                ack["acknowledged"] = acknowledged
            }),
            ("a pending artifact", { ack in
                var acknowledged = ack["acknowledged"] as? [[String: Any]] ?? []
                var artifacts = acknowledged[2]["artifacts"] as? [[String: Any]] ?? []
                artifacts[2]["status"] = "pending"
                acknowledged[2]["artifacts"] = artifacts
                ack["acknowledged"] = acknowledged
            }),
            ("another owner", { ack in ack["user_id"] = "someone-else" }),
            ("an extra member", { ack in ack["note"] = "extra" }),
            ("a record twice", { ack in
                var acknowledged = ack["acknowledged"] as? [Any] ?? []
                acknowledged[1] = acknowledged[0]
                ack["acknowledged"] = acknowledged
            }),
        ]
        for (name, change) in badAcks {
            let (result, sent) = await run { _, index in
                if index >= putCount { return alteredAck(change) }
                return nil
            }
            guard case .unknown(let stage, _, let status, _, let inDoubt, let originals) = result else {
                XCTFail("\(name): \(result)")
                continue
            }
            XCTAssertEqual([stage.rawValue, inDoubt], ["batch", "batch"], name)
            XCTAssertEqual(status, 200, name)
            XCTAssertEqual(originals.count, putCount, name)
            XCTAssertEqual(sent.count, putCount + 3, name)
            XCTAssertEqual(Set(sent.dropFirst(putCount).map(\.body)).count, 1, "\(name): the same bytes each time")
        }

        // Replies that are not believed: a redirect, an oversized reply, 503, a wrong error version,
        // a wrong retryable, a code not released for its status.
        let unbelieved: [(String, MacHTTPReply)] = [
            ("redirect", MacHTTPReply(status: 307, body: Data(), url: nil)),
            ("oversized", MacHTTPReply(status: 200, body: Data(repeating: 0x20, count: 70 * 1024), url: nil)),
            ("unavailable", Self.typed(503, "unavailable", version: "0.2.4")),
            ("batch version on a PUT", Self.typed(403, "forbidden", version: "0.2.12")),
            ("retryable forbidden", Self.typed(403, "forbidden", version: "0.2.4", retryable: true)),
            ("code for another status", Self.typed(403, "not_found", version: "0.2.4")),
            ("not JSON", MacHTTPReply(status: 500, body: Data("<html>".utf8), url: nil)),
        ]
        for (name, reply) in unbelieved {
            let (result, sent) = await run { _, index in index == 0 ? reply : nil }
            guard case .committed = result else {
                XCTFail("\(name) once, then the exact receipt: \(result)")
                continue
            }
            XCTAssertEqual(sent[0].body, sent[1].body, name)
            let (always, alwaysSent) = await run { _, index in index < 3 ? reply : nil }
            guard case .unknown(let stage, _, _, _, let inDoubt, let originals) = always else {
                XCTFail("\(name) every time: \(always)")
                continue
            }
            XCTAssertEqual(stage, .original, name)
            XCTAssertEqual(inDoubt, prepared.originals[0].binding.artifact.artifactID, name)
            XCTAssertEqual(originals, [], name)
            XCTAssertEqual(alwaysSent.count, 3, name)
        }

        // An exact receipt from another URL, or in UTF-16: neither is believed.
        let elsewhere = URL(string: "http://127.0.0.1:9/elsewhere")
        let alterations: [(String, @Sendable (MacHTTPReply) -> MacHTTPReply)] = [
            ("another URL", { reply in MacHTTPReply(status: 200, body: reply.body, url: elsewhere) }),
            ("UTF-16", { reply in
                MacHTTPReply(status: 200, body: String(decoding: reply.body ?? Data(), as: UTF8.self).data(using: .utf16LittleEndian),
                             url: nil)
            }),
        ]
        for (name, alter) in alterations {
            let (result, _) = await run { sent, index in
                guard index < 3 else { return nil }
                return alter(StandInHost().honest(sent))
            }
            guard case .unknown(.original, let reason, 200?, nil, _, []) = result else {
                XCTFail("\(name): \(result)")
                continue
            }
            if name == "another URL" {
                XCTAssertTrue(reason.contains("answered from another URL"), reason)
            }
        }

        // In doubt, then refused: still unknown.
        let (doubtThenRefused, _) = await run { _, index in
            if index == 0 { throw URLError(.networkConnectionLost) }
            return index == 1 ? Self.typed(403, "forbidden", version: "0.2.4") : nil
        }
        guard case .unknown(_, _, let status, let code, let inDoubt, _) = doubtThenRefused else {
            return XCTFail("\(doubtThenRefused)")
        }
        XCTAssertEqual([status.map(String.init), code, inDoubt], ["403", "forbidden", prepared.originals[0].binding.artifact.artifactID])
    }

    func testTypedRefusalsAndDependencies() async throws {
        let directory = try writeMacSession(root: root.appending(path: "refusals", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let prepared = try MacIngressBatch.prepare(ingressPlan(session), session: session)
        let authority = try uploadAuthority()
        let putCount = prepared.originals.count
        func run(_ script: @escaping StandInHost.Script) async -> (MacIngressResult, [SentRequest]) {
            let host = StandInHost(script: script)
            let result = await MacIngressUpload.upload(prepared, authority: authority, transport: host,
                                                       options: MacUploadOptions(attempts: 3, pause: 0))
            return (result, host.sent)
        }

        let (forbidden, forbiddenSent) = await run { _, _ in Self.typed(403, "forbidden", version: "0.2.4") }
        XCTAssertEqual(forbidden, .refused(stage: .original, reason: "\(prepared.originals[0].binding.artifact.artifactID) was refused",
                                           status: 403, code: "forbidden", originals: []))
        XCTAssertEqual(forbiddenSent.count, 1, "nothing more is sent")

        let (expiredToken, _) = await run { _, index in index == 2 ? Self.typed(401, "unauthenticated", version: "0.2.4") : nil }
        guard case .refused(.original, _, 401?, "unauthenticated"?, let committed) = expiredToken else {
            return XCTFail("\(expiredToken)")
        }
        XCTAssertEqual(committed.count, 2)

        for code in ["idempotency_conflict", "capture_stopped", "record_conflict", "stale_scope"] {
            let (result, sent) = await run { _, index in index == putCount ? Self.typed(409, code, version: "0.2.12") : nil }
            XCTAssertEqual(result, .refused(stage: .batch, reason: "batch was refused", status: 409, code: code,
                                            originals: prepared.originals.map(\.binding.artifact.artifactID)), code)
            XCTAssertEqual(sent.count, putCount + 1, code)
        }

        // A dependency the service lacks is not resent in this call, and is not a refusal.
        let (missing, missingSent) = await run { _, index in
            index == putCount ? Self.typed(409, "dependency_missing", version: "0.2.12") : nil
        }
        guard case .unknown(.batch, _, 409?, "dependency_missing"?, nil, _) = missing else { return XCTFail("\(missing)") }
        XCTAssertEqual(missingSent.count, putCount + 1)
        // The same code in the other route's version is not believed.
        let (wrongVersion, wrongVersionSent) = await run { _, index in
            index >= putCount ? Self.typed(409, "capture_stopped", version: "0.2.4") : nil
        }
        guard case .unknown(.batch, _, 409?, nil, "batch"?, _) = wrongVersion else { return XCTFail("\(wrongVersion)") }
        XCTAssertEqual(wrongVersionSent.count, putCount + 3)
    }

    func testStopCancellationAndExpiryPreventNewSends() async throws {
        let directory = try writeMacSession(root: root.appending(path: "stop", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let prepared = try MacIngressBatch.prepare(ingressPlan(session), session: session)
        let ids = prepared.originals.map(\.binding.artifact.artifactID)

        // Stop before anything: nothing is sent.
        let idle = StandInHost()
        let early = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: idle,
                                                  options: MacUploadOptions(pause: 0), shouldStop: { true })
        XCTAssertEqual(early, .cancelled(stage: .local, cause: .stopped, inDoubt: nil, originals: []))
        XCTAssertEqual(idle.sent.count, 0)

        // Stop after two receipts: nothing more is sent.
        let stopping = StandInHost()
        let stopped = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: stopping,
                                                    options: MacUploadOptions(pause: 0),
                                                    shouldStop: { stopping.sent.count >= 2 })
        XCTAssertEqual(stopped, .cancelled(stage: .original, cause: .stopped, inDoubt: nil, originals: Array(ids.prefix(2))))
        XCTAssertEqual(stopping.sent.count, 2)

        // Stop while a send is in doubt: cancelled with that send in doubt.
        let doubting = StandInHost { _, index in
            if index == 0 { throw URLError(.timedOut) }
            return nil
        }
        let stoppedInDoubt = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: doubting,
                                                           options: MacUploadOptions(pause: 0),
                                                           shouldStop: { doubting.sent.count >= 1 })
        XCTAssertEqual(stoppedInDoubt, .cancelled(stage: .original, cause: .stopped, inDoubt: ids[0], originals: []))

        // Task cancellation while the third upload is on its way: abandoned, in doubt, nothing after it.
        let started = expectation(description: "the third upload is on its way")
        let waiting = StandInHost { _, index in
            if index == 2 {
                started.fulfill()
                try await Task.sleep(nanoseconds: 60_000_000_000)
            }
            return nil
        }
        let authority = try uploadAuthority()
        let task = Task {
            await MacIngressUpload.upload(prepared, authority: authority, transport: waiting, options: MacUploadOptions(pause: 0))
        }
        await fulfillment(of: [started], timeout: 10)
        task.cancel()
        let cancelled = await task.value
        XCTAssertEqual(cancelled, .cancelled(stage: .original, cause: .taskCancelled, inDoubt: ids[2], originals: Array(ids.prefix(2))))
        XCTAssertEqual(waiting.sent.count, 3)

        // Expiry after three receipts: refused, or unknown when a send is in doubt.
        let clock = UploadClock()
        let expiring = StandInHost { _, index in
            if index == 2 { clock.advance(3600) }
            return nil
        }
        let expired = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(expires: clock.start.addingTimeInterval(60)),
                                                    transport: expiring, options: MacUploadOptions(pause: 0, now: { clock.now }))
        XCTAssertEqual(expired, .refused(stage: .original, reason: "the bearer has expired", status: nil, code: nil,
                                         originals: Array(ids.prefix(3))))
        XCTAssertEqual(expiring.sent.count, 3)
        let doubtClock = UploadClock()
        let expiringInDoubt = StandInHost { _, index in
            if index == 0 {
                doubtClock.advance(3600)
                throw URLError(.timedOut)
            }
            return nil
        }
        let expiredInDoubt = await MacIngressUpload.upload(
            prepared, authority: try uploadAuthority(expires: doubtClock.start.addingTimeInterval(60)), transport: expiringInDoubt,
            options: MacUploadOptions(pause: 0, now: { doubtClock.now }))
        guard case .unknown(.original, _, nil, nil, let inDoubt, let originals) = expiredInDoubt else {
            return XCTFail("\(expiredInDoubt)")
        }
        XCTAssertEqual(inDoubt, ids[0])
        XCTAssertEqual(originals, [])
    }

    /// A settable clock for expiry.
    final class UploadClock: @unchecked Sendable {
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        private let lock = NSLock()
        private var offset: TimeInterval = 0
        var now: Date { lock.withLock { start.addingTimeInterval(offset) } }
        func advance(_ seconds: TimeInterval) { lock.withLock { offset += seconds } }
    }

    func testLocalRefusalsSendNothing() async throws {
        // Only numeric IPv4 loopback on an explicit port other than 80, and a host-shaped token.
        let refusedOrigins = [
            "http://localhost:48123", "https://127.0.0.1:48123", "http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:0",
            "http://127.0.0.1:65536", "http://[::1]:48123", "http://127.0.0.1:48123/v2", "http://127.0.0.1:48123?x=1",
            "http://user@127.0.0.1:48123", "http://127.0.0.1:048123", "http://0x7f.0.0.1:48123", "http://127.0.0.1:48123#x",
            "HTTP://127.0.0.1:48123", "http://127.0.0.1:48123//",
        ]
        for origin in refusedOrigins {
            XCTAssertThrowsError(try MacIngressAuthority(origin: origin, token: Self.uploadToken, expiresAt: .distantFuture,
                                                         userID: macSource.userID, incarnation: macIncarnation), origin)
        }
        XCTAssertEqual(try MacIngressAuthority(origin: Self.uploadOrigin + "/", token: Self.uploadToken, expiresAt: .distantFuture,
                                               userID: macSource.userID, incarnation: macIncarnation).origin, Self.uploadOrigin)
        for token in [String(repeating: "a", count: 31), "Bearer " + Self.uploadToken, Self.uploadToken + "=a",
                      String(repeating: "b", count: 4097), Self.uploadToken + "\n"] {
            XCTAssertThrowsError(try MacIngressAuthority(origin: Self.uploadOrigin, token: token, expiresAt: .distantFuture,
                                                         userID: macSource.userID, incarnation: macIncarnation))
        }
        XCTAssertNoThrow(try MacIngressAuthority(origin: Self.uploadOrigin, token: String(repeating: "a", count: 32) + "==",
                                                 expiresAt: .distantFuture, userID: macSource.userID, incarnation: macIncarnation))
        // The token never appears in a description, a mirror or a dump.
        let authority = try uploadAuthority()
        var dumped = ""
        dump(authority, to: &dumped)
        for text in [String(describing: authority), String(reflecting: authority), dumped] {
            XCTAssertFalse(text.contains(Self.uploadToken), text)
        }

        let directory = try writeMacSession(root: root.appending(path: "local", directoryHint: .isDirectory))
        func refusal(_ copyName: String?, authority: MacIngressAuthority? = nil,
                     change: (URL, PreparedMacBatch) throws -> Void = { _, _ in }) async throws -> (MacIngressResult, Int) {
            let sessionDirectory = try copyName.map { try sessionCopy(directory, $0) } ?? directory
            let session = try RetainedSession.read(sessionDirectory)
            let prepared = try MacIngressBatch.prepare(ingressPlan(session), session: session)
            try change(sessionDirectory, prepared)
            let host = StandInHost()
            let result = await MacIngressUpload.upload(prepared, authority: try authority ?? uploadAuthority(), transport: host,
                                                       options: MacUploadOptions(pause: 0))
            return (result, host.sent.count)
        }
        func reason(_ result: MacIngressResult) -> String {
            if case .refused(.local, let reason, nil, nil, []) = result { return reason }
            return "not a local refusal: \(result)"
        }

        let (expired, expiredSent) = try await refusal(nil, authority: try uploadAuthority(expires: Date(timeIntervalSinceNow: -1)))
        XCTAssertEqual([reason(expired), String(expiredSent)], ["the bearer has expired", "0"])
        let stranger = try MacIngressAuthority(origin: Self.uploadOrigin, token: Self.uploadToken, expiresAt: .distantFuture,
                                               userID: "someone-else", incarnation: macIncarnation)
        let (foreign, foreignSent) = try await refusal(nil, authority: stranger)
        XCTAssertEqual([reason(foreign), String(foreignSent)], ["the authority's user is not the batch source's owner", "0"])
        let otherStream = try MacIngressAuthority(
            origin: Self.uploadOrigin, token: Self.uploadToken, expiresAt: .distantFuture, userID: macSource.userID,
            incarnation: CaptureIncarnation(deviceID: macIncarnation.deviceID, sessionID: macIncarnation.sessionID, streamID: "another-stream"))
        let (restarted, restartedSent) = try await refusal(nil, authority: otherStream)
        XCTAssertEqual([reason(restarted), String(restartedSent)], ["the authority is for another capture incarnation", "0"])

        // Changed, missing, linked or FIFO originals: refused before anything is sent.
        let (changed, changedSent) = try await refusal("changed") { copy, _ in
            let url = copy.appending(path: "composed/00000004.png")
            var bytes = try Data(contentsOf: url)
            bytes[bytes.count - 1] ^= 1
            try bytes.write(to: url)
        }
        XCTAssertTrue(reason(changed).contains("composed/00000004.png no longer has the recorded SHA-256"), reason(changed))
        XCTAssertEqual(changedSent, 0)
        let (missing, missingSent) = try await refusal("missing") { copy, prepared in
            let ink = try XCTUnwrap(prepared.originals.first { $0.binding.kind == "editable_ink" })
            try FileManager.default.removeItem(at: copy.appending(path: ink.file))
        }
        XCTAssertTrue(reason(missing).contains("is not a regular file inside the session"), reason(missing))
        XCTAssertEqual(missingSent, 0)
        let (linked, linkedSent) = try await refusal("linked") { copy, _ in
            let url = copy.appending(path: "frames/00000001.png")
            let outside = copy.deletingLastPathComponent().appending(path: "linked-outside.png")
            try FileManager.default.copyItem(at: url, to: outside)
            try FileManager.default.removeItem(at: url)
            try FileManager.default.createSymbolicLink(at: url, withDestinationURL: outside)
        }
        XCTAssertTrue(reason(linked).contains("frames/00000001.png is not a regular file inside the session"), reason(linked))
        XCTAssertEqual(linkedSent, 0)
        let (fifo, fifoSent) = try await refusal("fifo") { copy, _ in
            let url = copy.appending(path: "composed/00000003.png")
            try FileManager.default.removeItem(at: url)
            XCTAssertEqual(mkfifo(url.path(percentEncoded: false), 0o600), 0)
        }
        XCTAssertTrue(reason(fifo).contains("composed/00000003.png is not a regular file"), reason(fifo))
        XCTAssertEqual(fifoSent, 0)

        // A file changed after the check and before its upload: never sent under its ID.
        let lateDirectory = try sessionCopy(directory, "late")
        let lateSession = try RetainedSession.read(lateDirectory)
        let latePrepared = try MacIngressBatch.prepare(ingressPlan(lateSession), session: lateSession)
        let lateFile = latePrepared.originals[1].file
        let lateHost = StandInHost { _, index in
            if index == 0 {
                let url = lateDirectory.appending(path: lateFile)
                var bytes = try Data(contentsOf: url)
                bytes[bytes.count - 1] ^= 1
                try bytes.write(to: url)
            }
            return nil
        }
        let late = await MacIngressUpload.upload(latePrepared, authority: try uploadAuthority(), transport: lateHost,
                                                 options: MacUploadOptions(pause: 0))
        guard case .refused(.original, let lateReason, nil, nil, let lateOriginals) = late else { return XCTFail("\(late)") }
        XCTAssertTrue(lateReason.contains("no longer has the recorded SHA-256"), lateReason)
        XCTAssertEqual(lateOriginals, [latePrepared.originals[0].binding.artifact.artifactID])
        XCTAssertEqual(lateHost.sent.count, 1)
    }

    // MARK: - URLSession transport

    func testLoopbackTransportSendsExactHeadersAndNeverFollowsRedirects() async throws {
        let directory = try writeMacSession(root: root.appending(path: "transport", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let prepared = try MacIngressBatch.prepare(ingressPlan(session), session: session)
        let configuration = LoopbackHTTPTransport.configuration(requestTimeout: 10, resourceTimeout: 30)
        configuration.protocolClasses = [LoopbackStandIn.self]
        let transport = LoopbackHTTPTransport(configuration: configuration)
        let honest = StandInHost()
        LoopbackStandIn.reset { sent in honest.honest(sent) }

        let result = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: transport,
                                                   options: MacUploadOptions(pause: 0))
        guard case .committed = result else { return XCTFail("\(result)") }
        let seen = LoopbackStandIn.seen
        XCTAssertEqual(seen.count, prepared.originals.count + 1)
        for request in seen {
            XCTAssertEqual(request.headers["Authorization"], "Bearer " + Self.uploadToken, "the bearer reaches the loading system")
            XCTAssertEqual(request.headers["Content-Type"], "application/json; charset=utf-8")
            XCTAssertNil(request.headers["Origin"])
            XCTAssertNil(request.headers["Cookie"])
        }
        XCTAssertEqual(seen.last?.body, prepared.body)
        XCTAssertEqual(seen.last?.headers["Idempotency-Key"], prepared.idempotencyKey)

        // A redirect is an answer, never followed; an oversized reply is not read past its limit.
        LoopbackStandIn.reset { _ in
            MacHTTPReply(status: 307, body: Data("{}".utf8), url: URL(string: "http://127.0.0.1:9/elsewhere"))
        }
        let redirected = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: transport,
                                                       options: MacUploadOptions(attempts: 1, pause: 0))
        guard case .unknown(.original, let redirectReason, 307?, nil, _, []) = redirected else { return XCTFail("\(redirected)") }
        XCTAssertTrue(redirectReason.contains("redirect 307"), redirectReason)
        XCTAssertEqual(LoopbackStandIn.seen.map(\.path), ["/v2/process/originals/" + prepared.originals[0].binding.artifact.artifactID])
        LoopbackStandIn.reset { _ in MacHTTPReply(status: 200, body: Data(repeating: 0x20, count: 100_000), url: nil) }
        let oversized = await MacIngressUpload.upload(prepared, authority: try uploadAuthority(), transport: transport,
                                                      options: MacUploadOptions(attempts: 1, pause: 0))
        guard case .unknown(.original, let oversizedReason, 200?, nil, _, []) = oversized else { return XCTFail("\(oversized)") }
        XCTAssertTrue(oversizedReason.contains("more than the expected reply length"), oversizedReason)

        // The transport's session has the delegate that refuses every redirect it is asked about.
        XCTAssertTrue(transport.session.delegate is RedirectRefusal)
        let probe = URLSession(configuration: .ephemeral)
        let task = probe.dataTask(with: URL(string: "http://127.0.0.1:9/")!)
        let response = try XCTUnwrap(HTTPURLResponse(url: URL(string: "http://127.0.0.1:9/")!, statusCode: 307, httpVersion: "HTTP/1.1",
                                                     headerFields: ["Location": "http://example.invalid/"]))
        let followed = await RedirectRefusal().urlSession(probe, task: task, willPerformHTTPRedirection: response,
                                                          newRequest: URLRequest(url: URL(string: "http://example.invalid/")!))
        XCTAssertNil(followed)
        probe.invalidateAndCancel()
    }

    // MARK: - UtcTimestamp

    func testUTCTimestampsFollowTheReleasedRule() {
        let valid = ["2026-09-30T12:00:00Z", "2026-09-30T12:00:00.123456Z", "2026-09-30t12:00:00Z", "2024-02-29T00:00:00Z",
                     "2000-02-29T23:59:59Z", "0001-01-01T00:00:00Z", "2026-09-30T12:00:00.1234567890123Z"]
        let invalid = ["2026-09-30T12:00:00z", "2026-02-30T12:00:00Z", "2100-02-29T00:00:00Z", "0000-01-01T00:00:00Z",
                       "2026-09-30T24:00:00Z", "2026-09-30T23:59:60Z", "2026-09-30T12:00:00.Z", "2026-09-30T12:00:00+00:00",
                       "2026-09-30T12:00:00Z\n", " 2026-09-30T12:00:00Z", "2026-9-30T12:00:00Z", "2026-09-30 12:00:00Z",
                       "２０２６-09-30T12:00:00Z", "2026-13-01T00:00:00Z", "2026-00-10T00:00:00Z", ""]
        for text in valid {
            XCTAssertTrue(MacIngressUpload.isUTCTimestamp(text), text)
        }
        for text in invalid {
            XCTAssertFalse(MacIngressUpload.isUTCTimestamp(text), text)
        }
    }

    /// Timestamps for the checker to compare with the released UtcTimestamp validator.
    static func utcCorpus() -> [String] {
        let years: [String] = ["0000", "0001", "1900", "2000", "2024", "2100", "2026", "9999"]
        let months: [String] = ["00", "01", "02", "04", "12", "13"]
        let days: [String] = ["00", "01", "28", "29", "30", "31", "32"]
        let times: [String] = ["00:00:00", "23:59:59", "24:00:00", "12:60:00", "12:00:60"]
        let fractions: [String] = ["", ".5", ".", ".123456789012"]
        let endings: [String] = ["Z", "z", "+00:00"]
        let separators: [String] = ["T", "t"]
        var corpus: [String] = []
        for year in years {
            for month in months {
                for day in days {
                    for time in times {
                        for fraction in fractions {
                            for ending in endings {
                                for separator in separators {
                                    let date: String = year + "-" + month + "-" + day
                                    let clock: String = separator + time + fraction + ending
                                    corpus.append(date + clock)
                                }
                            }
                        }
                    }
                }
            }
        }
        return corpus
    }
}

/// Serves the loading system's requests from a handler, recording what reached it.
final class LoopbackStandIn: URLProtocol {
    nonisolated(unsafe) static var handler: (@Sendable (DesktopCaptureTests.SentRequest) -> MacHTTPReply)?
    nonisolated(unsafe) static var requests: [DesktopCaptureTests.SentRequest] = []
    static let lock = NSLock()

    static func reset(_ handler: @escaping @Sendable (DesktopCaptureTests.SentRequest) -> MacHTTPReply) {
        lock.withLock {
            self.handler = handler
            requests = []
        }
    }

    static var seen: [DesktopCaptureTests.SentRequest] { lock.withLock { requests } }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host() == "127.0.0.1"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        var body = request.httpBody ?? Data()
        if body.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            var buffer = [UInt8](repeating: 0, count: 65_536)
            while true {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                body.append(buffer, count: count)
            }
            stream.close()
        }
        let sent = DesktopCaptureTests.SentRequest(method: request.httpMethod ?? "", path: request.url?.path(percentEncoded: true) ?? "",
                                                   headers: request.allHTTPHeaderFields ?? [:], body: body)
        let handler: (@Sendable (DesktopCaptureTests.SentRequest) -> MacHTTPReply)? = Self.lock.withLock {
            Self.requests.append(sent)
            return Self.handler
        }
        guard let url = request.url, let reply = handler?(sent),
              let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1",
                                             headerFields: ["Content-Type": "application/json"]) else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reply.body ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
