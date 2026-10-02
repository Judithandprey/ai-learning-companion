import CoreGraphics
import CoreMedia
import CoreVideo
import ScreenCaptureKit
import XCTest
@testable import DesktopCapture

/// Synthetic recorder callbacks only; these tests establish current-frame admission, not
/// native capture, device permissions or real AI receipt.
final class LiveFreshnessTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appending(path: "LiveFreshnessTests-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        if let root { try? FileManager.default.removeItem(at: root) }
    }

    private func recorder() throws -> CaptureRecorder {
        let display = DisplayFacts(displayID: 7, name: "Synthetic", frame: RecordedRect(CGRect(x: 0, y: 0, width: 4, height: 2)),
                                   pointPixelScale: 1, requestedWidth: 4, requestedHeight: 2,
                                   rotationDegrees: 0, isMain: true, scope: "test")
        let recorder = try CaptureRecorder(root: root.appending(path: UUID().uuidString), display: display,
                                           settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 20,
                                                                     silenceLimit: 6, showsCursor: true),
                                           permissionPreflightAtStart: true, host: 100)
        recorder.streamStarted(host: 100, wall: Date())
        return recorder
    }

    private func image() throws -> CVPixelBuffer {
        var created: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
        XCTAssertEqual(CVPixelBufferCreate(nil, 4, 2, kCVPixelFormatType_32BGRA, attributes, &created), kCVReturnSuccess)
        let image = try XCTUnwrap(created)
        CVPixelBufferLockBaseAddress(image, [])
        defer { CVPixelBufferUnlockBaseAddress(image, []) }
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(image)).assumingMemoryBound(to: UInt8.self)
        for row in 0..<2 {
            base.advanced(by: row * CVPixelBufferGetBytesPerRow(image)).initialize(repeating: 255, count: 16)
        }
        return image
    }

    private func facts(_ status: SCFrameStatus, source: Double? = nil) -> FrameFacts {
        var attachments: [SCStreamFrameInfo: Any] = [.status: NSNumber(value: status.rawValue)]
        if let source { attachments[.displayTime] = NSNumber(value: HostClock.ticks(seconds: source)) }
        return FrameFacts(attachments: attachments, presentationTime: .zero)
    }

    private func seed(_ recorder: CaptureRecorder) throws -> Int {
        recorder.frame(facts(.complete, source: 101), image: try image(), host: 101, accepted: true)
        return try XCTUnwrap(recorder.status.lastKept?.sequence)
    }

    func testHealthyIdleConfirmsOldPixelsWithoutChangingTheirSequence() throws {
        let recorder = try recorder()
        let sequence = try seed(recorder)
        recorder.frame(facts(.idle, source: 107), image: nil, host: 107, accepted: true)
        XCTAssertEqual(recorder.status.lastNewPixelsSequence, sequence)
        XCTAssertEqual(recorder.status.lastNewPixelsSourceHost, 101)
        XCTAssertEqual(recorder.status.keptFrames, 1)
        XCTAssertNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 107.5),
                     "old pixel creation time does not invalidate a recent idle source confirmation")
    }

    func testCallbackSilenceLosesCurrentInputAndValidIdleRestoresTheSameFrame() throws {
        let recorder = try recorder()
        let sequence = try seed(recorder)
        let problem = Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 108)
        XCTAssertNotNil(problem)
        XCTAssertEqual(problem, Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 109),
                       "continuing silence has a stable reason")
        recorder.frame(facts(.idle, source: 110), image: nil, host: 110, accepted: true)
        XCTAssertEqual(recorder.status.lastKept?.sequence, sequence)
        XCTAssertEqual(recorder.status.lastNewPixelsSequence, sequence)
        XCTAssertNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 110.5))
        XCTAssertEqual(recorder.status.gaps, 1, "the recovered current picture does not erase the silent interval")
    }

    func testBlankSuspendedAndMissingImageNeedNewPixelsToRecover() throws {
        for loss in [SCFrameStatus.blank, .suspended, .complete] {
            let recorder = try recorder()
            let sequence = try seed(recorder)
            recorder.frame(facts(loss, source: 102), image: nil, host: 102, accepted: true)
            XCTAssertEqual(recorder.status.lastKept?.sequence, sequence)
            XCTAssertEqual(recorder.status.lastNewPixelsSequence, sequence)
            XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 102.5))
            recorder.frame(facts(.idle, source: 103), image: nil, host: 103, accepted: true)
            XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 103.5),
                            "idle cannot restore pixels invalidated by \(loss)")
            recorder.frame(facts(.complete, source: 104), image: try image(), host: 104, accepted: true)
            let fresh = try XCTUnwrap(recorder.status.lastKept?.sequence)
            XCTAssertGreaterThan(fresh, sequence)
            XCTAssertNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: fresh, now: 104.5))
        }
    }

    func testMissingCallbackStatusCannotReuseTheRetainedFrame() throws {
        let recorder = try recorder()
        let sequence = try seed(recorder)
        recorder.frame(FrameFacts(attachments: nil, presentationTime: .invalid), image: try image(), host: 102, accepted: true)
        XCTAssertEqual(recorder.status.lastKept?.sequence, sequence)
        XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 102.5))
    }

    func testMissingZeroAndInvalidFutureSourceTimeRefuseThenIdleCanConfirmPixels() throws {
        for source in [nil, 0, 103] as [Double?] {
            let recorder = try recorder()
            recorder.frame(facts(.complete, source: source), image: try image(), host: 101, accepted: true)
            let sequence = try XCTUnwrap(recorder.status.lastKept?.sequence)
            XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 101.5), .pixelAgeUnknown(callbackAge: 0.5))
            XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 101.5))
            recorder.frame(facts(.idle, source: 102), image: nil, host: 102, accepted: true)
            XCTAssertEqual(recorder.status.lastNewPixelsSequence, sequence)
            XCTAssertNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 102.5))
        }
    }

    func testRecentCallbackDoesNotMakeStaleSourcePixelsCurrent() throws {
        let recorder = try recorder()
        recorder.frame(facts(.complete, source: 101), image: try image(), host: 110, accepted: true)
        let sequence = try XCTUnwrap(recorder.status.lastKept?.sequence)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 110.5), .stale(pixelAge: 9.5, callbackAge: 0.5))
        XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 110.5))
        recorder.frame(facts(.idle, source: 111), image: nil, host: 111, accepted: true)
        XCTAssertNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 111.5))
    }

    func testStopGateRefusesBeforeEndingAndLaterCallbacksCannotRestoreIt() throws {
        let recorder = try recorder()
        let sequence = try seed(recorder)
        let gate = LiveGate()
        gate.close("user_stop", clock: { 101.5 })
        XCTAssertNil(recorder.status.ending, "the gate is authoritative before the ending is written")
        XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: gate.isOpen, sequence: sequence, now: 101.5))
        recorder.frame(facts(.complete, source: 102), image: try image(), host: 102, accepted: gate.isOpen)
        XCTAssertEqual(recorder.status.lastKept?.sequence, sequence)
        XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: gate.isOpen, sequence: sequence, now: 102.5))
    }

    func testFreshnessAloneCannotAuthorizeAMismatchedRetainedSequence() throws {
        let recorder = try recorder()
        let sequence = try seed(recorder)
        XCTAssertNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence, now: 101.5))
        XCTAssertNotNil(Freshness.currentFrameProblem(recorder.status, capturing: true, sequence: sequence + 1, now: 101.5))
        var state = recorder.status
        state.lastNewPixelsSequence = sequence + 1
        XCTAssertNotNil(Freshness.currentFrameProblem(state, capturing: true, sequence: sequence, now: 101.5))
        state.lastKept = nil
        XCTAssertNotNil(Freshness.currentFrameProblem(state, capturing: true, sequence: sequence + 1, now: 101.5))
    }
}
