import Foundation
import XCTest
// LINUX-HARNESS-ONLY PROBE (not a committed test): the actual services.worker.connectors.chatgpt_local
// of main cd9b0ef, launched by the production ProcessAskLauncher under the production AskLink.
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
            "format": "lc-macos-dev-ask-connector/v1", "python": "/usr/bin/python3", "repository": "/tmp/lc-connector-cd9b0ef",
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
// binder of main cd9b0ef (services.learning.subscription_ask), run over the requests Swift makes,
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
        let checked = try run(["/tmp/lc-connector-cd9b0ef/apps/macos/CompanionDesktop/checks/validate_ask_request.py",
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
