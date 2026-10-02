import Foundation
import FoundationNetworking
import Glibc
import XCTest

/// The retained-session → DesktopFrame 0.2.7 / DesktopFrameBatchRequest 0.2.8 mapping. A real
/// recorder writes a synthetic session; the mapping reads it back. Nothing is sent. With
/// COMPANION_DESKTOP_INGRESS_FIXTURE_DIR set to a new directory, the Swift-made files are kept
/// there for checks/validate_desktop_ingress.py. It is separate from COMPANION_DESKTOP_FIXTURE_DIR,
/// whose root holds exactly one sample session.
extension DesktopCaptureTests {
    // MARK: - Fixture session and trusted identities (all synthetic)

    private var ingressSource: SourceReference {
        SourceReference(userID: "synthetic-user", sourceID: "synthetic-mac-display", sourceVersion: 1)
    }

    private var ingressIncarnation: CaptureIncarnation {
        CaptureIncarnation(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                           streamID: "synthetic-screen-incarnation")
    }

    private func ingressBinding(_ frame: RetainedFrame) -> OriginalBinding {
        OriginalBinding(source: ingressSource, artifact: PNGReference(
            artifactID: "synthetic-png-\(frame.record.sequence)", sha256: frame.record.sha256,
            byteLength: frame.record.byteLength))
    }

    /// A session with three kept frames and four gaps:
    /// - 1: complete, with every attachment;
    /// - 2: blank;
    /// - 3: complete, with the largest UInt64 display time, known-empty dirty rectangles and a
    ///   negative PTS;
    /// - 4: complete without an image;
    /// - 5: no status;
    /// - 6: complete after a 15 s silence, with only a status.
    private func writeIngressSession(root: URL) throws -> URL {
        let recorder = try CaptureRecorder(
            root: root,
            display: DisplayFacts(
                displayID: 7, name: "Synthetic Display ✓", frame: RecordedRect(CGRect(x: -1440, y: 0, width: 4, height: 2)),
                pointPixelScale: 1, requestedWidth: 4, requestedHeight: 2, rotationDegrees: 90, isMain: false,
                scope: "synthetic fixture; not a captured display"),
            settings: .engineeringDefaults, permissionPreflightAtStart: false,
            wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        recorder.streamStarted(host: 100.5, wall: Date(timeIntervalSince1970: 1_790_000_000.75))
        let first = try sampleBuffer(try buffer(marker: 1), pts: CMTime(value: 101, timescale: 1), attachments: [
            .status: NSNumber(value: SCFrameStatus.complete.rawValue),
            .displayTime: NSNumber(value: HostClock.ticks(seconds: 101)),
            .contentRect: CGRect(x: 0, y: 0, width: 4, height: 2).dictionaryRepresentation,
            .contentScale: NSNumber(value: 1.0),
            .scaleFactor: NSNumber(value: 2.0),
            .dirtyRects: [CGRect(x: 0, y: 0, width: 4, height: 1).dictionaryRepresentation],
        ])
        recorder.frame(FrameFacts(sampleBuffer: first), image: first.imageBuffer, host: 101, accepted: true)
        recorder.frame(facts(.blank), image: nil, host: 102, accepted: true)
        let third = try sampleBuffer(try buffer(marker: 3), pts: CMTime(value: -5, timescale: 2), attachments: [
            .status: NSNumber(value: SCFrameStatus.complete.rawValue),
            .displayTime: NSNumber(value: UInt64.max),
            .dirtyRects: [Any](),
        ])
        recorder.frame(FrameFacts(sampleBuffer: third), image: third.imageBuffer, host: 103, accepted: true)
        recorder.frame(facts(.complete), image: nil, host: 104, accepted: true)
        recorder.frame(FrameFacts(attachments: nil, presentationTime: .invalid), image: nil, host: 105, accepted: true)
        let sixth = try buffer(marker: 6)
        recorder.frame(FrameFacts(attachments: [.status: NSNumber(value: SCFrameStatus.complete.rawValue)],
                                  presentationTime: .invalid), image: sixth, host: 120, accepted: true)
        recorder.finish(reason: "user_stop", detail: nil, liveEndedHost: 121, host: 121.5,
                        wall: Date(timeIntervalSince1970: 1_790_000_021.75))
        return recorder.directory
    }

    private func frame(_ session: RetainedSession, _ callback: Int) throws -> RetainedFrame {
        try XCTUnwrap(session.frames.first { $0.record.sequence == callback })
    }

    private func gap(_ session: RetainedSession, _ kind: String) throws -> NativeGap {
        try XCTUnwrap(session.gaps.first { $0.kind == kind })
    }

    private func plan(_ session: RetainedSession, _ name: String, _ entries: [DesktopIngressPlan.Entry]) -> DesktopIngressPlan {
        DesktopIngressPlan(batchID: "synthetic-batch-\(name)", idempotencyKey: "synthetic-key-\(name)",
                           deliveryMode: "historical", incarnation: ingressIncarnation, source: ingressSource,
                           nativeSessionID: session.status.session, displayID: 7, entries: entries)
    }

    private func frameEntry(_ session: RetainedSession, _ callback: Int, record: String, sequence: Int) throws
        -> DesktopIngressPlan.Entry {
        let retained = try frame(session, callback)
        return .frame(callbackSequence: callback, frameID: "synthetic-frame-\(callback)",
                      binding: ingressBinding(retained), record: RecordIdentity(recordID: record, sequence: sequence))
    }

    private func object(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// Every file under `directory`, with its bytes.
    private func snapshot(_ directory: URL) throws -> [String: Data] {
        var files: [String: Data] = [:]
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey]))
        for case let url as URL in enumerator where (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true {
            files[url.path(percentEncoded: false)] = try Data(contentsOf: url)
        }
        return files
    }

    // MARK: - Mapping

    func testMapsRetainedFramesToDesktopFrames() throws {
        let directory = try writeIngressSession(root: root)
        let session = try RetainedSession.read(directory)
        XCTAssertEqual(session.frames.map(\.record.sequence), [1, 3, 6])
        XCTAssertEqual(session.frames.map(\.originalProblem), [nil, nil, nil], "every retained PNG was re-hashed")
        XCTAssertEqual(session.gaps.map(\.kind), ["blank", "complete_without_image", "missing", "no_callbacks"])
        let silence = try gap(session, "no_callbacks")
        XCTAssertEqual([silence.fromHost, silence.toHost], [105, 120])
        let wallText = try XCTUnwrap(String(data: try Data(contentsOf: directory.appending(path: "status.json")), encoding: .utf8))
        XCTAssertTrue(wallText.contains(#""startedWall":"\#(session.startedWallText)""#), "the wall text is kept verbatim")

        let third = try object(try DesktopJSON.encode(try DesktopIngress.frame(
            frame(session, 3), in: session, frameID: "synthetic-frame-3", incarnation: ingressIncarnation,
            binding: ingressBinding(try frame(session, 3)))))
        XCTAssertEqual(third["contract_version"] as? String, "0.2.7")
        XCTAssertEqual(third["callback_sequence"] as? Int, 3)
        XCTAssertEqual([third["raw_width"] as? Int, third["raw_height"] as? Int], [4, 2])
        for key in ["captured_at", "media_position", "pixel_orientation"] {
            XCTAssertTrue(third[key] is NSNull, key)
        }
        XCTAssertEqual(third["pixels_transformed"] as? Bool, false)
        let timing = try XCTUnwrap(third["timing"] as? [String: Any])
        XCTAssertEqual(timing.count, 4)
        XCTAssertTrue(timing.values.allSatisfy { $0 is NSNull }, "no estimate, basis, uncertainty or Process clock")
        let profile = try XCTUnwrap(third["profile"] as? [String: Any])
        XCTAssertEqual(profile["native_session_id"] as? String, session.status.session)
        let clock = try XCTUnwrap(profile["host_clock"] as? [String: Any])
        XCTAssertEqual(clock["display_time_ticks_decimal"] as? String, "18446744073709551615", "UInt64 kept losslessly")
        XCTAssertEqual(clock["display_time_seconds"] as? Double, HostClock.seconds(ticks: UInt64.max))
        XCTAssertEqual(clock["session_started_wall_utc"] as? String, session.startedWallText)
        XCTAssertEqual(clock["callback_seconds"] as? Double, 103)
        let sample = try XCTUnwrap(profile["sample"] as? [String: Any])
        XCTAssertEqual(sample["presentation_time_seconds"] as? Double, -2.5)
        XCTAssertEqual((sample["dirty_rects"] as? [Any])?.count, 0, "known-empty stays []")
        XCTAssertTrue(sample["content_rect"] is NSNull)
        let display = try XCTUnwrap(profile["display_at_start"] as? [String: Any])
        XCTAssertEqual(display["name"] as? String, "Synthetic Display ✓")
        XCTAssertEqual((display["frame_points"] as? [String: Any])?["x"] as? Double, -1440)
        XCTAssertEqual(display["rotation_degrees"] as? Double, 90)

        let first = try object(try DesktopJSON.encode(try DesktopIngress.frame(
            frame(session, 1), in: session, frameID: "synthetic-frame-1", incarnation: ingressIncarnation,
            binding: ingressBinding(try frame(session, 1)))))
        let firstSample = try XCTUnwrap((first["profile"] as? [String: Any])?["sample"] as? [String: Any])
        XCTAssertEqual(firstSample["scale_factor"] as? Double, 2)
        XCTAssertEqual((firstSample["dirty_rects"] as? [Any])?.count, 1)

        let sixth = try object(try DesktopJSON.encode(try DesktopIngress.frame(
            frame(session, 6), in: session, frameID: "synthetic-frame-6", incarnation: ingressIncarnation,
            binding: ingressBinding(try frame(session, 6)))))
        let sixthProfile = try XCTUnwrap(sixth["profile"] as? [String: Any])
        let sixthSample = try XCTUnwrap(sixthProfile["sample"] as? [String: Any])
        let sixthClock = try XCTUnwrap(sixthProfile["host_clock"] as? [String: Any])
        XCTAssertTrue(sixthSample["dirty_rects"] is NSNull, "unknown stays null")
        XCTAssertTrue(sixthSample["presentation_time_seconds"] is NSNull)
        XCTAssertTrue(sixthClock["display_time_ticks_decimal"] is NSNull)
        XCTAssertTrue(sixthClock["display_time_seconds"] is NSNull)
    }

    // MARK: - Requests and fixtures

    func testPreparesRequestsAndWritesFixtures() throws {
        let fixtureDirectory = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_INGRESS_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
        let output = fixtureDirectory ?? root.appending(path: "desktop-ingress", directoryHint: .isDirectory)
        guard !FileManager.default.fileExists(atPath: output.path(percentEncoded: false)) else {
            XCTFail("fixtures are written only to a new directory: \(output.path(percentEncoded: false))")
            return
        }
        let directory = try writeIngressSession(root: output.appending(path: "native", directoryHint: .isDirectory))
        let session = try RetainedSession.read(directory)
        let before = try snapshot(directory)

        let gapKinds = ["blank", "complete_without_image", "missing", "no_callbacks"]
        let plans: [DesktopIngressPlan] = [
            plan(session, "framed", [
                try frameEntry(session, 1, record: "framed-1", sequence: 11),
                try frameEntry(session, 3, record: "framed-3", sequence: 12),
                try frameEntry(session, 6, record: "framed-6", sequence: 13),
            ]),
            plan(session, "frameless", try gapKinds.enumerated().map { index, kind in
                .gap(try gap(session, kind), record: RecordIdentity(recordID: "gap-\(kind)", sequence: 21 + index))
            }),
            plan(session, "mixed", [
                try frameEntry(session, 1, record: "mixed-frame-1", sequence: 31),
                .gap(try gap(session, "blank"), record: RecordIdentity(recordID: "mixed-blank", sequence: 32)),
                try frameEntry(session, 3, record: "mixed-frame-3", sequence: 33),
                .gap(try gap(session, "complete_without_image"), record: RecordIdentity(recordID: "mixed-no-image", sequence: 34)),
                .gap(try gap(session, "missing"), record: RecordIdentity(recordID: "mixed-missing", sequence: 35)),
                .gap(try gap(session, "no_callbacks"), record: RecordIdentity(recordID: "mixed-silence", sequence: 36)),
                try frameEntry(session, 6, record: "mixed-frame-6", sequence: 37),
                // A second record of the same retained frame; the frame appears once.
                try frameEntry(session, 1, record: "mixed-frame-1-again", sequence: 38),
            ]),
        ]
        var cases: [JSONValue] = []
        for plan in plans {
            let request = try DesktopIngress.request(plan, session: session)
            let body = try object(request.body)
            let batch = try XCTUnwrap(body["batch"] as? [String: Any])
            let records = try XCTUnwrap(batch["records"] as? [[String: Any]])
            let frames = try XCTUnwrap(body["frames"] as? [[String: Any]])
            XCTAssertEqual(body["contract_version"] as? String, "0.2.8")
            XCTAssertEqual(request.idempotencyKey, plan.idempotencyKey)
            let expectedSequences = plan.entries.map { entry -> Int in
                switch entry {
                case .frame(_, _, _, let record), .gap(_, let record): return record.sequence
                }
            }
            XCTAssertEqual(records.compactMap { $0["sequence"] as? Int }, expectedSequences,
                           "process sequences come from the plan, not from callbacks")
            for record in records {
                let evidence = try XCTUnwrap(record["evidence"] as? [String: Any])
                XCTAssertTrue(record["clock"] is NSNull && record["observed_at"] is NSNull && record["media_position"] is NSNull)
                if record["frame_id"] is NSNull {
                    XCTAssertEqual((record["artifacts"] as? [Any])?.count, 0)
                    XCTAssertNotEqual(evidence["coverage"] as? String, "observed_samples")
                } else {
                    XCTAssertEqual(evidence["coverage"] as? String, "observed_samples")
                    XCTAssertEqual((record["artifacts"] as? [Any])?.count, 1)
                }
            }
            XCTAssertEqual(Set(frames.compactMap { $0["frame_id"] as? String }).count, frames.count)
            let gapCount = plan.entries.filter { if case .gap = $0 { return true } else { return false } }.count
            XCTAssertEqual(request.unrepresented.count, gapCount + session.notes.count,
                           "every gap, and every session note, reports what 0.2.8 cannot carry")

            let file = "requests/\(plan.batchID).json"
            try write(request.body, to: output.appending(path: file))
            cases.append(.object([
                "type": .string("request"), "name": .string(plan.batchID), "body": .string(file),
                "idempotency_key": .string(request.idempotencyKey),
                "batch_id": .string(plan.batchID), "delivery_mode": .string(plan.deliveryMode),
                "records": .array(plan.entries.map { entry -> JSONValue in
                    switch entry {
                    case .frame(_, let frameID, _, let record):
                        return .object(["record_id": .string(record.recordID), "sequence": .integer(record.sequence),
                                        "frame_id": .string(frameID)])
                    case .gap(_, let record):
                        return .object(["record_id": .string(record.recordID), "sequence": .integer(record.sequence),
                                        "frame_id": .null])
                    }
                }),
                "unrepresented": .array(request.unrepresented.map(JSONValue.string)),
                "gap_kinds": .object(Dictionary(uniqueKeysWithValues: plan.entries.compactMap { entry -> (String, JSONValue)? in
                    if case .gap(let gap, let record) = entry { return (record.recordID, .string(gap.kind)) }
                    return nil
                })),
            ]))
        }
        XCTAssertEqual((try object(try DesktopIngress.request(plans[1], session: session).body)["frames"] as? [Any])?.count, 0,
                       "a frameless-only request carries no frame")
        let mixed = try object(try DesktopIngress.request(plans[2], session: session).body)
        XCTAssertEqual((mixed["frames"] as? [Any])?.count, 3)

        for ((name, reason), (_, _, expected)) in zip(refusalOutcomes(session), refusalCases(session)) {
            cases.append(.object(["type": .string("refusal"), "name": .string(name), "reason": .string(reason),
                                  "expected": .string(expected)]))
        }
        XCTAssertEqual(try snapshot(directory), before, "mapping and refusals leave every retained file unchanged")

        let bindings = session.frames.map { frame -> (String, JSONValue) in
            let binding = ingressBinding(frame)
            return (binding.artifact.artifactID, .object([
                "contract_version": .string(binding.contractVersion), "kind": .string(binding.kind),
                "source": .object(["user_id": .string(binding.source.userID), "source_id": .string(binding.source.sourceID),
                                   "source_version": .integer(binding.source.sourceVersion)]),
                "artifact": .object(["artifact_id": .string(binding.artifact.artifactID), "sha256": .string(binding.artifact.sha256),
                                     "byte_length": .integer(binding.artifact.byteLength),
                                     "media_type": .string(binding.artifact.mediaType)]),
            ]))
        }
        let manifest: JSONValue = .object([
            "generator": .string("DesktopCaptureTests.testPreparesRequestsAndWritesFixtures"),
            "synthetic": .string("synthetic session, identities and display source; real Swift recorder, FrameStore PNGs and mapper output; nothing sent"),
            "native_session": .string("native/\(session.status.session)"),
            "user_id": .string(ingressSource.userID),
            "display_source": .object([
                "contract_version": .string("0.2.3"), "user_id": .string(ingressSource.userID),
                "source_id": .string(ingressSource.sourceID), "source_version": .integer(ingressSource.sourceVersion),
                "type": .string("shared_display"), "device_id": .string(ingressIncarnation.deviceID),
                "session_id": .string(ingressIncarnation.sessionID), "stream_id": .string(ingressIncarnation.streamID),
                "project_id": .null, "created_at": .string("2026-09-21T14:13:00Z"),
                "source_timezone": .string("America/Los_Angeles"),
            ]),
            "bindings": .object(Dictionary(uniqueKeysWithValues: bindings)),
            "cases": .array(cases),
        ])
        try write(try DesktopJSON.encode(manifest), to: output.appending(path: "manifest.json"))
    }

    private func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .withoutOverwriting)
    }

    // MARK: - Refusals

    func testRefusesUnrepresentableDataAndKeepsOriginals() throws {
        let directory = try writeIngressSession(root: root)
        let session = try RetainedSession.read(directory)
        let before = try snapshot(directory)
        let outcomes = refusalOutcomes(session)
        XCTAssertEqual(outcomes.count, refusalCases(session).count)
        for ((name, reason), (_, _, expected)) in zip(outcomes, refusalCases(session)) {
            XCTAssertTrue(reason.contains(expected), "\(name): \(reason)")
        }
        XCTAssertEqual(try snapshot(directory), before, "no retained file is changed, truncated or deleted")
    }

    /// Each case's actual refusal reason, or "NOT REFUSED".
    private func refusalOutcomes(_ session: RetainedSession) -> [(String, String)] {
        refusalCases(session).map { name, attempt, _ in
            do {
                try attempt()
                return (name, "NOT REFUSED")
            } catch let refusal as MappingRefusal {
                return (name, refusal.reason)
            } catch {
                return (name, "unexpected error \(error)")
            }
        }
    }

    /// Named attempts that must be refused, with a fragment of the expected reason.
    private func refusalCases(_ session: RetainedSession) -> [(String, () throws -> Void, String)] {
        func changedFrame(_ callback: Int, _ change: (inout KeptFrame) -> Void, problem: String? = nil) -> RetainedSession {
            let frames = session.frames.map { frame -> RetainedFrame in
                guard frame.record.sequence == callback else { return frame }
                var record = frame.record
                change(&record)
                return RetainedFrame(record: record, originalProblem: problem)
            }
            return RetainedSession(directory: session.directory, status: session.status,
                                   startedWallText: session.startedWallText, frames: frames, gaps: session.gaps,
                                   notes: session.notes)
        }
        func changedStatus(_ change: (inout SessionStatus) -> Void) -> RetainedSession {
            var status = session.status
            change(&status)
            return RetainedSession(directory: session.directory, status: status, startedWallText: session.startedWallText,
                                   frames: session.frames, gaps: session.gaps, notes: session.notes)
        }
        let first = session.frames.first(where: { $0.record.sequence == 1 })!
        let binding = ingressBinding(first)
        func mapFirst(_ session: RetainedSession, frameID: String = "synthetic-frame-1", binding: OriginalBinding? = nil) throws {
            let retained = session.frames.first(where: { $0.record.sequence == 1 })!
            _ = try DesktopIngress.frame(retained, in: session, frameID: frameID, incarnation: ingressIncarnation,
                                         binding: binding ?? ingressBinding(retained))
        }
        func request(_ session: RetainedSession, _ entries: [DesktopIngressPlan.Entry], change: (inout DesktopIngressPlan) -> Void = { _ in }) throws {
            var plan = plan(session, "refusal", entries)
            change(&plan)
            _ = try DesktopIngress.request(plan, session: session)
        }
        let firstEntry = DesktopIngressPlan.Entry.frame(callbackSequence: 1, frameID: "synthetic-frame-1", binding: binding,
                                                        record: RecordIdentity(recordID: "r1", sequence: 1))
        var otherHash = binding
        otherHash.artifact.sha256 = String(repeating: "0", count: 64)
        var otherLength = binding
        otherLength.artifact.byteLength += 1
        var foreign = binding
        foreign.source.sourceID = "another-display"
        let huge = changedFrame(1) { $0.byteLength = 33_554_433 }
        var hugeBinding = binding
        hugeBinding.artifact.byteLength = 33_554_433
        let blank = session.gaps.first(where: { $0.kind == "blank" })!
        let idle = NativeGap(kind: "idle", firstCallback: 9, lastCallback: 9, fromHost: 130, toHost: 130, open: false)
        let withIdle = RetainedSession(directory: session.directory, status: session.status,
                                       startedWallText: session.startedWallText, frames: session.frames,
                                       gaps: session.gaps + [idle], notes: session.notes)
        return [
            ("binding_hash_mismatch", { try mapFirst(session, binding: otherHash) }, "SHA-256 and length"),
            ("binding_length_mismatch", { try mapFirst(session, binding: otherLength) }, "SHA-256 and length"),
            ("png_over_reference_ceiling", { try mapFirst(huge, binding: hugeBinding) }, "reference range"),
            ("dirty_rects_over_limit", {
                try mapFirst(changedFrame(1) { $0.facts.dirtyRects = Array(repeating: RecordedRect(.zero), count: 4097) })
            }, "dirty rectangles exceed"),
            ("display_name_code_points", {
                // 513 characters, but 1026 code points: limits count code points.
                try mapFirst(changedStatus { $0.display.name = String(repeating: "e\u{301}", count: 513) })
            }, "code points"),
            ("not_complete_status", { try mapFirst(changedFrame(1) { $0.facts.status = "idle" }) }, "only a complete callback"),
            ("callback_before_session", { try mapFirst(changedFrame(1) { $0.callbackHost = 99 }) }, "precedes"),
            ("non_finite_callback_time", { try mapFirst(changedFrame(1) { $0.callbackHost = .infinity }) }, "finite"),
            ("negative_content_extent", {
                try mapFirst(changedFrame(1) { $0.facts.contentRect = RecordedRect(CGRect(x: 0, y: 0, width: 4, height: 2)).with(width: -1) })
            }, "negative extent"),
            ("zero_content_scale", { try mapFirst(changedFrame(1) { $0.facts.contentScale = 0 }) }, "positive"),
            ("unknown_scope", { try mapFirst(changedStatus { $0.display.scope = "whole display" }) }, "released descriptions"),
            ("ink_overlay_scope", {
                try mapFirst(changedStatus { $0.display.scope = DisplayFacts.inkOverlayScope(showsCursor: true) })
            }, "no released 0.2.7 scope value"),
            ("app_excluded_scope", {
                try mapFirst(changedStatus { $0.display.scope = DisplayFacts.appExcludedScope(showsCursor: true) })
            }, "excludes this app's windows"),
            ("altered_original", {
                try mapFirst(changedFrame(1, { _ in }, problem: "frames/00000001.png no longer has the recorded SHA-256 and length"))
            }, "no longer has the recorded"),
            ("bad_frame_identifier", { try mapFirst(session, frameID: "not an id") }, "Identifier"),
            ("native_session_mismatch", { try request(session, [firstEntry]) { $0.nativeSessionID = "another-session" } }, "native session"),
            ("display_mismatch", { try request(session, [firstEntry]) { $0.displayID = 8 } }, "start display"),
            ("foreign_source_binding", {
                try request(session, [.frame(callbackSequence: 1, frameID: "synthetic-frame-1", binding: foreign,
                                             record: RecordIdentity(recordID: "r1", sequence: 1))])
            }, "another source"),
            ("callback_not_retained", {
                try request(session, [.frame(callbackSequence: 2, frameID: "synthetic-frame-2", binding: binding,
                                             record: RecordIdentity(recordID: "r1", sequence: 1))])
            }, "no kept frame for callback 2"),
            ("frame_id_names_two_frames", {
                let third = session.frames.first(where: { $0.record.sequence == 3 })!
                try request(session, [firstEntry, .frame(callbackSequence: 3, frameID: "synthetic-frame-1",
                                                         binding: self.ingressBinding(third),
                                                         record: RecordIdentity(recordID: "r2", sequence: 2))])
            }, "names two different frames"),
            ("artifact_id_names_two_pngs", {
                let third = session.frames.first(where: { $0.record.sequence == 3 })!
                var reused = self.ingressBinding(third)
                reused.artifact.artifactID = binding.artifact.artifactID
                try request(session, [firstEntry, .frame(callbackSequence: 3, frameID: "synthetic-frame-3", binding: reused,
                                                         record: RecordIdentity(recordID: "r2", sequence: 2))])
            }, "names two different PNGs"),
            ("duplicate_process_sequence", {
                try request(session, [firstEntry, .gap(blank, record: RecordIdentity(recordID: "r2", sequence: 1))])
            }, "unique"),
            ("gap_not_retained", { try request(session, [.gap(idle, record: RecordIdentity(recordID: "r1", sequence: 1))]) },
             "not one of this session's retained gaps"),
            ("idle_is_not_a_gap", { try request(withIdle, [.gap(idle, record: RecordIdentity(recordID: "r1", sequence: 1))]) },
             "is not a coverage gap"),
            ("too_many_records", {
                try request(session, (1...101).map { .gap(blank, record: RecordIdentity(recordID: "r\($0)", sequence: $0)) })
            }, "1 to 100 records"),
            ("zero_process_sequence", { try request(session, [.gap(blank, record: RecordIdentity(recordID: "r1", sequence: 0))]) },
             "positive safe integer"),
        ]
    }

    // MARK: - Reader and JSON

    func testReaderRefusesAlteredEscapingAndUnreadableOriginals() throws {
        let directory = try writeIngressSession(root: root)
        let png = directory.appending(path: "frames/00000001.png")
        var bytes = try Data(contentsOf: png)
        bytes[bytes.count - 1] ^= 1
        try bytes.write(to: png)  // This test's own temporary session.
        let events = try FileHandle(forWritingTo: directory.appending(path: "events.jsonl"))
        var escaping = try frame(try RetainedSession.read(directory), 3).record
        escaping.sequence = 99
        escaping.file = "../status.json"
        var line = try CaptureFiles.encoder.encode(CaptureEvent(event: "kept", host: 130, frame: escaping))
        line.append(0x0A)
        try events.seekToEnd()
        try events.write(contentsOf: line)

        let session = try RetainedSession.read(directory)
        XCTAssertEqual(try frame(session, 1).originalProblem, "frames/00000001.png no longer has the recorded SHA-256 and length")
        XCTAssertEqual(try frame(session, 99).originalProblem,
                       "../status.json is not this frame's frames/NNNNNNNN.png path inside the session")
        XCTAssertNil(try frame(session, 3).originalProblem)
        XCTAssertTrue(session.notes.contains { $0.contains("counts 3 kept frames but events.jsonl holds 4") }, "\(session.notes)")
        XCTAssertThrowsError(try DesktopIngress.frame(frame(session, 1), in: session, frameID: "f1",
                                                      incarnation: ingressIncarnation, binding: ingressBinding(try frame(session, 1))))

        try events.write(contentsOf: Data("{not json\n".utf8))
        try events.close()
        XCTAssertThrowsError(try RetainedSession.read(directory)) { error in
            XCTAssertTrue((error as? MappingRefusal)?.reason.contains("unreadable") == true)
        }
    }

    func testReaderRefusesSymbolicLinksForOriginals() throws {
        // A frame file that links to an identical PNG outside the session.
        let fileCase = try writeIngressSession(root: root.appending(path: "file-link"))
        let original = fileCase.appending(path: "frames/00000001.png")
        let outside = root.appending(path: "outside.png")
        try FileManager.default.copyItem(at: original, to: outside)
        try FileManager.default.removeItem(at: original)
        try FileManager.default.createSymbolicLink(at: original, withDestinationURL: outside)
        let linked = try RetainedSession.read(fileCase)
        XCTAssertEqual(try frame(linked, 1).originalProblem,
                       "frames/00000001.png is not a regular file inside the session (it is missing or a symbolic link)")
        XCTAssertNil(try frame(linked, 3).originalProblem)
        XCTAssertThrowsError(try DesktopIngress.frame(frame(linked, 1), in: linked, frameID: "f1",
                                                      incarnation: ingressIncarnation, binding: ingressBinding(try frame(linked, 1))))

        // A frames directory that links to a matching directory outside the session.
        let directoryCase = try writeIngressSession(root: root.appending(path: "directory-link"))
        let frames = directoryCase.appending(path: "frames")
        let moved = root.appending(path: "outside-frames")
        try FileManager.default.moveItem(at: frames, to: moved)
        try FileManager.default.createSymbolicLink(at: frames, withDestinationURL: moved)
        let redirected = try RetainedSession.read(directoryCase)
        XCTAssertEqual(redirected.frames.count, 3)
        XCTAssertTrue(redirected.frames.allSatisfy {
            $0.originalProblem == "frames is not a real directory inside the session (it is missing or a symbolic link)"
        })
    }

    func testReaderRefusesRecognizedEventsWithoutPayload() throws {
        for kind in ["kept", "gap", "run"] {
            let directory = try writeIngressSession(root: root.appending(path: "missing-\(kind)"))
            let file = directory.appending(path: "events.jsonl")
            var recorded = try Data(contentsOf: file).split(separator: 0x0A).map {
                try CaptureFiles.decoder.decode(CaptureEvent.self, from: Data($0))
            }
            let index = try XCTUnwrap(recorded.firstIndex { $0.event == kind })
            switch kind {
            case "kept": recorded[index].frame = nil
            case "gap": recorded[index].detail = nil
            default: recorded[index].run = nil
            }
            var encoded = Data()
            for event in recorded {
                encoded.append(try CaptureFiles.encoder.encode(event))
                encoded.append(0x0A)
            }
            try encoded.write(to: file)  // This test's own temporary session.
            XCTAssertThrowsError(try RetainedSession.read(directory), kind) { error in
                XCTAssertTrue((error as? MappingRefusal)?.reason.contains("a \(kind) event without its payload") == true, "\(error)")
            }
        }
    }

    func testDesktopJSONIsStrictStandardJSON() throws {
        XCTAssertEqual(String(decoding: try DesktopJSON.encode(.object(["b": .integer(1), "a": .string("x/y é")])), as: UTF8.self),
                       #"{"a":"x/y é","b":1}"#)
        XCTAssertThrowsError(try DesktopJSON.encode(.number(.nan)))
        XCTAssertThrowsError(try DesktopJSON.encode(.array([.integer(9_007_199_254_740_992)]))) { error in
            XCTAssertEqual(error as? DesktopJSON.Problem, .unsafeInteger("9007199254740992"))
        }
        XCTAssertNoThrow(try DesktopJSON.encode(.array([.integer(9_007_199_254_740_991), .integer(-9_007_199_254_740_991)])))
        XCTAssertNil(DesktopJSON.unsafeIntegerToken(in: Data(#"{"a":"99999999999999999999","b":1e+16,"c":true}"#.utf8)))
        XCTAssertEqual(DesktopJSON.unsafeIntegerToken(in: Data(#"[false,-10000000000000000]"#.utf8)), "-10000000000000000")
    }
}

private extension RecordedRect {
    func with(width: Double) -> RecordedRect {
        var rect = self
        rect.width = width
        return rect
    }
}
