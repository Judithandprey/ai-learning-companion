import Foundation
import XCTest

// A controlled queue for the production scheduleStatus seam. It queues refresh triggers only;
// the actual controller still performs every authority await, publication and panel operation.
final class DeferredControllerStatus: @unchecked Sendable {
    private let lock = NSLock()
    private var work: [@MainActor () -> Void] = []
    func enqueue(_ action: @escaping @MainActor () -> Void) { lock.withLock { work.append(action) } }
    var count: Int { lock.withLock { work.count } }
    @MainActor func drain() {
        let batch = lock.withLock { () -> [@MainActor () -> Void] in
            let batch = work
            work = []
            return batch
        }
        for action in batch { action() }
    }
}

extension DesktopCaptureTests {
    private struct ControllerStand {
        let source: LiveStand
        let frame: FrameReference
        let connector: FakeLiveConnector
        let link: LiveLink
        let controller: LiveController
        let queue: DeferredControllerStatus
        let gate: LiveGate
    }

    @MainActor private func controllerStand(_ name: String, submissions: Int = 10) async throws -> ControllerStand {
        ControllerUITrace.reset(name)
        let source = try liveStand(name)
        let frame = try liveKeep(source, host: 100.3)
        let connector = FakeLiveConnector()
        let link = liveLink(connector)
        await link.connect()
        let queue = DeferredControllerStatus()
        let controller = LiveController(link: link, scheduleStatus: { queue.enqueue($0) })
        let gate = LiveGate()
        controller.captureGate = gate
        controller.requests = submissions
        controller.minutes = 10
        controller.seconds = 30
        var input = liveInput(source, frame)
        input.captureGate = gate
        let picture = input
        controller.newest = { picture }
        controller.start(captureSession: source.session, captureSessionID: source.id)
        let started = await until(5) {
            let status = await link.currentStatus()
            return status.session.state == .on && status.session.frames > 0 && status.session.out == 0
                && (submissions == 1 || connector.turns.contains { $0["trigger"] as? String == "observation" })
        }
        XCTAssertTrue(started, "Actual controller Start should establish and offer this synthetic display")
        return ControllerStand(source: source, frame: frame, connector: connector, link: link,
                               controller: controller, queue: queue, gate: gate)
    }

    @MainActor private func queuedControllerAnswer(_ run: ControllerStand) async throws -> LiveCard {
        run.connector.onTurn = { turn in
            turn["trigger"] as? String == "observation" ? .answer("Synthetic observation.") : .hold
        }
        _ = try liveSelect(run.source, on: run.frame, host: 103)
        let selection = try XCTUnwrap(run.source.ink.document.selections.last)
        let input = try XCTUnwrap(AskSelectionInput.freeze(selection: selection, document: run.source.ink.document,
                                                         captureSession: run.source.session, display: run.source.display))
        run.controller.selectionConfirmed(input, unlocated: nil, geometryProblem: nil)
        let asking = await until(5) {
            let status = await run.link.currentStatus()
            return status.card?.phase == .asking && run.connector.turns.contains { $0["trigger"] as? String == "focus" }
        }
        XCTAssertTrue(asking)
        // Create the actual asking panel before the delayed answer, so Cancel/Stop are real
        // controller actions on an existing view state. Leave scheduled refreshes deferred.
        await run.controller.refreshStatus()
        XCTAssertEqual(run.controller.status.card?.phase, .asking)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty)
        run.connector.release(text: "Synthetic controller hint: check the sign.")
        let answered = await until(5) { await run.link.currentStatus().card?.phase == .answered }
        XCTAssertTrue(answered)
        let card = try await liveCard(run.link)
        XCTAssertNotNil(card.answer)
        XCTAssertNil(card.presentation?.shownAt, "The answered callback is still deferred")
        XCTAssertGreaterThan(run.queue.count, 0)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty)
        return card
    }

    private func receipt(_ run: ControllerStand, _ request: String) -> URL {
        run.source.session.appending(path: "live/" + request + ".shown.json")
    }

    @MainActor private func drainController(_ run: ControllerStand) async {
        run.queue.drain()
        // Drain the scheduled Tasks and then obtain one final current-state refresh. The trace
        // retains every publication, including any transient answer a later refresh removes.
        for _ in 0..<5 { await Task.yield() }
        await run.controller.refreshStatus()
    }

    @MainActor func testControllerDeferredAnswerCannotAppearAfterSynchronousStop() async throws {
        let run = try await controllerStand("controller-stop")
        let answer = try await queuedControllerAnswer(run)
        let request = try XCTUnwrap(answer.requestID)
        run.controller.stop()
        XCTAssertFalse(run.controller.isObserving, "Local Stop applies before actor/network work finishes")
        await drainController(run)
        let stopped = await until(5) { await run.link.currentStatus().session.state == .ended("stopped by you") }
        XCTAssertTrue(stopped)
        await drainController(run)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty, "No answer may flash in any publication after Stop")
        XCTAssertNil(run.controller.status.card?.answer)
        XCTAssertNil(answer.presentation?.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, request).path))
        print("CONTROLLER_PROBE stop deferred_answer=true published_answers=\(ControllerUITrace.answers.count) shown_receipt=false")
        await run.link.shutdown()
    }

    @MainActor func testControllerDeferredAnswerCannotAppearAfterSynchronousCancel() async throws {
        let run = try await controllerStand("controller-cancel")
        let answer = try await queuedControllerAnswer(run)
        let request = try XCTUnwrap(answer.requestID)
        run.controller.cancel()
        await drainController(run)
        let closed = await until(5) { await run.link.currentStatus().card == nil }
        XCTAssertTrue(closed)
        await drainController(run)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty)
        XCTAssertNil(run.controller.status.card)
        XCTAssertNil(answer.presentation?.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, request).path))
        print("CONTROLLER_PROBE cancel deferred_answer=true published_answers=\(ControllerUITrace.answers.count) shown_receipt=false")
        await run.link.shutdown()
    }

    @MainActor func testControllerCaptureGateBlocksDeferredAnswerBeforeNotification() async throws {
        let run = try await controllerStand("controller-capture-gate")
        let answer = try await queuedControllerAnswer(run)
        let request = try XCTUnwrap(answer.requestID)
        let gate = run.gate
        let closed = await Task.detached { gate.close("system_stop") }.value
        XCTAssertTrue(closed)
        let beforeNotification = await run.link.currentStatus()
        XCTAssertEqual(beforeNotification.session.state, .on)
        await drainController(run)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty, "The actual controller must check the capture gate before its delayed notification")
        XCTAssertNil(answer.presentation?.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, request).path))
        run.controller.captureStopped(run.source.id)
        await drainController(run)
        print("CONTROLLER_PROBE capture_gate_closed=true actor_notification_initially=false published_answers=\(ControllerUITrace.answers.count) shown_receipt=false")
        await run.link.shutdown()
    }

    @MainActor func testControllerNewSelectionRejectsQueuedOldAnswerAndDisplaysItsOwn() async throws {
        let run = try await controllerStand("controller-replacement")
        let old = try await queuedControllerAnswer(run)
        let oldRequest = try XCTUnwrap(old.requestID)
        run.connector.holdsWrites = ["companion/turn"]
        _ = try liveSelect(run.source, on: run.frame, from: (40, 10), to: (80, 40), host: 110)
        let selection = try XCTUnwrap(run.source.ink.document.selections.last)
        let input = try XCTUnwrap(AskSelectionInput.freeze(selection: selection, document: run.source.ink.document,
                                                         captureSession: run.source.session, display: run.source.display))
        run.controller.selectionConfirmed(input, unlocated: nil, geometryProblem: nil)
        let replacing = await until(5) {
            let card = await run.link.currentStatus().card
            return card?.phase == .asking && card?.requestID != nil && card?.requestID != oldRequest
        }
        XCTAssertTrue(replacing)
        // The new request is still inside its held writer; drain the old answer triggers now.
        XCTAssertEqual(run.connector.turns.filter { $0["trigger"] as? String == "focus" }.count, 1)
        await drainController(run)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty)
        XCTAssertNil(old.presentation?.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, oldRequest).path))
        run.connector.holdsWrites = []
        let delivered = await until(5) {
            run.connector.turns.filter { $0["trigger"] as? String == "focus" }.count == 2
        }
        XCTAssertTrue(delivered)
        run.connector.release(text: "Synthetic replacement hint: inspect the denominator.")
        let answered = await until(5) { await run.link.currentStatus().card?.phase == .answered }
        XCTAssertTrue(answered)
        await run.controller.refreshStatus()
        let replacement = try await liveCard(run.link)
        let newRequest = try XCTUnwrap(replacement.requestID)
        XCTAssertNotEqual(newRequest, oldRequest)
        XCTAssertEqual(run.controller.status.card?.answer, "Synthetic replacement hint: inspect the denominator.")
        XCTAssertFalse(ControllerUITrace.answers.contains(try XCTUnwrap(old.answer)))
        let recorded = await until(5) { FileManager.default.fileExists(atPath: self.receipt(run, newRequest).path) }
        XCTAssertTrue(recorded)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, oldRequest).path))
        print("CONTROLLER_PROBE replacement_inflight=true old_answer_publications=0 old_receipt=false new_answer_visible=true new_receipt=true")
        await run.link.shutdown()
    }

    @MainActor func testControllerExplicitRestartRejectsQueuedOldAnswerAndDisplaysNewSessionAnswer() async throws {
        let run = try await controllerStand("controller-restart")
        let old = try await queuedControllerAnswer(run)
        let oldRequest = try XCTUnwrap(old.requestID)
        let oldSession = try XCTUnwrap(run.connector.params("companion/start").first?["session_id"] as? String)
        run.connector.holdsWrites = ["companion/start"]
        run.controller.stop()
        let stopped = await until(5) { await run.link.currentStatus().session.state == .ended("stopped by you") }
        XCTAssertTrue(stopped)
        // Explicit new Start on the same capture; old UI triggers remain queued throughout.
        run.controller.start(captureSession: run.source.session, captureSessionID: run.source.id)
        let starting = await until(5) { await run.link.currentStatus().session.state == .starting }
        XCTAssertTrue(starting)
        XCTAssertEqual(run.connector.params("companion/start").count, 1, "The new Start is still inside its held writer")
        await drainController(run)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty)
        XCTAssertNil(old.presentation?.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, oldRequest).path))
        run.connector.holdsWrites = []
        let restarted = await until(5) {
            let status = await run.link.currentStatus()
            return status.session.state == .on && status.session.frames > 0 && status.session.out == 0
                && run.connector.params("companion/start").count == 2
        }
        XCTAssertTrue(restarted)
        let newSession = try XCTUnwrap(run.connector.params("companion/start").last?["session_id"] as? String)
        XCTAssertNotEqual(newSession, oldSession)
        _ = try liveSelect(run.source, on: run.frame, from: (40, 10), to: (80, 40), host: 110)
        let selection = try XCTUnwrap(run.source.ink.document.selections.last)
        let input = try XCTUnwrap(AskSelectionInput.freeze(selection: selection, document: run.source.ink.document,
                                                         captureSession: run.source.session, display: run.source.display))
        run.controller.selectionConfirmed(input, unlocated: nil, geometryProblem: nil)
        let delivered = await until(5) {
            run.connector.turns.contains { $0["trigger"] as? String == "focus" && $0["session_id"] as? String == newSession }
        }
        XCTAssertTrue(delivered)
        await drainController(run)
        XCTAssertTrue(ControllerUITrace.answers.isEmpty)
        run.connector.release(text: "Synthetic restarted-session hint: compare both sides.")
        let answered = await until(5) { await run.link.currentStatus().card?.phase == .answered }
        XCTAssertTrue(answered)
        await run.controller.refreshStatus()
        let replacement = try await liveCard(run.link)
        let newRequest = try XCTUnwrap(replacement.requestID)
        XCTAssertNotEqual(newRequest, oldRequest)
        XCTAssertEqual(run.controller.status.card?.answer, "Synthetic restarted-session hint: compare both sides.")
        XCTAssertFalse(ControllerUITrace.answers.contains(try XCTUnwrap(old.answer)))
        let recorded = await until(5) { FileManager.default.fileExists(atPath: self.receipt(run, newRequest).path) }
        XCTAssertTrue(recorded)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, oldRequest).path))
        print("CONTROLLER_PROBE explicit_restart_inflight=true old_answer_publications=0 old_receipt=false new_session_visible=true new_receipt=true")
        await run.link.shutdown()
    }

    @MainActor func testControllerAlreadyShownAnswerKeepsItsFirstReceiptAfterStop() async throws {
        let run = try await controllerStand("controller-already-shown")
        let answer = try await queuedControllerAnswer(run)
        let request = try XCTUnwrap(answer.requestID)
        await run.controller.refreshStatus()
        XCTAssertEqual(run.controller.status.card?.answer, answer.answer)
        XCTAssertEqual(ControllerUITrace.answers.last, answer.answer)
        let firstShown = try XCTUnwrap(answer.presentation?.shownAt)
        run.controller.stop()
        await drainController(run)
        let recorded = await until(5) { FileManager.default.fileExists(atPath: self.receipt(run, request).path) }
        XCTAssertTrue(recorded)
        let firstReceipt = try Data(contentsOf: receipt(run, request))
        let record = try liveRecord(run.source.session, request + ".shown.json")
        XCTAssertEqual(record["shown_at"] as? String, firstShown)
        XCTAssertEqual(run.controller.status.card?.answer, answer.answer, "Legitimate visible help remains historical")
        run.queue.drain()
        await run.controller.refreshStatus()
        XCTAssertEqual(try Data(contentsOf: receipt(run, request)), firstReceipt)
        print("CONTROLLER_PROBE already_shown=true first_shown_at_preserved=true historical_answer_retained=true")
        await run.link.shutdown()
    }

    @MainActor func testControllerHiddenAnswerCanBecomeVisibleWithoutFalseReceipt() async throws {
        let run = try await controllerStand("controller-hidden-visible")
        let answer = try await queuedControllerAnswer(run)
        let request = try XCTUnwrap(answer.requestID)
        ControllerUITrace.panelsVisible = false
        await run.controller.refreshStatus()
        XCTAssertNil(answer.presentation?.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: receipt(run, request).path))
        XCTAssertNil(run.controller.status.card?.answer, "The hidden attempt is not kept as displayed UI state")
        ControllerUITrace.panelsVisible = true
        await run.controller.refreshStatus()
        XCTAssertEqual(run.controller.status.card?.answer, answer.answer)
        let recorded = await until(5) { FileManager.default.fileExists(atPath: self.receipt(run, request).path) }
        XCTAssertTrue(recorded)
        XCTAssertNotNil(answer.presentation?.shownAt)
        print("CONTROLLER_PROBE hidden_receipt=false later_visible_receipt=true")
        await run.link.shutdown()
    }

    @MainActor func testControllerFinalUsedUpAnswerCanBeDisplayed() async throws {
        let run = try await controllerStand("controller-final-used-up", submissions: 1)
        let answer = try await queuedControllerAnswer(run)
        let request = try XCTUnwrap(answer.requestID)
        let exhausted = await run.link.currentStatus()
        XCTAssertEqual(exhausted.session.state, .usedUp)
        await run.controller.refreshStatus()
        XCTAssertEqual(run.controller.status.card?.answer, answer.answer)
        XCTAssertEqual(ControllerUITrace.answers.last, answer.answer)
        XCTAssertNotNil(answer.presentation?.shownAt)
        let recorded = await until(5) { FileManager.default.fileExists(atPath: self.receipt(run, request).path) }
        XCTAssertTrue(recorded)
        XCTAssertEqual(run.connector.turns.count, 1, "The only allowed request was the user's focus")
        print("CONTROLLER_PROBE final_used_up=true answer_visible=true shown_receipt=true")
        await run.link.shutdown()
    }
}
