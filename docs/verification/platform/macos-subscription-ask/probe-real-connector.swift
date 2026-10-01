import Foundation
import XCTest
// LINUX-HARNESS-ONLY PROBE (not a committed test): the actual services.worker.connectors.chatgpt_local
// of main fca2a25, launched by the production ProcessAskLauncher under the production AskLink.
// `codex_bin` is a stub script, so the connector's launch gate does not admit it: no Codex runs,
// no sign-in is started, nothing is asked, and no product state is created.
extension DesktopCaptureTests {
    func testProbeRealConnector() async throws {
        let directory = root.appending(path: "connector-probe", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let stub = directory.appending(path: "not-codex")
        try Data("#!/bin/sh\nexit 1\n".utf8).write(to: stub)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: stub.path(percentEncoded: false))
        let state = directory.appending(path: "state", directoryHint: .isDirectory)
        let file = directory.appending(path: "ask-connector.json")
        try JSONSerialization.data(withJSONObject: [
            "format": "lc-macos-dev-ask-connector/v1", "python": "/usr/bin/python3", "repository": "/tmp/lc-connector-fca2a25",
            "state_dir": state.path(percentEncoded: false), "codex_bin": stub.path(percentEncoded: false),
        ]).write(to: file)
        let config = AskConnectorConfig.load(file)
        guard case .success = config else { return XCTFail("configuration refused: \(config)") }
        let log = AskLog()
        let link = AskLink(config: config, launcher: ProcessAskLauncher(), callTimeout: 20)
        await link.setStatusHandler { log.add($0) }
        for round in 1...2 {
            let began = Date()
            await link.connect()
            let status = await link.currentStatus()
            print("PROBE round=\(round) connection=\(status.connection.rawValue) summary=\(status.summaryLine) "
                  + "detail=\(status.detail ?? "nil") seconds=\(String(format: "%.2f", Date().timeIntervalSince(began)))")
            XCTAssertEqual(status.connection, .refused)
            XCTAssertEqual(status.detail, "the connector is unavailable")
            // The connector ends by itself after that answer; the status stays what it said.
            try await Task.sleep(nanoseconds: 1_500_000_000)
            let later = await link.currentStatus()
            print("PROBE round=\(round) after-exit connection=\(later.connection.rawValue) detail=\(later.detail ?? "nil")")
            XCTAssertEqual(later.connection, .refused)
        }
        let page = await link.startLogin()
        let afterLogin = await link.currentStatus()
        print("PROBE sign-in page=\(page == nil ? "nil" : "non-nil") detail=\(afterLogin.detail ?? "nil") pending=\(afterLogin.loginPending)")
        XCTAssertNil(page)
        let fixture = try askFixture("connector-probe-ask")
        await link.open(fixture.input)
        await link.submit(question: "Why?", assistance: .hint)
        let card = try await askCard(link)
        print("PROBE card phase=\(card.phase.rawValue) detail=\(card.detail ?? "nil")")
        XCTAssertEqual(card.detail, "not sent: ChatGPT is not connected and signed in")
        let asks = try files(in: fixture.session.appending(path: "asks"))
        print("PROBE asks files=\(asks.map { $0.hasSuffix(".png") ? "<card>.png" : $0.hasSuffix(".ink.json") ? "<card>.ink.json" : $0 })")
        XCTAssertFalse(asks.contains { $0.hasSuffix(".request.json") })
        await link.shutdown()
        print("PROBE state directory created=\(FileManager.default.fileExists(atPath: state.path(percentEncoded: false))) "
              + "statuses=\(log.all.map(\.connection.rawValue))")
        XCTAssertFalse(FileManager.default.fileExists(atPath: state.path(percentEncoded: false)))
    }
}

// LINUX-HARNESS-ONLY PROBE (not a committed test): the released request validator and answer
// binder of main fca2a25 (services.learning.subscription_ask), run over the requests Swift makes,
// and the app's own answer check run over what the released binder returns. The PNG of each
// request is replaced by a real PNG first, because the Linux stubs do not write real PNG files
// (askcheck/linux_real_png_fixture.py); every other field is exactly as Swift wrote it.
extension DesktopCaptureTests {
    func testProbeRealValidatorRoundTrip() async throws {
        let directory = root.appending(path: "validator-probe", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let stub = directory.appending(path: "stub", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: stub, withIntermediateDirectories: true)
        let lines = try askStartLines()
        try lines.map(\.line).reduce(Data(), +).write(to: stub.appending(path: "ask-start.jsonl"))
        let real = directory.appending(path: "real", directoryHint: .isDirectory)
        let results = directory.appending(path: "results.jsonl")
        func run(_ arguments: [String]) throws -> (Int32, String) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python")
            process.arguments = arguments
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe
            try process.run()
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return (process.terminationStatus, String(decoding: output, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
        }
        let converted = try run(["/tmp/lc-link-run/askcheck/linux_real_png_fixture.py", stub.path(percentEncoded: false),
                                 real.path(percentEncoded: false)])
        print("PROBE convert exit=\(converted.0) \(converted.1)")
        XCTAssertEqual(converted.0, 0)
        let checked = try run(["/tmp/lc-connector-fca2a25/apps/macos/CompanionDesktop/checks/validate_ask_request.py",
                               real.path(percentEncoded: false), results.path(percentEncoded: false)])
        print("PROBE released validator exit=\(checked.0) \(checked.1)")
        XCTAssertEqual(checked.0, 0)
        let bound = try String(contentsOf: results, encoding: .utf8).split(separator: "\n").map { try decodedObject(Data($0.utf8)) }
        XCTAssertEqual(bound.count, lines.count)
        for (index, result) in bound.enumerated() {
            var request = lines[index].request
            // As sent by Swift, the request names another image than the substituted one: refused.
            let asSent = AskAnswer.parse(result, request: request)
            // With only the substituted image's hash, everything the released binder returns
            // equals the request in full.
            let provenance = try XCTUnwrap(result["provenance"] as? [String: Any])
            request.imageSHA256 = try XCTUnwrap((provenance["image"] as? [String: Any])?["sha256"] as? String)
            let answer = AskAnswer.parse(result, request: request)
            var other = result
            other["kind"] = "source"
            print("PROBE answer \(request.requestID): accepted=\(answer != nil) text=\(answer?.text ?? "nil") "
                  + "model=\(answer?.model ?? "nil") latency=\(answer?.latencyMS.map(String.init) ?? "nil") "
                  + "refusedWithTheOtherImageHash=\(asSent == nil) refusedWithAnotherKind=\(AskAnswer.parse(other, request: request) == nil)")
            XCTAssertNotNil(answer)
            XCTAssertNil(asSent)
        }
    }
}

// LINUX-HARNESS-ONLY PROBE (not a committed test), for MAC-SUB-LIB-01: this worktree's real
// connector stream code (main fca2a25, with a stand-in client instead of Codex:
// askcheck/real_bridge_fake_client.py) under the production ProcessAskLauncher and AskLink. The
// connector is stopped (SIGSTOP) while a large selection is submitted, so the request is in the
// pipe part way; then Cancel or Stop; then it runs again. What it was given is read from its log.
extension DesktopCaptureTests {
    func testProbeCutOffRequestAndTheRealConnectorStream() async throws {
        let directory = root.appending(path: "cutoff-real", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory.appending(path: "repo/services/worker/connectors"), withIntermediateDirectories: true)
        try Data().write(to: directory.appending(path: "repo/services/worker/connectors/chatgpt_local.py"))
        let pidFile = directory.appending(path: "pid")
        let log = directory.appending(path: "connector.log")
        let python = directory.appending(path: "python-real")
        try Data("""
        #!/bin/sh
        echo $$ > '\(pidFile.path(percentEncoded: false))'
        LC_PROBE_LOG='\(log.path(percentEncoded: false))' PYTHONDONTWRITEBYTECODE=1 exec /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -B /tmp/lc-link-run/askcheck/real_bridge_fake_client.py

        """.utf8).write(to: python)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: python.path(percentEncoded: false))
        let config = AskConnectorConfig(python: python, repository: directory.appending(path: "repo", directoryHint: .isDirectory))
        func connectorLog() -> [String] {
            ((try? String(contentsOf: log, encoding: .utf8)) ?? "").split(separator: "\n").map(String.init)
        }
        for (round, action) in ["cancel", "stop", "cancel after delivery"].enumerated() {
            try? FileManager.default.removeItem(at: log)
            let link = AskLink(config: .success(config), launcher: ProcessAskLauncher(sendTimeout: 20, endGrace: 5), callTimeout: 10, askTimeout: 5)
            await link.connect()
            let connected = await link.currentStatus()
            XCTAssertEqual(connected.connection, .signedIn, action)
            let pid = pid_t(Int32((try String(contentsOf: pidFile, encoding: .utf8)).trimmingCharacters(in: .whitespacesAndNewlines))!)
            let fixture = try askFixture("cutoff-real-\(round)", large: true)
            await link.open(fixture.input)
            let card = try await askCard(link, action)
            let held = round < 2
            // The connector does not read for a while, as a busy one would not.
            if held { kill(pid, SIGSTOP) }
            let asking = Task { await link.submit(question: "Why?", assistance: .hint) }
            let sending = await until(5) { await link.currentStatus().card?.phase != .ready }
            XCTAssertTrue(sending, action)
            try await Task.sleep(nanoseconds: 800_000_000)
            if action == "stop" { await link.sessionStopped(card.captureSessionID) } else { await link.cancelCard() }
            let fenced = await link.currentStatus()
            if held { kill(pid, SIGCONT) }
            await asking.value
            if held {
                let lost = await until(15) { await link.currentStatus().connection == .disconnected }
                XCTAssertTrue(lost, action)
            } else {
                try await Task.sleep(nanoseconds: 500_000_000)
            }
            let after = await link.currentStatus()
            let lines = connectorLog()
            let record = (try? askRecord(fixture.session, card.cardID + "-q1.response.json")) ?? [:]
            print("PROBE [\(action)] card after the local \(action): \(fenced.card?.phase.rawValue ?? "none") | \(fenced.card?.detail ?? "nil")")
            print("PROBE [\(action)] connection afterwards: \(after.connection.rawValue) | \(after.detail ?? "nil")")
            print("PROBE [\(action)] record: outcome=\(record["outcome"] ?? "nil") delivered_to_connector=\(record["delivered_to_connector"] ?? "nil") interruption_uncertain=\(record["interruption_uncertain"] ?? "nil") code=\(record["code"] ?? "nil")")
            print("PROBE [\(action)] connector log: " + lines.joined(separator: " ; "))
            let handledAsk = lines.contains("handled method=ask/start")
            if held {
                XCTAssertFalse(handledAsk, "\(action): the connector acted on a request after the local \(action)")
                XCTAssertTrue(lines.contains { $0.hasPrefix("line bytes=") && $0.hasSuffix("newline=False") }, "\(action): it was given the part, without its newline")
                XCTAssertFalse(lines.contains("handled method=ask/cancel") || lines.contains("handled method=session/stop"), action)
                XCTAssertEqual(record["delivered_to_connector"] as? Bool, false, action)
                XCTAssertTrue(after.detail?.hasPrefix("the connector was ended, because a cancelled question had been written to it in part") == true, action)
            } else {
                XCTAssertTrue(handledAsk, "the control: a request that was delivered is handled")
            }
            await link.shutdown()
        }
    }
}
