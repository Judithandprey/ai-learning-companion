import Foundation
import XCTest
// LINUX-HARNESS-ONLY PROBE (not a committed test): the production LiveLink and ProcessAskLauncher
// against the real connector code of this worktree (chatgpt_local main/_Pipes/run_stream,
// chatgpt_live LiveSubscriptionBridge, services.learning.live_session, the released contract),
// started as a real child process with real pipes. Only the connector's inner client is a stand-in
// (livecheck/real_live_stand_in.py): no Codex, no sign-in, no account, no model, no network.
extension DesktopCaptureTests {
    func testProbeRealLiveConnector() async throws {
        let directory = root.appending(path: "live-connector-probe", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let wrapper = directory.appending(path: "python-stand-in")
        try Data("""
        #!/bin/sh
        LC_PROBE_DIR='\(directory.path(percentEncoded: false))' exec /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/lc-link-run/livecheck/real_live_stand_in.py

        """.utf8).write(to: wrapper)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: wrapper.path(percentEncoded: false))
        func mode(_ text: String) throws { try Data(text.utf8).write(to: directory.appending(path: "mode")) }
        func log() -> [String] {
            ((try? String(contentsOf: directory.appending(path: "log"), encoding: .utf8)) ?? "").split(separator: "\n").map(String.init)
        }
        let config = AskConnectorConfig(python: wrapper, repository: URL(fileURLWithPath: "/home/agentsdock/Projects/learning-companion/wt-platform"))
        let clock = LiveClock(1_000)
        let link = LiveLink(config: .success(config), launcher: ProcessAskLauncher(sendTimeout: 10, endGrace: 8, maxIncomingLine: LiveWire.maxIncomingLine),
                            callTimeout: 20, turnTimeout: 60, changeInterval: 0, clock: { clock.now })
        let stand = try liveStand("live-connector-probe-capture")
        let first = try liveKeep(stand, host: 100.3)

        try mode("answer")
        await link.connect()
        var status = await link.currentStatus()
        print("PROBE connection=\(status.connection.rawValue) plan=\(status.plan ?? "nil") models=\(status.usableModels.map(\.id))")
        print("PROBE usage=\(status.quota?.lines(readAt: "<read time>") ?? [])")
        XCTAssertEqual(status.connection, .signedIn)

        // 12 requests: the real connector keeps the last 3 for the user's own.
        let policy = LivePolicy(maxSubmissions: 12, maxSessionMS: 120_000, minObservationIntervalMS: 500)
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        status = await link.currentStatus()
        print("PROBE start state=\(status.session.state) used=\(status.session.used)")
        XCTAssertEqual(status.session.state, .on)

        // A look, a selection, a follow-up on the unchanged picture.
        await link.offer(liveInput(stand, first))
        status = await link.currentStatus()
        print("PROBE look-1 used=\(status.session.used) seenFrame=\(status.session.seenFrame ?? -1) missed=\(status.session.missed ?? "nil") card=\(status.card == nil ? "none" : "SHOWN")")
        XCTAssertEqual([status.session.used, status.session.seenFrame ?? -1], [1, 1])
        XCTAssertNil(status.card)
        let selection = try liveSelect(stand, on: first, from: (20.3, 5.7), to: (60, 25.2), host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        var card = try await liveCard(link)
        print("PROBE focus phase=\(card.phase.rawValue) answer=\(card.answer ?? "nil") detail=\(card.detail ?? "nil") focus=\(card.focus.rawValue)")
        XCTAssertEqual(card.phase, .answered)
        await link.answerShown(try XCTUnwrap(card.requestID))
        await link.followUp("Why is this step valid?", assistance: .explain, fresh: liveInput(stand, first))
        card = try await liveCard(link)
        print("PROBE follow-up-same-picture phase=\(card.phase.rawValue) detail=\(card.detail ?? "nil") focus=\(card.focus.rawValue)")
        XCTAssertEqual([card.phase, card.focus == .onThisPicture ? .answered : .refused], [.answered, .answered])

        // The screen changes and new ink is drawn; a look, then a follow-up that names the earlier focus.
        let second = try liveKeep(stand, host: 106, shade: 90)
        liveDraw(stand, on: second, y: 30, host: 107)
        clock.advance(1)
        try await Task.sleep(nanoseconds: 600_000_000)
        await link.offer(liveInput(stand, second))
        status = await link.currentStatus()
        print("PROBE look-2 used=\(status.session.used) seenFrame=\(status.session.seenFrame ?? -1) missed=\(status.session.missed ?? "nil")")
        XCTAssertEqual(status.session.used, 4)
        await link.followUp("And now?", assistance: .fullSolution, fresh: liveInput(stand, second))
        card = try await liveCard(link)
        print("PROBE follow-up-later-picture phase=\(card.phase.rawValue) detail=\(card.detail ?? "nil") focus=\(card.focus.rawValue)")
        XCTAssertEqual([card.phase, card.focus == .onAnEarlierPicture ? .answered : .refused], [.answered, .answered])

        // A request in flight is cancelled: the real connector interrupts it and the session goes on.
        try mode("hold")
        let again = try liveSelect(stand, on: second, from: (5, 5), to: (30, 30), host: 110)
        let asking = Task { [link] in await link.selected(again.input, rect: again.rect, selectionID: again.id) }
        let inFlight = await until(10) { log().filter { $0.hasPrefix("client.ask") }.count == 6 }
        XCTAssertTrue(inFlight)
        await link.cancelCard()
        await asking.value
        card = try await liveCard(link)
        status = await link.currentStatus()
        let cancelledID = try XCTUnwrap(card.requestID)
        _ = await until(5) { (try? self.liveRecord(stand.session, cancelledID + ".interrupt.json")) != nil }
        let response = try liveRecord(stand.session, cancelledID + ".response.json")
        let interrupt = try liveRecord(stand.session, cancelledID + ".interrupt.json")
        print("PROBE cancel phase=\(card.phase.rawValue) detail=\(card.detail ?? "nil") session=\(status.session.state) used=\(status.session.used) "
              + "connector_answer=\(response["connector_answer"] ?? "nil") interrupt=\(interrupt["connector_reply"] ?? "nil")")
        XCTAssertEqual(card.phase, .cancelled)
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(status.session.used, 6)

        // A new selection while a look is in flight: the real connector replaces the look.
        let third = try liveKeep(stand, host: 112, shade: 70)
        clock.advance(1)
        try await Task.sleep(nanoseconds: 600_000_000)
        let looking = Task { [link, stand] in await link.offer(self.liveInput(stand, third)) }
        let lookFlying = await until(10) { log().filter { $0.hasPrefix("client.ask") }.count == 7 }
        XCTAssertTrue(lookFlying)
        try mode("answer")
        let over = try liveSelect(stand, on: third, from: (40, 10), to: (80, 40), host: 114)
        await link.selected(over.input, rect: over.rect, selectionID: over.id)
        await looking.value
        card = try await liveCard(link)
        status = await link.currentStatus()
        print("PROBE focus-over-look phase=\(card.phase.rawValue) detail=\(card.detail ?? "nil") session=\(status.session.state) used=\(status.session.used) missed=\(status.session.missed ?? "nil")")
        XCTAssertEqual(card.phase, .answered)
        XCTAssertEqual(status.session.state, .on)

        // An account refusal after the request went out: fixed words, the session is over, nothing is sent again.
        try mode("fail:quota_exhausted")
        await link.followUp("One more?", assistance: .hint, fresh: liveInput(stand, third))
        card = try await liveCard(link)
        status = await link.currentStatus()
        print("PROBE allowance phase=\(card.phase.rawValue) detail=\(card.detail ?? "nil") session=\(status.session.state) used=\(status.session.used)")
        XCTAssertEqual(card.phase, .refused)
        XCTAssertFalse(status.session.isRunning)
        let asksBefore = log().filter { $0.hasPrefix("client.ask") }.count
        try mode("answer")
        await link.followUp("Again?", assistance: .hint, fresh: liveInput(stand, third))
        await link.offer(liveInput(stand, third))
        XCTAssertEqual(log().filter { $0.hasPrefix("client.ask") }.count, asksBefore, "nothing reached the stand-in after the session ended")
        card = try await liveCard(link)
        print("PROBE after-end detail=\(card.detail ?? "nil")")

        // The user's own Start: a new session in the same connector process; then Stop and Quit.
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        status = await link.currentStatus()
        print("PROBE start-again state=\(status.session.state) used=\(status.session.used)")
        XCTAssertEqual(status.session.state, .on)
        // Used up to the requests kept for the user: the app stops looking before the connector has to refuse.
        for index in 0..<10 {
            clock.advance(1)
            try await Task.sleep(nanoseconds: 550_000_000)
            await link.offer(liveInput(stand, try liveKeep(stand, host: 120 + Double(index) * 3, shade: UInt8(60 - index * 3))))
        }
        status = await link.currentStatus()
        print("PROBE reserve used=\(status.session.used) paused=\(status.session.paused ?? "nil") missed=\(status.session.missed ?? "nil") state=\(status.session.state)")
        XCTAssertEqual(status.session.used, 9)
        XCTAssertNotNil(status.session.paused)
        await link.stopSession()
        status = await link.currentStatus()
        let sessionFiles = try files(in: stand.session.appending(path: "live")).filter { $0.hasSuffix(".end.json") }
        for file in sessionFiles {
            let end = try liveRecord(stand.session, file)
            print("PROBE end reason=\(end["reason"] ?? "nil") stop=\(end["stop"] ?? "nil") used=\(end["requests_used"] ?? "nil")")
        }
        XCTAssertEqual(status.session.state, .ended("stopped by you"))
        await link.shutdown()
        let ended = await until(10) { log().last?.hasPrefix("exit") == true }
        XCTAssertTrue(ended, "the connector did not end at EOF")
        let lines = log()
        print("PROBE connector-log asks=\(lines.filter { $0.hasPrefix("client.ask") }.count) "
              + "pngs=\(lines.filter { $0.hasPrefix("client.ask") && $0.contains("png=True") }.count) "
              + "interrupts=\(lines.filter { $0 == "client.interrupt" }.count) "
              + "finished=\(Dictionary(grouping: lines.filter { $0.hasPrefix("client.finish_request") }, by: { $0 }).mapValues(\.count).sorted { $0.key < $1.key }) "
              + "touched=\(lines.filter { $0.hasSuffix("touched") }) last=\(lines.suffix(2))")
        XCTAssertTrue(lines.filter { $0.hasSuffix("touched") }.isEmpty)
    }
}
