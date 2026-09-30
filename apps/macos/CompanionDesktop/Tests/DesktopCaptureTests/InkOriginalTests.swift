import CoreGraphics
import CoreMedia
import CoreVideo
import CryptoKit
import ScreenCaptureKit
import XCTest
@testable import DesktopCapture

/// Immutable editable-ink originals kept with composed frames: the whole document frozen when a
/// frame is paired, written once as exact JSON bytes at ink-originals/<SHA-256>.json. Real recorder
/// and composer on encoded synthetic pixels; no overlay, pen or display.
extension DesktopCaptureTests {
    private var originalDisplay: DisplayFacts {
        DisplayFacts(displayID: 7, name: "Synthetic Display", frame: RecordedRect(CGRect(x: 0, y: 0, width: 100, height: 50)),
                     pointPixelScale: 2, requestedWidth: 200, requestedHeight: 100, rotationDegrees: 0, isMain: true,
                     scope: DisplayFacts.appExcludedScope(showsCursor: true))
    }

    private func originalRecorder(_ name: String) throws -> CaptureRecorder {
        let recorder = try CaptureRecorder(
            root: root.appending(path: name, directoryHint: .isDirectory), display: originalDisplay,
            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 24, silenceLimit: 6, showsCursor: true),
            permissionPreflightAtStart: true, composesInk: true, wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        recorder.streamStarted(host: 100, wall: Date(timeIntervalSince1970: 1_790_000_000.5))
        return recorder
    }

    private func originalFrame(_ recorder: CaptureRecorder, source: Double, callback: Double) throws -> KeptFrame {
        var created: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
        XCTAssertEqual(CVPixelBufferCreate(nil, 200, 100, kCVPixelFormatType_32BGRA, attributes, &created), kCVReturnSuccess)
        let buffer = try XCTUnwrap(created)
        CVPixelBufferLockBaseAddress(buffer, [])
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(buffer)).assumingMemoryBound(to: UInt8.self)
        for index in 0..<(CVPixelBufferGetBytesPerRow(buffer) * 100) {
            base[index] = index % 4 == 3 ? 255 : 128
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])
        recorder.frame(facts(.complete, source: source), image: buffer, host: callback, accepted: true)
        return try XCTUnwrap(recorder.status.lastKept)
    }

    private func originalInk(_ session: String) -> InkSession {
        InkSession(document: InkDocument(displayID: 7, createdInSession: session, createdWall: Date(timeIntervalSince1970: 1_790_000_000.5)))
    }

    private func stroke(_ ink: InkSession, _ points: [(Double, Double)], host: Double) {
        let inputs = points.map { InkPoint(x: $0.0, y: $0.1, eventTime: host) }
        XCTAssertEqual(ink.begin(at: inputs[0], device: .tabletPen, anchor: InkAnchor(nativeSession: "synthetic", frame: nil, host: host)),
                       .accepted)
        inputs.dropFirst().forEach { ink.extend(to: $0) }
        XCTAssertEqual(ink.end(host: host), .accepted)
    }

    private func composedRecord(_ recorder: CaptureRecorder, _ sequence: Int) throws -> ComposedFrame {
        try XCTUnwrap(try events(recorder).compactMap(\.composed).first { $0.rawSequence == sequence })
    }

    private func sha(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Exact bytes and history

    func testFrozenInkOriginalKeepsTheExactDocumentAndItsHistory() throws {
        let recorder = try originalRecorder("history")
        let session = recorder.status.session
        let ink = originalInk(session)
        ink.setMode(.write, host: 100.5)
        stroke(ink, [(10, 10), (90, 10)], host: 101)                          // revision 1: s1
        let early = try originalFrame(recorder, source: 101.2, callback: 101.3)
        ink.tool = .eraser
        stroke(ink, [(50, 0), (50, 20)], host: 101.5)                          // revision 2: s1 -> s2, s3
        XCTAssertEqual(ink.undo(host: 101.7), .accepted)                       // revision 3
        XCTAssertEqual(ink.redo(host: 101.9), .accepted)                       // revision 4
        ink.tool = .pen
        ink.setMode(.ask, host: 102)
        XCTAssertEqual(ink.begin(at: InkPoint(x: 5, y: 5, eventTime: 102.05), device: .mouse,
                                 anchor: InkAnchor(nativeSession: session, frame: nil, host: 102.05)), .accepted)
        ink.extend(to: InkPoint(x: 40, y: 30, eventTime: 102.1))
        XCTAssertEqual(ink.end(host: 102.1, selection: SelectionContext(
            nativeSession: session, captureSession: recorder.directory, display: originalDisplay,
            frame: FrameReference(early), freshness: "live", geometryProblem: nil)), .accepted)
        XCTAssertNotNil(ink.finishAsk(geometryProblem: nil, inkDirectory: nil, host: 102.2))   // ASK finished, WRITE again
        ink.setMode(.ask, host: 102.3)
        XCTAssertEqual(ink.cancelAsk(host: 102.4), .accepted)                   // ASK cancelled, WRITE again
        stroke(ink, [(10, 40), (30, 40)], host: 102.6)                          // revision 5: continue writing
        let late = try originalFrame(recorder, source: 102.8, callback: 102.9)

        // Both frames are paired now; each request freezes the document as it is (revision 5).
        let frozen = ink.document
        let span = InkSpan(document: frozen, file: session + "/ink/ink.json", opened: 100.5)
        let geometry = DisplayGeometry(started: originalDisplay)
        let requestEarly = InkComposer.request(for: early, display: originalDisplay, spans: [span], geometry: geometry, frozenHost: 103)
        let requestLate = InkComposer.request(for: late, display: originalDisplay, spans: [span], geometry: geometry, frozenHost: 103)
        // The live document changes after the requests are queued; their snapshots do not.
        stroke(ink, [(10, 45), (30, 45)], host: 103.5)
        XCTAssertEqual(ink.document.revision, 6)
        recorder.compose(requestEarly, host: 104)
        recorder.compose(requestLate, host: 104)

        let first = try XCTUnwrap(try composedRecord(recorder, early.sequence).inkOriginal)
        let second = try XCTUnwrap(try composedRecord(recorder, late.sequence).inkOriginal)
        let expected = try CaptureFiles.encoder.encode(frozen)
        XCTAssertEqual(first.status, "retained")
        XCTAssertEqual(first.file, "ink-originals/\(sha(expected)).json")
        XCTAssertEqual([first.sha256, first.mediaType], [sha(expected), "application/json"])
        XCTAssertEqual(first.byteLength, expected.count)
        XCTAssertEqual(first.reused, false)
        XCTAssertEqual([second.file, second.sha256], [first.file, first.sha256], "one snapshot, one file")
        XCTAssertEqual(second.reused, true)
        let stored = try Data(contentsOf: recorder.directory.appending(path: try XCTUnwrap(first.file)))
        XCTAssertEqual(stored, expected, "the exact bytes of the frozen document")

        // The earlier frame shows revision 1; the snapshot is at revision 5, and says so.
        XCTAssertEqual([first.pairedRevision, first.documentRevision], [1, 5])
        XCTAssertEqual([second.pairedRevision, second.documentRevision], [5, 5])
        XCTAssertTrue(first.limits.contains("the snapshot is at revision 5 and the frame shows revision 1: later operations were committed after the pixels and are not drawn in this frame"))
        XCTAssertFalse(second.limits.contains { $0.hasPrefix("the snapshot is at revision") })
        XCTAssertEqual(first.createdInSession, session)
        XCTAssertEqual(first.frozenHost, 103)

        // Its history corresponds exactly: every stroke and operation, the stacks and the selection.
        let decoded = try CaptureFiles.decoder.decode(InkDocument.self, from: stored)
        XCTAssertEqual(decoded.strokes, frozen.strokes)
        XCTAssertEqual(decoded.operations, frozen.operations)
        XCTAssertEqual(decoded.operations.map(\.kind), ["mode", "stroke", "erase", "undo", "redo", "mode", "ask_finished", "mode",
                                                        "ask_cancelled", "stroke"])
        XCTAssertEqual([decoded.undoStack, decoded.redoStack], [frozen.undoStack, frozen.redoStack])
        XCTAssertEqual(decoded.selections, frozen.selections)
        XCTAssertEqual(decoded.selections.count, 1)
        XCTAssertEqual(decoded.visibleStrokes(atRevision: 1)?.map(\.id), try composedRecord(recorder, early.sequence).ink.strokes)
        XCTAssertEqual(decoded.visibleStrokes(atRevision: 5)?.map(\.id), try composedRecord(recorder, late.sequence).ink.strokes)
        XCTAssertFalse(decoded.operations.contains { $0.host == 103.5 }, "the edit after enqueue is not in the snapshot")

        let saved = try savedStatus(recorder)
        XCTAssertEqual(saved.inkOriginalFiles, 1)
        XCTAssertEqual(saved.inkOriginalBytes, expected.count)
        XCTAssertNil(saved.inkOriginalsUnavailable)
        XCTAssertFalse(FileManager.default.fileExists(atPath: recorder.directory.appending(path: "ink/ink.json").path(percentEncoded: false)),
                       "the mutable ink file is never written here")
    }

    // MARK: - Failures never overwrite, and recovery

    func testInkOriginalFailuresLeaveEntriesUntouchedAndSayWhy() throws {
        func setUp(_ name: String) throws -> (CaptureRecorder, CompositionRequest, String) {
            let recorder = try originalRecorder(name)
            let ink = originalInk(recorder.status.session)
            ink.setMode(.write, host: 100.5)
            stroke(ink, [(10, 10), (90, 10)], host: 101)
            let frame = try originalFrame(recorder, source: 101.2, callback: 101.3)
            let request = InkComposer.request(for: frame, display: originalDisplay,
                                              spans: [InkSpan(document: ink.document, file: recorder.status.session + "/ink/ink.json",
                                                              opened: 100.5)],
                                              geometry: DisplayGeometry(started: originalDisplay), frozenHost: 102)
            let address = "ink-originals/\(sha(try CaptureFiles.encoder.encode(ink.document))).json"
            return (recorder, request, address)
        }
        func checkComposedAnyway(_ recorder: CaptureRecorder, _ sequence: Int) throws {
            let record = try composedRecord(recorder, sequence)
            XCTAssertEqual(record.file, String(format: "composed/%08ld.png", sequence), "the composition itself is kept")
            XCTAssertEqual(try FrameStore.digest(of: recorder.directory.appending(path: record.file)).sha256, record.sha256)
        }

        // Other bytes at the address: left as they are, and recovery once they are gone.
        let (corrupt, corruptRequest, corruptAddress) = try setUp("corrupt")
        let folder = corrupt.directory.appending(path: "ink-originals", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let junk = Data("{\"not\":\"this document\"}".utf8)
        try junk.write(to: corrupt.directory.appending(path: corruptAddress))
        corrupt.compose(corruptRequest, host: 103)
        let refused = try XCTUnwrap(try composedRecord(corrupt, corruptRequest.frame.sequence).inkOriginal)
        XCTAssertEqual(refused.status, "unavailable")
        XCTAssertNil(refused.file)
        XCTAssertTrue(refused.problem?.contains("is not these exact bytes") == true, refused.problem ?? "")
        XCTAssertEqual(refused.limits, [InkComposer.originalUnavailableLimit], "no snapshot is claimed")
        XCTAssertEqual([refused.pairedRevision, refused.documentRevision], [1, 1])
        XCTAssertEqual(try Data(contentsOf: corrupt.directory.appending(path: corruptAddress)), junk, "never overwritten")
        try checkComposedAnyway(corrupt, corruptRequest.frame.sequence)
        try FileManager.default.removeItem(at: corrupt.directory.appending(path: corruptAddress))
        let next = try originalFrame(corrupt, source: 101.25, callback: 103.1)
        let retry = InkComposer.request(
            for: next, display: originalDisplay,
            spans: [InkSpan(document: try XCTUnwrap(corruptRequest.document), file: corrupt.status.session + "/ink/ink.json", opened: 100.5)],
            geometry: DisplayGeometry(started: originalDisplay), frozenHost: 104)
        corrupt.compose(retry, host: 104)
        XCTAssertEqual(try composedRecord(corrupt, next.sequence).inkOriginal?.status, "retained", "a later frame keeps it")
        XCTAssertEqual(try savedStatus(corrupt).inkOriginalsUnavailable, 1)

        // A symbolic link, or a directory, at the address: untouched.
        let (linked, linkedRequest, linkedAddress) = try setUp("linked")
        try FileManager.default.createDirectory(at: linked.directory.appending(path: "ink-originals", directoryHint: .isDirectory),
                                                withIntermediateDirectories: true)
        let target = root.appending(path: "outside.json")
        try Data("outside".utf8).write(to: target)
        try FileManager.default.createSymbolicLink(at: linked.directory.appending(path: linkedAddress), withDestinationURL: target)
        linked.compose(linkedRequest, host: 103)
        XCTAssertEqual(try composedRecord(linked, linkedRequest.frame.sequence).inkOriginal?.status, "unavailable")
        XCTAssertEqual(try Data(contentsOf: target), Data("outside".utf8))
        try checkComposedAnyway(linked, linkedRequest.frame.sequence)

        let (directoried, directoryRequest, directoryAddress) = try setUp("directory")
        try FileManager.default.createDirectory(at: directoried.directory.appending(path: directoryAddress, directoryHint: .isDirectory),
                                                withIntermediateDirectories: true)
        directoried.compose(directoryRequest, host: 103)
        XCTAssertEqual(try composedRecord(directoried, directoryRequest.frame.sequence).inkOriginal?.status, "unavailable")
        var isDirectory: ObjCBool = false
        XCTAssertTrue(FileManager.default.fileExists(atPath: directoried.directory.appending(path: directoryAddress).path(percentEncoded: false),
                                                     isDirectory: &isDirectory) && isDirectory.boolValue)

        // A file where ink-originals/ belongs: nothing can be written, and it says so.
        let (blocked, blockedRequest, _) = try setUp("blocked")
        try Data("not a directory".utf8).write(to: blocked.directory.appending(path: "ink-originals"))
        blocked.compose(blockedRequest, host: 103)
        let blockedOriginal = try XCTUnwrap(try composedRecord(blocked, blockedRequest.frame.sequence).inkOriginal)
        XCTAssertEqual(blockedOriginal.status, "unavailable")
        XCTAssertTrue(blockedOriginal.problem?.hasPrefix("ink-originals/ cannot be created") == true, blockedOriginal.problem ?? "")
        try checkComposedAnyway(blocked, blockedRequest.frame.sequence)

        // A frozen document that does not reproduce the paired strokes is not associated.
        let (mismatched, mismatchedRequest, _) = try setUp("mismatched")
        var wrong = mismatchedRequest
        wrong.document?.revision = 0
        mismatched.compose(wrong, host: 103)
        let mismatch = try XCTUnwrap(try composedRecord(mismatched, wrong.frame.sequence).inkOriginal)
        XCTAssertEqual(mismatch.status, "unavailable")
        XCTAssertTrue(mismatch.problem?.hasPrefix("the frozen document does not reproduce") == true, mismatch.problem ?? "")
        XCTAssertFalse(FileManager.default.fileExists(atPath: mismatched.directory.appending(path: "ink-originals").path(percentEncoded: false)))

        // Over the originals' own cap (equal to the raw cap): unavailable, nothing written, image kept.
        let capped = try CaptureRecorder(
            root: root.appending(path: "capped", directoryHint: .isDirectory), display: originalDisplay,
            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 18, silenceLimit: 6, showsCursor: true),
            permissionPreflightAtStart: true, composesInk: true, wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        capped.streamStarted(host: 100, wall: Date(timeIntervalSince1970: 1_790_000_000.5))
        let long = originalInk(capped.status.session)
        long.setMode(.write, host: 100.5)
        stroke(long, (0..<20_000).map { (10 + Double($0 % 80), 10 + Double($0 % 7)) }, host: 101)
        XCTAssertGreaterThan(try CaptureFiles.encoder.encode(long.document).count, 1 << 18)
        let cappedFrame = try originalFrame(capped, source: 101.2, callback: 101.3)
        capped.compose(InkComposer.request(for: cappedFrame, display: originalDisplay,
                                           spans: [InkSpan(document: long.document, file: capped.status.session + "/ink/ink.json",
                                                           opened: 100.5)],
                                           geometry: DisplayGeometry(started: originalDisplay), frozenHost: 102), host: 103)
        let overCap = try XCTUnwrap(try composedRecord(capped, cappedFrame.sequence).inkOriginal)
        XCTAssertEqual(overCap.status, "unavailable")
        XCTAssertTrue(overCap.problem?.contains("cap for ink originals") == true, overCap.problem ?? "")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(
            atPath: capped.directory.appending(path: "ink-originals").path(percentEncoded: false)), [])
        try checkComposedAnyway(capped, cappedFrame.sequence)

        // A request made without a frozen document (an older caller): unavailable, never "no document".
        let (unfrozen, unfrozenRequest, _) = try setUp("unfrozen")
        var bare = unfrozenRequest
        bare.document = nil
        unfrozen.compose(bare, host: 103)
        let missing = try XCTUnwrap(try composedRecord(unfrozen, bare.frame.sequence).inkOriginal)
        XCTAssertEqual([missing.status, missing.problem], ["unavailable", "no frozen document came with this composition request"])
        XCTAssertEqual(missing.pairedRevision, 1)
        try checkComposedAnyway(unfrozen, bare.frame.sequence)
    }

    // MARK: - Stop, reopen, pending gestures and old sessions

    func testStopAndReopenKeepOriginalsAndOldSessionsStayUnknown() throws {
        let recorder = try originalRecorder("lifecycle")
        let session = recorder.status.session
        let ink = originalInk(session)
        ink.setMode(.write, host: 100.5)
        stroke(ink, [(10, 10), (90, 10)], host: 101)
        let beforeStop = try originalFrame(recorder, source: 101.2, callback: 101.3)
        // Input closes at Stop with a stroke in progress; the closed span keeps that final document.
        _ = ink.begin(at: InkPoint(x: 10, y: 30, eventTime: 101.5), device: .tabletPen,
                      anchor: InkAnchor(nativeSession: session, frame: nil, host: 101.5))
        ink.extend(to: InkPoint(x: 30, y: 30, eventTime: 101.6))
        ink.closeInput(reason: "user_stop", host: 101.7)
        let closed = InkSpan(document: ink.document, file: session + "/ink/ink.json", opened: 100.5, closed: 101.7)
        // Reopened later in the same capture: a new span whose document continues the history.
        let reopening = InkSession(document: ink.document)
        reopening.reopened(nativeSession: session, host: 102)
        let reopened = InkSpan(document: reopening.document, file: session + "/ink/ink.json", opened: 102)
        let afterReopen = try originalFrame(recorder, source: 102.5, callback: 102.6)
        let geometry = DisplayGeometry(started: originalDisplay)
        recorder.compose(InkComposer.request(for: beforeStop, display: originalDisplay, spans: [closed, reopened], geometry: geometry,
                                             frozenHost: 103), host: 104)
        recorder.compose(InkComposer.request(for: afterReopen, display: originalDisplay, spans: [closed, reopened], geometry: geometry,
                                             frozenHost: 103, pendingGesture: true), host: 104)

        let stopped = try XCTUnwrap(try composedRecord(recorder, beforeStop.sequence).inkOriginal)
        let stoppedDocument = try CaptureFiles.decoder.decode(
            InkDocument.self, from: Data(contentsOf: recorder.directory.appending(path: try XCTUnwrap(stopped.file))))
        XCTAssertEqual(stoppedDocument.operations.suffix(2).map(\.kind), ["stroke", "input_closed"])
        XCTAssertEqual(stoppedDocument.strokes.last?.interrupted, true, "the interrupted stroke is kept in the original")
        XCTAssertEqual([stopped.pairedRevision, stopped.documentRevision], [1, 2])
        XCTAssertFalse(stopped.limits.contains { $0.hasPrefix("a gesture was in progress") }, "a closed span has no pending gesture")

        let carried = try XCTUnwrap(try composedRecord(recorder, afterReopen.sequence).inkOriginal)
        XCTAssertNotEqual(carried.file, stopped.file, "the reopened document is another snapshot")
        let carriedDocument = try CaptureFiles.decoder.decode(
            InkDocument.self, from: Data(contentsOf: recorder.directory.appending(path: try XCTUnwrap(carried.file))))
        XCTAssertEqual(carriedDocument.operations.last?.kind, "reopened")
        XCTAssertTrue(carried.limits.contains("operations before the document's last reopening keep their own session's host clock"))
        XCTAssertTrue(carried.limits.contains("a gesture was in progress when the document was frozen; its points are not in the snapshot"))
        XCTAssertEqual(try composedRecord(recorder, afterReopen.sequence).ink.revisionHost, nil,
                       "the carried revision's commit time stays unknown")

        // An ASK region drawn and awaiting Finish is pending input too: not in the snapshot, and said.
        reopening.setMode(.ask, host: 102.7)
        XCTAssertEqual(reopening.begin(at: InkPoint(x: 5, y: 5, eventTime: 102.72), device: .mouse,
                                       anchor: InkAnchor(nativeSession: session, frame: nil, host: 102.72)), .accepted)
        reopening.extend(to: InkPoint(x: 40, y: 30, eventTime: 102.74))
        XCTAssertEqual(reopening.end(host: 102.74), .accepted)
        XCTAssertNotNil(reopening.pendingSelection)
        let asking = try originalFrame(recorder, source: 102.8, callback: 102.85)
        recorder.compose(InkComposer.request(
            for: asking, display: originalDisplay,
            spans: [closed, InkSpan(document: reopening.document, file: session + "/ink/ink.json", opened: 102)],
            geometry: geometry, frozenHost: 102.9, pendingGesture: !reopening.gesturePoints.isEmpty,
            pendingAskRegion: reopening.pendingSelection != nil), host: 104)
        let awaiting = try XCTUnwrap(try composedRecord(recorder, asking.sequence).inkOriginal)
        XCTAssertEqual([awaiting.pendingAskRegion, awaiting.pendingGesture], [true, false])
        XCTAssertEqual(awaiting.limits.filter { $0.hasPrefix("an ASK region") },
                       ["an ASK region was drawn and was awaiting Finish or Cancel when the document was frozen; it is not in the snapshot"])
        let awaitingDocument = try CaptureFiles.decoder.decode(
            InkDocument.self, from: Data(contentsOf: recorder.directory.appending(path: try XCTUnwrap(awaiting.file))))
        XCTAssertEqual(awaitingDocument.selections, [], "the region awaiting Finish is not a selection yet")
        XCTAssertEqual(awaitingDocument.operations.last?.kind, "mode")
        recorder.finish(reason: "user_stop", detail: nil, liveEndedHost: 105, host: 105, wall: Date(timeIntervalSince1970: 1_790_000_005))

        // Kept files survive the ending, and the session reads back with them.
        let read = try RetainedSession.read(recorder.directory)
        XCTAssertEqual(read.outcomes.count, 3)
        guard case .composed(let readBack, _)? = read.outcomes[beforeStop.sequence] else { return XCTFail("no composed outcome") }
        XCTAssertEqual(readBack.inkOriginal, stopped)

        // A composed record from before ink originals decodes with none: unknown, never "no ink".
        var old = readBack
        old.inkOriginal = nil
        let oldLine = try CaptureFiles.encoder.encode(old)
        XCTAssertFalse(String(decoding: oldLine, as: UTF8.self).contains("inkOriginal"))
        XCTAssertNil(try CaptureFiles.decoder.decode(ComposedFrame.self, from: oldLine).inkOriginal)
        var legacy = read
        legacy.outcomes[beforeStop.sequence] = .composed(old, host: 104)
        let plan = MacRetainedPlan(
            incarnation: CaptureIncarnation(deviceID: "synthetic-device", sessionID: "synthetic-learning", streamID: "synthetic-stream"),
            source: SourceReference(userID: "synthetic-user", sourceID: "synthetic-display", sourceVersion: 1),
            nativeSessionID: session, displayID: 7, entries: [])
        let facts = MacRetainedFrames.unrepresented(legacy, plan: plan, described: [])
        XCTAssertTrue(facts.contains { $0.hasPrefix("ink originals: 2 composed frames keep one [")
            && $0.contains("0 unavailable, 0 without a document, 1 not recorded (unknown, from before ink originals)") },
                      facts.joined(separator: "\n"))
        let carriedFile = try XCTUnwrap(carried.file)
        let awaitingFile = try XCTUnwrap(awaiting.file)
        let perFrame = facts.filter { $0.hasPrefix("ink originals: callback ") }
            .map { line in String(line.prefix { character in character != "(" }) }
        XCTAssertEqual(perFrame, ["ink originals: callback \(afterReopen.sequence) keeps \(carriedFile) ",
                                  "ink originals: callback \(asking.sequence) keeps \(awaitingFile) "],
                       "no line for the legacy frame, one for each kept original")
    }
}
