// Prepared review regressions for exact 3aaff3a. NOT COMPILED OR RUN here.
// The owner may add these to its existing macOS XCTest target for the correction.
import Foundation
import XCTest
@testable import DesktopCapture

final class InkDomainReviewRegressions: XCTestCase {
    private func session() -> InkSession {
        InkSession(document: InkDocument(displayID: 7, createdInSession: "review-A", createdWall: Date()))
    }

    @discardableResult
    private func stroke(_ ink: InkSession, _ coordinates: [(Double, Double)], host: Double) -> InkSession.Outcome {
        let points = coordinates.map { InkPoint(x: $0.0, y: $0.1, eventTime: host) }
        let result = ink.begin(at: points[0], device: .tabletPen,
                               anchor: InkAnchor(nativeSession: "review-A", frame: nil, host: host))
        guard result == .accepted else { return result }
        points.dropFirst().forEach { ink.extend(to: $0) }
        return ink.end(host: host)
    }

    func testErasingTheVisibleMiddleOfATwoPointStrokeMustChangeThatPortion() {
        let ink = session()
        ink.setMode(.write, host: 1)
        XCTAssertEqual(stroke(ink, [(0, 10), (100, 10)], host: 2), .accepted)
        let original = ink.document.strokes[0]
        ink.tool = .eraser
        // The drawn segment crosses this eraser path at (50, 10).
        XCTAssertEqual(stroke(ink, [(50, 0), (50, 20)], host: 3), .accepted)
        XCTAssertNotEqual(ink.document.visible, [original.id])
        XCTAssertEqual(ink.document.strokes.first, original, "editing must preserve the source stroke")
        XCTAssertEqual(ink.document.operations.last?.kind, "erase")
    }

    func testConflictSavedNewerEditableOriginalIsRecoverableAfterRestart() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "ink-review-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: root) }
        let sessionA = root.appending(path: "session-A", directoryHint: .isDirectory)
        let ink = session()
        ink.setMode(.write, host: 1)
        stroke(ink, [(0, 10), (100, 10)], host: 2)
        let store = InkStore(sessionDirectory: sessionA)
        let original = try store.save(ink.document)

        // A harmless external byte change exercises the exact conflict branch.
        var changed = try Data(contentsOf: original)
        changed.append(0x0A)
        try changed.write(to: original)
        stroke(ink, [(0, 30), (100, 30)], host: 3)
        let fork = try store.save(ink.document)
        XCTAssertNotEqual(fork, original)
        XCTAssertEqual(try Data(contentsOf: original), changed)

        // This is the current reopenLatest call path after a new capture starts.
        // It can only return a session and then load ink/ink.json. The corrected
        // API may need to return the actual selected document URL instead.
        let found = try XCTUnwrap(InkStore.latestDocument(in: root, displayID: 7))
        let recovered = try InkStore(sessionDirectory: found).load()
        XCTAssertEqual(recovered.revision, ink.document.revision,
                       "new work in a protected conflict copy must be reachable for editing")
        XCTAssertEqual(recovered.visible, ink.document.visible)
    }
}
