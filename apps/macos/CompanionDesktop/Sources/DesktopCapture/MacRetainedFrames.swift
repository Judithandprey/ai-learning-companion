import Foundation
import ImageIO

// Maps a retained native capture session to released Mac retained-frame metadata 0.2.11: pure
// descriptors plus the original bindings each one needs. Nothing is sent, registered or granted,
// and this is no request or transport. The released 0.2.7/0.2.8 path (`DesktopIngress`) is
// unchanged and still refuses the scopes only 0.2.11 can carry.
//
// Every identity comes from the trusted host: frame, device/session/stream, source and every
// archive binding. The native session label never becomes an archive identity. Every file is
// re-read and checked (path, SHA-256, length, PNG dimensions, raw relation) before a retained
// original is claimed. Unknown stays unknown:
// - capture UTC, media position, pixel orientation and capture latency are always null;
// - a kept frame without a recorded composition outcome is `unknown`, never successful empty ink;
// - a document path + revision is carried as the producer recorded it, never as an immutable
//   editable original. A frame's retained ink original (ink-originals/<SHA-256>.json) is bound
//   only as a separate existing 0.2.2 editable_ink binding the host supplies, after re-checking.
// Facts no descriptor carries are reported as unrepresented, not dropped.

/// One kept frame to describe, with the existing archive bindings the trusted host supplies.
public struct MacRetainedEntry: Sendable {
    public var callbackSequence: Int
    public var frameID: String
    /// The raw PNG's existing 0.2.2 `screen_image` binding.
    public var raw: OriginalBinding
    /// The composed PNG's binding. Required when the composed image is its own file. For a raw
    /// alias (no strokes), nil reuses the raw binding (one archive reference), and a binding with
    /// identical PNG facts is a second reference. It must be nil without a composed outcome.
    public var composed: OriginalBinding?
    /// The existing 0.2.2 `editable_ink` binding of the frame's retained ink original, if the host
    /// binds it. It stays outside the 0.2.11 descriptor and its image bindings.
    public var inkOriginal: OriginalBinding?

    public init(callbackSequence: Int, frameID: String, raw: OriginalBinding, composed: OriginalBinding? = nil,
                inkOriginal: OriginalBinding? = nil) {
        self.callbackSequence = callbackSequence
        self.frameID = frameID
        self.raw = raw
        self.composed = composed
        self.inkOriginal = inkOriginal
    }
}

/// The frames of one retained session to describe, with every identity from the trusted host.
public struct MacRetainedPlan: Sendable {
    public var incarnation: CaptureIncarnation
    /// The registered shared-display source of every frame.
    public var source: SourceReference
    /// The native session and start display the trusted host registered that source for.
    public var nativeSessionID: String
    public var displayID: UInt32
    public var entries: [MacRetainedEntry]

    public init(incarnation: CaptureIncarnation, source: SourceReference, nativeSessionID: String, displayID: UInt32,
                entries: [MacRetainedEntry]) {
        self.incarnation = incarnation
        self.source = source
        self.nativeSessionID = nativeSessionID
        self.displayID = displayID
        self.entries = entries
    }
}

/// One described frame: MacRetainedFrame 0.2.11 and the distinct 0.2.2 bindings of its images.
public struct MacRetainedDescriptor: Equatable, Sendable {
    public let callbackSequence: Int
    public let frameID: String
    public let frame: JSONValue
    /// One per distinct image artifact ID: raw first, then a composed image with its own ID.
    public let bindings: [JSONValue]
    /// The bound editable_ink original, when the plan supplies one; separate from `bindings`.
    public let inkOriginalBindings: [JSONValue]
}

/// One entry that could not be described, and why. Nothing retained is changed.
public struct MacRetainedRefusal: Equatable, Sendable {
    public let callbackSequence: Int
    public let frameID: String
    public let reason: String
}

public struct MacRetainedMapping: Equatable, Sendable {
    public let described: [MacRetainedDescriptor]
    public let refused: [MacRetainedRefusal]
    /// Native facts no descriptor carries. They stay in the session and ink files.
    public let unrepresented: [String]
}

public enum MacRetainedFrames {
    public static let contractVersion = "0.2.11"
    public static let maxTextCharacters = 16_384
    public static let maxMappingCharacters = 1_024
    public static let maxInkPathCharacters = 512
    static let refusalReasons: Set<String> = [
        "refused", "raw_unavailable", "render_failed", "write_failed", "composed_cap_reached",
        "composed_store_stopped", "session_ended_before_composition",
    ]
    /// The released 0.2.7 scopes and the four 0.2.11 adds; only the app-excluded ones compose.
    static let scopes: Set<String> = DesktopIngress.scopes.union([true, false].flatMap {
        [DisplayFacts.appExcludedScope(showsCursor: $0), DisplayFacts.inkOverlayScope(showsCursor: $0)]
    })
    static let appExcludedScopes: Set<String> = [DisplayFacts.appExcludedScope(showsCursor: true),
                                                  DisplayFacts.appExcludedScope(showsCursor: false)]

    /// Describes the plan's entries in order. A plan that cannot be trusted as a whole throws; an
    /// entry whose files or records cannot be represented is refused with its reason.
    public static func map(_ plan: MacRetainedPlan, session: RetainedSession) throws -> MacRetainedMapping {
        try DesktopIngress.identifiers([("device ID", plan.incarnation.deviceID), ("session ID", plan.incarnation.sessionID),
                                        ("stream ID", plan.incarnation.streamID)])
        _ = try DesktopIngress.sourceJSON(plan.source)
        guard session.status.session == plan.nativeSessionID else {
            throw MappingRefusal("the retained session is not the native session this source was registered for")
        }
        guard session.status.display.displayID == plan.displayID else {
            throw MappingRefusal("the retained session's start display is not the registered display")
        }
        guard !plan.entries.isEmpty else { throw MappingRefusal("the plan names no frame") }
        var frameIDs: Set<String> = []
        var sequences: Set<Int> = []
        var artifacts: [String: PNGReference] = [:]
        for entry in plan.entries {
            try DesktopIngress.identifiers([("frame ID", entry.frameID)])
            guard frameIDs.insert(entry.frameID).inserted, sequences.insert(entry.callbackSequence).inserted else {
                throw MappingRefusal("frame IDs and callback sequences must be unique in a plan")
            }
            for binding in [entry.raw, entry.composed, entry.inkOriginal].compactMap({ $0 }) {
                guard binding.source == plan.source else {
                    throw MappingRefusal("an original binding belongs to another source")
                }
                if let existing = artifacts[binding.artifact.artifactID], existing != binding.artifact {
                    throw MappingRefusal("artifact ID \(binding.artifact.artifactID) names two different PNGs")
                }
                artifacts[binding.artifact.artifactID] = binding.artifact
            }
        }
        var described: [MacRetainedDescriptor] = []
        var refused: [MacRetainedRefusal] = []
        for entry in plan.entries {
            do {
                described.append(try descriptor(entry, plan: plan, session: session))
            } catch let refusal as MappingRefusal {
                refused.append(MacRetainedRefusal(callbackSequence: entry.callbackSequence, frameID: entry.frameID,
                                                  reason: refusal.reason))
            }
        }
        return MacRetainedMapping(described: described, refused: refused,
                                  unrepresented: unrepresented(session, plan: plan, described: described))
    }

    // MARK: - One frame

    static func descriptor(_ entry: MacRetainedEntry, plan: MacRetainedPlan,
                           session: RetainedSession) throws -> MacRetainedDescriptor {
        let status = session.status
        guard let retained = session.frames.first(where: { $0.record.sequence == entry.callbackSequence }) else {
            throw MappingRefusal("the session retains no kept frame for callback \(entry.callbackSequence)")
        }
        let record = retained.record
        let facts = record.facts
        guard scopes.contains(status.display.scope) else {
            throw MappingRefusal("the display scope is not one of the 0.2.11 descriptions")
        }
        guard facts.status == "complete" else {
            throw MappingRefusal("only a complete callback's kept pixels are a retained frame, not \(facts.status)")
        }
        guard record.encoding == FrameStore.encoding, record.mediaType == "image/png" else {
            throw MappingRefusal("the kept frame is not the reviewed PNG encoding")
        }
        guard record.pixelFormat.unicodeScalars.count == 4,
              record.pixelFormat.unicodeScalars.allSatisfy({ $0.value <= 0xFF }) else {
            throw MappingRefusal("the pixel format is not a four-character code")
        }
        guard DesktopIngress.isNativeWall(session.startedWallText) else {
            throw MappingRefusal("the session wall anchor is not a UTC time with at most millisecond digits")
        }
        try DesktopIngress.identifiers([("native session", status.session)])
        guard status.startedHost >= 0, record.callbackHost >= status.startedHost else {
            throw MappingRefusal("the callback precedes its local session origin")
        }
        guard (facts.displayTimeTicks == nil) == (facts.displayTimeSeconds == nil) else {
            throw MappingRefusal("display ticks and their converted seconds are not both known or both unknown")
        }
        if let ticks = facts.displayTimeTicks, let seconds = facts.displayTimeSeconds, (ticks == 0) != (seconds == 0) {
            throw MappingRefusal("zero display ticks and zero converted seconds do not agree")
        }
        guard record.file == String(format: "frames/%08ld.png", record.sequence) else {
            throw MappingRefusal("\(record.file) is not the recorder's frames/NNNNNNNN.png name for callback \(record.sequence)")
        }
        // The recorder's own rule: present, nonzero and not later than the callback by more than
        // the recorded tolerance; otherwise the source time is unknown.
        let tolerance = status.settings.sourceTimeLeadTolerance
        let usable = facts.displayTimeTicks.map { $0 != 0 } == true
            && facts.displayTimeSeconds.map { $0 <= record.callbackHost + tolerance } == true
        guard record.sourceHost == (usable ? facts.displayTimeSeconds : nil) else {
            throw MappingRefusal("the recorded source time does not follow the recorder's validation rule")
        }

        // The raw original: re-read, and its PNG size checked, before it is claimed.
        let rawData = try RetainedOriginal.read(file: record.file, sequence: record.sequence, sha256: record.sha256,
                                                byteLength: record.byteLength, in: session.directory).get()
        try checkSize(rawData, width: record.width, height: record.height, file: record.file)
        let rawReference = PNGReference(artifactID: entry.raw.artifact.artifactID, sha256: record.sha256,
                                        byteLength: record.byteLength)
        try checkBinding(entry.raw, is: rawReference, what: "raw")
        let raw = try png(rawReference, width: record.width, height: record.height, file: record.file, encoding: record.encoding)

        var bindings = try [bindingJSON(entry.raw)]
        let composition: JSONValue
        if session.conflictingOutcomes.contains(record.sequence) {
            throw MappingRefusal("events.jsonl records more than one composition outcome for callback \(record.sequence)")
        }
        switch session.outcomes[record.sequence] {
        case nil:
            guard entry.composed == nil else {
                throw MappingRefusal("a composed binding was supplied for a frame with no recorded composition outcome")
            }
            composition = .object(["kind": .string("unknown"), "reason": .string("no_retained_outcome")])
        case .notComposed(let host, let reason, let detail)?:
            guard entry.composed == nil else {
                throw MappingRefusal("a composed binding was supplied for a frame that was not composed")
            }
            guard refusalReasons.contains(reason) else {
                throw MappingRefusal("the not_composed reason \(reason) is not one 0.2.11 describes")
            }
            try text(detail, "not_composed detail", limit: maxTextCharacters)
            guard host >= record.callbackHost else {
                throw MappingRefusal("the not_composed outcome precedes the frame's admission")
            }
            composition = .object([
                "kind": .string("not_composed"),
                "callback_sequence": try DesktopIngress.positive(record.sequence, "callback sequence"),
                "host_seconds": try DesktopIngress.number(host, "outcome time"),
                "reason": .string(reason),
                "detail": .string(detail),
            ])
        case .composed(let composed, _)?:
            let (value, binding) = try composedJSON(composed, entry: entry, record: record, raw: rawReference,
                                                    session: session)
            composition = value
            if let binding { bindings.append(binding) }
        }

        // Built in parts, each a typed value.
        let ticks: JSONValue = facts.displayTimeTicks.map { JSONValue.string(String($0)) } ?? .null
        let displaySeconds: JSONValue = try facts.displayTimeSeconds.map { try DesktopIngress.number($0, "display time") } ?? .null
        let sourceSeconds: JSONValue = try record.sourceHost.map { try DesktopIngress.number($0, "source time") } ?? .null
        let presentation: JSONValue = try facts.presentationTime.map {
            try DesktopIngress.number($0, "sample PTS", allowNegative: true) } ?? .null
        let contentRect: JSONValue = try facts.contentRect.map { try DesktopIngress.rectJSON($0, "content rectangle") } ?? .null
        let contentScale: JSONValue = try facts.contentScale.map { try DesktopIngress.scale($0, "content scale") } ?? .null
        let scaleFactor: JSONValue = try facts.scaleFactor.map { try DesktopIngress.scale($0, "scale factor") } ?? .null
        let dirtyRects: JSONValue = try facts.dirtyRects.map { try DesktopIngress.dirtyJSON($0) } ?? .null
        let hostClock: JSONValue = .object([
            "basis": .string("mach_absolute_time_seconds"),
            "session_started_wall_utc": .string(session.startedWallText),
            "session_started_seconds": try DesktopIngress.number(status.startedHost, "session start"),
            "callback_seconds": try DesktopIngress.number(record.callbackHost, "callback time"),
            // The UInt64 becomes a decimal string before any JSON number parsing can round it.
            "display_time_ticks_decimal": ticks,
            "display_time_seconds": displaySeconds,
            "source_seconds": sourceSeconds,
            "source_time_lead_tolerance_seconds": try DesktopIngress.number(tolerance, "source-time tolerance"),
        ])
        let sample: JSONValue = .object([
            "status": .string(facts.status),
            "presentation_time_seconds": presentation,
            "geometry_basis": .string("SCStreamFrameInfo_as_reported"),
            "geometry_unit": .null,
            "content_rect": contentRect,
            "content_scale": contentScale,
            "scale_factor": scaleFactor,
            "dirty_rects": dirtyRects,
        ])
        let profile: JSONValue = .object([
            "kind": .string("macos_screencapturekit"),
            "native_session_id": .string(status.session),
            "pixel_format": .string(record.pixelFormat),
            "display_at_start": try DesktopIngress.displayFacts(status.display),
            "host_clock": hostClock,
            "sample": sample,
        ])
        let frame: JSONValue = .object([
            "contract_version": .string(contractVersion),
            "kind": .string("retained_capture_frame"),
            "frame_id": .string(entry.frameID),
            "device_id": .string(plan.incarnation.deviceID),
            "session_id": .string(plan.incarnation.sessionID),
            "stream_id": .string(plan.incarnation.streamID),
            "source": try DesktopIngress.sourceJSON(plan.source),
            "callback_sequence": try DesktopIngress.positive(record.sequence, "callback sequence"),
            "captured_at": .null,
            "media_position": .null,
            "pixel_orientation": .null,
            "capture_latency_ms": .null,
            "raw": raw,
            "composition": composition,
            "profile": profile,
        ])
        do {
            _ = try DesktopJSON.encode(frame)
        } catch {
            throw MappingRefusal("the descriptor cannot be encoded as strict JSON: \(error)")
        }
        let inkBindings = try entry.inkOriginal.map { try [inkOriginalBinding($0, sequence: record.sequence, session: session)] } ?? []
        return MacRetainedDescriptor(callbackSequence: record.sequence, frameID: entry.frameID, frame: frame, bindings: bindings,
                                     inkOriginalBindings: inkBindings)
    }

    /// A supplied editable_ink binding, after the frame's retained ink original is re-read under the
    /// retained-file policy and shown to be the document that reproduces the frame's paired
    /// revision and strokes.
    static func inkOriginalBinding(_ binding: OriginalBinding, sequence: Int, session: RetainedSession) throws -> JSONValue {
        guard case .composed(let composed, _)? = session.outcomes[sequence], let original = composed.inkOriginal,
              original.status == "retained", let file = original.file, let sha256 = original.sha256,
              let byteLength = original.byteLength else {
            throw MappingRefusal("an editable-ink binding was supplied, but this frame has no retained ink original")
        }
        guard binding.contractVersion == "0.2.2", binding.kind == "editable_ink", binding.artifact.mediaType == "application/json",
              original.mediaType == "application/json" else {
            throw MappingRefusal("the ink-original binding is not a 0.2.2 editable_ink application/json binding")
        }
        guard binding.artifact.sha256 == sha256, binding.artifact.byteLength == byteLength else {
            throw MappingRefusal("the ink-original binding is not the retained ink original's SHA-256 and length")
        }
        try DesktopIngress.identifiers([("ink-original artifact ID", binding.artifact.artifactID)])
        guard (1...DesktopIngress.maxPNGBytes).contains(byteLength) else {
            throw MappingRefusal("the ink original is \(byteLength) bytes, outside the 1…\(DesktopIngress.maxPNGBytes)-byte original range")
        }
        let data = try RetainedOriginal.inkOriginal(file: file, sha256: sha256, byteLength: byteLength, in: session.directory).get()
        let document: InkDocument
        do {
            document = try CaptureFiles.decoder.decode(InkDocument.self, from: data)
        } catch {
            throw MappingRefusal("\(file) does not decode as an ink document")
        }
        // The snapshot must be the document this frame is paired with, not only the one its record names.
        guard let reference = composed.ink.document, original.documentFile == reference.file,
              original.createdInSession == reference.createdInSession, document.createdInSession == reference.createdInSession,
              document.displayID == reference.displayID else {
            throw MappingRefusal("\(file) is not the frozen document of this frame's paired ink")
        }
        guard document.revision == original.documentRevision, let paired = original.pairedRevision, paired == composed.ink.revision,
              document.visibleStrokes(atRevision: paired)?.map(\.id) == composed.ink.strokes else {
            throw MappingRefusal("\(file) does not reproduce this frame's paired revision and strokes")
        }
        return .object([
            "contract_version": .string(binding.contractVersion),
            "kind": .string(binding.kind),
            "source": try DesktopIngress.sourceJSON(binding.source),
            "artifact": .object([
                "artifact_id": .string(binding.artifact.artifactID),
                "sha256": .string(binding.artifact.sha256),
                "byte_length": .integer(binding.artifact.byteLength),
                "media_type": .string(binding.artifact.mediaType),
            ]),
        ])
    }

    /// The composed outcome, after its raw relation, file, bytes and pairing are checked; with the
    /// composed image's own binding when it has a distinct artifact ID.
    static func composedJSON(_ composed: ComposedFrame, entry: MacRetainedEntry, record: KeptFrame, raw: PNGReference,
                             session: RetainedSession) throws -> (JSONValue, JSONValue?) {
        let display = session.status.display
        guard appExcludedScopes.contains(display.scope) else {
            throw MappingRefusal("a composed outcome needs the configured app-exclusion scope")
        }
        guard composed.rawSequence == record.sequence, composed.rawFile == record.file,
              composed.rawSHA256 == record.sha256, composed.rawByteLength == record.byteLength else {
            throw MappingRefusal("the composed record does not name this frame's retained raw original exactly")
        }
        guard composed.width == record.width, composed.height == record.height else {
            throw MappingRefusal("the composed image does not have the raw image's size")
        }
        guard composed.mediaType == "image/png", composed.encoding == FrameStore.encoding else {
            throw MappingRefusal("the composed image is not the reviewed PNG encoding")
        }
        guard composed.composedHost >= record.callbackHost else {
            throw MappingRefusal("the composition precedes the frame's admission")
        }
        let ink = composed.ink
        // The composed file: the raw original itself without strokes, its own file with them.
        let imageReference: PNGReference
        let binding: OriginalBinding
        if ink.strokes.isEmpty {
            guard composed.file == record.file, composed.sha256 == record.sha256, composed.byteLength == record.byteLength else {
                throw MappingRefusal("an image without strokes is not the raw original itself")
            }
            binding = entry.composed ?? entry.raw
            imageReference = PNGReference(artifactID: binding.artifact.artifactID, sha256: record.sha256,
                                          byteLength: record.byteLength)
        } else {
            guard composed.file == String(format: "composed/%08ld.png", record.sequence) else {
                throw MappingRefusal("\(composed.file) is not this frame's composed/NNNNNNNN.png")
            }
            guard let supplied = entry.composed else {
                throw MappingRefusal("the composed image has no supplied original binding")
            }
            let data = try RetainedOriginal.read(file: composed.file, sequence: record.sequence, sha256: composed.sha256,
                                                 byteLength: composed.byteLength, in: session.directory, folder: "composed").get()
            try checkSize(data, width: composed.width, height: composed.height, file: composed.file)
            binding = supplied
            imageReference = PNGReference(artifactID: supplied.artifact.artifactID, sha256: composed.sha256,
                                          byteLength: composed.byteLength)
        }
        try checkBinding(binding, is: imageReference, what: "composed")
        if imageReference.artifactID == raw.artifactID, imageReference != raw {
            throw MappingRefusal("the raw and composed images share an artifact ID but not their PNG facts")
        }

        // The pairing, as recorded: its time basis, document, revision and limits.
        let sourceKnown = record.sourceHost != nil
        guard ink.pixelsTime == (sourceKnown ? "source_time" : "callback_admission"),
              ink.pixelsHost == (record.sourceHost ?? record.callbackHost) else {
            throw MappingRefusal("the ink is not paired at the frame's source time or callback admission")
        }
        guard ink.rendering == InkStyle.summary else {
            throw MappingRefusal("the rendering description is not the producer's")
        }
        try text(ink.mapping, "mapping", limit: maxMappingCharacters)
        guard display.frame.width > 0, display.frame.height > 0 else {
            throw MappingRefusal("a composition needs a recorded positive display size")
        }
        guard ink.mapping == InkComposer.mapping(scaleX: Double(record.width) / display.frame.width,
                                                 scaleY: Double(record.height) / display.frame.height) else {
            throw MappingRefusal("the mapping is not frame size / startup display size for this frame")
        }
        for limit in ink.limits { try text(limit, "composition limit", limit: maxTextCharacters) }
        // The producer's limitations: the base three first, and each conditional one exactly when it applies.
        guard ink.limits.starts(with: InkComposer.baseLimits) else {
            throw MappingRefusal("the composition limits do not start with the producer's three base limitations")
        }
        for (limit, applies) in [(InkComposer.unknownTimeLimit, !sourceKnown), (InkComposer.noDocumentLimit, ink.document == nil),
                                 (InkComposer.rawAliasLimit, ink.strokes.isEmpty)] where ink.limits.contains(limit) != applies {
            throw MappingRefusal("the composition limits contradict the time basis, the document or the raw alias")
        }
        let reopened = ink.limits.filter(isReopenedLimit)
        let expectedReopened: [String] = ink.revision.map { $0 > 0 && ink.revisionHost == nil ? [InkComposer.reopenedLimit($0)] : [] } ?? []
        guard reopened == expectedReopened else {
            throw MappingRefusal("a revision committed before the last reopening must state exactly its unknown commit time")
        }
        try DesktopIngress.identifiers(ink.strokes.map { ("stroke ID", $0) })
        guard Set(ink.strokes).count == ink.strokes.count else { throw MappingRefusal("a stroke ID repeats") }
        let document: JSONValue
        if let reference = ink.document {
            try DesktopIngress.identifiers([("ink document session", reference.createdInSession)])
            try text(reference.file, "ink document path", limit: maxInkPathCharacters)
            guard isInkDocumentPath(reference.file) else {
                throw MappingRefusal("the ink document path \(reference.file) is not <session>/ink/ink[.conflict-<id>].json")
            }
            guard reference.displayID == display.displayID, let revision = ink.revision, revision >= 0 else {
                throw MappingRefusal("an open ink document needs its revision and the capture's display")
            }
            if revision == 0, !ink.strokes.isEmpty || ink.revisionHost != nil {
                throw MappingRefusal("revision 0 has no committed strokes or commit time")
            }
            document = .object([
                "created_in_session": .string(reference.createdInSession),
                "file": .string(reference.file),
                "display_id": .integer(Int(reference.displayID)),
            ])
        } else {
            guard ink.revision == nil, ink.revisionHost == nil, ink.strokes.isEmpty else {
                throw MappingRefusal("without an open document there is no revision, commit time or stroke")
            }
            document = .null
        }
        if let committed = ink.revisionHost, committed > ink.pixelsHost {
            throw MappingRefusal("the paired revision was committed after the pixels' time")
        }
        let revision: JSONValue = ink.revision.map { JSONValue.integer($0) } ?? .null
        let committed: JSONValue = try ink.revisionHost.map { try DesktopIngress.number($0, "commit time") } ?? .null
        let pairing: JSONValue = .object([
            "pixels_host_seconds": try DesktopIngress.number(ink.pixelsHost, "pairing time"),
            "pixels_time": .string(ink.pixelsTime),
            "document": document,
            "revision": revision,
            "revision_host_seconds": committed,
            "strokes": .array(ink.strokes.map(JSONValue.string)),
            "mapping": .string(ink.mapping),
            "rendering": .string(ink.rendering),
            "limits": .array(ink.limits.map(JSONValue.string)),
        ])
        let value: JSONValue = .object([
            "kind": .string("composed"),
            "image": try png(imageReference, width: composed.width, height: composed.height, file: composed.file,
                             encoding: composed.encoding),
            "raw_sequence": try DesktopIngress.positive(composed.rawSequence, "raw sequence"),
            "raw_file": .string(composed.rawFile),
            "raw_sha256": .string(composed.rawSHA256),
            "raw_byte_length": .integer(composed.rawByteLength),
            "ink": pairing,
            "composed_host_seconds": try DesktopIngress.number(composed.composedHost, "composition time"),
        ])
        let distinct: OriginalBinding? = imageReference.artifactID == raw.artifactID ? nil : binding
        let extra = try distinct.map(bindingJSON)
        return (value, extra)
    }

    // MARK: - Pieces

    /// Whether a limitation is the reopened-revision text for some run of digits, as the released
    /// validator's pattern counts it (leading zeros included), so a noncanonical one is refused.
    static func isReopenedLimit(_ limit: String) -> Bool {
        let prefix = "revision "
        let tail = String(InkComposer.reopenedLimit(0).dropFirst("revision 0".count))
        guard limit.hasPrefix(prefix), limit.hasSuffix(tail) else { return false }
        // dropFirst and dropLast never trap; a limit too short for both leaves no digits.
        let digits = limit.dropFirst(prefix.count).dropLast(tail.count)
        return limit.count > prefix.count + tail.count && digits.unicodeScalars.allSatisfy { ("0"..."9").contains($0) }
    }

    static func png(_ reference: PNGReference, width: Int, height: Int, file: String, encoding: String) throws -> JSONValue {
        .object([
            "artifact": try DesktopIngress.artifactJSON(reference),
            "width": try DesktopIngress.positive(width, "image width"),
            "height": try DesktopIngress.positive(height, "image height"),
            "native_file": .string(file),
            "encoding": .string(encoding),
        ])
    }

    static func bindingJSON(_ binding: OriginalBinding) throws -> JSONValue {
        .object([
            "contract_version": .string(binding.contractVersion),
            "kind": .string(binding.kind),
            "source": try DesktopIngress.sourceJSON(binding.source),
            "artifact": try DesktopIngress.artifactJSON(binding.artifact),
        ])
    }

    /// The supplied binding must be a 0.2.2 screen image of exactly these PNG facts.
    static func checkBinding(_ binding: OriginalBinding, is reference: PNGReference, what: String) throws {
        guard binding.contractVersion == "0.2.2", binding.kind == "screen_image" else {
            throw MappingRefusal("the \(what) binding is not a 0.2.2 screen_image binding")
        }
        guard binding.artifact == reference else {
            throw MappingRefusal("the \(what) binding is not the retained PNG's SHA-256 and length")
        }
    }

    static let pngSignature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    /// The file must be a PNG (its signature, and ImageIO's detected type) of the recorded size. A
    /// consistently recorded file of another format at a .png path is refused.
    static func checkSize(_ data: Data, width: Int, height: Int, file: String) throws {
        guard data.starts(with: pngSignature), let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetType(source) as String? == "public.png" else {
            throw MappingRefusal("\(file) is not a PNG (its signature or detected image type is another format)")
        }
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let actualWidth = properties[kCGImagePropertyPixelWidth] as? Int,
              let actualHeight = properties[kCGImagePropertyPixelHeight] as? Int else {
            throw MappingRefusal("\(file) is not a readable PNG")
        }
        guard actualWidth == width, actualHeight == height else {
            throw MappingRefusal("\(file) is \(actualWidth)×\(actualHeight), not the recorded \(width)×\(height)")
        }
    }

    /// Characters as JSON Schema counts them: Unicode code points.
    static func text(_ value: String, _ what: String, limit: Int) throws {
        guard !value.isEmpty, value.unicodeScalars.count <= limit else {
            throw MappingRefusal("the \(what) is empty or longer than \(limit) characters; it is refused, not truncated")
        }
    }

    /// `<session>/ink/ink.json` or `<session>/ink/ink.conflict-<id>.json`, as the released pattern has it.
    static func isInkDocumentPath(_ path: String) -> Bool {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3, DesktopIngress.isIdentifier(String(parts[0])), parts[1] == "ink" else { return false }
        let name = parts[2]
        if name == "ink.json" { return true }
        guard name.hasPrefix("ink.conflict-"), name.hasSuffix(".json") else { return false }
        let id = name.dropFirst("ink.conflict-".count).dropLast(".json".count)
        return !id.isEmpty && id.unicodeScalars.allSatisfy { $0.isASCII && ($0.properties.isAlphabetic || ("0"..."9").contains($0) || $0 == "-") }
    }

    // MARK: - Unrepresented facts

    static func unrepresented(_ session: RetainedSession, plan: MacRetainedPlan, described: [MacRetainedDescriptor]) -> [String] {
        let status = session.status
        var facts = session.notes
        for gap in session.gaps {
            let callbacks = gap.firstCallback.map { "callbacks \($0)–\(gap.lastCallback ?? $0)" } ?? "no callback range"
            let hosts = gap.fromHost.map { from in "host \(from)–\(gap.toHost.map { String($0) } ?? "?") s" } ?? "no host interval"
            facts.append("native gap \(gap.kind) (\(callbacks), \(hosts)\(gap.open ? ", still open" : "")) is not carried by any descriptor")
        }
        // Both recorded endings are kept; where they differ, neither is chosen.
        if let ending = status.ending {
            facts.append("the session ended (\(ending.reason)\(ending.detail.map { ": " + $0 } ?? ""); live claims ended at host \(ending.liveEndedHost) s); no descriptor carries the ending")
        }
        if let ended = session.endedEvent {
            facts.append("events.jsonl records an ending (" + ended.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "; ")
                         + ")" + (status.ending == nil ? " that status.json does not" : "") + "; no descriptor carries the ending")
        }
        switch (status.ending, session.endedEvent) {
        case (nil, nil):
            facts.append("no ending is recorded: the session may still be running or have ended abruptly; no descriptor states either")
        case (.some, nil):
            facts.append("status.json records an ending that events.jsonl does not; events.jsonl may be incomplete")
        case (.some(let ending), .some(let ended)):
            let differing = [("reason", ended["reason"] == ending.reason), ("detail", ended["detail"] == ending.detail),
                             ("live_ended_host", ended["live_ended_host"] == String(ending.liveEndedHost))]
                .filter { !$0.1 }.map { $0.0 }
            if !differing.isEmpty {
                facts.append("the endings recorded in status.json and events.jsonl disagree on \(differing.joined(separator: ", ")); both are kept above and neither is chosen")
            }
        case (nil, .some):
            break
        }
        facts += session.streamNotes.map { $0 + "; not carried by any descriptor" }
        if let filter = session.captureFilter {
            facts.append("capture_filter: " + filter.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "; ")
                         + "; only the scope text is carried, and it is configured, not verified")
        } else {
            facts.append("no capture_filter event is recorded (a session from before app exclusion, or incomplete files)")
        }
        let describedSequences = Set(described.map(\.callbackSequence))
        let unknown = session.frames.map(\.record.sequence).filter {
            session.outcomes[$0] == nil && !session.conflictingOutcomes.contains($0)
        }
        if !unknown.isEmpty {
            facts.append("callbacks \(unknown.map(String.init).joined(separator: ", ")) have no recorded composition outcome: unknown, never empty ink")
        }
        if !session.conflictingOutcomes.isEmpty {
            facts.append("callbacks \(session.conflictingOutcomes.sorted().map(String.init).joined(separator: ", ")) have more than one recorded composition outcome and are not described")
        }
        if !session.strayOutcomes.isEmpty {
            facts.append("composition outcomes name callbacks \(session.strayOutcomes.map(String.init).joined(separator: ", ")) that have no kept frame")
        }
        if session.ignoredCompositionRequests > 0 {
            facts.append("\(session.ignoredCompositionRequests) composition requests came after a frame's outcome and were only noted")
        }
        let notDescribed = session.frames.map(\.record.sequence).filter { !describedSequences.contains($0) }
        if !notDescribed.isEmpty {
            facts.append("kept callbacks \(notDescribed.map(String.init).joined(separator: ", ")) are not described by this mapping")
        }
        // Ink documents named by outcomes, and those saved in this session's ink/ folder.
        let named = session.outcomes.values.compactMap { outcome -> String? in
            if case .composed(let composed, _) = outcome { return composed.ink.document?.file }
            return nil
        }
        let folder = session.directory.appending(path: "ink", directoryHint: .isDirectory)
        let saved = ((try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? [])
            .filter { $0.hasSuffix(".json") }.map { status.session + "/ink/" + $0 }
        let documents = Set(named + saved).sorted()
        facts.append((documents.isEmpty ? "no ink document is named or saved in this session" : "ink documents \(documents.joined(separator: ", "))")
                     + "; editable strokes, operations, anchors and ASK selections live in ink documents, possibly also in other sessions' folders,"
                     + " and a failed save is known only to the app; a descriptor carries at most a document path and a revision, which is not an immutable editable original")
        // Ink originals of the composed frames: kept, unavailable, without a document, or unknown.
        let originals = session.outcomes.values.compactMap { outcome -> InkOriginalRecord?? in
            if case .composed(let composed, _) = outcome { return .some(composed.inkOriginal) }
            return nil
        }
        let recorded = originals.compactMap { $0 }
        let keptFiles = Set(recorded.filter { $0.status == "retained" }.compactMap(\.file)).sorted()
        let problems = Set(recorded.filter { $0.status == "unavailable" }.compactMap(\.problem)).sorted()
        func count(_ status: String) -> Int { recorded.filter { $0.status == status }.count }
        let other = recorded.count - count("retained") - count("unavailable") - count("no_document")
        facts.append("ink originals: \(count("retained")) composed frames keep one [\(keptFiles.joined(separator: ", "))], "
                     + "\(count("unavailable")) unavailable, \(count("no_document")) without a document, "
                     + "\(originals.count - recorded.count) not recorded (unknown, from before ink originals)"
                     + (other > 0 ? ", \(other) with an unrecognized status" : "")
                     + (problems.isEmpty ? "" : "; unavailable because: " + problems.joined(separator: " | "))
                     + "; a kept original is an exact snapshot of the whole editable document frozen at pairing, possibly newer than the frame's paired revision, and it is bound only when the plan supplies an editable_ink binding")
        // Each kept original's own facts, which no descriptor or binding carries.
        for frame in session.frames {
            guard case .composed(let composed, _)? = session.outcomes[frame.record.sequence], let original = composed.inkOriginal,
                  original.status == "retained" else { continue }
            let frozen = original.frozenHost.map { "frozen at host \($0) s" } ?? "frozen at an unrecorded host time"
            facts.append("ink originals: callback \(frame.record.sequence) keeps \(original.file ?? "no file") (document revision "
                         + "\(original.documentRevision.map(String.init) ?? "unknown"), paired revision \(original.pairedRevision.map(String.init) ?? "unknown"), "
                         + "\(frozen), \(original.reused == true ? "reused" : "written")); limits: " + original.limits.joined(separator: " | "))
        }
        let refusals = (status.notComposed ?? [:]).sorted { $0.key < $1.key }.map { "\($0.key) \($0.value)" }.joined(separator: ", ")
        facts.append("counts: \(status.keptFrames) kept, \(status.composedFrames ?? 0) composed, not composed [\(refusals)], \(status.composedBytes ?? 0) composed bytes, \(status.gaps) gaps, \(status.callbacksAfterLiveEnded) callbacks after live ended")
        return facts
    }
}
