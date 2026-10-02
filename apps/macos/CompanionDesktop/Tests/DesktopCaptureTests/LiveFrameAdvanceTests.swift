import Foundation
import XCTest
@testable import DesktopCapture

extension DesktopCaptureTests {
    private func checkedFrame(_ stand: LiveStand, _ frame: FrameReference, clock: LiveClock) -> LiveFrameInput {
        var input = liveInput(stand, frame)
        input.currentSourceProblem = {
            Freshness.currentFrameProblem(stand.recorder.status, capturing: true,
                                          sequence: frame.sequence, now: clock.now)
        }
        return input
    }

    func testHealthyAdvanceRefusesOldCurrentInputWithoutRevokingItsSubmittedAnswer() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("advance-preserves-anchored-answer")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand)
        let selected = try liveSelect(stand, on: first, host: 101)
        await link.selected(selected.input, rect: selected.rect, selectionID: selected.id)
        let clock = LiveClock(100.3)
        let input = checkedFrame(stand, first, clock: clock)
        await link.followUp("Explain this retained frame.", assistance: .hint, fresh: input)
        let answer = try await liveCard(link)
        let permit = try XCTUnwrap(answer.presentation)
        let responseBefore = try Data(contentsOf: stand.session.appending(path: "live/" + permit.requestID + ".response.json"))
        let request = try liveRecord(stand.session, permit.requestID + ".request.json")
        let inkFile = try XCTUnwrap(request["ink_file"] as? String)
        let inkBefore = try Data(contentsOf: stand.session.appending(path: inkFile))
        clock.advance(2.7)
        let second = try liveKeep(stand, host: 103, shade: 90)
        XCTAssertNotNil(input.dispatchProblem, "Earlier pixels cannot become a current-picture request")
        await link.offer(input)
        var current = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 2)
        XCTAssertNil(current.session.missed, "A refused old input does not declare loss in a healthy source")
        XCTAssertEqual(current.card?.frameFile, first.file)
        XCTAssertTrue(permit.whileAllowed { true }, "The submitted answer remains bound to its original frame")
        await link.answerShown(permit.requestID, presentation: permit)
        await link.offer(checkedFrame(stand, second, clock: clock))
        current = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 3, "The healthy newer frame still reaches unattended observation")
        XCTAssertEqual(current.card?.frameFile, first.file, "The earlier answer is never relabeled as the new frame")
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: inkFile)), inkBefore)
        XCTAssertEqual(inkBefore, input.documentBytes)
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: "live/" + permit.requestID + ".response.json")), responseBefore)
        await link.shutdown()
    }

    func testHealthyAdvanceDuringRenderingDrainsTheNewestWaitingFrame() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("advance-during-render")
        let first = try liveKeep(stand, host: 100.3)
        let sourceClock = LiveClock(100.3)
        let entered = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        let link = LiveLink(config: .success(askConfig), launcher: connector, changeInterval: 0, makePicture: { input in
            if input.frame.sequence == first.sequence {
                entered.signal()
                guard release.wait(timeout: .now() + 5) == .success else {
                    return .failure(MappingRefusal("synthetic held renderer timed out"))
                }
            }
            return LiveFrameBuilder.render(input)
        })
        await link.connect()
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id)
        let input = checkedFrame(stand, first, clock: sourceClock)
        let rendering = Task { await link.offer(input) }
        XCTAssertEqual(entered.wait(timeout: .now() + 5), .success)
        sourceClock.advance(2.7)
        let second = try liveKeep(stand, host: 103, shade: 90)
        await link.enqueue(checkedFrame(stand, second, clock: sourceClock))
        release.signal()
        await rendering.value
        let current = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 1, "No further callback is needed to drain N+1 after N loses current eligibility")
        XCTAssertEqual(current.session.out, 0)
        XCTAssertNil(current.session.missed)
        let image = try XCTUnwrap(connector.turns.first?["image"] as? [String: Any])
        XCTAssertEqual(image["sha256"] as? String, second.sha256)
        let files = try FileManager.default.contentsOfDirectory(atPath: stand.session.appending(path: "live").path)
        XCTAssertFalse(files.contains { $0.contains("source-loss") }, "Healthy advancement is not a fabricated source gap")
        await link.shutdown()
    }

    func testHealthyAdvanceBeforeWriterCompletionStillRefusesTheOldCurrentLine() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("advance-before-writer")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand)
        let selected = try liveSelect(stand, on: first, host: 101)
        await link.selected(selected.input, rect: selected.rect, selectionID: selected.id)
        let clock = LiveClock(100.3)
        let input = checkedFrame(stand, first, clock: clock)
        connector.holdsWrites = ["companion/turn"]
        let following = Task { await link.followUp("Explain the current frame.", assistance: .hint, fresh: input) }
        let waiting = await until(5) {
            let current = await link.currentStatus()
            return current.card?.phase == .asking && current.card?.requestID?.hasSuffix(".2") == true
        }
        XCTAssertTrue(waiting)
        clock.advance(2.7)
        let second = try liveKeep(stand, host: 103, shade: 90)
        connector.holdsWrites = []
        await following.value
        var current = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 1)
        XCTAssertEqual(current.session.state, .on)
        XCTAssertEqual(current.session.out, 0)
        XCTAssertNil(current.session.missed)
        let request = try XCTUnwrap(current.card?.requestID)
        let response = try liveRecord(stand.session, request + ".response.json")
        XCTAssertEqual(response["outcome"] as? String, "cancelled")
        XCTAssertEqual(response["delivered_to_connector"] as? Bool, false)
        await link.followUp("Explain these new pixels.", assistance: .hint,
                            fresh: checkedFrame(stand, second, clock: clock))
        current = await link.currentStatus()
        XCTAssertEqual(connector.turns.count, 2)
        XCTAssertEqual(current.card?.frameFile, second.file)
        await link.shutdown()
    }

    func testNewestUnretainedPixelsStillBlockFirstDisplayOfAnEarlierAnswer() throws {
        let trial = try recorder()
        trial.frame(facts(.complete, source: 100.2), image: try buffer(), host: 100.3, accepted: true)
        let size = try XCTUnwrap(trial.status.lastKept).byteLength
        let capped = try recorder(byteCap: size)
        capped.frame(facts(.complete, source: 100.2), image: try buffer(), host: 100.3, accepted: true)
        let first = FrameReference(try XCTUnwrap(capped.status.lastKept))
        var input = LiveFrameInput.freeze(frame: first, document: nil, captureSession: capped.directory,
                                         captureSessionID: capped.status.session, display: capped.status.display)
        input.currentSourceProblem = {
            Freshness.currentFrameProblem(capped.status, capturing: true, sequence: first.sequence, now: 103)
        }
        capped.frame(facts(.complete, source: 102.9), image: try buffer(marker: 90), host: 103, accepted: true)
        XCTAssertEqual(capped.status.lastKept?.sequence, first.sequence)
        XCTAssertGreaterThan(try XCTUnwrap(capped.status.lastNewPixelsSequence), first.sequence)
        guard case .live = Freshness.judge(capped.status, capturing: true, now: 103) else {
            return XCTFail("The source is fresh; the problem is retaining its newest pixels")
        }
        XCTAssertNotNil(input.presentationSourceProblem?(), "Unretained current pixels are still a real availability loss")
        XCTAssertNotNil(Freshness.sourceLossProblem(Freshness.currentFrameProblem(capped.status, capturing: true,
            sequence: 0, now: 103)))
    }

    func testSourceLossAfterHealthyAdvancePermanentlyRevokesUnshownAnswer() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("advance-then-true-loss")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand)
        let selected = try liveSelect(stand, on: first, host: 101)
        await link.selected(selected.input, rect: selected.rect, selectionID: selected.id)
        let clock = LiveClock(100.3)
        let input = checkedFrame(stand, first, clock: clock)
        await link.followUp("Explain this retained frame.", assistance: .hint, fresh: input)
        let card = try await liveCard(link)
        let permit = try XCTUnwrap(card.presentation)
        clock.advance(2.7)
        _ = try liveKeep(stand, host: 103, shade: 90)
        XCTAssertNil(input.presentationSourceProblem?())
        stand.recorder.frame(facts(.blank, source: 103.9), image: nil, host: 104, accepted: true)
        clock.advance(1)
        let loss = try XCTUnwrap(input.presentationSourceProblem?())
        await link.noPicture(loss)
        clock.advance(2)
        _ = try liveKeep(stand, host: 106, shade: 70)
        XCTAssertNil(input.presentationSourceProblem?(), "The capture can recover without reviving this answer's authority")
        var displayed = false
        XCTAssertFalse(permit.whileAllowed { displayed = true; return true })
        XCTAssertFalse(displayed)
        await link.answerShown(permit.requestID, presentation: permit)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stand.session.appending(path: "live/" + permit.requestID + ".shown.json").path))
        await link.shutdown()
    }
}
