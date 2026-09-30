import CoreGraphics
import CoreMedia
import XCTest
@testable import DesktopCapture

/// The ink model and store: modes, strokes, partial erase, undo/redo, ASK, closing and saving.
/// Synthetic points only; the overlay window, pen hardware and real capture are not exercised.
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
    private func draw(_ ink: InkSession, _ points: [InkPoint], device: InkDevice = .tabletPen, host: Double)
        -> InkSession.Outcome {
        let anchor = InkAnchor(nativeSession: "native-1", frame: nil, host: host)
        let started = ink.begin(at: points[0], device: device, anchor: anchor)
        guard started == .accepted else { return started }
        for next in points.dropFirst() {
            ink.extend(to: next)
        }
        return ink.end(host: host)
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

        // Erasing across the middle removes only the point under the eraser.
        ink.tool = .eraser
        XCTAssertEqual(draw(ink, [point(50, 0), point(50, 20)], host: 12), .accepted)
        XCTAssertEqual(ink.document.visible, ["s2", "s3"])
        XCTAssertEqual(ink.document.strokes.map(\.id), ["s1", "s2", "s3"], "the erased original is kept")
        XCTAssertEqual(ink.document.strokes[1].points.map(\.x), [0, 10, 20, 30, 40])
        XCTAssertEqual(ink.document.strokes[2].points.map(\.x), [60, 70, 80, 90, 100])
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
        XCTAssertEqual(draw(ink, [point(10, 20)], host: 13.5), .refused("a selection needs an area; drag across the region"))
        XCTAssertEqual(draw(ink, [point(110, 70), point(10, 20)], host: 14), .accepted)
        XCTAssertEqual(ink.pendingSelection, RecordedRect(CGRect(x: 10, y: 20, width: 100, height: 50)))

        let display = DisplayFacts(displayID: 7, name: nil, frame: RecordedRect(CGRect(x: -1440, y: 0, width: 1440, height: 900)),
                                   pointPixelScale: 2, requestedWidth: 2880, requestedHeight: 1800, rotationDegrees: 0,
                                   isMain: false, scope: "synthetic fixture; not a captured display")
        let frame = kept(sequence: 4, callbackHost: 11.5)
        let selection = ink.finishAsk(SelectionContext(nativeSession: "native-1", display: display, frame: frame,
                                                       freshness: "live"), host: 15)
        XCTAssertEqual(ink.mode, .write, "finishing ASK restores WRITE")
        XCTAssertEqual(selection?.framePixelRect, RecordedRect(CGRect(x: 20, y: 40, width: 200, height: 100)))
        XCTAssertEqual(selection?.frame, frame)
        XCTAssertEqual(selection?.inkRevision, 2)
        XCTAssertEqual(selection?.inkRevisionAtFrame, 1, "only the first stroke preceded the frame")
        XCTAssertEqual(selection?.freshness, "live")
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

        let ink = newSession(session: recorder.status.session)
        ink.setMode(.ask, host: 102)
        draw(ink, [point(1.5, 0), point(2.5, 2)], host: 103)
        let mapped = InkSession.pixelRect(for: try XCTUnwrap(ink.pendingSelection), frame: frame, display: recorder.status.display)
        XCTAssertEqual(mapped.rect, region)
        let selection = ink.finishAsk(SelectionContext(nativeSession: recorder.status.session, display: recorder.status.display,
                                                       frame: frame, freshness: "live", crop: crop), host: 104)
        XCTAssertEqual(selection?.crop, crop)
        XCTAssertNil(selection?.cropProblem)
        XCTAssertTrue(selection?.composition.contains("No ink composite is rendered") == true)

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
        ink.setMode(.ask, host: 105)
        draw(ink, [point(0, 0), point(1, 1)], host: 106)
        let uncropped = ink.finishAsk(SelectionContext(nativeSession: nil, display: nil, frame: nil, freshness: "not live",
                                                       cropProblem: "no retained frame"), host: 107)
        XCTAssertNil(uncropped?.crop)
        XCTAssertEqual(uncropped?.cropProblem, "no retained frame")
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
        _ = try InkStore(sessionDirectory: sessionB).save(reopened.document)
        let empty = root.appending(path: "20260923T000000Z-CCCCCCCC", directoryHint: .isDirectory)
        _ = try InkStore(sessionDirectory: empty).save(newSession().document)
        var otherDisplay = reopened.document
        otherDisplay.displayID = 8
        let elsewhere = root.appending(path: "20260924T000000Z-DDDDDDDD", directoryHint: .isDirectory)
        _ = try InkStore(sessionDirectory: elsewhere).save(otherDisplay)
        XCTAssertEqual(InkStore.latestDocument(in: root, displayID: 7)?.lastPathComponent, sessionB.lastPathComponent,
                       "not the empty session, the other display or the non-user layer")
        XCTAssertEqual(InkStore.latestDocument(in: root, displayID: 7, excluding: [sessionB])?.lastPathComponent,
                       sessionA.lastPathComponent)
        XCTAssertEqual(InkStore.latestDocument(in: root, displayID: 8)?.lastPathComponent, elsewhere.lastPathComponent)
    }
}
