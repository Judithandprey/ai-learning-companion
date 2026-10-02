import Foundation
import FoundationNetworking
import Glibc
import XCTest

/// The Mac retained-frame 0.2.11 mapper on one deterministic session made by the real recorder,
/// composer and FrameStore from encoded synthetic pixels (not ScreenCaptureKit output). Every
/// archive identity and binding here is synthetic. With COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR set
/// to a new directory, the session, descriptors, refusals and manifest are kept there for
/// checks/validate_mac_retained_frames.py.
extension DesktopCaptureTests {
    var macSource: SourceReference {
        SourceReference(userID: "synthetic-user", sourceID: "synthetic-mac-display", sourceVersion: 1)
    }

    var macIncarnation: CaptureIncarnation {
        CaptureIncarnation(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                           streamID: "synthetic-screen-incarnation")
    }

    private var macDisplay: DisplayFacts {
        DisplayFacts(displayID: 7, name: "Synthetic Display", frame: RecordedRect(CGRect(x: 0, y: 0, width: 100, height: 50)),
                     pointPixelScale: 2, requestedWidth: 200, requestedHeight: 100, rotationDegrees: 0, isMain: true,
                     scope: DisplayFacts.appExcludedScope(showsCursor: true))
    }

    private func macBuffer() throws -> CVPixelBuffer {
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
                    base[y * rowBytes + x * 4 + channel] = channel == 3 ? 255 : 128
                }
            }
        }
        return buffer
    }

    /// One composing session, never finished, with these kept frames and outcomes:
    /// 1. pixels at 100.2, before any document: composed, no document, raw alias;
    /// 2. pixels at 100.9, document at revision 0: composed, raw alias;
    /// 3. pixels at 102, after a stroke: composed at revision 1, its own file;
    /// 4. pixels at 103, after a partial erase: composed at revision 2;
    /// 5. no source time, callback 103.6: composed at revision 2, paired at callback admission;
    /// 6. pixels at 105, in the same document reopened at 104.5: composed at the carried
    ///    revision 6, whose commit time is unknown;
    /// 7. pixels at 106, after a rotation noticed at 105.8: not composed (refused);
    /// 8. callback 106.6: kept, no outcome recorded (unknown).
    /// After frame 5's admission the first document goes on until Stop: undo, redo, ASK Finish, ASK
    /// Cancel, a continued stroke, and a stroke interrupted by Stop (revision 6). Ink originals are
    /// frozen at 106.7: frames 2 and 3 keep one snapshot at revision 6, newer than their pixels;
    /// frame 4's outcome line is then rewritten as a recorder from before ink originals wrote it
    /// (not recorded: unknown); frame 5's request comes without a frozen document (unavailable);
    /// frame 6 keeps the reopened document, frozen with a stroke in progress that is committed
    /// after the requests are made, and saved, so the snapshot does not hold it.
    func writeMacSession(root: URL) throws -> URL {
        let recorder = try CaptureRecorder(
            root: root, display: macDisplay,
            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 24, silenceLimit: 6, showsCursor: true),
            permissionPreflightAtStart: true, composesInk: true, wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        recorder.note("capture_filter", host: 100, detail: [
            "method": "SCContentFilter(display:excludingApplications:exceptingWindows:)", "excluded_process_id": "4242",
            "excluded_bundle_identifier": "org.example.synthetic", "excluded_application_name": "Synthetic",
            "composition": "each kept frame is composed with the ink separately",
        ])
        recorder.streamStarted(host: 100, wall: Date(timeIntervalSince1970: 1_790_000_000.5))
        func keep(source: Double?, callback: Double) throws -> KeptFrame {
            recorder.frame(facts(.complete, source: source), image: try macBuffer(), host: callback, accepted: true)
            return try XCTUnwrap(recorder.status.lastKept)
        }
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: recorder.status.session,
                                                   createdWall: Date(timeIntervalSince1970: 1_790_000_000.5)))
        func draw(_ points: [(Double, Double)], host: Double) {
            let inputs = points.map { InkPoint(x: $0.0, y: $0.1, eventTime: host) }
            XCTAssertEqual(ink.begin(at: inputs[0], device: .tabletPen, anchor: InkAnchor(nativeSession: nil, frame: nil, host: host)), .accepted)
            inputs.dropFirst().forEach { ink.extend(to: $0) }
            XCTAssertEqual(ink.end(host: host), .accepted)
        }
        var frames = [try keep(source: 100.2, callback: 100.3)]
        ink.setMode(.write, host: 100.5)
        frames.append(try keep(source: 100.9, callback: 101))
        draw([(10, 10), (90, 10)], host: 101.5)
        frames.append(try keep(source: 102, callback: 102.1))
        ink.tool = .eraser
        draw([(50, 0), (50, 20)], host: 102.5)
        frames.append(try keep(source: 103, callback: 103.1))
        frames.append(try keep(source: nil, callback: 103.6))
        // The first document's history goes on until Stop.
        XCTAssertEqual(ink.undo(host: 103.65), .accepted)                                      // revision 3
        XCTAssertEqual(ink.redo(host: 103.7), .accepted)                                       // revision 4
        ink.tool = .pen
        ink.setMode(.ask, host: 103.72)
        XCTAssertEqual(ink.begin(at: InkPoint(x: 5, y: 5, eventTime: 103.73), device: .mouse,
                                 anchor: InkAnchor(nativeSession: recorder.status.session, frame: nil, host: 103.73)), .accepted)
        ink.extend(to: InkPoint(x: 40, y: 30, eventTime: 103.74))
        XCTAssertEqual(ink.end(host: 103.74, selection: SelectionContext(
            nativeSession: recorder.status.session, captureSession: recorder.directory, display: macDisplay,
            frame: FrameReference(frames[3]), freshness: "live", geometryProblem: nil)), .accepted)
        XCTAssertNotNil(ink.finishAsk(geometryProblem: nil, inkDirectory: nil, host: 103.75))  // ASK finished, WRITE again
        ink.setMode(.ask, host: 103.78)
        XCTAssertEqual(ink.cancelAsk(host: 103.8), .accepted)                                  // ASK cancelled, WRITE again
        draw([(10, 40), (30, 40)], host: 103.85)                                               // revision 5: continued
        XCTAssertEqual(ink.begin(at: InkPoint(x: 60, y: 40, eventTime: 103.9), device: .tabletPen,
                                 anchor: InkAnchor(nativeSession: nil, frame: nil, host: 103.9)), .accepted)
        ink.extend(to: InkPoint(x: 80, y: 40, eventTime: 103.92))
        ink.closeInput(reason: "user_stop", host: 103.95)                                      // revision 6: interrupted
        let first = InkSpan(document: ink.document, file: recorder.status.session + "/ink/ink.json", opened: 100.5, closed: 104)
        let carried = InkSession(document: ink.document)
        carried.reopened(nativeSession: recorder.status.session, host: 104.5)
        var second = InkSpan(document: carried.document, file: recorder.status.session + "/ink/ink.json", opened: 104.5)
        frames.append(try keep(source: 105, callback: 105.1))
        // A stroke is in progress in the reopened document when the requests are made.
        carried.setMode(.write, host: 105.3)
        XCTAssertEqual(carried.begin(at: InkPoint(x: 20, y: 25, eventTime: 105.4), device: .tabletPen,
                                     anchor: InkAnchor(nativeSession: recorder.status.session, frame: nil, host: 105.4)), .accepted)
        carried.extend(to: InkPoint(x: 70, y: 25, eventTime: 105.5))
        var geometry = DisplayGeometry(started: macDisplay)
        geometry.observe(widthPoints: 50, heightPoints: 100, rotationDegrees: 90, host: 105.8)
        frames.append(try keep(source: 106, callback: 106.1))
        frames.append(try keep(source: 106.5, callback: 106.6))
        // As the app does, the open span holds the live document when the requests are made.
        second.document = carried.document
        var requests = frames.prefix(7).map { frame in
            InkComposer.request(for: frame, display: macDisplay, spans: [first, second], geometry: geometry, frozenHost: 106.7,
                                pendingGesture: !carried.gesturePoints.isEmpty)
        }
        // Frame 5's request comes without a frozen document, as from a caller before ink originals.
        requests[4].document = nil
        // The live document changes after the requests are made; the frozen values do not.
        XCTAssertEqual(carried.end(host: 106.8), .accepted)                                    // revision 7
        for request in requests {
            recorder.compose(request, host: 107)
        }
        // Frame 4's outcome line as a recorder from before ink originals wrote it; other lines unchanged.
        let events = recorder.directory.appending(path: "events.jsonl")
        let lines = try Data(contentsOf: events).split(separator: 0x0A, omittingEmptySubsequences: false).map { line -> Data in
            guard !line.isEmpty, var event = try? CaptureFiles.decoder.decode(CaptureEvent.self, from: Data(line)),
                  event.event == "composed", event.composed?.rawSequence == 4 else { return Data(line) }
            event.composed?.inkOriginal = nil
            return try CaptureFiles.encoder.encode(event)
        }
        try Data(lines.joined(separator: [0x0A])).write(to: events)
        // The editable document is saved beside the session, as the app saves it; it is not an
        // immutable original and no descriptor claims it.
        _ = try InkStore(sessionDirectory: recorder.directory).save(carried.document)
        return recorder.directory
    }

    private func macBinding(_ id: String, sha256: String, byteLength: Int) -> OriginalBinding {
        OriginalBinding(source: macSource, artifact: PNGReference(artifactID: id, sha256: sha256, byteLength: byteLength))
    }

    /// Every kept frame, raw bindings for all, and composed bindings for the images with strokes.
    func macPlan(_ session: RetainedSession, twoReferencesFor alias: Int? = nil) -> MacRetainedPlan {
        let entries = session.frames.map { frame -> MacRetainedEntry in
            let sequence = frame.record.sequence
            let raw = macBinding("synthetic-mac-raw-\(sequence)", sha256: frame.record.sha256, byteLength: frame.record.byteLength)
            var composed: OriginalBinding?
            if case .composed(let record, _)? = session.outcomes[sequence] {
                if !record.ink.strokes.isEmpty {
                    composed = macBinding("synthetic-mac-composed-\(sequence)", sha256: record.sha256, byteLength: record.byteLength)
                } else if alias == sequence {
                    composed = macBinding("synthetic-mac-alias-\(sequence)", sha256: record.sha256, byteLength: record.byteLength)
                }
            }
            // The retained editable original, bound as 0.2.2 editable_ink; one ID per distinct snapshot.
            var inkOriginal: OriginalBinding?
            if case .composed(let record, _)? = session.outcomes[sequence], let original = record.inkOriginal,
               original.status == "retained", let sha256 = original.sha256, let byteLength = original.byteLength {
                inkOriginal = OriginalBinding(source: macSource, artifact: PNGReference(
                    artifactID: "synthetic-mac-ink-\(sha256.prefix(12))", sha256: sha256, byteLength: byteLength,
                    mediaType: "application/json"), kind: "editable_ink")
            }
            return MacRetainedEntry(callbackSequence: sequence, frameID: "synthetic-mac-frame-\(sequence)", raw: raw,
                                    composed: composed, inkOriginal: inkOriginal)
        }
        return MacRetainedPlan(incarnation: macIncarnation, source: macSource, nativeSessionID: session.status.session,
                               displayID: 7, entries: entries)
    }

    /// The value at a path of object keys; a missing key gives the string "<missing>".
    private func value(_ json: JSONValue, _ path: String...) -> JSONValue {
        var current = json
        for key in path {
            guard case .object(let fields) = current, let next = fields[key] else { return .string("<missing>") }
            current = next
        }
        return current
    }

    // MARK: - Every outcome

    func testMapsEveryRetainedOutcomeToMacFrameMetadata() throws {
        let fixtureDirectory = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
        let output = fixtureDirectory ?? root.appending(path: "mac-frame", directoryHint: .isDirectory)
        guard !FileManager.default.fileExists(atPath: output.path(percentEncoded: false)) else {
            XCTFail("fixtures are written only to a new directory: \(output.path(percentEncoded: false))")
            return
        }
        let directory = try writeMacSession(root: output.appending(path: "native", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        XCTAssertEqual(session.frames.count, 8)
        XCTAssertEqual(session.outcomes.count, 7)
        XCTAssertEqual(session.captureFilter?["excluded_process_id"], "4242")

        let mapping = try MacRetainedFrames.map(macPlan(session), session: session)
        XCTAssertEqual(mapping.refused, [])
        XCTAssertEqual(mapping.described.map(\.callbackSequence), Array(1...8))
        let frames = mapping.described.map(\.frame)
        func kind(_ index: Int) -> JSONValue { value(frames[index], "composition", "kind") }
        XCTAssertEqual((0..<8).map(kind), [.string("composed"), .string("composed"), .string("composed"), .string("composed"),
                                            .string("composed"), .string("composed"), .string("not_composed"), .string("unknown")])
        XCTAssertEqual((0..<6).map { value(frames[$0], "composition", "ink", "revision") },
                       [.null, .integer(0), .integer(1), .integer(2), .integer(2), .integer(6)])
        XCTAssertEqual(value(frames[0], "composition", "ink", "document"), .null)
        XCTAssertEqual(value(frames[4], "composition", "ink", "pixels_time"), .string("callback_admission"))
        XCTAssertEqual(value(frames[5], "composition", "ink", "revision_host_seconds"), .null,
                       "the carried revision's commit time is on another clock scope")
        if case .array(let limits) = value(frames[5], "composition", "ink", "limits") {
            XCTAssertTrue(limits.contains(.string("revision 6 was committed before this document was last reopened; its commit time may be on another session's or boot's clock and is not given")))
        } else {
            XCTFail("limits missing")
        }
        XCTAssertEqual(value(frames[3], "composition", "ink", "revision_host_seconds"), .number(102.5))
        XCTAssertEqual(value(frames[6], "composition", "reason"), .string("refused"))
        XCTAssertEqual(value(frames[7], "composition"), .object(["kind": .string("unknown"), "reason": .string("no_retained_outcome")]))
        for frame in frames {
            for field in ["captured_at", "media_position", "pixel_orientation", "capture_latency_ms"] {
                XCTAssertEqual(value(frame, field), .null, field)
            }
            XCTAssertEqual(value(frame, "contract_version"), .string("0.2.11"))
        }
        // Raw aliases reuse the raw binding; images with strokes bring their own.
        XCTAssertEqual(mapping.described.map(\.bindings.count), [1, 1, 2, 2, 2, 2, 1, 1])
        XCTAssertEqual(value(frames[1], "composition", "image", "native_file"), .string("frames/00000002.png"))
        XCTAssertEqual(value(frames[1], "composition", "image", "artifact", "artifact_id"), .string("synthetic-mac-raw-2"))
        XCTAssertEqual(value(frames[2], "composition", "image", "native_file"), .string("composed/00000003.png"))
        XCTAssertEqual(value(frames[2], "profile", "host_clock", "source_seconds"),
                       .number(try XCTUnwrap(session.frames[2].record.sourceHost)))

        // Composed frames with a document keep a frozen editable original, bound separately; one
        // outcome predates ink originals and one came without a frozen document.
        XCTAssertEqual(mapping.described.map(\.inkOriginalBindings.count), [0, 1, 1, 0, 0, 1, 0, 0])
        func composedRecord(_ sequence: Int) throws -> ComposedFrame {
            guard case .composed(let record, _)? = session.outcomes[sequence] else { throw MappingRefusal("no composed outcome") }
            return record
        }
        func original(_ sequence: Int) throws -> InkOriginalRecord { try XCTUnwrap(try composedRecord(sequence).inkOriginal) }
        XCTAssertEqual(try original(1).status, "no_document")
        XCTAssertEqual(try [2, 3, 6].map { try original($0).status }, ["retained", "retained", "retained"])
        XCTAssertNil(try composedRecord(4).inkOriginal, "not recorded: unknown, never empty ink")
        XCTAssertEqual([try original(5).status, try original(5).problem], ["unavailable", "no frozen document came with this composition request"])
        XCTAssertEqual(try original(3).file, try original(2).file, "frames 2 and 3 share one snapshot")
        XCTAssertEqual([try original(2).reused, try original(3).reused, try original(6).reused], [false, true, false])
        XCTAssertNotEqual(try original(6).file, try original(2).file, "the reopened document is another snapshot")
        XCTAssertEqual([try original(2).pairedRevision, try original(2).documentRevision], [0, 6])
        XCTAssertEqual([try original(6).pairedRevision, try original(6).documentRevision], [6, 6])
        XCTAssertEqual([try original(6).pendingGesture, try original(2).pendingGesture], [true, false])
        XCTAssertEqual(try original(6).frozenHost, 106.7)
        XCTAssertEqual(try original(6).limits, [
            InkComposer.originalLimits(documentRevision: 6, pairedRevision: 6, pendingGesture: true, reopened: true)[0],
            "a gesture was in progress when the document was frozen; its points are not in the snapshot",
            "operations before the document's last reopening keep their own session's host clock",
        ])
        // The exact bytes and the whole history of each snapshot.
        func snapshot(_ sequence: Int) throws -> (Data, InkDocument) {
            let record = try original(sequence)
            let data = try Data(contentsOf: directory.appending(path: try XCTUnwrap(record.file)))
            XCTAssertEqual(data.count, record.byteLength)
            XCTAssertEqual(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), record.sha256)
            let document = try CaptureFiles.decoder.decode(InkDocument.self, from: data)
            XCTAssertEqual(try CaptureFiles.encoder.encode(document), data, "the stored bytes are the document's own encoding")
            return (data, document)
        }
        let (_, stopped) = try snapshot(2)
        XCTAssertEqual(stopped.operations.map(\.kind), ["mode", "stroke", "erase", "undo", "redo", "mode", "ask_finished", "mode",
                                                        "ask_cancelled", "stroke", "stroke", "input_closed"])
        XCTAssertEqual(stopped.selections.count, 1)
        XCTAssertEqual(stopped.strokes.last?.interrupted, true)
        XCTAssertEqual(stopped.visibleStrokes(atRevision: 0)?.map(\.id), try composedRecord(2).ink.strokes)
        XCTAssertEqual(stopped.visibleStrokes(atRevision: 1)?.map(\.id), try composedRecord(3).ink.strokes)
        let (_, reopenedSnapshot) = try snapshot(6)
        XCTAssertEqual(reopenedSnapshot.operations.map(\.kind).suffix(3), ["input_closed", "reopened", "mode"])
        XCTAssertEqual(reopenedSnapshot.visibleStrokes(atRevision: 6)?.map(\.id), try composedRecord(6).ink.strokes)
        let saved = try CaptureFiles.decoder.decode(InkDocument.self, from: Data(contentsOf: directory.appending(path: "ink/ink.json")))
        XCTAssertEqual(saved.revision, 7, "the live document went on after the requests")
        XCTAssertFalse(reopenedSnapshot.operations.contains { $0.host == 106.8 }, "the later stroke is not in the snapshot")
        let facts = mapping.unrepresented.joined(separator: "\n")
        XCTAssertTrue(mapping.unrepresented.contains { $0.hasPrefix("ink originals: 3 composed frames keep one [")
            && $0.contains("1 unavailable, 1 without a document, 1 not recorded (unknown, from before ink originals); unavailable because: no frozen document came with this composition request;") },
                      facts)
        XCTAssertTrue(mapping.unrepresented.contains { $0.hasPrefix("ink originals: callback 6 keeps ink-originals/")
            && $0.contains("(document revision 6, paired revision 6, frozen at host 106.7 s, written); limits: ")
            && $0.contains("a gesture was in progress") }, facts)
        XCTAssertEqual([session.status.inkOriginalFiles, session.status.inkOriginalsUnavailable], [2, 1])

        // A second archive reference for the same raw alias.
        let twoReferences = try MacRetainedFrames.map(macPlan(session, twoReferencesFor: 2), session: session)
        let aliased = try XCTUnwrap(twoReferences.described.first { $0.callbackSequence == 2 })
        XCTAssertEqual(aliased.bindings.count, 2)
        XCTAssertEqual(value(aliased.frame, "composition", "image", "artifact", "artifact_id"), .string("synthetic-mac-alias-2"))
        XCTAssertEqual(value(aliased.frame, "composition", "image", "native_file"), .string("frames/00000002.png"))

        // Facts the descriptors do not carry are reported, not dropped.
        let unrepresented = mapping.unrepresented.joined(separator: "\n")
        XCTAssertTrue(unrepresented.contains("no ending is recorded"), unrepresented)
        XCTAssertTrue(unrepresented.contains("capture_filter: composition=each kept frame is composed"), unrepresented)
        XCTAssertTrue(unrepresented.contains("callbacks 8 have no recorded composition outcome: unknown, never empty ink"), unrepresented)
        XCTAssertTrue(unrepresented.contains("not an immutable editable original"), unrepresented)

        // The released 0.2.7 path still refuses this scope.
        XCTAssertThrowsError(try DesktopIngress.frame(session.frames[0], in: session, frameID: "synthetic-mac-frame-1",
                                                      incarnation: macIncarnation,
                                                      binding: macPlan(session).entries[0].raw)) { error in
            XCTAssertTrue((error as? MappingRefusal)?.reason.contains("excludes this app's windows") == true, "\(error)")
        }

        let refusals = try macRefusalCases(session).map { (name, attempt, expected) -> JSONValue in
            var reason = "NOT REFUSED"
            do {
                try attempt()
            } catch let refusal as MappingRefusal {
                reason = refusal.reason
            } catch {
                reason = "unexpected error \(error)"
            }
            XCTAssertTrue(reason.contains(expected), "\(name): \(reason)")
            return .object(["type": .string("refusal"), "name": .string(name), "reason": .string(reason),
                            "expected": .string(expected)])
        }
        XCTAssertGreaterThanOrEqual(refusals.count, 20)

        // A limitation that reads like the reopened text but names no revision is an ordinary extra
        // limitation, as 0.2.11 reads it: described, and never a crash.
        var oddLimit = session
        if case .composed(var record, let host)? = session.outcomes[3] {
            record.ink.limits.append("revision" + InkComposer.reopenedLimit(0).dropFirst("revision 0".count))
            oddLimit.outcomes[3] = .composed(record, host: host)
        }
        let single = MacRetainedPlan(incarnation: macIncarnation, source: macSource, nativeSessionID: session.status.session,
                                     displayID: 7, entries: [macPlan(session).entries[2]])
        let tolerated = try MacRetainedFrames.map(single, session: oddLimit)
        XCTAssertEqual(tolerated.described.map(\.callbackSequence), [3])
        XCTAssertEqual(tolerated.refused, [])

        // Fixture: the session, descriptors and refusals, for the independent checker.
        func encoded(_ mapping: MacRetainedMapping) -> JSONValue {
            let described = mapping.described.map { item -> JSONValue in
                .object(["callback_sequence": .integer(item.callbackSequence), "frame_id": .string(item.frameID),
                         "frame": item.frame, "bindings": .array(item.bindings),
                         "ink_original_bindings": .array(item.inkOriginalBindings)])
            }
            let refused = mapping.refused.map { item -> JSONValue in
                .object(["callback_sequence": .integer(item.callbackSequence), "frame_id": .string(item.frameID),
                         "reason": .string(item.reason)])
            }
            return .object(["described": .array(described), "refused": .array(refused),
                            "unrepresented": .array(mapping.unrepresented.map(JSONValue.string))])
        }
        let manifest: JSONValue = .object([
            "generator": .string("DesktopCaptureTests.testMapsEveryRetainedOutcomeToMacFrameMetadata"),
            "synthetic": .string("synthetic session pixels, identities, bindings and display source; real Swift recorder, composer, FrameStore PNGs and mapper output; nothing sent"),
            "native_session": .string("native/\(session.status.session)"),
            "display_source": .object([
                "contract_version": .string("0.2.3"), "user_id": .string(macSource.userID),
                "source_id": .string(macSource.sourceID), "source_version": .integer(macSource.sourceVersion),
                "type": .string("shared_display"), "device_id": .string(macIncarnation.deviceID),
                "session_id": .string(macIncarnation.sessionID), "stream_id": .string(macIncarnation.streamID),
                "project_id": .null, "created_at": .string("2026-09-21T14:13:00Z"),
                "source_timezone": .string("America/Los_Angeles"),
            ]),
            "cases": .array([
                .object(["type": .string("mapping"), "name": .string("every_kept_frame"), "mapping": encoded(mapping)]),
                .object(["type": .string("mapping"), "name": .string("raw_alias_two_references"), "mapping": encoded(twoReferences)]),
            ] + refusals),
        ])
        let data = try DesktopJSON.encode(manifest)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        try data.write(to: output.appending(path: "manifest.json"), options: .withoutOverwriting)
    }

    // MARK: - Refusals

    /// Named attempts that must be refused, with a fragment of the expected reason: whole plans
    /// that cannot be trusted, and entries whose files or records cannot be represented.
    private func macRefusalCases(_ session: RetainedSession) throws -> [(String, () throws -> Void, String)] {
        let plan = macPlan(session)
        /// The one entry's refusal reason, thrown so each case reads the same way.
        func entry(_ changedSession: RetainedSession, _ sequence: Int, change: (inout MacRetainedEntry) -> Void = { _ in }) throws {
            var chosen = try XCTUnwrap(plan.entries.first { $0.callbackSequence == sequence })
            change(&chosen)
            let changedPlan = MacRetainedPlan(incarnation: plan.incarnation, source: plan.source, nativeSessionID: plan.nativeSessionID,
                                              displayID: plan.displayID, entries: [chosen])
            let mapping = try MacRetainedFrames.map(changedPlan, session: changedSession)
            if let refusal = mapping.refused.first { throw MappingRefusal(refusal.reason) }
        }
        func rewritten(_ base: RetainedSession, _ sequence: Int, _ change: (inout KeptFrame) -> Void) -> RetainedSession {
            var changed = RetainedSession(
                directory: base.directory, status: base.status, startedWallText: base.startedWallText,
                frames: base.frames.map { frame in
                    guard frame.record.sequence == sequence else { return frame }
                    var record = frame.record
                    change(&record)
                    return RetainedFrame(record: record, originalProblem: frame.originalProblem)
                }, gaps: base.gaps, notes: base.notes)
            changed.outcomes = base.outcomes
            changed.captureFilter = base.captureFilter
            return changed
        }
        func frames(_ sequence: Int, _ change: (inout KeptFrame) -> Void) -> RetainedSession {
            rewritten(session, sequence, change)
        }
        func composed(_ sequence: Int, _ change: (inout ComposedFrame) -> Void) -> RetainedSession {
            var changed = session
            if case .composed(var record, let host)? = session.outcomes[sequence] {
                change(&record)
                changed.outcomes[sequence] = .composed(record, host: host)
            }
            return changed
        }
        func notComposed(_ reason: String, _ detail: String) -> RetainedSession {
            var changed = session
            changed.outcomes[7] = .notComposed(host: 107, reason: reason, detail: detail)
            return changed
        }
        func scope(_ text: String) -> RetainedSession {
            var status = session.status
            status.display.scope = text
            var changed = RetainedSession(directory: session.directory, status: status, startedWallText: session.startedWallText,
                                          frames: session.frames, gaps: session.gaps, notes: session.notes)
            changed.outcomes = session.outcomes
            return changed
        }
        func planChange(_ change: (inout MacRetainedPlan) -> Void) throws {
            var changed = plan
            change(&changed)
            _ = try MacRetainedFrames.map(changed, session: session)
        }
        // Files on disk, in a copy of the session.
        func copied(_ change: (URL) throws -> Void) throws -> RetainedSession {
            // The per-test root exists only once something is written under it.
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let copy = root.appending(path: "copy-\(UUID().uuidString)", directoryHint: .isDirectory)
            try FileManager.default.copyItem(at: session.directory, to: copy)
            try change(copy)
            var read = try RetainedSession.read(copy)
            read.captureFilter = session.captureFilter
            return read
        }
        let alteredRaw = try copied { copy in
            let url = copy.appending(path: "frames/00000003.png")
            var bytes = try Data(contentsOf: url)
            bytes[bytes.count - 1] ^= 1
            try bytes.write(to: url)
        }
        let missingComposed = try copied { try FileManager.default.removeItem(at: $0.appending(path: "composed/00000003.png")) }
        let alteredComposed = try copied { copy in
            let url = copy.appending(path: "composed/00000004.png")
            var bytes = try Data(contentsOf: url)
            bytes[bytes.count - 1] ^= 1
            try bytes.write(to: url)
        }
        // A same-sized JPEG, recorded consistently (its own SHA-256 and length) at a .png path.
        let jpeg: Data = try {
            let context = try XCTUnwrap(CGContext(data: nil, width: 200, height: 100, bitsPerComponent: 8, bytesPerRow: 0,
                                                  space: try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB)),
                                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
            context.setFillColor(CGColor(gray: 0.5, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: 200, height: 100))
            let image = try XCTUnwrap(context.makeImage())
            let bytes = NSMutableData()
            let destination = try XCTUnwrap(CGImageDestinationCreateWithData(bytes, "public.jpeg" as CFString, 1, nil))
            CGImageDestinationAddImage(destination, image, nil)
            XCTAssertTrue(CGImageDestinationFinalize(destination))
            return bytes as Data
        }()
        let jpegSHA = SHA256.hash(data: jpeg).map { String(format: "%02x", $0) }.joined()
        let jpegRaw = rewritten(try copied { try jpeg.write(to: $0.appending(path: "frames/00000003.png")) }, 3) {
            $0.sha256 = jpegSHA
            $0.byteLength = jpeg.count
        }
        var jpegComposed = try copied { try jpeg.write(to: $0.appending(path: "composed/00000004.png")) }
        if case .composed(var record, let host)? = jpegComposed.outcomes[4] {
            record.sha256 = jpegSHA
            record.byteLength = jpeg.count
            jpegComposed.outcomes[4] = .composed(record, host: host)
        }
        // The retained ink original of frame 3, and a session copy where its bytes changed.
        guard case .composed(let third, _)? = session.outcomes[3], let thirdOriginal = third.inkOriginal,
              let thirdFile = thirdOriginal.file else { throw MappingRefusal("frame 3 keeps no ink original") }
        let alteredOriginal = try copied { copy in
            let url = copy.appending(path: thirdFile)
            var bytes = try Data(contentsOf: url)
            bytes[bytes.count - 1] ^= 1
            try bytes.write(to: url)
        }
        func originalChanged(_ change: @escaping (inout InkOriginalRecord) -> Void) -> RetainedSession {
            composed(3) { record in
                if var original = record.inkOriginal {
                    change(&original)
                    record.inkOriginal = original
                }
            }
        }
        return [
            ("ink_binding_without_original", { try entry(session, 1) { $0.inkOriginal = plan.entries[2].inkOriginal } },
             "no retained ink original"),
            ("ink_binding_for_unavailable", { try entry(originalChanged { $0.status = "unavailable" }, 3) }, "no retained ink original"),
            ("ink_binding_for_not_recorded", { try entry(session, 4) { $0.inkOriginal = plan.entries[2].inkOriginal } },
             "no retained ink original"),
            ("ink_binding_without_frozen_document", { try entry(session, 5) { $0.inkOriginal = plan.entries[2].inkOriginal } },
             "no retained ink original"),
            ("ink_original_other_document", {
                try entry(originalChanged { $0.documentFile = session.status.session + "/ink/ink.conflict-00000000.json" }, 3)
            }, "is not the frozen document of this frame's paired ink"),
            ("ink_binding_kind", { try entry(session, 3) { $0.inkOriginal?.kind = "screen_image" } }, "0.2.2 editable_ink"),
            ("ink_binding_length", { try entry(session, 3) { $0.inkOriginal?.artifact.byteLength += 1 } },
             "not the retained ink original's SHA-256 and length"),
            ("ink_original_bytes_changed", { try entry(alteredOriginal, 3) }, "\(thirdFile) no longer has the recorded SHA-256"),
            ("ink_original_not_reproducing", { try entry(originalChanged { $0.pairedRevision = 0 }, 3) },
             "does not reproduce this frame's paired revision and strokes"),
            ("jpeg_bytes_helper", { try MacRetainedFrames.checkSize(jpeg, width: 200, height: 100, file: "frames/00000001.png") },
             "frames/00000001.png is not a PNG"),
            ("raw_jpeg_as_png", { try entry(jpegRaw, 3) { $0.raw.artifact.sha256 = jpegSHA; $0.raw.artifact.byteLength = jpeg.count } },
             "frames/00000003.png is not a PNG"),
            ("composed_jpeg_as_png", {
                try entry(jpegComposed, 4) { $0.composed?.artifact.sha256 = jpegSHA; $0.composed?.artifact.byteLength = jpeg.count }
            }, "composed/00000004.png is not a PNG"),
            ("raw_bytes_changed", { try entry(alteredRaw, 3) }, "no longer has the recorded SHA-256"),
            ("composed_file_missing", { try entry(missingComposed, 3) }, "composed/00000003.png is not a regular file"),
            ("composed_bytes_changed", { try entry(alteredComposed, 4) }, "composed/00000004.png no longer has the recorded"),
            ("recorded_size_differs", { try entry(frames(3) { $0.width = 201 }, 3) }, "not the recorded 201×100"),
            ("source_time_rule", { try entry(frames(3) { $0.sourceHost = nil }, 3) }, "validation rule"),
            ("not_complete", { try entry(frames(3) { $0.facts.status = "idle" }, 3) }, "only a complete callback"),
            ("unknown_scope", { try entry(scope("whole display"), 3) }, "not one of the 0.2.11 descriptions"),
            ("composition_without_exclusion", { try entry(scope(DisplayFacts.inkOverlayScope(showsCursor: true)), 3) },
             "needs the configured app-exclusion scope"),
            ("raw_relation", { try entry(composed(3) { $0.rawSHA256 = String(repeating: "0", count: 64) }, 3) },
             "does not name this frame's retained raw original"),
            ("strokes_on_raw_file", { try entry(composed(3) { $0.file = "frames/00000003.png" }, 3) }, "is not this frame's composed"),
            ("empty_ink_own_file", { try entry(composed(1) { $0.file = "composed/00000001.png" }, 1) }, "not the raw original itself"),
            ("time_basis", { try entry(composed(3) { $0.ink.pixelsTime = "callback_admission" }, 3) }, "not paired"),
            ("commit_after_pixels", { try entry(composed(3) { $0.ink.revisionHost = 103 }, 3) }, "committed after"),
            ("stroke_identifier", { try entry(composed(3) { $0.ink.strokes = ["s 1"] }, 3) }, "stroke ID is not a contract Identifier"),
            ("raw_file_name", { try entry(frames(3) { $0.file = "frames/000000003.png" }, 3) },
             "is not the recorder's frames/NNNNNNNN.png name"),
            ("zero_ticks_disagree", { try entry(frames(3) { $0.facts.displayTimeTicks = 0 }, 3) }, "zero display ticks"),
            ("mapping_ratio", { try entry(composed(3) { $0.ink.mapping = InkComposer.mapping(scaleX: 3.0, scaleY: 2.0) }, 3) },
             "frame size / startup display size"),
            ("base_limits_order", { try entry(composed(3) { $0.ink.limits.swapAt(0, 1) }, 3) }, "three base limitations"),
            ("raw_alias_limit_missing", { try entry(composed(1) { $0.ink.limits.removeAll { $0 == InkComposer.rawAliasLimit } }, 1) },
             "contradict the time basis, the document or the raw alias"),
            ("unknown_time_limit_added", { try entry(composed(3) { $0.ink.limits.append(InkComposer.unknownTimeLimit) }, 3) },
             "contradict the time basis, the document or the raw alias"),
            ("reopened_limit_missing", { try entry(composed(6) { $0.ink.limits.removeAll { $0 == InkComposer.reopenedLimit(6) } }, 6) },
             "exactly its unknown commit time"),
            ("reopened_limit_leading_zero", { try entry(composed(6) { $0.ink.limits = $0.ink.limits.map {
                $0 == InkComposer.reopenedLimit(6) ? "revision 06" + $0.dropFirst("revision 6".count) : $0 } }, 6) },
             "exactly its unknown commit time"),
            ("reopened_limit_invented", { try entry(composed(4) { $0.ink.limits.append(InkComposer.reopenedLimit(2)) }, 4) },
             "exactly its unknown commit time"),
            ("ink_document_path", { try entry(composed(3) { $0.ink.document?.file = "elsewhere/ink.json" }, 3) },
             "is not <session>/ink/ink"),
            ("revision_zero_strokes", { try entry(composed(3) { $0.ink.revision = 0; $0.ink.revisionHost = nil }, 3) }, "revision 0"),
            ("oversized_limit", { try entry(composed(3) { $0.ink.limits.append(String(repeating: "x", count: 16_385)) }, 3) },
             "longer than 16384 characters"),
            ("unknown_reason", { try entry(notComposed("vanished", "synthetic"), 7) }, "not one 0.2.11 describes"),
            ("oversized_detail", { try entry(notComposed("refused", String(repeating: "x", count: 16_385)), 7) },
             "longer than 16384 characters"),
            ("two_outcomes", {
                var changed = session
                changed.outcomes[3] = nil
                changed.conflictingOutcomes = [3]
                try entry(changed, 3)
            }, "more than one composition outcome"),
            ("composed_binding_missing", { try entry(session, 3) { $0.composed = nil } }, "has no supplied original binding"),
            ("composed_binding_for_unknown", { try entry(session, 8) { $0.composed = $0.raw } }, "no recorded composition outcome"),
            ("raw_binding_mismatch", {
                try entry(session, 3) { $0.raw.artifact.byteLength += 1 }
            }, "raw binding is not the retained PNG's SHA-256 and length"),
            ("not_screen_image", { try entry(session, 3) { $0.raw.kind = "document" } }, "0.2.2 screen_image"),
            ("native_session_mismatch", { try planChange { $0.nativeSessionID = "another-session" } }, "native session"),
            ("display_mismatch", { try planChange { $0.displayID = 8 } }, "start display"),
            ("duplicate_frame_id", { try planChange { $0.entries[1].frameID = $0.entries[0].frameID } }, "unique in a plan"),
            // Raw frames here are identical PNGs, so the collision is a composed image named as its raw one.
            ("artifact_id_two_pngs", { try planChange { $0.entries[2].composed?.artifact.artifactID = "synthetic-mac-raw-3" } },
             "names two different PNGs"),
            ("foreign_source", { try planChange { $0.entries[0].raw.source.sourceID = "another-display" } }, "another source"),
            ("bad_frame_identifier", { try planChange { $0.entries[0].frameID = "not an id" } }, "Identifier"),
        ]
    }

    // MARK: - Incomplete sessions

    func testIncompleteSessionsNeverImplyEmptyInkOrLiveState() throws {
        let directory = try writeMacSession(root: root.appending(path: "incomplete", directoryHint: .isDirectory))
        let events = directory.appending(path: "events.jsonl")

        // A torn last line: the session cannot be read completely, so nothing is mapped.
        let whole = try Data(contentsOf: events)
        var torn = whole
        torn.append(contentsOf: Data("{\"event\":\"composed\",\"host\":10".utf8))
        try torn.write(to: events)  // This test's own session.
        XCTAssertThrowsError(try RetainedSession.read(directory)) { error in
            XCTAssertTrue((error as? MappingRefusal)?.reason.contains("is unreadable") == true, "\(error)")
        }

        // Every outcome line lost: every frame is unknown, none is empty ink, and the counts differ.
        let kept = whole.split(separator: 0x0A).filter { line in
            !(String(decoding: line, as: UTF8.self).contains("\"event\":\"composed\"")
              || String(decoding: line, as: UTF8.self).contains("\"event\":\"not_composed\""))
        }
        var rebuilt = Data()
        for line in kept {
            rebuilt.append(line)
            rebuilt.append(0x0A)
        }
        try rebuilt.write(to: events)
        let session = try RetainedSession.read(directory)
        XCTAssertEqual(session.outcomes.count, 0)
        let mapping = try MacRetainedFrames.map(macPlan(session), session: session)
        XCTAssertEqual(mapping.described.map { value($0.frame, "composition", "kind") }, Array(repeating: .string("unknown"), count: 8))
        XCTAssertTrue(mapping.unrepresented.contains { $0.hasPrefix("callbacks 1, 2, 3, 4, 5, 6, 7, 8 have no recorded composition outcome") })
        XCTAssertTrue(mapping.unrepresented.contains { $0.contains("no ending is recorded") })
        XCTAssertFalse(mapping.described.contains { value($0.frame, "composition", "kind") == .string("composed") })
        XCTAssertTrue(mapping.unrepresented.contains { $0.hasPrefix("ink documents \(session.status.session)/ink/ink.json;") },
                      "the saved ink document is reported even when no outcome names it")

        // Outcome lines read back: two for one frame, one for no kept frame, and an ignored request.
        let extra = [
            CaptureEvent(event: "not_composed", host: 108, detail: ["sequence": "3", "reason": "refused", "detail": "synthetic duplicate"]),
            CaptureEvent(event: "not_composed", host: 108, detail: ["sequence": "99", "reason": "refused", "detail": "synthetic stray"]),
            CaptureEvent(event: "composed", host: 108, composed: nil),
        ]
        var withOutcomes = whole
        for event in extra.prefix(2) {
            withOutcomes.append(try CaptureFiles.encoder.encode(event))
            withOutcomes.append(0x0A)
        }
        withOutcomes.append(try CaptureFiles.encoder.encode(CaptureEvent(event: "composition_request_ignored", host: 108, detail: [
            "sequence": "3", "reason": "this frame already has a composition outcome or was not awaiting one"])))
        withOutcomes.append(0x0A)
        try withOutcomes.write(to: events)
        let doubled = try RetainedSession.read(directory)
        XCTAssertEqual(doubled.conflictingOutcomes, [3])
        XCTAssertNil(doubled.outcomes[3])
        XCTAssertEqual(doubled.strayOutcomes, [99])
        XCTAssertEqual(doubled.ignoredCompositionRequests, 1)
        let doubledMapping = try MacRetainedFrames.map(macPlan(doubled), session: doubled)
        XCTAssertEqual(doubledMapping.refused.map(\.callbackSequence), [3])
        XCTAssertTrue(doubledMapping.refused[0].reason.contains("more than one composition outcome"))
        let doubledFacts = doubledMapping.unrepresented.joined(separator: "\n")
        XCTAssertTrue(doubledFacts.contains("callbacks 8 have no recorded composition outcome"), doubledFacts)
        XCTAssertFalse(doubledFacts.contains("callbacks 3 have no recorded composition outcome"), doubledFacts)
        XCTAssertTrue(doubledFacts.contains("callbacks 3 have more than one recorded composition outcome"), doubledFacts)
        XCTAssertTrue(doubledFacts.contains("composition outcomes name callbacks 99 that have no kept frame"), doubledFacts)
        XCTAssertTrue(doubledFacts.contains("1 composition requests came after a frame's outcome"), doubledFacts)
        // A recognized outcome line without its payload refuses the session, as a kept line does.
        var missingPayload = whole
        missingPayload.append(try CaptureFiles.encoder.encode(extra[2]))
        missingPayload.append(0x0A)
        try missingPayload.write(to: events)
        XCTAssertThrowsError(try RetainedSession.read(directory)) { error in
            XCTAssertTrue((error as? MappingRefusal)?.reason.contains("without its payload") == true, "\(error)")
        }

        // A session that could not exclude this app never composes: its frames are unknown too,
        // and 0.2.11 describes its scope while 0.2.7 still refuses it.
        let fallback = try CaptureRecorder(
            root: root.appending(path: "fallback", directoryHint: .isDirectory),
            display: DisplayFacts(displayID: 7, name: nil, frame: RecordedRect(CGRect(x: 0, y: 0, width: 100, height: 50)),
                                  pointPixelScale: 2, requestedWidth: 200, requestedHeight: 100, rotationDegrees: 0,
                                  isMain: true, scope: DisplayFacts.inkOverlayScope(showsCursor: false)),
            settings: .engineeringDefaults, permissionPreflightAtStart: true,
            wall: Date(timeIntervalSince1970: 1_790_000_100), host: 200)
        fallback.frame(facts(.complete, source: 200.5), image: try macBuffer(), host: 200.6, accepted: true)
        fallback.finish(reason: "user_stop", detail: nil, liveEndedHost: 201, host: 201, wall: Date(timeIntervalSince1970: 1_790_000_101))
        let plain = try RetainedSession.read(fallback.directory)
        let described = try MacRetainedFrames.map(macPlan(plain), session: plain)
        XCTAssertEqual(described.described.map { value($0.frame, "composition", "kind") }, [.string("unknown")])
        XCTAssertTrue(described.unrepresented.contains { $0.hasPrefix("the session ended (user_stop") })
        XCTAssertTrue(described.unrepresented.contains { $0.hasPrefix("no capture_filter event is recorded") })
        XCTAssertTrue(described.unrepresented.contains { $0.hasPrefix("no ink document is named or saved in this session") })

        // Both recorded endings are kept. When they agree nothing is flagged; when the events.jsonl
        // ending alone is changed, both stay and the differing fields are named, with neither chosen.
        XCTAssertTrue(described.unrepresented.contains("the session ended (user_stop; live claims ended at host 201.0 s); no descriptor carries the ending"))
        XCTAssertTrue(described.unrepresented.contains("events.jsonl records an ending (callbacks_after_live_ended=0; live_ended_host=201.0; reason=user_stop); no descriptor carries the ending"))
        XCTAssertFalse(described.unrepresented.contains { $0.contains("disagree on") })
        let fallbackEvents = fallback.directory.appending(path: "events.jsonl")
        var edited = Data()
        for line in try Data(contentsOf: fallbackEvents).split(separator: 0x0A) {
            var event = try CaptureFiles.decoder.decode(CaptureEvent.self, from: Data(line))
            if event.event == "ended" {
                event.detail = ["reason": "stream_error", "detail": "synthetic other detail", "live_ended_host": "202.5",
                                "callbacks_after_live_ended": "0"]
            }
            edited.append(try CaptureFiles.encoder.encode(event))
            edited.append(0x0A)
        }
        try edited.write(to: fallbackEvents)  // This test's own session.
        let paired = try RetainedSession.read(fallback.directory)
        let pairedFacts = try MacRetainedFrames.map(macPlan(paired), session: paired).unrepresented
        XCTAssertTrue(pairedFacts.contains("the session ended (user_stop; live claims ended at host 201.0 s); no descriptor carries the ending"))
        XCTAssertTrue(pairedFacts.contains("events.jsonl records an ending (callbacks_after_live_ended=0; detail=synthetic other detail; live_ended_host=202.5; reason=stream_error); no descriptor carries the ending"))
        XCTAssertTrue(pairedFacts.contains("the endings recorded in status.json and events.jsonl disagree on reason, detail, live_ended_host; both are kept above and neither is chosen"))
    }
}
