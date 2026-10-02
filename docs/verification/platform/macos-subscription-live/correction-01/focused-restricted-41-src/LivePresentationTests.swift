import Foundation
import FoundationNetworking
import Glibc
import Foundation
import XCTest

// Actual LiveLink answers and retained files, with the existing in-process connector and
// synthetic capture. Panel visibility below is a reported callback, not an AppKit/device test.
extension DesktopCaptureTests {
    private struct QueuedLiveAnswer {
        let connector: FakeLiveConnector
        let stand: LiveStand
        let frame: FrameReference
        let link: LiveLink
        let card: LiveCard
        let permit: LiveAnswerPresentation
        var receipt: URL {
            stand.session.appending(path: "live/" + permit.requestID + ".shown.json")
        }
    }

    private func queuedLiveAnswer(_ name: String, submissions: Int = 10,
                                  captureGate: LiveGate? = nil, presentationGate: LiveGate? = nil) async throws -> QueuedLiveAnswer {
        let connector = FakeLiveConnector()
        let stand = try liveStand(name)
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, policy: LivePolicy(
            maxSubmissions: submissions, maxSessionMS: 600_000, minObservationIntervalMS: 30_000))
        let queued = LiveLog()
        await link.setStatusHandler { queued.add($0) }
        var selection = try liveSelect(stand, on: frame, host: 103)
        selection.input.captureGate = captureGate
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id,
                            presentationGate: presentationGate)
        let snapshot = try XCTUnwrap(queued.all.last { $0.card?.phase == .answered })
        let card = try XCTUnwrap(snapshot.card)
        let permit = try XCTUnwrap(card.presentation)
        XCTAssertEqual(card.requestID, permit.requestID)
        XCTAssertNotNil(card.answer)
        XCTAssertNil(permit.shownAt, "Putting an answer in a queued status is not displaying it")
        let answer = QueuedLiveAnswer(connector: connector, stand: stand, frame: frame,
                                      link: link, card: card, permit: permit)
        XCTAssertFalse(FileManager.default.fileExists(atPath: answer.receipt.path))
        return answer
    }

    private func assertQueuedAnswerCannotAppear(_ queued: QueuedLiveAnswer) async throws {
        var displayedText: String?
        XCTAssertFalse(queued.permit.whileAllowed {
            displayedText = queued.card.answer
            return true
        })
        XCTAssertNil(displayedText, "Revoked text must not enter a display callback")
        // A stale callback carrying its original authority also cannot create a first receipt.
        await queued.link.answerShown(queued.permit.requestID, presentation: queued.permit)
        XCTAssertNil(queued.permit.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: queued.receipt.path))
        let original = try liveRecord(queued.stand.session, queued.permit.requestID + ".response.json")
        XCTAssertEqual(original["text"] as? String, queued.card.answer, "Revocation retains the original answer record")
    }

    func testLiveQueuedUnshownAnswerCannotAcquireReceiptAfterStop() async throws {
        let queued = try await queuedLiveAnswer("presentation-stop")
        await queued.link.stopSession()
        let stopped = await queued.link.currentStatus()
        XCTAssertEqual(stopped.session.state, .ended("stopped by you"))
        // The retained lead counterexample calls the original request-only API after Stop.
        await queued.link.answerShown(queued.permit.requestID)
        XCTAssertFalse(FileManager.default.fileExists(atPath: queued.receipt.path))
        try await assertQueuedAnswerCannotAppear(queued)
        XCTAssertEqual(queued.connector.turns.count, 1)
        await queued.link.shutdown()
    }

    func testLiveClosingAnUnshownAnswerRevokesItsQueuedDisplay() async throws {
        let queued = try await queuedLiveAnswer("presentation-cancel")
        await queued.link.cancelCard()
        let closed = await queued.link.currentStatus()
        XCTAssertNil(closed.card)
        XCTAssertEqual(closed.session.state, .on, "Closing the card need not stop observation")
        try await assertQueuedAnswerCannotAppear(queued)
        XCTAssertEqual(queued.connector.turns.count, 1)
        await queued.link.shutdown()
    }

    func testLiveNewSelectionRejectsTheOldQueuedAnswerAndDisplaysItsOwn() async throws {
        let queued = try await queuedLiveAnswer("presentation-selection")
        let selection = try liveSelect(queued.stand, on: queued.frame, from: (30, 10), to: (70, 30), host: 110)
        await queued.link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        let replacement = try await liveCard(queued.link)
        XCTAssertNotEqual(replacement.requestID, queued.card.requestID)
        try await assertQueuedAnswerCannotAppear(queued)
        let permit = try XCTUnwrap(replacement.presentation)
        var displayedText: String?
        XCTAssertTrue(permit.whileAllowed {
            displayedText = replacement.answer
            return true
        })
        XCTAssertEqual(displayedText, replacement.answer)
        await queued.link.answerShown(permit.requestID, presentation: permit)
        XCTAssertEqual(try liveRecord(queued.stand.session, permit.requestID + ".shown.json")["request_id"] as? String,
                       replacement.requestID)
        XCTAssertEqual(queued.connector.turns.count, 2)
        await queued.link.shutdown()
    }

    func testLiveFollowUpRevokesAnUnshownAnswerOnTheSameCard() async throws {
        let queued = try await queuedLiveAnswer("presentation-followup")
        await queued.link.followUp("Check only this step.", assistance: .hint,
                                   fresh: liveInput(queued.stand, queued.frame))
        let followUp = try await liveCard(queued.link)
        XCTAssertEqual(followUp.cardID, queued.card.cardID)
        XCTAssertNotEqual(followUp.requestID, queued.card.requestID)
        try await assertQueuedAnswerCannotAppear(queued)
        let permit = try XCTUnwrap(followUp.presentation)
        XCTAssertTrue(permit.whileAllowed { true }, "The new answer keeps its own display authority")
        await queued.link.answerShown(permit.requestID, presentation: permit)
        XCTAssertEqual(try liveRecord(queued.stand.session, permit.requestID + ".shown.json")["request_id"] as? String,
                       followUp.requestID)
        await queued.link.shutdown()
    }

    func testLiveExplicitRestartDoesNotAuthorizeAnEarlierUnshownAnswer() async throws {
        let queued = try await queuedLiveAnswer("presentation-restart", submissions: 1)
        let usedUp = await queued.link.currentStatus()
        XCTAssertEqual(usedUp.session.state, .usedUp)
        let originalSession = try XCTUnwrap(queued.connector.params("companion/start").first?["session_id"] as? String)
        await queued.link.startSession(policy: LivePolicy(maxSubmissions: 2, maxSessionMS: 600_000,
                                                        minObservationIntervalMS: 30_000),
                                       captureSession: queued.stand.session, captureSessionID: queued.stand.id)
        let restarted = await queued.link.currentStatus()
        XCTAssertEqual(restarted.session.state, .on)
        let newSession = try XCTUnwrap(queued.connector.params("companion/start").last?["session_id"] as? String)
        XCTAssertNotEqual(newSession, originalSession)
        // The same request/card may remain as history; the new session grants it no first display.
        await queued.link.answerShown(queued.permit.requestID)
        try await assertQueuedAnswerCannotAppear(queued)
        let selection = try liveSelect(queued.stand, on: queued.frame, host: 110)
        await queued.link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        let current = try await liveCard(queued.link)
        let permit = try XCTUnwrap(current.presentation)
        XCTAssertTrue(permit.whileAllowed { true })
        await queued.link.answerShown(permit.requestID, presentation: permit)
        XCTAssertEqual(try liveRecord(queued.stand.session, permit.requestID + ".shown.json")["request_id"] as? String,
                       current.requestID)
        await queued.link.shutdown()
    }

    func testLiveCaptureEndRevokesAnUnshownAnswerWithoutDiscardingItsOriginal() async throws {
        let queued = try await queuedLiveAnswer("presentation-capture-end")
        await queued.link.captureStopped(queued.stand.id)
        let stopped = await queued.link.currentStatus()
        XCTAssertEqual(stopped.session.state, .ended("the capture was stopped"))
        await queued.link.answerShown(queued.permit.requestID)
        try await assertQueuedAnswerCannotAppear(queued)
        await queued.link.followUp("Anything else?", assistance: .hint,
                                   fresh: liveInput(queued.stand, queued.frame))
        XCTAssertEqual(queued.connector.turns.count, 1, "A stopped capture cannot create another request")
        await queued.link.shutdown()
    }

    func testLiveActuallyShownAnswerKeepsItsOriginalReceiptAfterStopAndClose() async throws {
        let queued = try await queuedLiveAnswer("presentation-shown-before-stop")
        var displayedText: String?
        XCTAssertTrue(queued.permit.whileAllowed {
            displayedText = queued.card.answer
            return true
        })
        XCTAssertEqual(displayedText, queued.card.answer)
        let firstShownAt = try XCTUnwrap(queued.permit.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: queued.receipt.path), "The callback has not reached the actor yet")
        await queued.link.stopSession()
        await queued.link.answerShown(queued.permit.requestID, presentation: queued.permit)
        let originalReceipt = try Data(contentsOf: queued.receipt)
        let record = try liveRecord(queued.stand.session, queued.permit.requestID + ".shown.json")
        XCTAssertEqual(record["shown_at"] as? String, firstShownAt)
        XCTAssertEqual(record["request_id"] as? String, queued.permit.requestID)
        await queued.link.closeCard()
        await queued.link.answerShown(queued.permit.requestID, presentation: queued.permit)
        XCTAssertEqual(try Data(contentsOf: queued.receipt), originalReceipt, "Duplicate or delayed callbacks cannot rewrite the first display")
        XCTAssertEqual(queued.permit.shownAt, firstShownAt)
        XCTAssertTrue(queued.permit.whileAllowed { true }, "Already shown text remains accessible as history")
        await queued.link.shutdown()
        XCTAssertEqual(try Data(contentsOf: queued.receipt), originalReceipt)
    }

    func testLiveFinalUsedUpAnswerStillHasFirstDisplayAuthority() async throws {
        let queued = try await queuedLiveAnswer("presentation-final-answer", submissions: 1)
        let status = await queued.link.currentStatus()
        XCTAssertEqual(status.session.state, .usedUp)
        XCTAssertEqual(status.session.used, 1)
        XCTAssertTrue(queued.permit.whileAllowed { true }, "Exhausting requests does not revoke the final answer")
        await queued.link.answerShown(queued.permit.requestID, presentation: queued.permit)
        XCTAssertEqual(try liveRecord(queued.stand.session, queued.permit.requestID + ".shown.json")["shown_at"] as? String,
                       queued.permit.shownAt)
        XCTAssertEqual(queued.connector.turns.count, 1)
        await queued.link.shutdown()
    }

    func testLiveHiddenPanelDoesNotBecomeShownAndCanBeDisplayedLater() async throws {
        let queued = try await queuedLiveAnswer("presentation-hidden-panel")
        var attemptedText: String?
        let visible = queued.permit.whileAllowed {
            attemptedText = queued.card.answer
            return false
        }
        XCTAssertFalse(visible)
        XCTAssertEqual(attemptedText, queued.card.answer)
        XCTAssertNil(queued.permit.shownAt)
        XCTAssertFalse(FileManager.default.fileExists(atPath: queued.receipt.path))
        XCTAssertTrue(queued.permit.whileAllowed { true }, "A hidden attempt must not consume the later visible display")
        await queued.link.answerShown(queued.permit.requestID, presentation: queued.permit)
        XCTAssertNotNil(queued.permit.shownAt)
        XCTAssertTrue(FileManager.default.fileExists(atPath: queued.receipt.path))
        await queued.link.shutdown()
    }

    func testLiveCaptureGateCloseBlocksDisplayBeforeItsActorNotification() async throws {
        let captureGate = LiveGate()
        let queued = try await queuedLiveAnswer("presentation-capture-gate", captureGate: captureGate)
        XCTAssertTrue(captureGate.close("system_stop"))
        let stillQueued = await queued.link.currentStatus()
        XCTAssertEqual(stillQueued.session.state, .on, "The capture-stop notification has not reached the actor")
        await queued.link.answerShown(queued.permit.requestID)
        try await assertQueuedAnswerCannotAppear(queued)
        await queued.link.captureStopped(queued.stand.id)
        try await assertQueuedAnswerCannotAppear(queued)
        await queued.link.shutdown()
    }

    func testLiveLocalGenerationCloseBlocksDisplayBeforeTheStopTask() async throws {
        let presentationGate = LiveGate()
        let queued = try await queuedLiveAnswer("presentation-generation", presentationGate: presentationGate)
        XCTAssertTrue(presentationGate.close("the user stopped the AI"))
        let stillQueued = await queued.link.currentStatus()
        XCTAssertEqual(stillQueued.session.state, .on, "The local fence precedes asynchronous actor Stop")
        await queued.link.answerShown(queued.permit.requestID)
        try await assertQueuedAnswerCannotAppear(queued)
        await queued.link.stopSession()
        await queued.link.shutdown()
    }
}
