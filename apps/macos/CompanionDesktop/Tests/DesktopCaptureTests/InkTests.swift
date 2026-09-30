import CoreGraphics
import CoreMedia
import XCTest
@testable import DesktopCapture

/// The ink model and store: modes, strokes, partial erase, undo/redo, ASK, closing, saving,
/// reopening and unsaved ink. Synthetic points only; the overlay window, the app controller, pen
/// hardware and real capture are not exercised.
extension DesktopCaptureTests {
    private func point(_ x: Double, _ y: Double, time: Double = 0, pressure: Double? = nil) -> InkPoint {
        InkPoint(x: x, y: y, eventTime: time, pressure: pressure, tiltX: pressure.map { _ in 0.25 },
                 tiltY: pressure.map { _ in -0.5 })
    }

    private func newSession(session: String = "native-1") -> InkSession {
        InkSession(document: InkDocument(displayID: 7, createdInSession: session,
                                         createdWall: Date(timeIntervalSince1970: 1_790_000_000.25)))
    }

    @discardableResult
    private func draw(_ ink: InkSession, _ points: [InkPoint], device: InkDevice = .tabletPen, host: Double,
                      selection: SelectionContext? = nil) -> InkSession.Outcome {
        let anchor = InkAnchor(nativeSession: "native-1", frame: nil, host: host)
        let started = ink.begin(at: points[0], device: device, anchor: anchor)
        guard started == .accepted else { return started }
        for next in points.dropFirst() {
            ink.extend(to: next)
        }
        return ink.end(host: host, selection: selection)
    }

    /// Coordinates rounded to 1/1000 pt, for comparing computed cut points.
    private func xy(_ stroke: InkStroke) -> [[Double]] {
        stroke.points.map { [($0.x * 1000).rounded() / 1000, ($0.y * 1000).rounded() / 1000] }
    }

    /// A file's session directory name and file name.
    private func tail(_ url: URL?) -> String? {
        url.map { $0.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent + "/" + $0.lastPathComponent }
    }

    private func setSaved(_ url: URL, _ seconds: Double) throws {
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSince1970: seconds)],
                                              ofItemAtPath: url.path(percentEncoded: false))
    }

    private func kept(sequence: Int, callbackHost: Double) -> FrameReference {
        FrameReference(KeptFrame(
            file: String(format: "frames/%08ld.png", sequence), sequence: sequence, callbackHost: callbackHost,
            sourceHost: callbackHost, facts: FrameFacts(attachments: nil, presentationTime: .invalid), width: 2880,
            height: 1800, pixelFormat: "BGRA", mediaType: "image/png", encoding: FrameStore.encoding, byteLength: 1,
            sha256: String(repeating: "a", count: 64)))
    }

    private var line: [InkPoint] { (0...10).map { point(Double($0 * 10), 10) } }

    // MARK: - Strokes, erase, undo and redo

    func testWriteEraseUndoAndRedoKeepEveryStroke() {
        let ink = newSession()
        XCTAssertEqual(draw(ink, line, host: 10), .refused("NAV: input belongs to the original app"))
        ink.setMode(.write, host: 10)
        XCTAssertEqual(draw(ink, line, host: 11), .accepted)
        XCTAssertEqual(ink.document.visible, ["s1"])
        XCTAssertEqual(ink.document.revision, 1)

        // Erasing across the middle removes the drawn line within 8 pt of the eraser.
        ink.tool = .eraser
        XCTAssertEqual(draw(ink, [point(50, 0), point(50, 20)], host: 12), .accepted)
        XCTAssertEqual(ink.document.visible, ["s2", "s3"])
        XCTAssertEqual(ink.document.strokes.map(\.id), ["s1", "s2", "s3"], "the erased original is kept")
        XCTAssertEqual(xy(ink.document.strokes[1]).map { $0[0] }, [0, 10, 20, 30, 40, 42])
        XCTAssertEqual(xy(ink.document.strokes[2]).map { $0[0] }, [58, 60, 70, 80, 90, 100])
        XCTAssertEqual(ink.document.strokes[1].points.map { $0.interpolated == true }, [false, false, false, false, false, true])
        XCTAssertEqual(ink.document.strokes[2].points.map { $0.interpolated == true }, [true, false, false, false, false, false])
        XCTAssertEqual(ink.document.strokes[1].parent, "s1")
        let erase = ink.document.operations.last!
        XCTAssertEqual([erase.kind, erase.removed.joined(), erase.added.joined(separator: ",")], ["erase", "s1", "s2,s3"])
        XCTAssertEqual(draw(ink, [point(500, 500)], host: 12.5), .refused("nothing under the eraser"))

        XCTAssertEqual(ink.undo(host: 13), .accepted)
        XCTAssertEqual(ink.document.visible, ["s1"])
        XCTAssertEqual(ink.document.operations.last?.target, erase.sequence)
        XCTAssertEqual(ink.undo(host: 14), .accepted)
        XCTAssertEqual(ink.document.visible, [])
        XCTAssertEqual(ink.undo(host: 14.5), .refused("nothing to undo"))
        XCTAssertEqual(ink.redo(host: 15), .accepted)
        XCTAssertEqual(ink.document.visible, ["s1"])
        XCTAssertEqual(ink.redo(host: 16), .accepted)
        XCTAssertEqual(ink.document.visible, ["s2", "s3"])
        XCTAssertEqual(ink.redo(host: 17), .refused("nothing to redo"))
        XCTAssertEqual(ink.document.revision, 6)

        // A new stroke after an undo clears redo.
        ink.undo(host: 18)
        ink.tool = .pen
        draw(ink, [point(0, 40), point(10, 40)], host: 19)
        XCTAssertEqual(ink.document.visible, ["s1", "s4"])
        XCTAssertFalse(ink.canRedo)
        XCTAssertEqual(ink.document.strokes.count, 4)
        XCTAssertEqual(ink.document.operations.map(\.sequence), Array(1...ink.document.operations.count))
    }

    func testErasingCutsTheDrawnLineBetweenSparseSamples() {
        let ink = newSession()
        ink.setMode(.write, host: 1)
        XCTAssertEqual(draw(ink, [point(0, 10, time: 2, pressure: 0.2), point(100, 10, time: 3, pressure: 0.6)], host: 2), .accepted)
        let original = ink.document.strokes[0]
        ink.tool = .eraser
        // Neither recorded sample is within 8 pt of this eraser path; the drawn line crosses it at (50, 10).
        XCTAssertEqual(draw(ink, [point(50, 0), point(50, 20)], host: 3), .accepted)
        XCTAssertEqual(ink.document.strokes.first, original, "the recorded stroke is kept unchanged")
        XCTAssertEqual(ink.document.visible, ["s2", "s3"])
        let (left, right) = (ink.document.strokes[1], ink.document.strokes[2])
        XCTAssertEqual(xy(left), [[0, 10], [42, 10]])
        XCTAssertEqual(xy(right), [[58, 10], [100, 10]])
        XCTAssertEqual([left.parent, right.parent], ["s1", "s1"])
        XCTAssertEqual([left.anchor, right.anchor], [original.anchor, original.anchor])
        XCTAssertEqual([left.points[0], right.points[1]], original.points, "recorded samples stay exact")
        XCTAssertEqual([left.points[1].interpolated, right.points[0].interpolated], [true, true])
        XCTAssertEqual(left.points[1].eventTime, 2.42, accuracy: 1e-9)
        XCTAssertEqual(left.points[1].pressure ?? -1, 0.368, accuracy: 1e-9)
        XCTAssertEqual(left.points[1].tiltX ?? -1, 0.25, accuracy: 1e-9)
        let erase = ink.document.operations.last!
        XCTAssertEqual([erase.kind, erase.removed.joined(), erase.added.joined(separator: ",")], ["erase", "s1", "s2,s3"])
        XCTAssertEqual(ink.undo(host: 4), .accepted)
        XCTAssertEqual(ink.document.visible, ["s1"])
        XCTAssertEqual(ink.redo(host: 5), .accepted)
        XCTAssertEqual(ink.document.visible, ["s2", "s3"])

        // A line exactly 8 pt from a single eraser point is not cut; one 4 pt from it loses the
        // chord inside the eraser's disc.
        ink.tool = .pen
        draw(ink, [point(0, 58), point(100, 58)], host: 6)
        ink.tool = .eraser
        XCTAssertEqual(draw(ink, [point(50, 50)], host: 7), .refused("nothing under the eraser"))
        ink.tool = .pen
        draw(ink, [point(0, 54), point(100, 54)], host: 8)
        ink.tool = .eraser
        XCTAssertEqual(draw(ink, [point(50, 50)], host: 9), .accepted)
        XCTAssertEqual(ink.document.operations.last?.removed, ["s5"])
        XCTAssertEqual(ink.document.visible, ["s2", "s3", "s4", "s6", "s7"])
        XCTAssertEqual(xy(ink.document.strokes[5]), [[0, 54], [43.072, 54]])
        XCTAssertEqual(xy(ink.document.strokes[6]), [[56.928, 54], [100, 54]])

        // A vertex inside the eraser: both adjacent segments are cut back to the eraser's edge.
        ink.tool = .pen
        draw(ink, [point(0, 200), point(50, 200), point(100, 200)], host: 10)
        ink.tool = .eraser
        XCTAssertEqual(draw(ink, [point(50, 200)], host: 11), .accepted)
        XCTAssertEqual(ink.document.strokes.suffix(2).map(xy), [[[0, 200], [42, 200]], [[58, 200], [100, 200]]])
    }

    func testMouseWritingNeedsItsSwitchAndPenFactsAreKept() {
        let ink = newSession()
        ink.setMode(.write, host: 1)
        XCTAssertEqual(draw(ink, line, device: .mouse, host: 2), .refused("mouse writing is off; turn it on or use a pen"))
        XCTAssertTrue(ink.document.strokes.isEmpty)
        ink.mouseWritingEnabled = true
        XCTAssertEqual(draw(ink, line, device: .mouse, host: 3), .accepted)
        XCTAssertEqual(ink.document.strokes.last?.device, .mouse)

        let pen = [point(0, 30, time: 7.25, pressure: 0.5), point(10, 30, time: 7.5, pressure: 0.75)]
        draw(ink, pen, device: .tabletPen, host: 4)
        let stroke = ink.document.strokes.last!
        XCTAssertEqual(stroke.device, .tabletPen)
        XCTAssertEqual(stroke.points, pen, "event time, pressure and tilt are kept")

        // The pen's eraser end erases even while the pen tool is selected.
        XCTAssertEqual(draw(ink, [point(5, 30)], device: .tabletEraser, host: 5), .accepted)
        XCTAssertEqual(ink.document.operations.last?.kind, "erase")
    }

    // MARK: - ASK

    func testAskRestoresThePreviousModeAndRecordsTheFrameRegion() {
        let ink = newSession()
        ink.setMode(.write, host: 10)
        draw(ink, line, host: 11)
        draw(ink, [point(0, 60), point(10, 60)], host: 12)
        ink.setMode(.ask, host: 13)
        XCTAssertEqual(ink.modeBeforeAsk, .write)
        let display = DisplayFacts(displayID: 7, name: nil, frame: RecordedRect(CGRect(x: -1440, y: 0, width: 1440, height: 900)),
                                   pointPixelScale: 2, requestedWidth: 2880, requestedHeight: 1800, rotationDegrees: 0,
                                   isMain: false, scope: "synthetic fixture; not a captured display")
        let frame = kept(sequence: 4, callbackHost: 11.5)
        let context = SelectionContext(nativeSession: "native-1", captureSession: nil, display: display, frame: frame,
                                       freshness: "live", geometryProblem: nil)
        XCTAssertEqual(draw(ink, [point(10, 20)], host: 13.5, selection: context),
                       .refused("a selection needs an area; drag across the region"))
        XCTAssertEqual(draw(ink, [point(110, 70), point(10, 20)], host: 14, selection: context), .accepted)
        XCTAssertEqual(ink.pendingSelection?.rect, RecordedRect(CGRect(x: 10, y: 20, width: 100, height: 50)))
        XCTAssertEqual(ink.pendingSelection?.context, context)

        let selection = ink.finishAsk(geometryProblem: nil, inkDirectory: nil, host: 15)
        XCTAssertEqual(ink.mode, .write, "finishing ASK restores WRITE")
        XCTAssertEqual(selection?.framePixelRect, RecordedRect(CGRect(x: 20, y: 40, width: 200, height: 100)))
        var squeezed = display
        squeezed.frame = RecordedRect(CGRect(x: 0, y: 0, width: 1440, height: 600))
        XCTAssertEqual(InkSession.pixelRect(for: RecordedRect(CGRect(x: 10, y: 20, width: 100, height: 50)), frame: frame,
                                            display: squeezed).rect,
                       RecordedRect(CGRect(x: 20, y: 60, width: 200, height: 150)), "x and y scale separately (2 × 3)")
        XCTAssertEqual(selection?.frame, frame)
        XCTAssertEqual(selection?.inkRevision, 2)
        XCTAssertEqual(selection?.inkRevisionAtFrame, 1, "only the first stroke preceded the frame")
        XCTAssertEqual(selection?.freshness, "live")
        XCTAssertEqual([selection?.establishedHost, selection?.host], [14, 15])
        XCTAssertNil(selection?.crop)
        XCTAssertEqual(selection?.cropProblem, "the capture session or ink directory is unknown, so no crop was made")
        XCTAssertEqual(ink.document.selections.count, 1)
        XCTAssertEqual(ink.document.operations.last?.detail["restored_mode"], "WRITE")
        XCTAssertEqual(draw(ink, [point(0, 80), point(10, 80)], host: 16), .accepted, "writing continues")

        ink.setMode(.ask, host: 16.25)
        draw(ink, [point(0, 0), point(5, 5)], host: 16.5)
        XCTAssertEqual(ink.cancelAsk(host: 16.75), .accepted)
        XCTAssertEqual(ink.mode, .write, "cancelling ASK restores WRITE")
        XCTAssertEqual(ink.document.operations.last?.detail["restored_mode"], "WRITE")
        XCTAssertNil(ink.modeBeforeAsk)

        ink.setMode(.nav, host: 17)
        ink.setMode(.ask, host: 18)
        draw(ink, [point(0, 0), point(5, 5)], host: 19)
        XCTAssertEqual(ink.cancelAsk(host: 20), .accepted)
        XCTAssertEqual(ink.mode, .nav, "cancelling ASK restores NAV")
        XCTAssertNil(ink.pendingSelection)
        XCTAssertEqual(ink.document.selections.count, 1)
        XCTAssertEqual(ink.document.operations.last?.kind, "ask_cancelled")
    }

    func testAskKeepsAnActualCropOfTheExactRetainedOriginal() throws {
        let recorder = try recorder()
        recorder.streamStarted(host: 100, wall: Date())
        recorder.frame(facts(.complete), image: try buffer(), host: 101, accepted: true)
        let kept = try XCTUnwrap(recorder.status.lastKept)
        let frame = FrameReference(kept)
        let originalURL = recorder.directory.appending(path: kept.file)
        let original = try Data(contentsOf: originalURL)
        let inkDirectory = root.appending(path: "ink-document", directoryHint: .isDirectory)
        let region = RecordedRect(CGRect(x: 1.5, y: 0, width: 1, height: 2))

        let crop = try SelectionCropper.crop(frame, pixelRect: region, captureSession: recorder.directory,
                                             inkDirectory: inkDirectory, name: "a1").get()
        XCTAssertEqual(crop.pixelRect, RecordedRect(CGRect(x: 1, y: 0, width: 2, height: 2)), "rounded outward")
        XCTAssertEqual([crop.width, crop.height], [2, 2])
        XCTAssertTrue(crop.file.hasPrefix("selections/a1-"))
        let cropURL = inkDirectory.appending(path: crop.file)
        let digest = try FrameStore.digest(of: cropURL)
        XCTAssertEqual(digest.sha256, crop.sha256)
        XCTAssertEqual(digest.byteLength, crop.byteLength)
        // The crop's pixels are the original's pixels at columns 1-2 (±1 for colour management).
        let whole = try rgba(originalURL)
        let part = try rgba(cropURL)
        for y in 0..<2 {
            for x in 0..<2 {
                for channel in 0..<4 {
                    let expected = Int(whole.bytes[(y * 4 + x + 1) * 4 + channel])
                    let actual = Int(part.bytes[(y * 2 + x) * 4 + channel])
                    XCTAssertLessThanOrEqual(abs(expected - actual), 1, "pixel \(x),\(y) channel \(channel)")
                }
            }
        }
        XCTAssertEqual(try Data(contentsOf: originalURL), original, "the original is only read")
        XCTAssertEqual(InkSession.pixelRect(for: region, frame: frame, display: recorder.status.display).rect, region,
                       "one point is one pixel on this display")

        // A changed original, or a region outside the frame, gives no crop.
        var altered = original
        altered[altered.count - 1] ^= 1
        try altered.write(to: originalURL)  // This test's own session.
        XCTAssertThrowsError(try SelectionCropper.crop(frame, pixelRect: region, captureSession: recorder.directory,
                                                       inkDirectory: inkDirectory, name: "a2").get()) { error in
            XCTAssertTrue((error as? MappingRefusal)?.reason.contains("no longer has the recorded") == true, "\(error)")
        }
        try original.write(to: originalURL)
        XCTAssertThrowsError(try SelectionCropper.crop(frame, pixelRect: RecordedRect(CGRect(x: 10, y: 10, width: 2, height: 2)),
                                                       captureSession: recorder.directory, inkDirectory: inkDirectory,
                                                       name: "a3").get()) { error in
            XCTAssertEqual((error as? MappingRefusal)?.reason, "the region lies outside the frame")
        }
    }

    func testAskFinishCropsThePinnedFrameNotALaterOne() throws {
        let recorder = try recorder()
        recorder.streamStarted(host: 100, wall: Date())
        recorder.frame(facts(.complete), image: try buffer(marker: 40), host: 101, accepted: true)
        let frameA = FrameReference(try XCTUnwrap(recorder.status.lastKept))
        let inkDirectory = root.appending(path: "ink-document", directoryHint: .isDirectory)
        func context(_ frame: FrameReference, geometryProblem: String? = nil) -> SelectionContext {
            SelectionContext(nativeSession: recorder.status.session, captureSession: recorder.directory,
                             display: recorder.status.display, frame: frame, freshness: "live", geometryProblem: geometryProblem)
        }
        let ink = newSession(session: recorder.status.session)

        // The region is the bottom-left pixel only: an asymmetric crop, offset vertically.
        ink.setMode(.ask, host: 102)
        XCTAssertEqual(draw(ink, [point(0, 1), point(1, 2)], device: .mouse, host: 103, selection: context(frameA)), .accepted)
        // A newer frame is kept before Finish. The selection keeps frame A.
        recorder.frame(facts(.complete), image: try buffer(marker: 200), host: 104, accepted: true)
        let frameB = FrameReference(try XCTUnwrap(recorder.status.lastKept))
        XCTAssertNotEqual(frameB.sha256, frameA.sha256)
        let selection = try XCTUnwrap(ink.finishAsk(geometryProblem: nil, inkDirectory: inkDirectory, host: 105))
        XCTAssertEqual(selection.frame, frameA)
        XCTAssertEqual(selection.framePixelRect, RecordedRect(CGRect(x: 0, y: 1, width: 1, height: 1)))
        let crop = try XCTUnwrap(selection.crop, selection.cropProblem ?? "no crop")
        XCTAssertEqual(crop.pixelRect, RecordedRect(CGRect(x: 0, y: 1, width: 1, height: 1)))
        XCTAssertTrue(selection.composition.contains("No ink composite is rendered"))
        let cropped = try rgba(inkDirectory.appending(path: crop.file))
        XCTAssertEqual([cropped.width, cropped.height], [1, 1])
        let a = try rgba(recorder.directory.appending(path: frameA.file))
        let b = try rgba(recorder.directory.appending(path: frameB.file))
        func pixel(_ image: (width: Int, height: Int, bytes: [UInt8]), _ x: Int, _ y: Int) -> [Int] {
            (0..<4).map { Int(image.bytes[(y * image.width + x) * 4 + $0]) }
        }
        // Frame A's bottom-left pixel (±1 for colour management); not frame B's, and not the top row.
        XCTAssertTrue(zip(pixel(cropped, 0, 0), pixel(a, 0, 1)).allSatisfy { abs($0 - $1) <= 1 }, "\(pixel(cropped, 0, 0))")
        XCTAssertGreaterThan(abs(pixel(cropped, 0, 0)[0] - pixel(b, 0, 1)[0]), 100)
        XCTAssertNotEqual(pixel(a, 0, 0), pixel(a, 0, 1))

        // The display changes while a region is being drawn: it is pinned without a mapping.
        var geometry = DisplayGeometry(started: recorder.status.display)
        geometry.observe(widthPoints: 4, heightPoints: 2, rotationDegrees: 0, host: 106)
        XCTAssertNil(geometry.problem, "an unchanged display keeps the mapping")
        ink.setMode(.ask, host: 106)
        XCTAssertEqual(ink.begin(at: point(0, 1), device: .mouse, anchor: InkAnchor(nativeSession: nil, frame: nil, host: 106)), .accepted)
        geometry.observe(widthPoints: 2, heightPoints: 4, rotationDegrees: 90, host: 107)
        let problem = try XCTUnwrap(geometry.problem)
        XCTAssertTrue(problem.contains("2×4 pt at 90°") && problem.contains("4×2 pt at 0°"), problem)
        ink.extend(to: point(1, 2))
        XCTAssertEqual(ink.end(host: 108, selection: context(frameB, geometryProblem: geometry.problem)), .accepted)
        let during = try XCTUnwrap(ink.finishAsk(geometryProblem: geometry.problem, inkDirectory: inkDirectory, host: 109))
        XCTAssertEqual(during.frame, frameB)
        XCTAssertNil(during.framePixelRect)
        XCTAssertNil(during.crop)
        XCTAssertEqual([during.pixelMapping, during.cropProblem], [problem, problem])
        // Changing back does not re-establish the mapping; only a new capture does.
        geometry.observe(widthPoints: 4, heightPoints: 2, rotationDegrees: 0, host: 110)
        XCTAssertEqual(geometry.problem, problem)

        // The display changes after a region was drawn, before Finish: frame A stays, without pixels.
        var later = DisplayGeometry(started: recorder.status.display)
        ink.setMode(.ask, host: 111)
        draw(ink, [point(0, 1), point(1, 2)], device: .mouse, host: 112, selection: context(frameA, geometryProblem: later.problem))
        later.observe(widthPoints: 2, heightPoints: 4, rotationDegrees: 90, host: 113)
        let before = try XCTUnwrap(ink.finishAsk(geometryProblem: later.problem, inkDirectory: inkDirectory, host: 114))
        XCTAssertEqual(before.frame, frameA)
        XCTAssertNil(before.crop)
        XCTAssertEqual(before.cropProblem, "before Finish, " + (later.problem ?? "none"))
        XCTAssertEqual(ink.document.selections.count, 3)
        let crops = try FileManager.default.contentsOfDirectory(atPath: inkDirectory.appending(path: "selections").path(percentEncoded: false))
        XCTAssertEqual(crops.count, 1, "only the mapped selection wrote a crop")

        // A region whose gesture ended without the app's context has no frame and no pixels.
        ink.setMode(.ask, host: 115)
        draw(ink, [point(0, 0), point(1, 1)], device: .mouse, host: 116)
        let unrecorded = try XCTUnwrap(ink.finishAsk(geometryProblem: nil, inkDirectory: inkDirectory, host: 117))
        XCTAssertNil(unrecorded.frame)
        XCTAssertNil(unrecorded.crop)
        XCTAssertEqual(unrecorded.cropProblem, "no retained frame yet; no pixels are selected")
    }

    // MARK: - Closing input

    func testClosingInputKeepsTheStrokeInProgressAndRefusesNewInput() {
        let ink = newSession()
        ink.setMode(.write, host: 1)
        _ = ink.begin(at: point(0, 0), device: .tabletPen, anchor: InkAnchor(nativeSession: "native-1", frame: nil, host: 2))
        ink.extend(to: point(10, 0))
        ink.closeInput(reason: "user_stop", host: 3)
        XCTAssertEqual(ink.document.visible, ["s1"])
        XCTAssertEqual(ink.document.strokes.first?.interrupted, true)
        XCTAssertEqual(ink.document.strokes.first?.points.count, 2)
        XCTAssertEqual(ink.document.operations.suffix(2).map(\.kind), ["stroke", "input_closed"])
        XCTAssertEqual(ink.mode, .nav)
        XCTAssertEqual(ink.setMode(.write, host: 4), .refused("input is closed"))
        XCTAssertEqual(draw(ink, line, host: 5), .refused("input is closed"))
        XCTAssertEqual(ink.undo(host: 6), .refused("nothing to undo"))

        let erasing = newSession()
        erasing.setMode(.write, host: 1)
        draw(erasing, line, host: 2)
        erasing.tool = .eraser
        _ = erasing.begin(at: point(50, 10), device: .tabletPen, anchor: InkAnchor(nativeSession: nil, frame: nil, host: 3))
        erasing.closeInput(reason: "stopped_by_system", host: 4)
        XCTAssertEqual(erasing.document.visible, ["s1"], "an unfinished erase changes nothing")
        XCTAssertEqual(erasing.document.operations.suffix(2).map(\.kind), ["erase_interrupted", "input_closed"])

        let asking = newSession()
        asking.setMode(.ask, host: 1)
        asking.closeInput(reason: "system_sleep", host: 2)
        XCTAssertEqual(asking.document.operations.suffix(2).map(\.kind), ["ask_cancelled", "input_closed"])
        XCTAssertEqual(asking.document.operations.suffix(2).first?.detail["reason"], "system_sleep")
    }

    // MARK: - Saving and reopening

    func testInkIsSavedAtomicallyReopenedAndEditedWithoutReplacingOtherFiles() throws {
        let sessionA = root.appending(path: "20260921T141320Z-AAAAAAAA", directoryHint: .isDirectory)
        let sessionB = root.appending(path: "20260922T090000Z-BBBBBBBB", directoryHint: .isDirectory)
        let ink = newSession()
        ink.setMode(.write, host: 1)
        draw(ink, line, host: 2)
        let store = InkStore(sessionDirectory: sessionA)
        let written = try store.save(ink.document)
        XCTAssertEqual(written.path(percentEncoded: false), sessionA.appending(path: "ink/ink.json").path(percentEncoded: false))

        // Reopen in a later capture session and keep editing the same original.
        let reopenedStore = InkStore(sessionDirectory: sessionA)
        let loaded = try reopenedStore.load()
        XCTAssertEqual(loaded.createdWall.timeIntervalSince1970, 1_790_000_000.25, accuracy: 0.0005)
        var sameWall = loaded
        sameWall.createdWall = ink.document.createdWall
        XCTAssertEqual(sameWall, ink.document, "strokes, operations and anchors round-trip")
        let reopened = InkSession(document: loaded)
        reopened.reopened(nativeSession: "native-2", host: 10)
        reopened.setMode(.write, host: 11)
        draw(reopened, [point(0, 50), point(20, 50)], host: 12)
        XCTAssertEqual(try reopenedStore.save(reopened.document), written, "the store that read the file replaces it")
        let again = try InkStore(sessionDirectory: sessionA).load()
        XCTAssertEqual(again.visible, ["s1", "s2"])
        XCTAssertEqual(again.revision, 2)
        XCTAssertEqual(again.operations.map(\.kind), ["mode", "stroke", "reopened", "mode", "stroke"])
        // Operations from before the reopening belong to another session: earlier times are unknown.
        XCTAssertNil(again.revision(at: 9.5))
        XCTAssertEqual(again.revision(at: 10), 1)
        XCTAssertEqual(again.revision(at: 12), 2)

        // A store that never read the file, and a file changed on disk, are both saved beside.
        let beside = try InkStore(sessionDirectory: sessionA).save(ink.document)
        XCTAssertNotEqual(beside, written)
        XCTAssertTrue(beside.lastPathComponent.hasPrefix("ink.conflict-"))
        var changed = try Data(contentsOf: written)
        changed.append(0x20)
        try changed.write(to: written)
        let second = try reopenedStore.save(reopened.document)
        XCTAssertNotEqual(second, written)
        XCTAssertEqual(try Data(contentsOf: written), changed, "a changed original is never replaced")

        var foreign = ink.document
        foreign.layer = "ai_additions"
        let foreignSession = root.appending(path: "foreign", directoryHint: .isDirectory)
        let foreignStore = InkStore(sessionDirectory: foreignSession)
        _ = try foreignStore.save(foreign)
        XCTAssertThrowsError(try InkStore(sessionDirectory: foreignSession).load(), "only the user's original layer opens")

        // Reopen finds the most recently saved user document with strokes for this display.
        XCTAssertNil(InkStore.latestDocument(in: root.appending(path: "none"), displayID: 7))
        let inB = try InkStore(sessionDirectory: sessionB).save(reopened.document)
        let empty = root.appending(path: "20260923T000000Z-CCCCCCCC", directoryHint: .isDirectory)
        let inEmpty = try InkStore(sessionDirectory: empty).save(newSession().document)
        var otherDisplay = reopened.document
        otherDisplay.displayID = 8
        let elsewhere = root.appending(path: "20260924T000000Z-DDDDDDDD", directoryHint: .isDirectory)
        let inElsewhere = try InkStore(sessionDirectory: elsewhere).save(otherDisplay)
        let inForeign = foreignSession.appending(path: "ink/ink.json")
        for (offset, file) in [written, beside, second, inB, inEmpty, inElsewhere, inForeign].enumerated() {
            try setSaved(file, 1_790_000_000 + Double(offset))
        }
        XCTAssertEqual(tail(InkStore.latestDocument(in: root, displayID: 7)), tail(inB),
                       "not the empty session, the other display or the non-user layer")
        XCTAssertEqual(tail(InkStore.latestDocument(in: root, displayID: 7, excluding: [inB])), tail(second),
                       "the newest copy in session A is the conflict copy saved last")
        XCTAssertEqual(tail(InkStore.latestDocument(in: root, displayID: 7, excluding: [inB, second, beside])), tail(written))
        XCTAssertEqual(tail(InkStore.latestDocument(in: root, displayID: 8)), tail(inElsewhere))
    }

    func testReopenFindsAndLoadsNewerConflictCopies() throws {
        // A newer conflict copy beside a changed ink.json.
        let sessionA = root.appending(path: "20260925T000000Z-AAAAAAAA", directoryHint: .isDirectory)
        let ink = newSession()
        ink.setMode(.write, host: 1)
        draw(ink, [point(0, 10), point(100, 10)], host: 2)
        let store = InkStore(sessionDirectory: sessionA)
        let original = try store.save(ink.document)
        var changed = try Data(contentsOf: original)
        changed.append(0x0A)
        try changed.write(to: original)  // This test's own temporary file.
        draw(ink, [point(0, 30), point(100, 30)], host: 3)
        let fork = try store.save(ink.document)
        XCTAssertNotEqual(fork, original)
        try setSaved(original, 1_790_000_000)
        try setSaved(fork, 1_790_000_060)
        let found = try XCTUnwrap(InkStore.latestDocument(in: root, displayID: 7))
        XCTAssertEqual(tail(found), tail(fork))
        let recovered = try InkStore(documentFile: found).load()
        XCTAssertEqual(recovered.revision, ink.document.revision, "the newer work in the conflict copy opens")
        XCTAssertEqual(recovered.visible, ink.document.visible)
        XCTAssertEqual(tail(InkStore.latestDocument(in: root, displayID: 7, excluding: [fork])), tail(original),
                       "the older original is still there")
        XCTAssertEqual(try Data(contentsOf: original), changed)

        // A corrupted ink.json with a valid newer conflict copy: the copy is found and opens, and
        // editing it saves to that same copy; the corrupted file is left as it is.
        let sessionB = root.appending(path: "20260926T000000Z-BBBBBBBB", directoryHint: .isDirectory)
        let other = newSession(session: "native-B")
        other.setMode(.write, host: 1)
        draw(other, [point(0, 50), point(100, 50)], host: 2)
        let storeB = InkStore(sessionDirectory: sessionB)
        let corrupt = try storeB.save(other.document)
        try Data("{not ink".utf8).write(to: corrupt)  // This test's own temporary file.
        draw(other, [point(0, 70), point(100, 70)], host: 3)
        let rescued = try storeB.save(other.document)
        XCTAssertTrue(rescued.lastPathComponent.hasPrefix("ink.conflict-"))
        try setSaved(corrupt, 1_790_000_100)
        try setSaved(rescued, 1_790_000_120)
        let newest = try XCTUnwrap(InkStore.latestDocument(in: root, displayID: 7))
        XCTAssertEqual(tail(newest), tail(rescued))
        let reopenedStore = InkStore(documentFile: newest)
        let loaded = try reopenedStore.load()
        XCTAssertEqual(loaded.visible, other.document.visible)
        let continued = InkSession(document: loaded)
        continued.reopened(nativeSession: "native-C", host: 10)
        continued.setMode(.write, host: 11)
        draw(continued, [point(0, 90), point(10, 90)], host: 12)
        XCTAssertEqual(tail(try reopenedStore.save(continued.document)), tail(rescued))
        XCTAssertEqual(try InkStore(documentFile: rescued).load().revision, continued.document.revision)
        XCTAssertEqual(try Data(contentsOf: corrupt), Data("{not ink".utf8))
    }

    // MARK: - Unsaved ink at Stop and Quit

    func testUnsavedInkIsHeldUntilSavedExportedOrDiscarded() throws {
        // A file where the ink directory belongs makes every save fail until it is removed.
        func blockedSession(_ name: String) throws -> URL {
            let session = root.appending(path: name, directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: session, withIntermediateDirectories: true)
            try Data("not a directory".utf8).write(to: session.appending(path: "ink"))
            return session
        }
        let unsaved = UnsavedInk()

        // Stopped earlier: the closed document's save failed.
        let stoppedDirectory = try blockedSession("stopped")
        let stopped = newSession(session: "stopped")
        stopped.setMode(.write, host: 1)
        draw(stopped, line, host: 2)
        XCTAssertNil(unsaved.close(stopped, store: InkStore(sessionDirectory: stoppedDirectory), reason: "user_stop", host: 3))
        // Quit while capturing: the stroke in progress is closed as interrupted, and its save fails too.
        let activeDirectory = try blockedSession("active")
        let active = newSession(session: "active")
        active.setMode(.write, host: 4)
        _ = active.begin(at: point(0, 0), device: .tabletPen, anchor: InkAnchor(nativeSession: "active", frame: nil, host: 5))
        active.extend(to: point(10, 0))
        XCTAssertNil(unsaved.close(active, store: InkStore(sessionDirectory: activeDirectory), reason: "app_quit", host: 6))
        XCTAssertEqual(active.document.strokes.first?.interrupted, true)
        XCTAssertEqual(active.document.operations.last?.detail["reason"], "app_quit")
        XCTAssertEqual(unsaved.documents.count, 2, "Quit has to wait")
        XCTAssertNotNil(unsaved.problem)
        unsaved.retry()
        XCTAssertEqual(unsaved.documents.count, 2, "a persistent failure keeps both")

        // The stopped session's storage recovers: a retry saves it once, as ink.json, and releases it.
        try FileManager.default.removeItem(at: stoppedDirectory.appending(path: "ink"))
        unsaved.retry()
        XCTAssertEqual(unsaved.documents.map { $0.session.document.createdInSession }, ["active"])
        let saved = try InkStore(sessionDirectory: stoppedDirectory).load()
        XCTAssertEqual(saved.strokes, stopped.document.strokes)
        XCTAssertEqual(saved.operations, stopped.document.operations)
        unsaved.retry()
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(
            atPath: stoppedDirectory.appending(path: "ink").path(percentEncoded: false)), ["ink.json"],
                       "saved once; nothing duplicated or saved beside")

        // Export needs an existing folder; it writes a new file, reads it back, and releases it.
        let folder = root.appending(path: "export", directoryHint: .isDirectory)
        XCTAssertEqual(unsaved.export(to: folder), [])
        XCTAssertEqual(unsaved.documents.count, 1)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let exported = unsaved.export(to: folder)
        XCTAssertEqual(exported.count, 1)
        XCTAssertTrue(unsaved.isEmpty)
        let copy = try InkStore(documentFile: exported[0]).load()
        XCTAssertEqual(copy.strokes, active.document.strokes)
        XCTAssertEqual(copy.operations, active.document.operations)

        // Discarding is an explicit choice that drops what is held.
        let dropped = newSession(session: "dropped")
        XCTAssertNil(unsaved.close(dropped, store: InkStore(sessionDirectory: try blockedSession("dropped")),
                                   reason: "user_stop", host: 7))
        XCTAssertEqual(unsaved.discard(), 1)
        XCTAssertTrue(unsaved.isEmpty)
    }
}
