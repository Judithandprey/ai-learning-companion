import Foundation
import XCTest

extension DesktopCaptureTests {
    func testLeadQueuedAnswerIsNotAcceptedAsShownAfterStop() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("lead-delayed-presentation")
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand)
        let queued = LiveLog()
        await link.setStatusHandler { queued.add($0) }
        let selection = try liveSelect(stand, on: frame, host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        let answered = try XCTUnwrap(queued.all.last { $0.card?.phase == .answered })
        let requestID = try XCTUnwrap(answered.card?.requestID)
        let shownURL = stand.session.appending(path: "live/" + requestID + ".shown.json")
        XCTAssertNotNil(answered.card?.answer)
        XCTAssertFalse(FileManager.default.fileExists(atPath: shownURL.path), "No queued answer has been displayed")
        await link.stopSession()
        let stopped = await link.currentStatus()
        XCTAssertEqual(stopped.session.state, .ended("stopped by you"))
        // Model the UI draining an already queued LiveStatus after the user's Stop.
        await link.answerShown(requestID)
        let staleReceiptExists = FileManager.default.fileExists(atPath: shownURL.path)
        print("PROBE queued_answer=true; session=\(stopped.session.state); card=\(String(describing: stopped.card?.phase)); shown_receipt_after_Stop=\(staleReceiptExists)")
        if staleReceiptExists {
            try Data(contentsOf: shownURL).write(to: URL(fileURLWithPath: "/tmp/lc-lead-live-lifecycle-3147291/stale-shown.json"))
        }
        await link.shutdown()
        XCTAssertFalse(staleReceiptExists, "A queued pre-Stop answer must not acquire a first displayed receipt after its session ended")
    }
}
