import CoreGraphics
import CoreMedia
import CoreVideo
import ImageIO
import ScreenCaptureKit
import XCTest
@testable import DesktopCapture

/// Synthetic buffers and attachments only: these tests exercise the recorder and the facts parser,
/// not ScreenCaptureKit, permission or a real display.
final class DesktopCaptureTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appending(path: "DesktopCaptureTests-\(UUID().uuidString)", directoryHint: .isDirectory)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    // MARK: - Fixtures

    private let display = DisplayFacts(
        displayID: 7, name: "Test Display", frame: RecordedRect(CGRect(x: 0, y: 0, width: 4, height: 2)),
        pointPixelScale: 1, requestedWidth: 4, requestedHeight: 2, rotationDegrees: 0, isMain: true, scope: "test")

    private func recorder(byteCap: Int = 1 << 20) throws -> CaptureRecorder {
        try CaptureRecorder(
            root: root, display: display,
            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: byteCap, silenceLimit: 6, showsCursor: true),
            permissionPreflightAtStart: true, wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
    }

    /// Pixels (BGRA) of a 4×2 frame: top row red, green, blue, white; bottom row black, black,
    /// black, red. Distinct corners show whether the stored image was rotated or flipped.
    private let pattern: [[UInt8]] = [
        [0, 0, 255, 255], [0, 255, 0, 255], [255, 0, 0, 255], [255, 255, 255, 255],
        [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 255, 255],
    ]

    private func buffer() throws -> CVPixelBuffer {
        var created: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
        let result = CVPixelBufferCreate(nil, 4, 2, kCVPixelFormatType_32BGRA, attributes, &created)
        XCTAssertEqual(result, kCVReturnSuccess)
        let buffer = try XCTUnwrap(created)
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(buffer)).assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        for y in 0..<2 {
            for x in 0..<4 {
                for channel in 0..<4 {
                    base[y * rowBytes + x * 4 + channel] = pattern[y * 4 + x][channel]
                }
            }
        }
        return buffer
    }

    /// Facts with a status and, when `source` is given, a `displayTime` at that host second.
    private func facts(_ status: SCFrameStatus, source: Double? = nil) -> FrameFacts {
        var attachments: [SCStreamFrameInfo: Any] = [.status: NSNumber(value: status.rawValue)]
        if let source {
            attachments[.displayTime] = NSNumber(value: HostClock.ticks(seconds: source))
        }
        return FrameFacts(attachments: attachments, presentationTime: CMTime(value: 3, timescale: 2))
    }

    /// A sample buffer carrying `image`, `pts` and the given attachments, as ScreenCaptureKit
    /// attaches them.
    private func sampleBuffer(_ image: CVPixelBuffer, pts: CMTime,
                              attachments: [SCStreamFrameInfo: Any]) throws -> CMSampleBuffer {
        var format: CMVideoFormatDescription?
        let formatResult = CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: nil, imageBuffer: image, formatDescriptionOut: &format)
        XCTAssertEqual(formatResult, noErr)
        let description = try XCTUnwrap(format)
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: pts, decodeTimeStamp: .invalid)
        var created: CMSampleBuffer?
        let sampleResult = CMSampleBufferCreateReadyWithImageBuffer(
            allocator: nil, imageBuffer: image, formatDescription: description, sampleTiming: &timing,
            sampleBufferOut: &created)
        XCTAssertEqual(sampleResult, noErr)
        let sample = try XCTUnwrap(created)
        if !attachments.isEmpty {
            let array = try XCTUnwrap(CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true))
            let dictionary = try XCTUnwrap((array as NSArray).firstObject as? NSMutableDictionary)
            for (key, value) in attachments {
                dictionary.setObject(value, forKey: key.rawValue as NSString)
            }
        }
        return sample
    }

    private func events(_ recorder: CaptureRecorder) throws -> [CaptureEvent] {
        let data = try Data(contentsOf: recorder.directory.appending(path: "events.jsonl"))
        return try data.split(separator: 0x0A).map { try CaptureFiles.decoder.decode(CaptureEvent.self, from: Data($0)) }
    }

    private func savedStatus(_ recorder: CaptureRecorder) throws -> SessionStatus {
        try CaptureFiles.decoder.decode(SessionStatus.self,
                                        from: Data(contentsOf: recorder.directory.appending(path: "status.json")))
    }

    private func files(in directory: URL) throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: directory.path(percentEncoded: false)).sorted()
    }

    /// Width, height and RGBA bytes (top row first) of a PNG, drawn into an sRGB bitmap.
    private func rgba(_ url: URL) throws -> (width: Int, height: Int, bytes: [UInt8]) {
        let source = try XCTUnwrap(CGImageSourceCreateWithURL(url as CFURL, nil))
        let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { pointer -> Bool in
            guard let context = CGContext(
                data: pointer.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        XCTAssertTrue(drawn)
        return (image.width, image.height, bytes)
    }

    // MARK: - Frame facts

    func testFactsAreReadFromSampleBufferAttachments() throws {
        let sample = try sampleBuffer(try buffer(), pts: CMTime(value: 12_500, timescale: 1000), attachments: [
            .status: NSNumber(value: SCFrameStatus.complete.rawValue),
            .displayTime: NSNumber(value: UInt64(123_456_789)),
            .contentRect: CGRect(x: 0, y: 0, width: 4, height: 2).dictionaryRepresentation,
            .contentScale: NSNumber(value: 1.0),
            .scaleFactor: NSNumber(value: 2.0),
            .dirtyRects: [CGRect(x: 1, y: 0, width: 2, height: 1).dictionaryRepresentation],
        ])
        let facts = FrameFacts(sampleBuffer: sample)
        XCTAssertEqual(facts.status, "complete")
        XCTAssertEqual(facts.displayTimeTicks, 123_456_789)
        XCTAssertEqual(facts.displayTimeSeconds, HostClock.seconds(ticks: 123_456_789))
        XCTAssertEqual(facts.presentationTime, 12.5)
        XCTAssertEqual(facts.contentRect, RecordedRect(CGRect(x: 0, y: 0, width: 4, height: 2)))
        XCTAssertEqual(facts.contentScale, 1)
        XCTAssertEqual(facts.scaleFactor, 2)
        XCTAssertEqual(facts.dirtyRects, [RecordedRect(CGRect(x: 1, y: 0, width: 2, height: 1))])
    }

    func testMissingOrUnknownFactsStayUnknown() throws {
        let bare = FrameFacts(sampleBuffer: try sampleBuffer(try buffer(), pts: .zero, attachments: [:]))
        XCTAssertEqual(bare, FrameFacts(attachments: nil, presentationTime: .zero))
        XCTAssertEqual(bare.status, "missing")
        XCTAssertNil(bare.displayTimeTicks)
        XCTAssertNil(bare.displayTimeSeconds)
        XCTAssertEqual(bare.presentationTime, 0)
        XCTAssertNil(bare.contentRect)
        XCTAssertNil(bare.contentScale)
        XCTAssertNil(bare.scaleFactor)
        XCTAssertNil(bare.dirtyRects)
        XCTAssertNil(FrameFacts(attachments: nil, presentationTime: .invalid).presentationTime)

        let odd = FrameFacts(attachments: [.status: NSNumber(value: 99), .dirtyRects: ["not a rect"]],
                             presentationTime: .positiveInfinity)
        XCTAssertEqual(odd.status, "unknown_99")
        XCTAssertNil(odd.dirtyRects, "an unreadable dirty rect is unknown, not dropped")
        XCTAssertNil(odd.presentationTime)
        XCTAssertEqual(FrameFacts(attachments: [.dirtyRects: [Any]()], presentationTime: .zero).dirtyRects, [])
        XCTAssertEqual(["complete", "idle", "blank", "suspended", "started", "stopped"],
                       [SCFrameStatus.complete, .idle, .blank, .suspended, .started, .stopped].map {
                           FrameFacts.statusName($0.rawValue)
                       })
    }

    // MARK: - Kept frames

    func testNewPixelsAreKeptAsTheExactUnrotatedPNG() throws {
        let recorder = try recorder()
        recorder.streamStarted(host: 100.5, wall: Date())
        let sample = try sampleBuffer(try buffer(), pts: CMTime(value: 3, timescale: 2),
                                      attachments: [.status: NSNumber(value: SCFrameStatus.complete.rawValue)])
        let facts = FrameFacts(sampleBuffer: sample)
        recorder.frame(facts, image: sample.imageBuffer, host: 101, accepted: true)

        let status = recorder.status
        XCTAssertEqual(status.keptFrames, 1)
        let kept = try XCTUnwrap(status.lastKept)
        XCTAssertEqual(kept.file, "frames/00000001.png")
        XCTAssertEqual(kept.sequence, 1)
        XCTAssertEqual(kept.callbackHost, 101)
        XCTAssertEqual(kept.facts, facts)
        XCTAssertEqual([kept.width, kept.height], [4, 2])
        XCTAssertEqual(kept.pixelFormat, "BGRA")
        XCTAssertEqual(kept.mediaType, "image/png")
        XCTAssertEqual(kept.encoding, FrameStore.encoding)

        let url = recorder.directory.appending(path: kept.file)
        let digest = try FrameStore.digest(of: url)
        XCTAssertEqual(digest.byteLength, kept.byteLength)
        XCTAssertEqual(digest.sha256, kept.sha256)
        XCTAssertEqual(status.bytesKept, kept.byteLength)
        // PNG signature, then IHDR: width 4, height 2, bit depth 8, colour type 6 (RGBA).
        let bytes = [UInt8](try Data(contentsOf: url))
        XCTAssertEqual(Array(bytes[0..<8]), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        XCTAssertEqual(Array(bytes[12..<16]), Array("IHDR".utf8))
        XCTAssertEqual(Array(bytes[16..<26]), [0, 0, 0, 4, 0, 0, 0, 2, 8, 6])

        // Same orientation as delivered: each pixel keeps its colour and position (sRGB
        // primaries, black and white survive colour management; ±1 allows rounding).
        let image = try rgba(url)
        XCTAssertEqual([image.width, image.height], [4, 2])
        for index in 0..<8 {
            let bgra = pattern[index]
            let expected = [bgra[2], bgra[1], bgra[0], bgra[3]]
            let actual = Array(image.bytes[index * 4..<index * 4 + 4])
            for channel in 0..<4 {
                XCTAssertLessThanOrEqual(abs(Int(actual[channel]) - Int(expected[channel])), 1,
                                         "pixel \(index) channel \(channel): \(actual) vs \(expected)")
            }
        }

        XCTAssertEqual(try files(in: recorder.directory.appending(path: "frames")), ["00000001.png"])
        XCTAssertEqual(try events(recorder).map(\.event), ["session_created", "stream_started", "kept"])
        XCTAssertEqual(try events(recorder).last?.frame, kept)
        // Kept 0.5 s after the forced stream_started write: keeping forces its own status write.
        let saved = try savedStatus(recorder)
        XCTAssertEqual(saved.lastKept, kept)
        XCTAssertEqual(saved.startedHost, 100)
        XCTAssertEqual(saved.startedWall.timeIntervalSince1970, 1_790_000_000.25, accuracy: 0.0005)
        XCTAssertEqual(saved.display, display)
        XCTAssertTrue(saved.permissionPreflightAtStart)
    }

    // MARK: - Statuses, runs and gaps

    func testStatusesRunsAndGapsAreRecorded() throws {
        let recorder = try recorder()
        let image = try buffer()
        recorder.streamStarted(host: 100, wall: Date())
        // Status, admission time and source time (displayTime); nil source means none attached.
        let steps: [(SCFrameStatus?, Double, Double?)] = [
            (.complete, 101, 101), (.idle, 102, nil), (.idle, 103, 103), (.blank, 104, 104), (.blank, 105, nil),
            (.suspended, 106, nil), (.idle, 106.5, 106.5), (.complete, 107, 107), (.complete, 120, 120), (nil, 121, nil),
        ]
        var freshness: [Freshness] = []
        for (status, host, source) in steps {
            let frameFacts = status.map { self.facts($0, source: source) }
                ?? FrameFacts(attachments: nil, presentationTime: .invalid)
            recorder.frame(frameFacts, image: image, host: host, accepted: true)
            freshness.append(Freshness.judge(recorder.status, capturing: true, now: host + 0.5))
        }
        let status = recorder.status
        XCTAssertEqual(status.callbacks, 10)
        XCTAssertEqual(status.callbacksByStatus,
                       ["complete": 3, "idle": 3, "blank": 2, "suspended": 1, "missing": 1])
        XCTAssertEqual(status.keptFrames, 3)
        XCTAssertEqual(status.lastNewPixelsSequence, 9)
        // blank run, suspended run, the 13 s silence and the missing status.
        XCTAssertEqual(status.gaps, 4)
        XCTAssertEqual(status.openRun, CallbackRun(kind: "missing", isGap: true, firstSequence: 10, lastSequence: 10,
                                                   firstHost: 121, lastHost: 121))
        XCTAssertEqual(try savedStatus(recorder).openRun?.kind, status.openRun?.kind,
                       "the open run is saved with the counts")

        let recorded = try events(recorder)
        XCTAssertEqual(recorded.compactMap(\.run), [
            CallbackRun(kind: "idle", isGap: false, firstSequence: 2, lastSequence: 3, firstHost: 102, lastHost: 103),
            CallbackRun(kind: "blank", isGap: true, firstSequence: 4, lastSequence: 5, firstHost: 104, lastHost: 105),
            CallbackRun(kind: "suspended", isGap: true, firstSequence: 6, lastSequence: 6, firstHost: 106, lastHost: 106),
            CallbackRun(kind: "idle", isGap: false, firstSequence: 7, lastSequence: 7, firstHost: 106.5, lastHost: 106.5),
        ])
        let silence = try XCTUnwrap(recorded.first { $0.event == "gap" })
        XCTAssertEqual(silence.detail?["kind"], "no_callbacks")
        XCTAssertEqual(silence.detail?["from_host"], "107.0")
        XCTAssertEqual(silence.detail?["to_host"], "120.0")
        XCTAssertEqual(silence.detail?["before_sequence"], "9")
        XCTAssertEqual(recorded.filter { $0.event == "kept" }.compactMap(\.frame?.sequence), [1, 8, 9])

        XCTAssertEqual(freshness, [
            .live(callbackAge: 0.5, pixelAge: 0.5, newPixelsAge: 0.5),
            // An idle without a source time leaves the last confirmation (101) standing.
            .live(callbackAge: 0.5, pixelAge: 1.5, newPixelsAge: 1.5),
            // An idle displayed at 103 confirms the same pixels as of 103.
            .live(callbackAge: 0.5, pixelAge: 0.5, newPixelsAge: 2.5),
            .unavailable(status: "blank", callbackAge: 0.5),
            .unavailable(status: "blank", callbackAge: 0.5),
            .unavailable(status: "suspended", callbackAge: 0.5),
            // idle after a blank/suspended run: the last new pixels are not current again.
            .unavailable(status: "idle", callbackAge: 0.5),
            .live(callbackAge: 0.5, pixelAge: 0.5, newPixelsAge: 0.5),
            .live(callbackAge: 0.5, pixelAge: 0.5, newPixelsAge: 0.5),
            .unavailable(status: "missing", callbackAge: 0.5),
        ])
        XCTAssertEqual(status.sourceTimeUnknown, ["missing": 1], "only the idle at 102 lacked a source time")
    }

    func testStatusOnlyAndUnknownCallbacksClearCurrentPixels() throws {
        let recorder = try recorder()
        let image = try buffer()
        recorder.streamStarted(host: 100, wall: Date())
        recorder.frame(facts(.complete), image: image, host: 101, accepted: true)
        recorder.frame(facts(.started), image: nil, host: 102, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 102.5),
                       .unavailable(status: "started", callbackAge: 0.5))
        recorder.frame(FrameFacts(attachments: [.status: NSNumber(value: 99)], presentationTime: .zero),
                       image: image, host: 103, accepted: true)

        let status = recorder.status
        XCTAssertEqual(status.callbacksByStatus, ["complete": 1, "started": 1, "unknown_99": 1])
        XCTAssertEqual(status.keptFrames, 1, "an unknown status with an image is not new pixels")
        XCTAssertEqual(status.gaps, 1)
        XCTAssertEqual(status.openRun?.kind, "unknown_99")
        let statusEvent = try XCTUnwrap(try events(recorder).first { $0.event == "stream_status" })
        XCTAssertEqual(statusEvent.detail, ["status": "started", "sequence": "2"])
        XCTAssertEqual(Freshness.judge(status, capturing: true, now: 103.5),
                       .unavailable(status: "unknown_99", callbackAge: 0.5))
    }

    func testCompleteWithoutImageIsAGapNotNewPixels() throws {
        let recorder = try recorder()
        recorder.frame(facts(.complete), image: nil, host: 101, accepted: true)
        XCTAssertEqual(recorder.status.gaps, 1)
        XCTAssertNil(recorder.status.lastNewPixelsHost)
        XCTAssertEqual(try events(recorder).last?.detail?["kind"], "complete_without_image")
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 102),
                       .unavailable(status: "no new pixels yet (complete)", callbackAge: 1))
    }

    // MARK: - Stop and ending

    func testNothingIsKeptOrLiveAfterLiveClaimsEnd() throws {
        let recorder = try recorder()
        let image = try buffer()
        recorder.streamStarted(host: 100, wall: Date())
        recorder.frame(facts(.complete, source: 101), image: image, host: 101, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 101.5),
                       .live(callbackAge: 0.5, pixelAge: 0.5, newPixelsAge: 0.5))
        // The gate closed at 101.5; the controller passes capturing: false from then on.
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: false, now: 101.5), .notLive(reason: "not capturing"))
        recorder.frame(facts(.complete), image: image, host: 101.6, accepted: false)
        recorder.finish(reason: "user_stop", detail: nil, liveEndedHost: 101.5, host: 102, wall: Date())
        recorder.frame(facts(.complete), image: image, host: 102.5, accepted: true)

        let status = recorder.status
        XCTAssertEqual(status.callbacks, 1)
        XCTAssertEqual(status.keptFrames, 1)
        XCTAssertEqual(status.callbacksAfterLiveEnded, 2)
        XCTAssertFalse(status.pixelsCurrent)
        XCTAssertEqual(status.ending?.reason, "user_stop")
        XCTAssertEqual(status.ending?.liveEndedHost, 101.5)
        XCTAssertEqual(status.ending?.host, 102)
        XCTAssertEqual(try files(in: recorder.directory.appending(path: "frames")), ["00000001.png"])
        XCTAssertEqual(try events(recorder).map(\.event),
                       ["session_created", "stream_started", "kept", "ended", "callback_after_end"])
        XCTAssertEqual(try events(recorder)[3].detail?["callbacks_after_live_ended"], "1")
        XCTAssertEqual(Freshness.judge(status, capturing: true, now: 102.6), .notLive(reason: "user_stop"))
        XCTAssertEqual(try savedStatus(recorder).ending?.reason, "user_stop")

        recorder.finish(reason: "stream_error", detail: nil, liveEndedHost: 103, host: 103, wall: Date())
        XCTAssertEqual(recorder.status.ending?.reason, "user_stop", "the first ending is kept")
    }

    func testSilenceBeforeTheEndIsAGap() throws {
        let recorder = try recorder()
        recorder.streamStarted(host: 100, wall: Date())
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 103), .unknown(silentFor: 3))
        recorder.finish(reason: "stopped_by_system", detail: "test", liveEndedHost: 110, host: 110.2, wall: Date())
        let gap = try XCTUnwrap(try events(recorder).first { $0.event == "gap" })
        XCTAssertEqual(gap.detail?["kind"], "no_callbacks")
        XCTAssertEqual(gap.detail?["from_host"], "100.0")
        XCTAssertEqual(gap.detail?["to_host"], "110.0")
        XCTAssertEqual(recorder.status.gaps, 1)
    }

    func testFreshnessNeedsARecentCallback() throws {
        let recorder = try recorder()
        XCTAssertEqual(Freshness.judge(nil, capturing: true, now: 1), .notLive(reason: "not started"))
        recorder.streamStarted(host: 100, wall: Date())
        recorder.frame(facts(.complete, source: 101), image: try buffer(), host: 101, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 107),
                       .live(callbackAge: 6, pixelAge: 6, newPixelsAge: 6))
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 107.5), .unknown(silentFor: 6.5))
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 100), .unknown(silentFor: 0),
                       "a callback later than now is not evidence of freshness")
    }

    // MARK: - Source time and delayed samples

    func testDelayedSampleIsNotLive() throws {
        let recorder = try recorder()
        let image = try buffer()
        recorder.streamStarted(host: 100, wall: Date())
        recorder.frame(facts(.complete, source: 101), image: image, host: 101, accepted: true)
        // The queue was busy: pixels on screen at 102 are processed only at 110.
        recorder.frame(facts(.complete, source: 102), image: image, host: 110, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 110.5),
                       .stale(pixelAge: 8.5, callbackAge: 0.5), "a recent callback does not make old pixels fresh")
        XCTAssertEqual(recorder.status.lastKept?.callbackHost, 110)
        XCTAssertEqual(recorder.status.lastKept?.sourceHost, 102)

        // An idle displayed at 110 confirms those pixels as of 110.
        recorder.frame(facts(.idle, source: 110), image: nil, host: 110.5, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 111),
                       .live(callbackAge: 0.5, pixelAge: 1, newPixelsAge: 9))

        // New pixels without a source time, or with one later than their callback, have an unknown age.
        recorder.frame(facts(.complete), image: image, host: 111, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 111.5), .pixelAgeUnknown(callbackAge: 0.5))
        XCTAssertNil(recorder.status.lastKept?.sourceHost)
        recorder.frame(facts(.complete, source: 113), image: image, host: 112, accepted: true)
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: true, now: 112.5), .pixelAgeUnknown(callbackAge: 0.5))
        XCTAssertEqual(recorder.status.sourceTimeUnknown, ["missing": 1, "after_callback": 1])
        let saved = try savedStatus(recorder)
        XCTAssertEqual(saved.lastKept?.sequence, 5)
        XCTAssertNil(saved.lastKept?.sourceHost)
    }

    // MARK: - Admission at Stop

    func testFrameAdmittedBeforeStopIsKeptAndNothingAfter() throws {
        let recorder = try recorder()
        let image = try buffer()
        let gate = LiveGate()
        recorder.streamStarted(host: 100, wall: Date())
        // A callback is admitted at 101; Stop closes the gate at 101.5 while that frame still waits
        // to be encoded; a callback at 101.6 is not admitted.
        let admitted = try XCTUnwrap(gate.admit(clock: { 101 }))
        XCTAssertTrue(gate.close("user_stop", clock: { 101.5 }))
        XCTAssertNil(gate.admit(clock: { 101.6 }))
        recorder.frame(facts(.complete, source: 101), image: image, host: admitted, accepted: true)
        recorder.frame(facts(.complete, source: 101.6), image: image, host: 101.6, accepted: false)
        // The controller passes `capturing: false` once the gate has closed.
        XCTAssertEqual(Freshness.judge(recorder.status, capturing: gate.isOpen, now: 101.7),
                       .notLive(reason: "not capturing"))
        let closure = try XCTUnwrap(gate.closure)
        recorder.finish(reason: closure.reason, detail: nil, liveEndedHost: closure.host, host: 102, wall: Date())

        let status = recorder.status
        let kept = try XCTUnwrap(status.lastKept)
        let ending = try XCTUnwrap(status.ending)
        XCTAssertEqual(status.keptFrames, 1, "the admitted original is preserved")
        XCTAssertEqual(status.callbacksAfterLiveEnded, 1)
        XCTAssertLessThan(kept.callbackHost, ending.liveEndedHost)
        XCTAssertEqual(try files(in: recorder.directory.appending(path: "frames")), ["00000001.png"])
        XCTAssertEqual(try events(recorder).map(\.event), ["session_created", "stream_started", "kept", "ended"])
    }

    // MARK: - Cancellable Start

    @MainActor
    func testStopWhileListingDisplaysCreatesNothing() async {
        let gate = LiveGate()
        let steps = StartSteps()
        let start = Task { await steps.run(gate) }
        await steps.waitUntilListing()
        XCTAssertTrue(gate.close("user_stop"))
        steps.listing?.resume(returning: 1)
        let outcome = await start.value
        XCTAssertEqual(outcome, .stoppedBeforeSession)
        XCTAssertEqual(steps.calls, ["find"], "no session is opened and no stream is started")
    }

    @MainActor
    func testStopWhileTheStreamStartsStopsIt() async {
        let gate = LiveGate()
        let steps = StartSteps(startWaits: true)
        let start = Task { await steps.run(gate) }
        await steps.waitUntilListing()
        steps.listing?.resume(returning: 1)
        await steps.waitUntilStarting()
        XCTAssertTrue(gate.close("user_stop"))
        steps.starting?.resume()
        let outcome = await start.value
        XCTAssertEqual(outcome, .stoppedAfterSession)
        XCTAssertEqual(steps.calls, ["find", "open", "start", "stop"])
    }

    @MainActor
    func testStartOutcomes() async {
        let started = StartSteps()
        let startedRun = Task { await started.run(LiveGate()) }
        await started.waitUntilListing()
        started.listing?.resume(returning: 1)
        let startedOutcome = await startedRun.value
        XCTAssertEqual(startedOutcome, .started)
        XCTAssertEqual(started.calls, ["find", "open", "start"])

        let failing = StartSteps()
        let failingGate = LiveGate()
        let failingRun = Task { await failing.run(failingGate) }
        await failing.waitUntilListing()
        failing.listing?.resume(throwing: NSError(domain: "Test", code: 1))
        let failingOutcome = await failingRun.value
        XCTAssertEqual(failingOutcome, .failed(step: "find", reason: StopReason(NSError(domain: "Test", code: 1)).summary))

        let late = StartSteps()
        let lateGate = LiveGate()
        let lateRun = Task { await late.run(lateGate) }
        await late.waitUntilListing()
        lateGate.close("user_stop")
        late.listing?.resume(throwing: NSError(domain: "Test", code: 2))
        let lateOutcome = await lateRun.value
        XCTAssertEqual(lateOutcome, .stoppedBeforeSession, "a failure after Stop is not reported as a start failure")

        let closed = StartSteps()
        let closedGate = LiveGate()
        closedGate.close("user_stop")
        let closedOutcome = await closed.run(closedGate)
        XCTAssertEqual(closedOutcome, .stoppedBeforeSession)
        XCTAssertEqual(closed.calls, [], "a Start stopped before it runs does not even list displays")
    }

    // MARK: - Retention cap

    func testNewPixelsBeyondTheBudgetAreNotKept() throws {
        let recorder = try recorder(byteCap: 10)
        let image = try buffer()
        recorder.frame(facts(.complete), image: image, host: 101, accepted: true)
        recorder.frame(facts(.complete), image: image, host: 102, accepted: true)
        let status = recorder.status
        XCTAssertEqual(status.keptFrames, 0)
        XCTAssertEqual(status.bytesKept, 0)
        XCTAssertEqual(status.notRetained, ["over_budget": 1, "retention_cap_reached": 1])
        XCTAssertEqual(status.gaps, 1)
        XCTAssertTrue(status.pixelsCurrent, "the screen was observed even though it was not kept")
        XCTAssertEqual(try files(in: recorder.directory.appending(path: "frames")), [], "no candidate is left behind")
        XCTAssertEqual(try events(recorder).first { $0.event == "gap" }?.detail?["kind"], "retention_cap_reached")
        XCTAssertEqual(status.openRun?.kind, "not_retained_retention_cap_reached")
    }

    // MARK: - Sample session for the desktop metadata mapping

    /// Writes one session with the recorder's real encoders so the record format can be reviewed.
    /// With COMPANION_DESKTOP_FIXTURE_DIR set, the session directory is kept under that directory;
    /// otherwise it goes to this test's temporary directory. The inputs are synthetic: a 4×2 buffer
    /// and hand-set attachments, not ScreenCaptureKit output or a real display.
    func testWritesSampleSessionForMapping() throws {
        let fixtureRoot = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) } ?? root!
        let recorder = try CaptureRecorder(
            root: fixtureRoot,
            display: DisplayFacts(
                displayID: 1, name: "Synthetic Display", frame: RecordedRect(CGRect(x: 0, y: 0, width: 4, height: 2)),
                pointPixelScale: 1, requestedWidth: 4, requestedHeight: 2, rotationDegrees: 0, isMain: true,
                scope: "synthetic fixture; not a captured display"),
            settings: .engineeringDefaults, permissionPreflightAtStart: false,
            wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        recorder.streamStarted(host: 100.5, wall: Date(timeIntervalSince1970: 1_790_000_000.75))
        let complete = try sampleBuffer(try buffer(), pts: CMTime(value: 101_000, timescale: 1000), attachments: [
            .status: NSNumber(value: SCFrameStatus.complete.rawValue),
            .displayTime: NSNumber(value: UInt64(2_424_000_000)),
            .contentRect: CGRect(x: 0, y: 0, width: 4, height: 2).dictionaryRepresentation,
            .contentScale: NSNumber(value: 1.0),
            .scaleFactor: NSNumber(value: 1.0),
            .dirtyRects: [CGRect(x: 0, y: 0, width: 4, height: 1).dictionaryRepresentation],
        ])
        recorder.frame(FrameFacts(sampleBuffer: complete), image: complete.imageBuffer, host: 101, accepted: true)
        recorder.frame(facts(.idle), image: nil, host: 103, accepted: true)
        recorder.frame(facts(.blank), image: nil, host: 105, accepted: true)
        recorder.frame(FrameFacts(sampleBuffer: complete), image: complete.imageBuffer, host: 107, accepted: true)
        recorder.note("display_parameters_changed", host: 108, detail: ["rotation_degrees": "0.0", "note": "synthetic"])
        recorder.finish(reason: "user_stop", detail: nil, liveEndedHost: 109, host: 109.5,
                        wall: Date(timeIntervalSince1970: 1_790_000_009.75))

        XCTAssertEqual(try events(recorder).map(\.event), [
            "session_created", "stream_started", "kept", "run", "run", "kept", "display_parameters_changed", "ended",
        ])
        let saved = try savedStatus(recorder)
        XCTAssertEqual(saved.keptFrames, 2)
        XCTAssertEqual(saved.lastKept?.facts.dirtyRects, [RecordedRect(CGRect(x: 0, y: 0, width: 4, height: 1))])
        XCTAssertEqual(saved.ending?.reason, "user_stop")
        XCTAssertEqual(try files(in: recorder.directory), ["events.jsonl", "frames", "status.json"])
        XCTAssertEqual(try files(in: recorder.directory.appending(path: "frames")), ["00000001.png", "00000004.png"])
    }

    // MARK: - Gate, stop reasons and the reviewed store

    func testLiveGateKeepsTheFirstClosureAndAdmitsNothingAfterIt() {
        let gate = LiveGate()
        XCTAssertTrue(gate.isOpen)
        XCTAssertEqual(gate.admit(clock: { 4 }), 4)
        XCTAssertTrue(gate.close("user_stop", clock: { 5 }))
        XCTAssertFalse(gate.close("stopped_by_system", clock: { 6 }))
        XCTAssertNil(gate.admit(clock: { 7 }))
        XCTAssertFalse(gate.isOpen)
        XCTAssertEqual(gate.closure, LiveGate.Closure(reason: "user_stop", host: 5))
    }

    func testStopReasonsKeepTheOriginalError() {
        let declined = StopReason(NSError(domain: SCStreamErrorDomain, code: SCStreamError.Code.userDeclined.rawValue))
        XCTAssertEqual(declined.kind, "permission_declined")
        XCTAssertEqual(declined.domain, SCStreamErrorDomain)
        XCTAssertEqual(declined.code, SCStreamError.Code.userDeclined.rawValue)
        XCTAssertEqual(StopReason(NSError(domain: SCStreamErrorDomain,
                                          code: SCStreamError.Code.noCaptureSource.rawValue)).kind,
                       "capture_source_unavailable")
        XCTAssertEqual(StopReason(NSError(domain: SCStreamErrorDomain, code: 12_345)).kind, "stream_error")
        XCTAssertEqual(StopReason(NSError(domain: "Other", code: 1)).kind, "error")
    }

    func testSessionsNeverShareADirectory() throws {
        let first = try recorder()
        let second = try recorder()
        XCTAssertNotEqual(first.directory, second.directory)
        XCTAssertEqual(try files(in: root).count, 2)
    }

    func testFrameStoreIsTheReviewedScreenObserverCopy() throws {
        let package = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        let copy = try Data(contentsOf: package.appending(path: "Sources/DesktopCapture/FrameStore.swift"))
        let reviewed = try Data(contentsOf: package.appending(path: "../../ios/ScreenObserver/BroadcastUpload/FrameStore.swift"))
        XCTAssertEqual(copy, reviewed)
    }
}

/// `CaptureStart` steps whose display listing, and optionally stream start, wait until the test
/// resumes them. Integers stand in for the display list and the session.
@MainActor
private final class StartSteps {
    var listing: CheckedContinuation<Int, Error>?
    var starting: CheckedContinuation<Void, Error>?
    var calls: [String] = []
    private let startWaits: Bool

    init(startWaits: Bool = false) {
        self.startWaits = startWaits
    }

    func run(_ gate: LiveGate) async -> CaptureStart.Outcome {
        await CaptureStart.run(
            gate: gate,
            find: { () async throws -> Int in
                self.calls.append("find")
                return try await withCheckedThrowingContinuation { self.listing = $0 }
            },
            open: { (target: Int) throws -> Int in
                self.calls.append("open")
                return target
            },
            start: { (_: Int) async throws in
                self.calls.append("start")
                if self.startWaits {
                    try await withCheckedThrowingContinuation { self.starting = $0 }
                }
            },
            stopStarted: { (_: Int) async in
                self.calls.append("stop")
            })
    }

    func waitUntilListing() async {
        while listing == nil {
            await Task.yield()
        }
    }

    func waitUntilStarting() async {
        while starting == nil {
            await Task.yield()
        }
    }
}
