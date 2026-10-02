import Foundation
import FoundationNetworking
import Glibc
import XCTest

/// Composed images: each kept frame's raw original with the ink committed when its pixels were on
/// screen. Real encoded synthetic pixels (a uniform grey 200×100 buffer for a 100×50 pt display);
/// not ScreenCaptureKit output, the app's exclusion filter, an overlay or pen hardware. With
/// COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR set to a new directory, the first test's session is kept
/// there for checks/validate_composed_frames.py.
extension DesktopCaptureTests {
    private var composedDisplay: DisplayFacts {
        DisplayFacts(displayID: 7, name: "Synthetic Display", frame: RecordedRect(CGRect(x: 0, y: 0, width: 100, height: 50)),
                     pointPixelScale: 2, requestedWidth: 200, requestedHeight: 100, rotationDegrees: 0, isMain: true,
                     scope: DisplayFacts.appExcludedScope(showsCursor: true))
    }

    private func composingRecorder(root: URL, display: DisplayFacts? = nil) throws -> CaptureRecorder {
        try CaptureRecorder(root: root, display: display ?? composedDisplay,
                            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 24, silenceLimit: 6, showsCursor: true),
                            permissionPreflightAtStart: true, composesInk: true,
                            wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
    }

    /// A uniform 200×100 BGRA buffer.
    private func greyBuffer(_ level: UInt8 = 128) throws -> CVPixelBuffer {
        var created: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
        XCTAssertEqual(CVPixelBufferCreate(nil, 200, 100, kCVPixelFormatType_32BGRA, attributes, &created), kCVReturnSuccess)
        let buffer = try XCTUnwrap(created)
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(buffer)).assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        for y in 0..<100 {
            for x in 0..<200 {
                for channel in 0..<4 {
                    base[y * rowBytes + x * 4 + channel] = channel == 3 ? 255 : level
                }
            }
        }
        return buffer
    }

    /// Keeps one frame with the given source time (nil: none) and callback time.
    @discardableResult
    private func keep(_ recorder: CaptureRecorder, source: Double?, callback: Double) throws -> KeptFrame {
        recorder.frame(facts(.complete, source: source), image: try greyBuffer(), host: callback, accepted: true)
        return try XCTUnwrap(recorder.status.lastKept)
    }

    private func pixel(_ image: (width: Int, height: Int, bytes: [UInt8]), _ x: Int, _ y: Int) -> [Int] {
        (0..<4).map { Int(image.bytes[(y * image.width + x) * 4 + $0]) }
    }

    private func isInk(_ value: [Int]) -> Bool { value[0] > 240 && value[1] < 80 && value[2] < 70 && value[3] > 250 }

    private func isRaw(_ value: [Int]) -> Bool { value.prefix(3).allSatisfy { abs($0 - 128) <= 2 } }

    /// A document with one stroke across the display, committed at host 99.9, open from 99.5.
    private func inkedSpan(_ session: String) -> InkSpan {
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: session, createdWall: Date(timeIntervalSince1970: 1_790_000_000)))
        ink.setMode(.write, host: 99.6)
        _ = ink.begin(at: InkPoint(x: 10, y: 25, eventTime: 99.9), device: .tabletPen,
                      anchor: InkAnchor(nativeSession: session, frame: nil, host: 99.9))
        ink.extend(to: InkPoint(x: 90, y: 25, eventTime: 99.9))
        ink.end(host: 99.9)
        return InkSpan(document: ink.document, file: session + "/ink/ink.json", opened: 99.5)
    }

    private func composedRecords(_ recorder: CaptureRecorder) throws -> [Int: ComposedFrame] {
        Dictionary(uniqueKeysWithValues: try events(recorder).compactMap(\.composed).map { ($0.rawSequence, $0) })
    }

    // MARK: - Composition follows the ink revision at the pixels' time

    func testComposedImagesDrawTheInkCommittedWhenThePixelsWereOnScreen() throws {
        let fixtureDirectory = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
        if let fixtureDirectory {
            guard !FileManager.default.fileExists(atPath: fixtureDirectory.path(percentEncoded: false)) else {
                XCTFail("fixtures are written only to a new directory: \(fixtureDirectory.path(percentEncoded: false))")
                return
            }
        }
        let recorder = try composingRecorder(root: fixtureDirectory ?? root.appending(path: "composed", directoryHint: .isDirectory))
        recorder.streamStarted(host: 100, wall: Date(timeIntervalSince1970: 1_790_000_000.5))
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: recorder.status.session,
                                                   createdWall: Date(timeIntervalSince1970: 1_790_000_000.5)))
        func draw(_ points: [(Double, Double)], host: Double) {
            let inputs = points.map { InkPoint(x: $0.0, y: $0.1, eventTime: host) }
            XCTAssertEqual(ink.begin(at: inputs[0], device: .tabletPen, anchor: InkAnchor(nativeSession: nil, frame: nil, host: host)), .accepted)
            inputs.dropFirst().forEach { ink.extend(to: $0) }
            XCTAssertEqual(ink.end(host: host), .accepted)
        }
        ink.setMode(.write, host: 100.5)
        var frames: [KeptFrame] = []
        // Frame 1: pixels at 100.9, before any stroke.
        frames.append(try keep(recorder, source: 100.9, callback: 101))
        // A stroke 10 pt from the top (pixel row 20), x 10…90 pt.
        draw([(10, 10), (90, 10)], host: 101.5)
        frames.append(try keep(recorder, source: 102, callback: 102.1))            // revision 1
        ink.tool = .eraser
        draw([(50, 0), (50, 20)], host: 102.5)                                       // x 42…58 pt erased
        frames.append(try keep(recorder, source: 103, callback: 103.1))            // revision 2
        XCTAssertEqual(ink.undo(host: 103.5), .accepted)
        frames.append(try keep(recorder, source: 104, callback: 104.1))            // revision 3: whole stroke
        XCTAssertEqual(ink.redo(host: 104.5), .accepted)
        frames.append(try keep(recorder, source: 105, callback: 105.1))            // revision 4: erased again
        // Frame 6: no source time; paired at its callback admission.
        frames.append(try keep(recorder, source: nil, callback: 105.6))
        // Frame 7: the display rotates first; its pixels are not composed.
        var geometry = DisplayGeometry(started: composedDisplay)
        frames.append(try keep(recorder, source: 106, callback: 106.1))
        geometry.observe(widthPoints: 50, heightPoints: 100, rotationDegrees: 90, host: 105.8)

        // Every frame is paired only now, after all the ink changes: each still gets the revision
        // committed when its pixels were on screen.
        let span = InkSpan(document: ink.document, file: recorder.status.session + "/ink/ink.json", opened: 100.5)
        for frame in frames {
            recorder.compose(InkComposer.request(for: frame, display: composedDisplay, spans: [span], geometry: geometry),
                             host: 107)
        }
        recorder.finish(reason: "user_stop", detail: nil, liveEndedHost: 107.5, host: 107.6,
                        wall: Date(timeIntervalSince1970: 1_790_000_008))
        // The document the records name, so the validator can replay each revision.
        XCTAssertEqual(try InkStore(sessionDirectory: recorder.directory).save(ink.document).lastPathComponent, "ink.json")

        let records = try composedRecords(recorder)
        XCTAssertEqual(records.keys.sorted(), [1, 2, 3, 4, 5, 6])
        XCTAssertEqual(records.values.sorted { $0.rawSequence < $1.rawSequence }.map { $0.ink.revision },
                       [0, 1, 2, 3, 4, 4])
        XCTAssertEqual(records[2]?.ink.strokes, ["s1"])
        XCTAssertEqual(records[3]?.ink.strokes, ["s2", "s3"])
        XCTAssertEqual(records[4]?.ink.strokes, ["s1"])
        XCTAssertEqual(records[5]?.ink.strokes, ["s2", "s3"])
        XCTAssertEqual(records[1]?.ink.strokes, [])
        XCTAssertEqual(records[2]?.ink.revisionHost, 101.5)
        XCTAssertEqual(records[5]?.ink.revisionHost, 104.5)
        XCTAssertEqual(records[5]?.ink.pixelsTime, "source_time")
        XCTAssertEqual(records[6]?.ink.pixelsTime, "callback_admission")
        XCTAssertEqual(records[6]?.ink.pixelsHost, 105.6)
        XCTAssertTrue(records[6]?.ink.limits.contains { $0.contains("pixels' own time is unknown") } == true)
        XCTAssertEqual(records[2]?.ink.document?.file, recorder.status.session + "/ink/ink.json")

        let rows = try events(recorder)
        let refusal = try XCTUnwrap(rows.first { $0.event == "not_composed" })
        XCTAssertEqual(refusal.detail?["sequence"], String(frames[6].sequence))
        XCTAssertEqual(refusal.detail?["reason"], "refused")
        XCTAssertTrue(refusal.detail?["detail"]?.hasPrefix("before these pixels, the display measured 50×100 pt at 90°") == true,
                      refusal.detail?["detail"] ?? "")
        XCTAssertEqual(rows.last?.event, "ended")
        let saved = try savedStatus(recorder)
        XCTAssertEqual(saved.composedFrames, 6)
        XCTAssertEqual(saved.composedBytes, try (2...6).reduce(0) { $0 + (try XCTUnwrap(records[$1])).byteLength })
        XCTAssertEqual(saved.notComposed, ["refused": 1])
        XCTAssertNil(saved.lateCompositionRequests)

        for (sequence, record) in records {
            let frame = try XCTUnwrap(frames.first { $0.sequence == sequence })
            XCTAssertEqual([record.rawFile, record.rawSHA256], [frame.file, frame.sha256])
            XCTAssertEqual(record.rawByteLength, frame.byteLength)
            if record.ink.strokes.isEmpty {
                XCTAssertEqual([record.file, record.sha256], [frame.file, frame.sha256], "no strokes: the raw original itself")
            } else {
                XCTAssertEqual(record.file, String(format: "composed/%08ld.png", sequence))
            }
            let digest = try FrameStore.digest(of: recorder.directory.appending(path: record.file))
            XCTAssertEqual([digest.sha256, String(digest.byteLength)], [record.sha256, String(record.byteLength)])
            XCTAssertEqual([record.width, record.height], [200, 100])
            let raw = try FrameStore.digest(of: recorder.directory.appending(path: frame.file))
            XCTAssertEqual(raw.sha256, frame.sha256, "the raw original is only read")
        }

        func image(_ sequence: Int) throws -> (width: Int, height: Int, bytes: [UInt8]) {
            try rgba(recorder.directory.appending(path: try XCTUnwrap(records[sequence]).file))
        }
        // Row 20 is the stroke (10 pt from the top); row 80, its mirror image, stays raw.
        let empty = try image(1), stroke = try image(2), erased = try image(3), undone = try image(4), redone = try image(5)
        XCTAssertTrue([pixel(empty, 40, 20), pixel(empty, 100, 20), pixel(empty, 0, 0)].allSatisfy(isRaw), "no ink before the stroke")
        XCTAssertTrue([pixel(stroke, 40, 20), pixel(stroke, 100, 20), pixel(stroke, 160, 20)].allSatisfy(isInk))
        XCTAssertTrue(zip(pixel(stroke, 100, 20), [255, 59, 48, 255]).allSatisfy { abs($0 - $1) <= 2 },
                      "the stroke's core is the sRGB ink colour: \(pixel(stroke, 100, 20))")
        XCTAssertTrue([pixel(stroke, 100, 80), pixel(stroke, 100, 35), pixel(stroke, 10, 20)].allSatisfy(isRaw))
        // Width: 3 pt at 2× is 6 px, rows 17–22 about the centre line at y = 20 px. Rows 18 and 21,
        // off the centre line and clear of the edges, are ink; rows 14 and 25 are raw.
        XCTAssertTrue([pixel(stroke, 40, 18), pixel(stroke, 40, 21), pixel(stroke, 100, 18), pixel(stroke, 100, 21),
                       pixel(stroke, 160, 18), pixel(stroke, 160, 21)].allSatisfy(isInk), "the stroke keeps its recorded width")
        XCTAssertTrue([pixel(stroke, 100, 14), pixel(stroke, 100, 25)].allSatisfy(isRaw), "and is no wider")
        XCTAssertTrue(isInk(pixel(erased, 40, 20)) && isInk(pixel(erased, 160, 20)))
        XCTAssertTrue([pixel(erased, 40, 18), pixel(erased, 40, 21), pixel(erased, 160, 18), pixel(erased, 160, 21)].allSatisfy(isInk),
                      "erase pieces keep the width")
        XCTAssertTrue(isRaw(pixel(erased, 100, 20)), "the erased middle shows the raw pixels")
        XCTAssertTrue(isInk(pixel(undone, 100, 20)), "undo restores the middle")
        XCTAssertTrue(isRaw(pixel(redone, 100, 20)) && isInk(pixel(redone, 40, 20)), "redo erases it again")
        let raw = try rgba(recorder.directory.appending(path: frames[1].file))
        XCTAssertTrue(isRaw(pixel(raw, 100, 20)), "the raw original of a frame with ink holds no ink")
        XCTAssertEqual(try files(in: recorder.directory.appending(path: "composed")), (2...6).map { String(format: "%08ld.png", $0) },
                       "only images with strokes are written; nothing for the refused frame")

        // The session still reads as before: the same frames and gaps, and no new notes.
        let session = try RetainedSession.read(recorder.directory)
        XCTAssertEqual(session.frames.map(\.record.sequence), frames.map(\.sequence))
        XCTAssertEqual(session.frames.compactMap(\.originalProblem), [])
        XCTAssertEqual(session.gaps.count, 0)
        XCTAssertEqual(session.notes, [])
    }

    // MARK: - Exactly one outcome per kept frame, Stop and late work

    func testEveryKeptFrameGetsOneCompositionOutcomeBeforeTheEnding() throws {
        let recorder = try composingRecorder(root: root)
        recorder.streamStarted(host: 100, wall: Date())
        let first = try keep(recorder, source: 100.5, callback: 100.6)
        let second = try keep(recorder, source: 101, callback: 101.1)
        let geometry = DisplayGeometry(started: composedDisplay)
        recorder.compose(InkComposer.request(for: first, display: composedDisplay, spans: [], geometry: geometry), host: 102)
        // The same frame again: only noted.
        recorder.compose(InkComposer.request(for: first, display: composedDisplay, spans: [], geometry: geometry), host: 102.5)
        recorder.finish(reason: "user_stop", detail: nil, liveEndedHost: 103, host: 103.5, wall: Date())
        // After the ending: only noted, and no pixels are made.
        recorder.compose(InkComposer.request(for: second, display: composedDisplay, spans: [], geometry: geometry), host: 104)

        let rows = try events(recorder)
        XCTAssertEqual(rows.map(\.event), [
            "session_created", "stream_started", "kept", "kept", "composed", "composition_request_ignored",
            "not_composed", "ended", "composition_request_ignored",
        ])
        XCTAssertEqual(rows[6].detail?["sequence"], String(second.sequence))
        XCTAssertEqual(rows[6].detail?["reason"], "session_ended_before_composition")
        XCTAssertEqual(rows[8].detail?["reason"], "the session had ended; this frame's outcome was recorded then")
        XCTAssertFalse(FileManager.default.fileExists(atPath: recorder.directory.appending(path: "composed").path(percentEncoded: false)),
                       "an image without strokes writes no file")
        let saved = try savedStatus(recorder)
        XCTAssertEqual([saved.composedFrames, saved.lateCompositionRequests], [1, 2])
        XCTAssertNil(saved.composedBytes)
        XCTAssertEqual(saved.notComposed, ["session_ended_before_composition": 1])
        // Empty ink is still a composed image: the verified raw original itself, with no document.
        let record = try XCTUnwrap(rows[4].composed)
        XCTAssertNil(record.ink.document)
        XCTAssertNil(record.ink.revision)
        XCTAssertTrue(record.ink.limits.contains("no ink document was open at that time, so nothing is drawn"))
        XCTAssertEqual([record.file, record.sha256, String(record.byteLength)], [first.file, first.sha256, String(first.byteLength)])

        // A session that does not compose writes no composition outcomes at all.
        let plain = try CaptureRecorder(root: root, display: composedDisplay, settings: .engineeringDefaults,
                                        permissionPreflightAtStart: true, wall: Date(timeIntervalSince1970: 1_790_000_100), host: 200)
        plain.frame(facts(.complete, source: 200.5), image: try greyBuffer(), host: 200.6, accepted: true)
        plain.finish(reason: "user_stop", detail: nil, liveEndedHost: 201, host: 201, wall: Date())
        XCTAssertEqual(try events(plain).map(\.event), ["session_created", "kept", "ended"])
        XCTAssertEqual(try files(in: plain.directory), ["events.jsonl", "frames", "status.json"])
    }

    // MARK: - Refusals and failures keep the raw original and say why

    func testCompositionRefusalsAndFailuresKeepRawOriginalsAndSayWhy() throws {
        let recorder = try composingRecorder(root: root)
        recorder.streamStarted(host: 100, wall: Date())
        let geometry = DisplayGeometry(started: composedDisplay)
        let span = inkedSpan(recorder.status.session)
        func compose(_ frame: KeptFrame, display: DisplayFacts? = nil, host: Double) {
            recorder.compose(InkComposer.request(for: frame, display: display ?? composedDisplay, spans: [span], geometry: geometry),
                             host: host)
        }
        func outcome(_ frame: KeptFrame) throws -> CaptureEvent {
            try XCTUnwrap(try events(recorder).last { $0.detail?["sequence"] == String(frame.sequence) || $0.composed?.rawSequence == frame.sequence })
        }

        // Storage: a file where composed/ belongs.
        let blocker = recorder.directory.appending(path: "composed")
        try Data("not a directory".utf8).write(to: blocker)
        let blocked = try keep(recorder, source: 100.5, callback: 100.6)
        compose(blocked, host: 101)
        XCTAssertEqual(try outcome(blocked).detail?["reason"], "write_failed")
        XCTAssertTrue(try outcome(blocked).detail?["detail"]?.hasPrefix("composed/ cannot be created") == true)
        XCTAssertEqual(try FrameStore.digest(of: recorder.directory.appending(path: blocked.file)).sha256, blocked.sha256)
        try FileManager.default.removeItem(at: blocker)
        let recovered = try keep(recorder, source: 101.5, callback: 101.6)
        compose(recovered, host: 102)
        XCTAssertEqual(try outcome(recovered).event, "composed", "storage that recovers composes later frames")
        XCTAssertEqual(try outcome(recovered).composed?.ink.strokes, ["s1"])

        // A raw original changed on disk is not composed from.
        let altered = try keep(recorder, source: 102.5, callback: 102.6)
        let rawURL = recorder.directory.appending(path: altered.file)
        var bytes = try Data(contentsOf: rawURL)
        bytes[bytes.count - 1] ^= 1
        try bytes.write(to: rawURL)  // This test's own session.
        compose(altered, host: 103)
        XCTAssertEqual(try outcome(altered).detail?["reason"], "raw_unavailable")
        XCTAssertTrue(try outcome(altered).detail?["detail"]?.contains("no longer has the recorded SHA-256") == true)
        XCTAssertEqual(try Data(contentsOf: rawURL), bytes, "nothing is rewritten")

        // A capture that could not exclude this app is not composed: the raw frame may hold the ink.
        var included = composedDisplay
        included.scope = DisplayFacts.inkOverlayScope(showsCursor: true)
        let unknown = try keep(recorder, source: 103.5, callback: 103.6)
        compose(unknown, display: included, host: 104)
        XCTAssertEqual(try outcome(unknown).detail?["reason"], "refused")
        XCTAssertTrue(try outcome(unknown).detail?["detail"]?.contains("may already hold the ink") == true)

        // No geometry recorded: refused.
        let noGeometry = try keep(recorder, source: 104.5, callback: 104.6)
        recorder.compose(InkComposer.request(for: noGeometry, display: composedDisplay, spans: [], geometry: nil), host: 105)
        XCTAssertEqual(try outcome(noGeometry).detail?["detail"], "no display geometry was recorded for this capture")

        // A document reopened after the pixels' time is not used for them; one open at that time
        // but only reopened later in it has an unknown revision then.
        var reopened = InkDocument(displayID: 7, createdInSession: "earlier", createdWall: Date(timeIntervalSince1970: 1_790_000_000))
        let reopening = InkSession(document: reopened)
        reopening.reopened(nativeSession: recorder.status.session, host: 106)
        reopened = reopening.document
        let early = try keep(recorder, source: 105.5, callback: 105.6)
        let request = InkComposer.request(for: early, display: composedDisplay,
                                          spans: [InkSpan(document: reopened, file: "earlier/ink/ink.json", opened: 105)],
                                          geometry: geometry)
        XCTAssertEqual(request.problem, "the ink revision at the pixels' time is unknown in earlier/ink/ink.json")

        // After a reopening, the revision committed in the earlier session keeps no commit time here.
        let carried = InkSession(document: span.document)
        carried.reopened(nativeSession: recorder.status.session, host: 106.5)
        let later = try keep(recorder, source: 107, callback: 107.1)
        let pairing = InkComposer.request(for: later, display: composedDisplay,
                                          spans: [InkSpan(document: carried.document, file: "earlier/ink/ink.json", opened: 106.5)],
                                          geometry: geometry)
        XCTAssertEqual(pairing.ink?.revision, 1)
        XCTAssertEqual(pairing.ink?.strokes, ["s1"])
        XCTAssertNil(pairing.ink?.revisionHost)
        XCTAssertTrue(pairing.ink?.limits.contains { $0.hasPrefix("revision 1 was committed before this document was last reopened") } == true)

        let saved = try savedStatus(recorder)
        XCTAssertEqual(saved.composedFrames, 1)
        XCTAssertGreaterThan(saved.composedBytes ?? 0, 0)
        XCTAssertEqual(saved.notComposed, ["write_failed": 1, "raw_unavailable": 1, "refused": 2])
    }

    // MARK: - ASK in a session that excludes this app

    func testAskTextInAnAppExcludedSessionMakesNoUnverifiedClaim() {
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: "ask", createdWall: Date()))
        ink.setMode(.ask, host: 1)
        _ = ink.begin(at: InkPoint(x: 10, y: 10, eventTime: 2), device: .mouse, anchor: InkAnchor(nativeSession: nil, frame: nil, host: 2))
        ink.extend(to: InkPoint(x: 30, y: 20, eventTime: 2))
        let frame = FrameReference(KeptFrame(
            file: "frames/00000003.png", sequence: 3, callbackHost: 1.5, sourceHost: 1.4,
            facts: FrameFacts(attachments: nil, presentationTime: .invalid), width: 200, height: 100, pixelFormat: "BGRA",
            mediaType: "image/png", encoding: FrameStore.encoding, byteLength: 1, sha256: String(repeating: "a", count: 64)))
        ink.end(host: 2, selection: SelectionContext(nativeSession: "ask", captureSession: nil, display: composedDisplay, frame: frame,
                                                     freshness: "live", geometryProblem: nil))
        let selection = ink.finishAsk(geometryProblem: nil, inkDirectory: nil, host: 3)
        let text = selection?.composition ?? ""
        XCTAssertTrue(text.contains("configured to exclude this app's windows"), text)
        XCTAssertTrue(text.contains("unverified on a Mac"), text)
        XCTAssertTrue(text.contains("joined by the frame's sequence"), text)
        XCTAssertFalse(text.contains("ink-free"), text)
        XCTAssertTrue(text.hasPrefix("No crop was made"), text)
    }

    // MARK: - Replaying revisions

    func testVisibleStrokesReplayEveryCommittedRevision() {
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: "replay", createdWall: Date()))
        ink.setMode(.write, host: 1)
        var snapshots: [Int: [String]] = [0: []]
        func record() { snapshots[ink.document.revision] = ink.document.visible }
        func draw(_ points: [(Double, Double)], host: Double) {
            let inputs = points.map { InkPoint(x: $0.0, y: $0.1, eventTime: host) }
            _ = ink.begin(at: inputs[0], device: .tabletPen, anchor: InkAnchor(nativeSession: nil, frame: nil, host: host))
            inputs.dropFirst().forEach { ink.extend(to: $0) }
            ink.end(host: host)
            record()
        }
        draw([(0, 10), (100, 10)], host: 2)
        draw([(0, 30), (100, 30)], host: 3)
        ink.tool = .eraser
        draw([(50, 0), (50, 40)], host: 4)
        ink.undo(host: 5); record()
        ink.undo(host: 6); record()
        ink.redo(host: 7); record()
        ink.tool = .pen
        draw([(0, 60), (10, 60)], host: 8)
        ink.tool = .eraser
        draw([(5, 60)], host: 9)
        ink.setMode(.ask, host: 10)
        ink.setMode(.write, host: 11)
        XCTAssertEqual(ink.document.revision, 8)
        for (revision, visible) in snapshots {
            XCTAssertEqual(ink.document.visibleStrokes(atRevision: revision)?.map(\.id), visible, "revision \(revision)")
        }
        XCTAssertNil(ink.document.visibleStrokes(atRevision: 9))
        XCTAssertNil(ink.document.committedHost(ofRevision: 0))
        XCTAssertEqual(ink.document.committedHost(ofRevision: 3), 4)
        XCTAssertEqual(ink.document.committedHost(ofRevision: 8), 9)
    }
}
