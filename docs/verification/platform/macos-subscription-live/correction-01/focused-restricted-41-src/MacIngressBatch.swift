import Foundation
import FoundationNetworking
import Glibc
import Foundation

// Prepares one exact MacOSFrameBatchRequest 0.2.12 and the originals it references, from a retained
// session and identities the trusted caller supplies. Nothing is sent here (see MacIngressUpload).
//
// - The 0.2.11 descriptors are the Mac retained-frame mapper's, unchanged; every raw, composed and
//   ink original is re-read under the retained-file policy while mapping.
// - One framed Process record per kept frame carries the raw PNG reference, the composed PNG
//   reference when it has its own artifact ID, and the frame's immutable editable-ink original
//   (ink-originals/<SHA-256>.json) when the caller binds it. The mutable ink/ink.json never is.
// - Record IDs and Process sequences are the caller's, never callback ordinals. Capture UTC, clock
//   and media position stay null. Native gaps become frameless coverage records.
// - The body is encoded once. Its exact bytes and key are kept for every retry.

/// One batch to prepare, with every identity from the trusted caller.
public struct MacIngressPlan: Sendable {
    public enum Entry: Sendable {
        /// A kept frame, described by the Mac retained-frame mapper, as one framed record.
        case frame(MacRetainedEntry, record: RecordIdentity)
        /// One of the session's retained native gaps, as one frameless coverage record.
        case gap(NativeGap, record: RecordIdentity)
    }

    public var batchID: String
    public var idempotencyKey: String
    /// live or historical, as the trusted caller states; never upgraded here.
    public var deliveryMode: String
    public var incarnation: CaptureIncarnation
    /// The registered shared-display source of every record.
    public var source: SourceReference
    /// The native session and start display the caller registered that source for.
    public var nativeSessionID: String
    public var displayID: UInt32
    public var entries: [Entry]

    public init(batchID: String, idempotencyKey: String, deliveryMode: String, incarnation: CaptureIncarnation,
                source: SourceReference, nativeSessionID: String, displayID: UInt32, entries: [Entry]) {
        self.batchID = batchID
        self.idempotencyKey = idempotencyKey
        self.deliveryMode = deliveryMode
        self.incarnation = incarnation
        self.source = source
        self.nativeSessionID = nativeSessionID
        self.displayID = displayID
        self.entries = entries
    }
}

/// A record as sent: its identity and the exact artifact references it names.
public struct PreparedRecord: Equatable, Sendable {
    public let recordID: String
    public let sequence: Int
    public let artifacts: [PNGReference]
}

/// One original to upload before the batch: its existing 0.2.2 binding and its retained file.
public struct PlannedOriginal: Equatable, Sendable {
    public let binding: OriginalBinding
    /// Inside the session: frames/NNNNNNNN.png, composed/NNNNNNNN.png or ink-originals/<SHA-256>.json.
    public let file: String
    /// The callback sequence of the frame whose file this is.
    public let callbackSequence: Int
}

/// A prepared, unsent batch. `body` and `idempotencyKey` are sent unchanged on every attempt.
public struct PreparedMacBatch: Equatable, Sendable {
    public let batchID: String
    public let idempotencyKey: String
    public let deliveryMode: String
    public let incarnation: CaptureIncarnation
    public let source: SourceReference
    public let sessionDirectory: URL
    /// MacOSFrameBatchRequest 0.2.12 as Foundation JSON.
    public let body: Data
    public let records: [PreparedRecord]
    /// Each distinct artifact ID once, in record order: raw, composed, ink.
    public let originals: [PlannedOriginal]
    /// Native facts no record or descriptor carries. They stay in the session files.
    public let unrepresented: [String]
}

public enum MacIngressBatch {
    public static let contractVersion = "0.2.12"

    /// The prepared batch, or a refusal naming every entry that cannot be represented. Nothing
    /// retained is changed either way.
    public static func prepare(_ plan: MacIngressPlan, session: RetainedSession) throws -> PreparedMacBatch {
        try DesktopIngress.identifiers([("batch ID", plan.batchID), ("Idempotency-Key", plan.idempotencyKey),
                                        ("device ID", plan.incarnation.deviceID), ("session ID", plan.incarnation.sessionID),
                                        ("stream ID", plan.incarnation.streamID)])
        guard ["live", "historical"].contains(plan.deliveryMode) else {
            throw MappingRefusal("the delivery mode is neither live nor historical")
        }
        guard session.status.session == plan.nativeSessionID else {
            throw MappingRefusal("the retained session is not the native session this source was registered for")
        }
        guard session.status.display.displayID == plan.displayID else {
            throw MappingRefusal("the retained session's start display is not the registered display")
        }
        guard (1...DesktopIngress.maxRecords).contains(plan.entries.count) else {
            throw MappingRefusal("a batch holds 1 to \(DesktopIngress.maxRecords) records, not \(plan.entries.count)")
        }
        var recordIDs: Set<String> = []
        var sequences: Set<Int> = []
        var frameEntries: [MacRetainedEntry] = []
        for entry in plan.entries {
            let identity: RecordIdentity
            switch entry {
            case .frame(let frame, let record):
                identity = record
                frameEntries.append(frame)
            case .gap(_, let record):
                identity = record
            }
            try DesktopIngress.identifiers([("record ID", identity.recordID)])
            guard (1...ContractLimits.maxSafeInteger).contains(identity.sequence) else {
                throw MappingRefusal("the process sequence \(identity.sequence) is not a positive safe integer")
            }
            guard recordIDs.insert(identity.recordID).inserted, sequences.insert(identity.sequence).inserted else {
                throw MappingRefusal("record IDs and process sequences must be unique in a batch")
            }
        }

        // The descriptors, with every file re-read; any refused entry refuses the batch.
        var described: [Int: MacRetainedDescriptor] = [:]
        var unrepresented = session.notes
        if !frameEntries.isEmpty {
            let mapping = try MacRetainedFrames.map(MacRetainedPlan(
                incarnation: plan.incarnation, source: plan.source, nativeSessionID: plan.nativeSessionID,
                displayID: plan.displayID, entries: frameEntries), session: session)
            if !mapping.refused.isEmpty {
                let reasons = mapping.refused.map { "callback \($0.callbackSequence) (\($0.frameID)): \($0.reason)" }
                throw MappingRefusal("these frames cannot be described, so no batch is prepared: " + reasons.joined(separator: "; "))
            }
            for item in mapping.described {
                described[item.callbackSequence] = item
            }
            unrepresented = mapping.unrepresented
        } else {
            unrepresented = MacRetainedFrames.unrepresented(session, plan: MacRetainedPlan(
                incarnation: plan.incarnation, source: plan.source, nativeSessionID: plan.nativeSessionID,
                displayID: plan.displayID, entries: []), described: [])
        }

        let source = try DesktopIngress.sourceJSON(plan.source)
        var records: [JSONValue] = []
        var prepared: [PreparedRecord] = []
        var frames: [JSONValue] = []
        var originals: [PlannedOriginal] = []
        var originalIDs: Set<String> = []
        func addOriginal(_ binding: OriginalBinding, file: String, sequence: Int) {
            if originalIDs.insert(binding.artifact.artifactID).inserted {
                originals.append(PlannedOriginal(binding: binding, file: file, callbackSequence: sequence))
            }
        }
        for entry in plan.entries {
            switch entry {
            case .frame(let frame, let record):
                guard let descriptor = described[frame.callbackSequence],
                      let kept = session.frames.first(where: { $0.record.sequence == frame.callbackSequence })?.record else {
                    throw MappingRefusal("callback \(frame.callbackSequence) was not described")
                }
                // Raw first; the composed image when it is its own archive reference; then the ink original.
                var artifacts: [PNGReference] = [frame.raw.artifact]
                addOriginal(frame.raw, file: kept.file, sequence: kept.sequence)
                if let composed = frame.composed, composed.artifact.artifactID != frame.raw.artifact.artifactID {
                    guard case .composed(let outcome, _)? = session.outcomes[kept.sequence] else {
                        throw MappingRefusal("callback \(kept.sequence) has a composed binding but no composed outcome")
                    }
                    artifacts.append(composed.artifact)
                    addOriginal(composed, file: outcome.file, sequence: kept.sequence)
                }
                if let ink = frame.inkOriginal {
                    guard case .composed(let outcome, _)? = session.outcomes[kept.sequence],
                          let original = outcome.inkOriginal, original.status == "retained", let file = original.file else {
                        throw MappingRefusal("callback \(kept.sequence) has an editable_ink binding but no retained ink original")
                    }
                    guard !artifacts.contains(where: { $0.artifactID == ink.artifact.artifactID }) else {
                        throw MappingRefusal("the ink original of callback \(kept.sequence) reuses an image's artifact ID")
                    }
                    artifacts.append(ink.artifact)
                    addOriginal(ink, file: file, sequence: kept.sequence)
                }
                let references = try artifacts.map { try referenceJSON($0) }
                records.append(DesktopIngress.recordJSON(record, source: source, frameID: .string(frame.frameID),
                                                         artifacts: references, coverage: "observed_samples",
                                                         limitations: ["sample_only", "unsupported_history"]))
                prepared.append(PreparedRecord(recordID: record.recordID, sequence: record.sequence, artifacts: artifacts))
                frames.append(descriptor.frame)
            case .gap(let gap, let record):
                guard session.gaps.contains(gap) else {
                    throw MappingRefusal("the gap is not one of this session's retained gaps")
                }
                guard let evidence = DesktopIngress.coverage(forGap: gap.kind) else {
                    throw MappingRefusal("\(gap.kind) is not a coverage gap")
                }
                records.append(DesktopIngress.recordJSON(record, source: source, frameID: .null, artifacts: [],
                                                         coverage: evidence.coverage, limitations: evidence.limitations))
                prepared.append(PreparedRecord(recordID: record.recordID, sequence: record.sequence, artifacts: []))
                unrepresented.append(DesktopIngress.describe(gap, record: record))
            }
        }

        let request: JSONValue = .object([
            "contract_version": .string(contractVersion),
            "batch": .object([
                "contract_version": .string("0.2.0"),
                "batch_id": .string(plan.batchID),
                "device_id": .string(plan.incarnation.deviceID),
                "session_id": .string(plan.incarnation.sessionID),
                "stream_id": .string(plan.incarnation.streamID),
                "delivery_mode": .string(plan.deliveryMode),
                "records": .array(records),
            ]),
            "frames": .array(frames),
        ])
        let body: Data
        do {
            body = try DesktopJSON.encode(request)
        } catch {
            throw MappingRefusal("the batch cannot be encoded as strict JSON: \(error)")
        }
        guard body.count <= DesktopIngress.maxBodyBytes else {
            throw MappingRefusal("the batch is \(body.count) bytes, over the \(DesktopIngress.maxBodyBytes)-byte metadata limit; split it at record boundaries")
        }
        return PreparedMacBatch(batchID: plan.batchID, idempotencyKey: plan.idempotencyKey, deliveryMode: plan.deliveryMode,
                                incarnation: plan.incarnation, source: plan.source, sessionDirectory: session.directory,
                                body: body, records: prepared, originals: originals, unrepresented: unrepresented)
    }

    /// A PNG or editable-ink JSON reference, as a Process record artifact.
    static func referenceJSON(_ artifact: PNGReference) throws -> JSONValue {
        guard artifact.mediaType == "application/json" else { return try DesktopIngress.artifactJSON(artifact) }
        try DesktopIngress.identifiers([("artifact ID", artifact.artifactID)])
        guard artifact.sha256.count == 64,
              artifact.sha256.utf8.allSatisfy({ (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }),
              (1...DesktopIngress.maxPNGBytes).contains(artifact.byteLength) else {
            throw MappingRefusal("the ink original reference is not a lowercase SHA-256 with a 1…\(DesktopIngress.maxPNGBytes)-byte length")
        }
        return .object([
            "artifact_id": .string(artifact.artifactID),
            "sha256": .string(artifact.sha256),
            "byte_length": .integer(artifact.byteLength),
            "media_type": .string(artifact.mediaType),
        ])
    }
}
