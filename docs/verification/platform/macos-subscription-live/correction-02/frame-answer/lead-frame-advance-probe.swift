import Foundation
import XCTest

extension DesktopCaptureTests {
    func testLeadSubmittedFollowupSurvivesHealthyFrameAdvanceButNotSourceLoss() async throws {
        for healthyAdvance in [false, true] {
            let connector = FakeLiveConnector()
            let stand = try liveStand(healthyAdvance ? "lead-healthy-advance" : "lead-actual-source-loss")
            let first = try liveKeep(stand, host: 100.3)
            let link = await liveStarted(connector, stand)
            let selection = try liveSelect(stand, on: first, host: 101)
            await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
            let sourceClock = LiveClock(100.3)
            var currentInput = liveInput(stand, first)
            // Same source/sequence recheck supplied by CaptureController.liveInput -> CaptureRun.
            currentInput.currentSourceProblem = {
                Freshness.currentFrameProblem(stand.recorder.status, capturing: true,
                                              sequence: first.sequence, now: sourceClock.now)
            }
            XCTAssertNil(currentInput.currentSourceProblem?())
            let input = currentInput
            connector.onTurn = { _ in .hold }
            let asking = Task { await link.followUp("Explain the earlier frame only.", assistance: .hint, fresh: input) }
            let submitted = await until(5) { connector.turns.count == 2 }
            XCTAssertTrue(submitted, "The complete follow-up line is delivered before source changes")
            let submittedTurn = try XCTUnwrap(connector.turns.last)
            XCTAssertEqual(submittedTurn["trigger"] as? String, "text_followup")
            sourceClock.advance(2.7)
            if healthyAdvance {
                let second = try liveKeep(stand, host: 103, shade: 90)
                XCTAssertGreaterThan(second.sequence, first.sequence)
                XCTAssertNil(Freshness.currentFrameProblem(stand.recorder.status, capturing: true,
                                                          sequence: second.sequence, now: sourceClock.now))
            } else {
                stand.recorder.frame(facts(.blank, source: 102.9), image: nil, host: 103, accepted: true)
            }
            let sourceState = Freshness.judge(stand.recorder.status, capturing: true, now: sourceClock.now)
            connector.release(text: "Synthetic valid hint about the explicitly retained earlier frame.")
            await asking.value
            let status = await link.currentStatus()
            XCTAssertEqual(status.session.state, .on)
            XCTAssertEqual(status.card?.phase, .answered)
            XCTAssertEqual(status.card?.frameFile, first.file)
            let card = try XCTUnwrap(status.card)
            let permit = try XCTUnwrap(card.presentation)
            var displayed = false
            let allowed = permit.whileAllowed { displayed = true; return true }
            await link.answerShown(permit.requestID, presentation: permit)
            let receiptExists = FileManager.default.fileExists(atPath: stand.session.appending(path: "live/" + permit.requestID + ".shown.json").path)
            let response = try liveRecord(stand.session, permit.requestID + ".response.json")
            XCTAssertEqual(response["outcome"] as? String, "answered")
            print("FRAME_ADVANCE_PROBE healthy_advance=\(healthyAdvance); source=\(sourceState); answered=true; original_frame_preserved=true; display_allowed=\(allowed); displayed=\(displayed); shown_receipt=\(receiptExists); stale_sequence_reason=\(String(describing: input.currentSourceProblem?()))")
            if healthyAdvance {
                XCTAssertTrue(allowed, "Normal healthy frame N+1 must not revoke a valid already-submitted answer anchored to frame N")
            } else {
                XCTAssertFalse(allowed, "Actual blank source loss must still fence a first display")
            }
            await link.shutdown()
        }
    }
}
