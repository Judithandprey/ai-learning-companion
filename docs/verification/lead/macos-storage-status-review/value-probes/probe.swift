import Foundation

public struct CaptureLinkStatus: Equatable, Sendable {
    public enum State: String, Equatable, Sendable {
        /// No configuration file: the development capture service is not set up.
        case notConfigured
        /// The configuration or the link record cannot be used.
        case unavailable
        case idle
        case reconciling
        case connecting
        /// Linked: the stream is registered and was read live, and its display source answered.
        /// It says nothing about any frame: only `stored` counts what the service confirmed.
        case storing
        /// Frames stay on this Mac; the service is not reachable or not permitted for this stream.
        case notConnected
        case stopping
        case stopped
        /// The service stopped or withdrew the stream, or its permission was lost.
        case endedByService
    }

    public var state: State
    /// Frames in batches the service answered with a verified ACK: the only confirmed storage.
    public var stored = 0
    /// Frames in a batch whose send is recorded and whose answer has not come yet. It may already
    /// have arrived at the service.
    public var awaiting = 0
    /// Frames in a batch that got no believed answer, or whose send was cut off: it may have taken
    /// effect.
    public var unknown = 0
    public var refused = 0
    /// Kept frames not sent yet (while linked) or not sent at all (after Stop).
    public var notSent = 0
    /// Earlier streams whose server state could not be settled.
    public var earlierUnknown = 0
    public var detail: String?

    public init(state: State, detail: String? = nil) {
        self.state = state
        self.detail = detail
    }
}

extension CaptureLinkStatus {
    /// The link's state in fixed words. It never says frames are being stored: what the service
    /// confirmed is in `countsLine`. Local pixels are "live" only in the capture line.
    public var summaryLine: String {
        switch state {
        case .notConfigured:
            return "Not set up on this Mac (no capture-host.json): frames stay on this Mac."
        case .unavailable: return "Unavailable: frames stay on this Mac."
        case .idle: return "Connects when you press Start."
        case .reconciling: return "Checking earlier streams."
        case .connecting: return "Connecting."
        case .storing: return "Linked to the capture service."
        case .notConnected: return "Not connected: frames stay on this Mac."
        case .stopping: return "Stopping: nothing new is sent."
        case .stopped: return "Stopped."
        case .endedByService: return "Ended by the capture service."
        }
    }

    /// What is confirmed stored, apart from what awaits an answer, is not known, was refused or
    /// was not sent. Shown whenever the link is up, also before anything is confirmed.
    public var countsLine: String? {
        let earlier = earlierUnknown > 0 ? " \(earlierUnknown) earlier stream(s) not settled." : ""
        let linked = state == .storing
        guard linked || stored + awaiting + unknown + refused + notSent > 0 || !earlier.isEmpty else { return nil }
        let unsent = linked || state == .connecting ? "not sent yet" : "not sent"
        return "\(stored) frame(s) confirmed stored, \(awaiting) awaiting an answer, \(unknown) not known, "
            + "\(refused) refused, \(notSent) \(unsent).\(earlier)"
    }

    public var menuLine: String {
        "Capture storage: " + summaryLine
    }
}


struct LinkJob: Codable, Equatable {
    var key: String
    /// The exact request bytes, relative to the journal's directory.
    var file: String
    var bodySHA256: String
    var callbacks: [Int]
    /// sending, unknown, committed, refused, not_sent or unsendable.
    var status: String
    var inDoubt: String?
    var httpStatus: Int?
    var code: String?
    var sends = 0
    /// Original files the service accepted for this batch although the batch was not accepted
    /// then: the frames of a batch "not sent" can still have originals there.
    var acceptedOriginals: Int?
}



let old = Data(#"{"key":"source.b1","file":"stream/source.b1.json","bodySHA256":"abc","callbacks":[1,2],"status":"not_sent","sends":1}"#.utf8)
var job = try JSONDecoder().decode(LinkJob.self, from: old)
precondition(job.acceptedOriginals == nil)
job.acceptedOriginals = 3
let encoded = try JSONEncoder().encode(job)
let reread = try JSONDecoder().decode(LinkJob.self, from: encoded)
precondition(reread == job && reread.status == "not_sent" && reread.acceptedOriginals == 3)
var status = CaptureLinkStatus(state: .storing)
precondition(status.countsLine != nil && status.summaryLine == "Linked to the capture service.")
status.awaiting = 2
precondition(status.stored == 0 && status.unknown == 0)
let pending = status.countsLine!
precondition(pending.contains("0 frame(s) confirmed stored, 2 awaiting an answer, 0 not known"))
status.awaiting = 0; status.unknown = 2
let unknown = status.countsLine!
precondition(unknown.contains("0 frame(s) confirmed stored, 0 awaiting an answer, 2 not known"))
let report:[String:Any] = ["candidate":"30807f23a911739c089126d86b2b34d51976ea18","groups":2,"passed":2,
"checks":[["case":"legacy_LinkJob_decodes_without_optional_field_and_new_field_roundtrips","pass":true],
["case":"exact_library_status_text_separates_pending_unknown_confirmed","pass":true,"pending":pending,"unknown":unknown]],
"limits":"Exact extracted value types on Linux Swift; no actor/upload/transport/native UI execution"]
let result=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
print(String(decoding:result,as:UTF8.self))
