import Foundation
import XCTest
extension DesktopCaptureTests {
    func testReviewQuitWaitsForPartialCancelCleanup() async throws {
        let connector = FakeConnector()
        connector.holdsWrites = ["ask/start"]
        connector.heldWritesAreInPart = true
        connector.endDelay = 1.5
        let link = askLink(connector)
        await link.connect()
        let fixture = try askFixture("review-partial-quit")
        await link.open(fixture.input)
        let asking = Task { await link.submit(question: "Why?", assistance: .hint) }
        let sending = await until(5) { await link.currentStatus().card?.phase == .sending }
        XCTAssertTrue(sending)
        try await Task.sleep(nanoseconds: 100_000_000)
        await link.cancelCard()
        let disconnected = await until(5) { await link.currentStatus().connection == .disconnected }
        XCTAssertTrue(disconnected)
        let began = Date()
        await link.shutdown()
        let endsAtQuit = connector.ends
        print("REVIEW partial-cancel Quit returned in \(Date().timeIntervalSince(began))s; completed child ends=\(endsAtQuit)")
        // Preserve cleanup even when the assertion fails; these are in-process fakes only.
        await asking.value
        let cleaned = await until(5) { connector.ends == 1 }
        XCTAssertTrue(cleaned)
        XCTAssertEqual(endsAtQuit, 1, "Quit returned while its retired connector still awaited cleanup")
    }
}
