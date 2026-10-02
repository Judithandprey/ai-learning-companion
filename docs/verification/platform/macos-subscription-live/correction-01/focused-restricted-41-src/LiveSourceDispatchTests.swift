import Foundation
import FoundationNetworking
import Glibc
import Foundation
import XCTest

private final class LiveSourceProblem: @unchecked Sendable {
    private let lock = NSLock()
    private var problem: String?
    func set(_ value: String?) { lock.withLock { problem = value } }
    func read() -> String? { lock.withLock { problem } }
}

/// Makes a transient admission denial recover before send returns, without delivering bytes.
private final class RecoveringLiveWriter: AskChildLauncher, @unchecked Sendable {
    let connector = FakeLiveConnector()
    let source = LiveSourceProblem()
    private let lock = NSLock()
    private var refuseNext = false
    func refuseOneTurn() { lock.withLock { refuseNext = true } }
    func launch(_ config: AskConnectorConfig, onLine: @escaping @Sendable (Data) -> Void,
                onExit: @escaping @Sendable () -> Void) -> (any AskChild)? {
        guard let inner = connector.launch(config, onLine: onLine, onExit: onExit) else { return nil }
        return Child(inner: inner, owner: self)
    }
    private final class Child: AskChild, @unchecked Sendable {
        let inner: any AskChild
        let owner: RecoveringLiveWriter
        init(inner: any AskChild, owner: RecoveringLiveWriter) { self.inner = inner; self.owner = owner }
        var hasExited: Bool { inner.hasExited }
        func end() async { await inner.end() }
        func send(_ line: Data, revocation: AskRevocation?) async -> Bool {
            let method = (try? JSONSerialization.jsonObject(with: line) as? [String: Any])?["method"] as? String
            let refuse = owner.lock.withLock { () -> Bool in
                guard method == "companion/turn", owner.refuseNext else { return false }
                owner.refuseNext = false
                return true
            }
            if refuse, let revocation {
                owner.source.set("synthetic temporary source loss")
                _ = revocation.attempt(remaining: line.count, started: false) { line.count }
                owner.source.set(nil)
                return false
            }
            return await inner.send(line, revocation: revocation)
        }
    }
}

extension DesktopCaptureTests {
    func testRecoveredSourceRefusalDoesNotBecomeTransportFailure() async throws {
        let writer = RecoveringLiveWriter()
        let stand = try liveStand("source-recovered-before-send-return")
        let frame = try liveKeep(stand, host: 100.3)
        let link = LiveLink(config: .success(askConfig), launcher: writer, changeInterval: 0)
        await link.connect()
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id)
        let selected = try liveSelect(stand, on: frame, host: 103)
        await link.selected(selected.input, rect: selected.rect, selectionID: selected.id)
        var input = liveInput(stand, frame)
        input.currentSourceProblem = { writer.source.read() }
        writer.refuseOneTurn()
        await link.followUp("A small hint, please", assistance: .hint, fresh: input)
        let current = await link.currentStatus()
        XCTAssertEqual(current.session.state, .on)
        XCTAssertEqual(current.session.out, 0)
        XCTAssertEqual(writer.connector.turns.count, 1)
        let request = try XCTUnwrap(current.card?.requestID)
        let record = try liveRecord(stand.session, request + ".response.json")
        XCTAssertEqual(record["outcome"] as? String, "cancelled")
        XCTAssertEqual(record["delivered_to_connector"] as? Bool, false)
        await link.shutdown()
    }

    func testOldOrReplacementDispatchGateCannotAuthorizeTheActiveSession() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("dispatch-generation")
        let frame = try liveKeep(stand, host: 100.3)
        let link = LiveLink(config: .success(askConfig), launcher: connector, changeInterval: 0)
        await link.connect()
        let old = LiveGate()
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id, dispatchGate: old)
        old.close("synchronous Stop before actor notification")
        let replacement = LiveGate()
        var input = liveInput(stand, frame)
        input.dispatchGate = replacement
        await link.offer(input)
        XCTAssertTrue(connector.turns.isEmpty, "A new open input gate cannot bypass the old active session's closed gate")
        await link.stopSession()
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id, dispatchGate: replacement)
        input.dispatchGate = old
        await link.offer(input)
        var current = await link.currentStatus()
        XCTAssertNil(current.session.missed, "Old queued frames do not poison the new session")
        input.dispatchGate = replacement
        await link.offer(input)
        current = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 1)
        XCTAssertEqual(current.session.out, 0)
        await link.shutdown()
    }

    func testSameFrameRecoveryClearsSourceLossWithoutAnotherSubmission() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("source-same-frame-recovery")
        let frame = try liveKeep(stand, host: 100.3)
        let clock = LiveClock(1_000)
        let link = await liveStarted(connector, stand, clock: clock)
        let input = liveInput(stand, frame)
        await link.offer(input)
        await link.noPicture("callback silence")
        clock.advance(40)
        await link.offer(input)
        let current = await link.currentStatus()
        XCTAssertNil(current.session.missed)
        XCTAssertEqual(connector.turns.count, 1, "A healthy idle callback does not need another submission for unchanged pixels")
        await link.shutdown()
    }

    func testClosedCaptureRefusesStartBeforeAndAfterConnectorAwait() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("capture-close-start")
        let link = LiveLink(config: .success(askConfig), launcher: connector, changeInterval: 0)
        await link.connect()
        let closed = LiveGate()
        closed.close("system stop")
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id, captureGate: closed)
        XCTAssertTrue(connector.params("companion/start").isEmpty)
        let closing = LiveGate()
        connector.startResult = { params in
            closing.close("system stop while Start awaits")
            return ["session_id": params["session_id"]!, "epoch": params["epoch"]!,
                    "remaining_submissions": LivePolicy.preset.maxSubmissions,
                    "expires_in_ms": LivePolicy.preset.maxSessionMS]
        }
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id, captureGate: closing)
        let current = await link.currentStatus()
        XCTAssertFalse(current.session.isRunning)
        XCTAssertEqual(connector.params("companion/start").count, 1)
        XCTAssertEqual(connector.params("companion/stop").count, 1)
        XCTAssertTrue(connector.turns.isEmpty)
        await link.shutdown()
    }

    func testPermanentGateClosureAndFinalByteAreAtomicallyOrdered() {
        let gate = LiveGate()
        let line = AskRevocation(gates: [gate])
        let entered = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        let written = DispatchSemaphore(value: 0)
        let closing = DispatchSemaphore(value: 0)
        let closed = DispatchSemaphore(value: 0)
        DispatchQueue.global().async {
            _ = line.attempt(remaining: 1, started: false) {
                entered.signal()
                _ = release.wait(timeout: .now() + 5)
                return 1
            }
            written.signal()
        }
        XCTAssertEqual(entered.wait(timeout: .now() + 5), .success)
        DispatchQueue.global().async { closing.signal(); gate.close("Stop AI"); closed.signal() }
        XCTAssertEqual(closing.wait(timeout: .now() + 5), .success)
        XCTAssertEqual(closed.wait(timeout: .now() + 0.05), .timedOut, "Stop cannot complete in the middle of an admitted final-byte step")
        release.signal()
        XCTAssertEqual(written.wait(timeout: .now() + 5), .success)
        XCTAssertEqual(closed.wait(timeout: .now() + 5), .success)
        let later = AskRevocation(gates: [gate])
        var sentAfterStop = false
        XCTAssertNil(later.attempt(remaining: 1, started: false) { sentAfterStop = true; return 1 })
        XCTAssertFalse(sentAfterStop)
    }
    func testCurrentSourceLossDuringRenderRefusesThenRecoversWithoutRestart() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("current-source-render")
        let frame = try liveKeep(stand, host: 100.3)
        let source = LiveSourceProblem()
        let entered = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        let clock = LiveClock(1_000)
        let link = LiveLink(config: .success(askConfig), launcher: connector, changeInterval: 0, clock: { clock.now },
                            makePicture: { input in
            entered.signal()
            guard release.wait(timeout: .now() + 5) == .success else {
                return .failure(MappingRefusal("synthetic renderer timed out"))
            }
            return LiveFrameBuilder.render(input)
        })
        await link.connect()
        await link.startSession(policy: LivePolicy(maxSubmissions: 10, maxSessionMS: 600_000,
            minObservationIntervalMS: 1_000), captureSession: stand.session, captureSessionID: stand.id)
        var input = liveInput(stand, frame)
        input.currentSourceProblem = { source.read() }
        let frozen = input
        let rendering = Task { await link.offer(frozen) }
        XCTAssertEqual(entered.wait(timeout: .now() + 5), .success)
        // No actor noPicture has run yet: dispatch itself must notice the lost source.
        source.set("the current pixels are unknown after callback silence")
        release.signal()
        await rendering.value
        var status = await link.currentStatus()
        XCTAssertTrue(connector.turns.isEmpty)
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(status.session.out, 0)
        XCTAssertTrue(status.session.missed?.contains("callback silence") == true)
        source.set(nil)
        release.signal()
        await link.offer(frozen)
        status = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 1, "Healthy recovery can reoffer the same retained pixels")
        XCTAssertNil(status.session.missed)
        let history = connector.turns.last?["history"] as? [[String: Any]]
        XCTAssertTrue(history?.contains { ($0["text"] as? String)?.contains("source-status metadata") == true } == true)
        await link.stopSession()
        await link.offer(frozen)
        XCTAssertEqual(connector.turns.count, 1, "Recovery never restarts Stop")
        await link.shutdown()
    }

    func testCurrentSourceLossWhileFollowupWaitsInWriterDropsTheLine() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("current-source-writer")
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand)
        let selected = try liveSelect(stand, on: frame, host: 103)
        await link.selected(selected.input, rect: selected.rect, selectionID: selected.id)
        XCTAssertEqual(connector.turns.count, 1)
        let source = LiveSourceProblem()
        var input = liveInput(stand, frame)
        input.currentSourceProblem = { source.read() }
        let frozen = input
        connector.holdsWrites = ["companion/turn"]
        let following = Task { await link.followUp("A small hint, please", assistance: .hint, fresh: frozen) }
        let waiting = await until(5) {
            let current = await link.currentStatus()
            return current.card?.phase == .asking && current.card?.requestID?.hasSuffix(".2") == true
        }
        XCTAssertTrue(waiting)
        source.set("the capture reports blank without usable current pixels")
        connector.holdsWrites = []
        await following.value
        let status = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 1, "No delayed current-picture line reached the connector")
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(status.session.out, 0)
        XCTAssertEqual(status.card?.phase, .cancelled)
        XCTAssertNil(status.card?.answer)
        let request = try XCTUnwrap(status.card?.requestID)
        let record = try liveRecord(stand.session, request + ".response.json")
        XCTAssertEqual(record["delivered_to_connector"] as? Bool, false)
        XCTAssertEqual(record["outcome"] as? String, "cancelled")
        await link.shutdown()
    }

    func testSourceAdmissionRechecksFinalByteAndPermanentSessionStop() {
        let source = LiveSourceProblem()
        let gate = LiveGate()
        let line = AskRevocation(allowed: { gate.isOpen && source.read() == nil })
        XCTAssertEqual(line.attempt(remaining: 4, started: false) { 3 }, 3)
        source.set("suspended")
        var completed = false
        XCTAssertNil(line.attempt(remaining: 1, started: true) { completed = true; return 1 })
        XCTAssertFalse(completed)
        XCTAssertTrue(line.wasWrittenInPart)
        source.set(nil)
        XCTAssertNil(line.attempt(remaining: 1, started: true) { completed = true; return 1 }, "Revoked partial lines never revive")
        let stopped = AskRevocation(allowed: { gate.isOpen })
        gate.close("Stop AI")
        XCTAssertNil(stopped.attempt(remaining: 1, started: false) { completed = true; return 1 })
        XCTAssertFalse(completed)
    }
}
