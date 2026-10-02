import Foundation
import FoundationNetworking
import Glibc
import Foundation

// Links one explicit Start…Stop capture to the local capture service: a new stream registered
// through its own trusted host child, its display source, and the retained raw, composed and
// immutable ink originals uploaded while the stream is live. Local capture never waits for the
// link and never depends on it.
//
// - Start: the user's explicit Start is the only fresh consent. Earlier unsettled streams of the
//   same lineage (user, device, session, producer) are settled first, so the new stream names a
//   closed predecessor. A new stream and source ID are journaled before the child is asked for
//   anything; the registration is POSTed only for that Start and never after a Stop; the stream is
//   used only after a GET shows it live with exactly this identity, and after the display source
//   answers with exactly its descriptor.
// - Sending: each batch's exact bytes and key are journaled before the first send. Batches in
//   doubt, or not taken for an expired bearer, are resent with the same bytes and key while the
//   stream is live; a later refusal never makes a doubt known.
// - Stop (the caller closes the capture gate first, so nothing new is sent): the connection and an
//   in-flight batch get a bounded wait, then are cancelled and stay in doubt; the Stop is journaled
//   before it is sent; the state is read back; then the child gets EOF. After a Stop this service
//   accepts no upload for the stream: unsent frames stay on this Mac.
// - A server Stop or withdrawal, or lost source authority, ends this capture through the caller.
// - App restart: every unsettled stream is reconciled with a fresh_consent=false child under its
//   own recorded identities — read, and Stopped if still live. Nothing is resent and capture never
//   restarts.
// - A record that cannot be written is a sticky fault: no child is started and nothing more is
//   requested or sent in this run, this stream's own child is ended, and the next launch
//   reconciles. Local capture and its originals go on unchanged.
// The journal holds no token, connection string or pixels. Nothing retained is changed.

/// What the link shows. Counts are kept frames (records); details are fixed words.
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

/// The link's nonsecret record, kept beside the app's other data.
struct LinkJournal: Codable, Equatable {
    var format = "lc-macos-capture-link/v1"
    var streams: [LinkStream] = []
}

extension LinkJournal {
    /// Why a loaded record cannot be used, or nil. Every field used for a host, a grant, a request
    /// path or header, a Stop or a count must have the form this link writes; otherwise nothing is
    /// used and the record is left as it is.
    var problem: String? {
        guard format == LinkJournal().format else { return "an unknown format" }
        var seen: Set<String> = []
        for stream in streams {
            if let problem = stream.problem { return problem }
            guard seen.insert(stream.registration.streamID).inserted else { return "a stream recorded twice" }
        }
        return nil
    }

    /// The predecessor a new stream of this lineage declares: its last registered stream. Streams
    /// are appended in Start order, and one registers only after naming the stream before it.
    func predecessor(_ lineage: (LinkStream) -> Bool) -> String? {
        streams.last { lineage($0) && $0.registered }?.registration.streamID
    }
}

extension LinkStream {
    var problem: String? {
        let grants: Set<String> = ["requested_unknown", "pending", "consumed", "abandoned"]
        let finals: Set<String> = ["stopped", "withdrawn", "abandoned"]
        let jobStates: Set<String> = ["sending", "unknown", "committed", "refused", "not_sent", "unsendable"]
        let stopOutcomes: Set<String> = ["written", "stopped", "refused", "unknown"]
        let identities = [userID, producerID, registration.deviceID, registration.sessionID, registration.streamID, sourceID]
            + (registration.previousStreamID.map { [$0] } ?? [])
        guard identities.allSatisfy(DesktopIngress.isIdentifier), registration.authorizationGeneration == 1,
              registration.membershipRevision == 1, registrationKey == registration.streamID + ".register" else {
            return "a malformed stream registration"
        }
        guard grants.contains(grant), final.map(finals.contains) ?? true, nextSequence >= 1, batches >= 0 else {
            return "a malformed stream state"
        }
        if let state, !["live", "stopped", "withdrawn"].contains(state.state) || state.revision < 1 {
            return "a malformed server state"
        }
        for job in jobs {
            guard jobStates.contains(job.status), DesktopIngress.isIdentifier(job.key), job.sends >= 0,
                  (job.acceptedOriginals ?? 0) >= 0, job.callbacks.allSatisfy({ $0 >= 0 }) else { return "a malformed batch" }
        }
        let stopPrefix = registration.streamID + ".stop."
        guard stops.allSatisfy({ stop in
            let number = stop.key.dropFirst(stopPrefix.count)
            return stopOutcomes.contains(stop.outcome) && DesktopIngress.isIdentifier(stop.key)
                && stop.key.hasPrefix(stopPrefix) && !number.isEmpty && number.allSatisfy { ("0"..."9").contains($0) }
                && (stop.replays ?? 0) >= 0
        }) else {
            return "a malformed Stop"
        }
        return nil
    }

    /// Not settled: the server may still hold it live.
    var open: Bool {
        final == nil && grant != "abandoned"
    }
}

struct LinkStream: Codable, Equatable {
    /// The owner and producer this stream was registered for; with the device and session, its
    /// lineage. Reconciliation always uses these, never a later configuration.
    var userID: String
    var producerID: String
    var registration: StreamRegistration
    var registrationKey: String
    var sourceID: String
    var sourceTimezone: String
    var sourceCreatedAt: String?
    /// The native capture session (directory name) whose frames this stream carries.
    var captureSession: String
    /// requested_unknown (a child may have been asked), pending, consumed or abandoned.
    var grant: String
    /// Whether a child received the whole startup record, so a grant may exist.
    var delivered = false
    /// Set before the registration is first POSTed; false means it was never sent.
    var registrationSent = false
    var registered = false
    var state: StreamStateValue?
    var nextSequence = 1
    var batches = 0
    /// Callback sequences put into a batch (sent or locally unsendable).
    var planned: [Int] = []
    var jobs: [LinkJob] = []
    var stops: [LinkStop] = []
    /// stopped, withdrawn or abandoned; nil while the server state is not settled.
    var final: String?
    var notes: [String] = []
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

struct LinkStop: Codable, Equatable {
    var key: String
    /// The exact command bytes sent under `key`.
    var body: String
    /// written (journaled; whether it was sent is not known after a restart), stopped, refused
    /// (known not taken) or unknown (it may have taken effect).
    var outcome: String
    /// The believed refusal that answered the latest send, if one did (for `unknown`: of a retry
    /// after an attempt in doubt). Answers of earlier sends are in the stream's notes.
    var httpStatus: Int?
    var code: String?
    /// How often a later Stop of the same stream and revision sent this command again.
    var replays: Int?
}

public actor CaptureLink {
    public typealias StatusHandler = @Sendable (CaptureLinkStatus) -> Void

    /// One explicit Start.
    final class Active {
        let gate: LiveGate
        let session: URL
        let index: Int
        let endCapture: @Sendable (String) -> Void
        var host: (any CaptureHostHandle)?
        var authority: MacIngressAuthority?
        var live = false
        var reconnects = 0
        var reconnecting = false
        /// This capture was ended by the service (the caller was asked to end it).
        var endedByService = false
        var kept = 0
        /// The first connection, or the latest reconnection after the child exited.
        var connecting: Task<Void, Never>?
        var runner: Task<Void, Never>?
        var again = false
        /// When a planning pass last found nothing ready.
        var idleAt: Date?
        var stopping: Task<Void, Never>?
        /// Prepared batches of this process, by key, for exact resends.
        var prepared: [String: PreparedMacBatch] = [:]

        init(gate: LiveGate, session: URL, index: Int, endCapture: @escaping @Sendable (String) -> Void) {
            self.gate = gate
            self.session = session
            self.index = index
            self.endCapture = endCapture
        }
    }

    public static var defaultDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "CompanionDesktop/CaptureLink", directoryHint: .isDirectory)
    }

    /// Engineering defaults.
    static let tokenLifetime: TimeInterval = 12 * 3600
    static let renewBefore: TimeInterval = 60
    static let framesPerBatch = 20
    static let batchesPerRun = 5
    static let sendsPerBatch = 3
    static let reconnectsPerStart = 2
    /// At most one planning pass per second while nothing is ready: capture reports are frequent.
    static let idlePause: TimeInterval = 1

    private let config: Result<CaptureHostConfig, CaptureHostProblem>
    private let directory: URL
    private let launcher: any CaptureHostLauncher
    private let transport: @Sendable () -> any MacIngressTransport
    private let clock: @Sendable () -> Date
    /// How long Stop waits for the connection or an in-flight batch before cancelling it
    /// (engineering default 5 s).
    private let stopWait: UInt64
    /// Kept frames per batch (engineering default 20).
    private let framesPerBatch: Int
    private var journal = LinkJournal()
    private var fault: String?
    private var status: CaptureLinkStatus
    private var onStatus: StatusHandler?
    private var reconciliation: Task<Void, Never>?
    /// The one settlement of a lineage's earlier streams that a Start is waiting for.
    private var lineageSettle: Task<Void, Never>?
    /// The latest Start, until it has a stream (or has ended without one).
    private var starting: Task<Void, Never>?
    private var active: Active?

    public init(config: Result<CaptureHostConfig, CaptureHostProblem>, directory: URL = CaptureLink.defaultDirectory,
                launcher: any CaptureHostLauncher = ProcessHostLauncher(),
                transport: @escaping @Sendable () -> any MacIngressTransport = { LoopbackHTTPTransport() },
                clock: @escaping @Sendable () -> Date = { Date() }, stopWait: TimeInterval = 5,
                framesPerBatch: Int = 20) {
        self.config = config
        self.stopWait = UInt64(max(stopWait, 0) * 1_000_000_000)
        self.framesPerBatch = min(max(framesPerBatch, 1), Self.framesPerBatch)
        self.directory = directory
        self.launcher = launcher
        self.transport = transport
        self.clock = clock
        switch config {
        case .failure(.notConfigured):
            status = CaptureLinkStatus(state: .notConfigured)
        case .failure(.invalid(let reason)):
            status = CaptureLinkStatus(state: .unavailable, detail: reason)
        case .success:
            status = CaptureLinkStatus(state: .idle)
        }
        let file = directory.appending(path: "journal.json")
        if RetainedOriginal.entryType(file) != nil {
            if let data = try? Data(contentsOf: file), let loaded = try? JSONDecoder().decode(LinkJournal.self, from: data),
               loaded.problem == nil {
                journal = loaded
            } else {
                // Left as it is: a new record would forget streams that may still be live. No host is
                // started and no grant or Stop is used from it.
                fault = "the capture link record (CaptureLink/journal.json) cannot be used; it is left as it is and "
                    + "nothing is sent (see the setup record for recovery)"
                status = CaptureLinkStatus(state: .unavailable, detail: fault)
            }
        }
    }

    public func setStatusHandler(_ handler: @escaping StatusHandler) {
        onStatus = handler
        handler(status)
    }

    public func currentStatus() -> CaptureLinkStatus {
        status
    }

    // MARK: - Reconciliation

    /// Reads, and Stops if still live, every stream an earlier run left unsettled. Nothing is
    /// resent, no source is created and no capture starts. Runs once; Start waits for it.
    public func reconcile() async {
        if let reconciliation {
            await reconciliation.value
            return
        }
        let task = Task { await self.reconcileAll() }
        reconciliation = task
        await task.value
    }

    private func reconcileAll() async {
        guard case .success = config, fault == nil, journal.streams.contains(where: \.open) else { return }
        publish(.reconciling, detail: "checking earlier streams")
        await settleOpen { _ in true }
        if let fault {
            publish(.unavailable, detail: fault)
        } else {
            publish(.idle, detail: nil)
        }
    }

    /// Settles the open streams `include` selects, each with a fresh_consent=false child under its
    /// own recorded identities.
    private func settleOpen(_ include: (LinkStream) -> Bool) async {
        guard case .success(let config) = config else { return }
        let open = journal.streams.indices.filter { journal.streams[$0].open && include(journal.streams[$0]) }
        for index in open {
            guard fault == nil else { return }
            guard journal.streams[index].open else { continue }
            for job in journal.streams[index].jobs.indices where journal.streams[index].jobs[job].status == "sending" {
                journal.streams[index].jobs[job].status = "unknown"
            }
            let stream = journal.streams[index]
            if !stream.registrationSent, stream.grant != "consumed" {
                // Never POSTed, so never registered: a grant it may have left is never used.
                abandon(index)
                guard save() else { return }
                continue
            }
            guard save() else { return }
            guard case .success(let launched) = await launchHost(config, index: index, fresh: false) else {
                note(index, "not reconciled: the capture host could not be started without new consent")
                continue
            }
            let (host, ready, authority) = launched
            if ready.startStatus == "pending" {
                // The registration never committed; it is never sent without the user's Start.
                abandon(index)
            } else {
                journal.streams[index].grant = "consumed"
                journal.streams[index].registered = true
                await settle(index, control: CaptureControl(authority: authority, transport: transport()))
            }
            _ = save()
            _ = await host.end()
        }
    }

    /// Reads the stream; if it is still live, Stops it (journaled first) and reads it again.
    private func settle(_ index: Int, control: CaptureControl) async {
        switch await control.read(journal.streams[index].registration) {
        case .ok(let state):
            journal.streams[index].state = state
            if state.state == "live" {
                await sendStop(index, control: { control }, renew: { nil })
            } else {
                journal.streams[index].final = state.state
            }
        case .refused(let status, let code):
            note(index, "the stream could not be read (\(status) \(code)); its server state is not known")
        case .unknown, .notSent:
            note(index, "the stream could not be read; its server state is not known")
        }
    }

    private func abandon(_ index: Int) {
        journal.streams[index].grant = "abandoned"
        journal.streams[index].final = "abandoned"
    }

    // MARK: - Start

    /// At the user's explicit Start, once local capture has started: registers a new stream and
    /// its display source, then sends while the stream is live. Returns at once.
    public func begin(gate: LiveGate, session: URL, endCapture: @escaping @Sendable (String) -> Void) {
        guard case .success = config else { return }
        if let fault {
            notLinked(fault)
            return
        }
        if let current = active, current.gate.isOpen {
            // One stream at a time: a Start while another capture is linked is not linked.
            notLinked("another capture is still linked; this one stays on this Mac")
            return
        }
        // A previous capture's Stop and the launch reconciliation finish first. A Stop meanwhile
        // closes the gate, and nothing is started.
        let previous = active
        starting = Task {
            if let previous { await self.finish(previous) }
            await self.reconcile()
            await self.start(gate: gate, session: session, endCapture: endCapture)
        }
    }

    /// An ended capture's Stop, joined or started (only while it is still the current one).
    private func finish(_ previous: Active) async {
        if let stopping = previous.stopping {
            await stopping.value
        } else if active === previous {
            await stop()
        }
    }

    /// This Start is not linked: its frames are counted by the capture itself, not here.
    private func notLinked(_ detail: String?) {
        var next = CaptureLinkStatus(state: .notConnected, detail: detail.map { $0 + "; frames stay on this Mac" })
        next.earlierUnknown = journal.streams.filter(\.open).count
        status = next
        onStatus?(next)
    }

    private func start(gate: LiveGate, session: URL, endCapture: @escaping @Sendable (String) -> Void) async {
        guard case .success(let config) = config, gate.isOpen, active == nil else { return }
        let lineage: (LinkStream) -> Bool = { stream in
            stream.userID == config.userID && stream.producerID == config.producerID
                && stream.registration.deviceID == config.deviceID && stream.registration.sessionID == config.sessionID
        }
        // The new stream names a closed predecessor: earlier unsettled streams of its lineage are
        // settled first, by one settlement at a time (a Start that finds one running joins it).
        while fault == nil, journal.streams.contains(where: { lineage($0) && $0.open }) {
            if let running = lineageSettle {
                await running.value
                continue
            }
            publish(.reconciling, detail: "checking earlier streams")
            let task = Task { await self.settleOpen(lineage) }
            lineageSettle = task
            await task.value
            lineageSettle = nil
            break
        }
        guard gate.isOpen, active == nil else {
            // Stopped meanwhile: the settled state is shown, not "checking".
            if active == nil, lineageSettle == nil { publish(.idle, detail: nil) }
            return
        }
        if let fault {
            notLinked(fault)
            return
        }
        if journal.streams.contains(where: { lineage($0) && $0.open }) {
            notLinked("an earlier stream of this capture could not be settled, so no new stream is registered")
            return
        }
        let registration = StreamRegistration(deviceID: config.deviceID, sessionID: config.sessionID,
                                              streamID: "stream-" + Self.randomHex(12),
                                              previousStreamID: journal.predecessor(lineage))
        let stream = LinkStream(userID: config.userID, producerID: config.producerID, registration: registration,
                                registrationKey: registration.streamID + ".register", sourceID: "src-" + Self.randomHex(12),
                                sourceTimezone: TimeZone.current.identifier, captureSession: session.lastPathComponent,
                                grant: "requested_unknown")
        journal.streams.append(stream)
        guard save() else {
            // Nothing was written for it, so nothing is asked for it.
            journal.streams.removeLast()
            notLinked(fault)
            return
        }
        let a = Active(gate: gate, session: session, index: journal.streams.count - 1, endCapture: endCapture)
        active = a
        publish(.connecting, detail: nil)
        let connecting = Task {
            _ = await self.connect(a, config: config, fresh: true)
            // A child that exited before the stream went live was not acted on: replaced now.
            if self.usable(a), a.host?.hasExited == true { await self.reconnect(a) }
        }
        a.connecting = connecting
        await connecting.value
    }

    /// Whether `a` is the current, open, unstopped capture.
    private func current(_ a: Active) -> Bool {
        a.gate.isOpen && a.stopping == nil && active === a
    }

    /// Whether anything may still be started, requested or sent for `a`: it is current, and the
    /// record can still be written.
    private func usable(_ a: Active) -> Bool {
        fault == nil && current(a)
    }

    /// Shows a connection problem only for the current capture (a record fault stays shown).
    private func notConnected(_ a: Active, _ detail: String) {
        if usable(a) { publish(.notConnected, detail: detail + "; frames stay on this Mac") }
    }

    /// After a record fault this stream's own child is ended: nothing more goes through it. Local
    /// capture goes on, and ending the child is not a server Stop.
    private func endHostAfterFault(_ a: Active) async {
        guard fault != nil, let host = a.host else { return }
        a.live = false
        a.host = nil
        _ = await host.end()
    }

    /// Launches a child for this stream, registers (fresh only, never after Stop), reads the state,
    /// registers the display source, and opens sending. True when live. Every step is journaled
    /// before the next request: a record that cannot be written ends the connection there.
    private func connect(_ a: Active, config: CaptureHostConfig, fresh: Bool) async -> Bool {
        let live = await establish(a, config: config, fresh: fresh)
        await endHostAfterFault(a)
        return live && fault == nil
    }

    private func establish(_ a: Active, config: CaptureHostConfig, fresh: Bool) async -> Bool {
        let index = a.index
        guard usable(a) else { return false }
        let host: any CaptureHostHandle
        let ready: HostReady
        let authority: MacIngressAuthority
        switch await launchHost(config, index: index, fresh: fresh) {
        case .success(let launched):
            (host, ready, authority) = launched
        case .failure(let reason):
            notConnected(a, reason)
            return false
        }
        // The child serves this stream until the Stop, which uses or ends it. Never two at once.
        if let old = a.host, old !== host { _ = await old.end() }
        a.host = host
        a.authority = authority
        let hostID = ObjectIdentifier(host)
        host.onExit { [weak self] in
            Task { await self?.hostExited(hostID) }
        }
        let control = CaptureControl(authority: authority, transport: transport())
        if ready.startStatus == "pending" {
            journal.streams[index].grant = "pending"
            guard save() else { return false }
            guard fresh else {
                // Only the user's Start registers.
                notConnected(a, "the stream was not registered")
                return false
            }
        } else {
            journal.streams[index].grant = "consumed"
            guard save() else { return false }
        }
        guard usable(a) else { return false }
        if !journal.streams[index].registered {
            journal.streams[index].registrationSent = true
            guard save() else { return false }
        }
        // A consumed stream's registration replay under its key returns the current state.
        let registration = journal.streams[index].registration
        // The registration is already known committed: this request only replays it.
        let replay = journal.streams[index].registered || journal.streams[index].grant == "consumed"
        let gate = a.gate
        switch await control.register(registration, key: journal.streams[index].registrationKey,
                                      shouldStop: { !gate.isOpen }) {
        case .ok(let state):
            let saved = registered(index, state)
            guard state.state == "live" else {
                // A believed server end still ends this capture, whatever the record.
                serviceEnded(a, state: state.state)
                return false
            }
            guard saved else { return false }
        case .notSent:
            // Stopped before it was sent: known not registered.
            if !journal.streams[index].registered {
                journal.streams[index].registrationSent = false
                _ = save()
            }
            return false
        case .refused(let status, let code) where replay:
            note(index, "registration replay refused (\(status) \(code))")
            _ = save()
            // The registered stream is no longer permitted, as for its state and source.
            if status == 403 || status == 404 {
                authorityLost(a)
            } else {
                notConnected(a, "the registered stream could not be confirmed (\(code))")
            }
            return false
        case .refused(let status, let code):
            note(index, "registration refused (\(status) \(code))")
            _ = save()
            notConnected(a, "the stream was not registered (\(code))")
            return false
        case .unknown(_, let later) where replay:
            note(index, "the registration replay was not answered in a believed way")
            _ = save()
            if later?.status == 403 || later?.status == 404 {
                authorityLost(a)
            } else {
                notConnected(a, "the registered stream could not be confirmed")
            }
            return false
        case .unknown:
            note(index, "whether the registration committed is not known")
            _ = save()
            notConnected(a, "whether the stream was registered is not known")
            return false
        }
        guard usable(a) else { return false }
        switch await control.read(registration) {
        case .ok(let state):
            journal.streams[index].state = state
            let saved = save()
            guard state.state == "live" else {
                // A believed server end still ends this capture, whatever the record.
                serviceEnded(a, state: state.state)
                return false
            }
            guard saved else { return false }
            guard state.revision == 1 else {
                notConnected(a, "the stream's server revision is not the registered one")
                return false
            }
        case .refused(let status, _) where status == 403 || status == 404:
            authorityLost(a)
            return false
        case .refused, .unknown, .notSent:
            notConnected(a, "the stream state could not be read")
            return false
        }
        guard usable(a) else { return false }
        let stream = journal.streams[index]
        guard let body = CaptureControl.sourceBody(sourceID: stream.sourceID, streamID: registration.streamID,
                                                   timezone: stream.sourceTimezone) else { return false }
        switch await control.putSource(body, sourceID: stream.sourceID, registration: registration, timezone: stream.sourceTimezone,
                                       createdAt: stream.sourceCreatedAt, shouldStop: { !gate.isOpen }) {
        case .ok(let createdAt):
            journal.streams[index].sourceCreatedAt = createdAt
            guard save() else { return false }
        case .refused(let status, _) where status == 403 || status == 404:
            authorityLost(a)
            return false
        case .unknown(_, let later) where later?.status == 403 || later?.status == 404:
            // Whether the earlier attempt registered it stays not known; the permission is gone.
            note(index, "whether the display source was registered is not known")
            authorityLost(a)
            return false
        case .notSent:
            return false
        case .refused:
            notConnected(a, "the display source was not registered")
            return false
        case .unknown:
            note(index, "whether the display source was registered is not known")
            _ = save()
            notConnected(a, "whether the display source was registered is not known")
            return false
        }
        guard usable(a) else { return false }
        a.live = true
        publish(.storing, detail: nil)
        kick()
        return true
    }

    /// Records a believed registration. False when the record could not be written: nothing more
    /// is requested for the stream in this run.
    private func registered(_ index: Int, _ state: StreamStateValue) -> Bool {
        journal.streams[index].registered = true
        journal.streams[index].grant = "consumed"
        journal.streams[index].state = state
        return save()
    }

    private enum Launched {
        case success((any CaptureHostHandle, HostReady, MacIngressAuthority))
        /// Fixed words, with the host's own fixed code when it gave one.
        case failure(String)
    }

    /// One child for this stream's registration and recorded identities, with a new random bearer.
    private func launchHost(_ config: CaptureHostConfig, index: Int, fresh: Bool) async -> Launched {
        // No child is started once the record cannot be written.
        if let fault { return .failure(fault) }
        let dsn: String
        switch config.readDSN() {
        case .success(let text):
            dsn = text
        case .failure(let problem):
            let reason: String
            if case .invalid(let text) = problem { reason = text } else { reason = "the dsn_file cannot be used" }
            note(index, reason)
            return .failure(reason)
        }
        let stream = journal.streams[index]
        let token = Self.randomHex(32)
        let expires = clock().addingTimeInterval(Self.tokenLifetime)
        guard let record = Self.startupRecord(dsn: dsn, userID: stream.userID, producerID: stream.producerID,
                                              registration: stream.registration, token: token, expires: expires,
                                              fresh: fresh) else {
            note(index, "the startup record cannot be encoded")
            return .failure("the startup record cannot be encoded")
        }
        let result = await launcher.launch(config, record: record)
        switch result {
        case .success(let (host, ready)):
            journal.streams[index].delivered = true
            guard save() else {
                // Not recorded: the child is not used, and it is ended.
                _ = await host.end()
                return .failure(fault ?? "the capture link record could not be written")
            }
            let incarnation = CaptureIncarnation(deviceID: stream.registration.deviceID, sessionID: stream.registration.sessionID,
                                                 streamID: stream.registration.streamID)
            guard let authority = try? MacIngressAuthority(origin: ready.origin, token: token, expiresAt: expires,
                                                           userID: stream.userID, incarnation: incarnation) else {
                _ = await host.end()
                return .failure("the capture host's READY origin cannot be used")
            }
            return .success((host, ready, authority))
        case .failure(let failure):
            if failure.delivered {
                journal.streams[index].delivered = true
            } else if !journal.streams[index].delivered {
                // No child ever received this registration: no grant can exist.
                abandon(index)
            }
            let reason = failure.reason + (failure.code.map { " (\($0))" } ?? "")
            note(index, reason)
            _ = save()
            return .failure(reason)
        }
    }

    /// The host's startup record: one line, with the bearer and connection string only here.
    static func startupRecord(dsn: String, userID: String, producerID: String, registration: StreamRegistration,
                              token: String, expires: Date, fresh: Bool) -> Data? {
        let record: JSONValue = .object([
            "format": .string("lc-desktop-capture-host-v1"), "port": .integer(0), "database_dsn": .string(dsn),
            "user_id": .string(userID), "device_id": .string(registration.deviceID),
            "session_id": .string(registration.sessionID), "producer_id": .string(producerID),
            "registration": registration.json, "token": .string(token),
            "expires_at": .string(expires.formatted(Date.ISO8601FormatStyle())),
            "scopes": .array(["process:capture", "process:control", "sources:read", "sources:write"].map(JSONValue.string)),
            "capabilities": .array(["process.capture.v0.2", "process.control.v0.2.1", "process.ingress.v0.2.4",
                                    "process.macos-ingress.v0.2.12"].map(JSONValue.string)),
            "fresh_consent": .bool(fresh), "producer_profile": .string("desktop_pixels"),
            "enable_raw_ingress": .bool(false), "enable_desktop_ingress": .bool(false), "enable_windows_ingress": .bool(false),
            "enable_macos_ingress": .bool(true),
        ])
        guard var data = try? DesktopJSON.encode(record), !data.contains(0x0A) else { return nil }
        data.append(0x0A)
        return data.count <= 65_536 ? data : nil
    }

    // MARK: - Sending

    /// Called for every new capture report; sends what is ready while the stream is live.
    public nonisolated func framesChanged() {
        Task { await self.kick() }
    }

    private func kick() {
        guard let a = active, a.live, usable(a) else { return }
        if a.runner != nil {
            a.again = true
            return
        }
        let wait = idleWait(a)
        a.runner = Task {
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            await self.runLoop(a)
        }
    }

    private func runLoop(_ a: Active) async {
        repeat {
            a.again = false
            await runOnce(a)
            let wait = idleWait(a)
            if a.again, wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
        } while a.again && a.live && usable(a) && !Task.isCancelled
        await endHostAfterFault(a)
        a.runner = nil
    }

    private func idleWait(_ a: Active) -> TimeInterval {
        a.idleAt.map { max(0, Self.idlePause - clock().timeIntervalSince($0)) } ?? 0
    }

    private func runOnce(_ a: Active) async {
        for _ in 0..<Self.batchesPerRun {
            guard a.live, usable(a), !Task.isCancelled, let authority = a.authority else { return }
            if authority.expiresAt.timeIntervalSince(clock()) < Self.renewBefore {
                await reconnect(a)
                continue
            }
            let index = a.index
            // The oldest batch in doubt or not taken is sent again first, with the same bytes and key.
            if let open = journal.streams[index].jobs.firstIndex(where: { job in
                ["unknown", "not_sent"].contains(job.status) && job.sends < Self.sendsPerBatch && a.prepared[job.key] != nil
            }) {
                await send(a, job: open)
                continue
            }
            guard let job = plan(a) else {
                a.idleAt = clock()
                return
            }
            a.idleAt = nil
            await send(a, job: job)
        }
        a.again = true
    }

    /// The next batch of kept frames that are ready (their composition outcome is recorded, or
    /// the session does not compose ink), journaled with its exact bytes before anything is sent.
    /// Nil when nothing is ready.
    private func plan(_ a: Active) -> Int? {
        let index = a.index
        guard let overview = try? RetainedSession.read(a.session, verifying: []) else { return nil }
        a.kept = overview.frames.count
        let planned = Set(journal.streams[index].planned)
        // A session that does not compose ink never records an outcome; its frames are ready as kept.
        let composes = MacRetainedFrames.appExcludedScopes.contains(overview.status.display.scope)
        let ready = overview.frames.map(\.record.sequence).filter { sequence in
            (!composes || overview.outcomes[sequence] != nil) && !planned.contains(sequence)
        }
        guard !ready.isEmpty else {
            publishCounts(a)
            return nil
        }
        let chosen = Array(ready.prefix(framesPerBatch))
        switch journalBatch(a, frames: chosen) {
        case .job(let job): return job
        case .notNow: return nil
        case .refused: break
        }
        // One frame alone: a frame that cannot be described is kept locally, marked unsendable.
        if chosen.count > 1 {
            switch journalBatch(a, frames: [chosen[0]]) {
            case .job(let job): return job
            case .notNow: return nil
            case .refused: break
            }
        }
        journal.streams[index].planned.append(chosen[0])
        let key = journal.streams[index].sourceID + ".u\(chosen[0])"
        journal.streams[index].jobs.append(LinkJob(key: key, file: "", bodySHA256: "", callbacks: [chosen[0]],
                                                   status: "unsendable"))
        _ = save()
        publishCounts(a)
        return nil
    }

    private enum Planned {
        case job(Int)
        /// The session could not be read now (for example a line still being appended), or the
        /// journal could not be written: nothing is sent, and the next report tries again.
        case notNow
        /// The mapper or the batch builder refused these frames.
        case refused
    }

    private func journalBatch(_ a: Active, frames: [Int]) -> Planned {
        let index = a.index
        let stream = journal.streams[index]
        guard let session = try? RetainedSession.read(a.session, verifying: Set(frames)),
              let userID = a.authority?.userID else { return .notNow }
        let source = SourceReference(userID: userID, sourceID: stream.sourceID, sourceVersion: 1)
        var sequence = stream.nextSequence
        var entries: [MacIngressPlan.Entry] = []
        for frame in session.frames where frames.contains(frame.record.sequence) {
            let record = RecordIdentity(recordID: stream.sourceID + ".r\(sequence)", sequence: sequence)
            entries.append(.frame(Self.entry(frame, outcome: session.outcomes[frame.record.sequence], source: source), record: record))
            sequence += 1
        }
        let key = stream.sourceID + ".b\(stream.batches + 1)"
        let plan = MacIngressPlan(batchID: key, idempotencyKey: key, deliveryMode: "live",
                                  incarnation: CaptureIncarnation(deviceID: stream.registration.deviceID,
                                                                  sessionID: stream.registration.sessionID,
                                                                  streamID: stream.registration.streamID),
                                  source: source, nativeSessionID: session.status.session,
                                  displayID: session.status.display.displayID, entries: entries)
        guard let prepared = try? MacIngressBatch.prepare(plan, session: session) else { return .refused }
        let file = stream.registration.streamID + "/" + key + ".json"
        guard writeBody(prepared.body, to: file) else {
            failed("a batch could not be written to the capture link record; nothing more is sent")
            return .notNow
        }
        journal.streams[index].batches += 1
        journal.streams[index].nextSequence = sequence
        journal.streams[index].planned += frames
        journal.streams[index].jobs.append(LinkJob(key: key, file: file, bodySHA256: Self.sha256(prepared.body),
                                                   callbacks: frames, status: "sending"))
        guard save(quiet: true) else {
            // Never sent: shown as not sent, never as awaiting an answer (the failure is sticky, so
            // nothing sends it).
            journal.streams[index].jobs[journal.streams[index].jobs.count - 1].status = "not_sent"
            publishCounts(a)
            return .notNow
        }
        a.prepared[key] = prepared
        return .job(journal.streams[index].jobs.count - 1)
    }

    /// Existing 0.2.2 bindings for one kept frame, content-addressed within this source.
    static func entry(_ frame: RetainedFrame, outcome: CompositionOutcome?, source: SourceReference) -> MacRetainedEntry {
        let id = source.sourceID
        let record = frame.record
        let raw = OriginalBinding(source: source, artifact: PNGReference(artifactID: id + ".png." + record.sha256,
                                                                         sha256: record.sha256, byteLength: record.byteLength))
        var composed: OriginalBinding?
        var ink: OriginalBinding?
        if case .composed(let image, _)? = outcome {
            if image.file != record.file {
                composed = OriginalBinding(source: source, artifact: PNGReference(artifactID: id + ".png." + image.sha256,
                                                                                  sha256: image.sha256, byteLength: image.byteLength))
            }
            if let original = image.inkOriginal, original.status == "retained", let sha = original.sha256,
               let length = original.byteLength {
                ink = OriginalBinding(source: source, artifact: PNGReference(artifactID: id + ".ink." + sha, sha256: sha,
                                                                             byteLength: length, mediaType: "application/json"),
                                      kind: "editable_ink")
            }
        }
        return MacRetainedEntry(callbackSequence: record.sequence, frameID: id + ".f\(record.sequence)", raw: raw,
                                composed: composed, inkOriginal: ink)
    }

    private func send(_ a: Active, job: Int) async {
        let index = a.index
        let key = journal.streams[index].jobs[job].key
        guard let prepared = a.prepared[key], let authority = a.authority else { return }
        let gate = a.gate
        // The send intent is recorded before the request, and shown at once: until the answer comes
        // these frames await it. After Stop or a record fault nothing is sent, so nothing awaits.
        let before = journal.streams[index].jobs[job].status
        if before != "unknown" {
            journal.streams[index].jobs[job].status = "sending"
            guard usable(a), before == "sending" || save(quiet: true) else {
                journal.streams[index].jobs[job].status = "not_sent"
                _ = save()
                publishCounts(a)
                return
            }
        }
        publishCounts(a)
        let result = await MacIngressUpload.upload(prepared, authority: authority, transport: transport(),
                                                   shouldStop: { !gate.isOpen })
        journal.streams[index].jobs[job].sends += 1
        let earlier = journal.streams[index].jobs[job].status == "unknown"
        switch result {
        case .committed:
            journal.streams[index].jobs[job].status = "committed"
            journal.streams[index].jobs[job].inDoubt = nil
            journal.streams[index].jobs[job].acceptedOriginals = nil
            a.prepared[key] = nil
        case .unknown(_, _, let status, let code, let inDoubt, _):
            journal.streams[index].jobs[job].status = "unknown"
            journal.streams[index].jobs[job].inDoubt = inDoubt ?? journal.streams[index].jobs[job].inDoubt
            journal.streams[index].jobs[job].httpStatus = status
            journal.streams[index].jobs[job].code = code
        case .cancelled(_, _, let inDoubt, let originals):
            let doubt = earlier || inDoubt != nil
            journal.streams[index].jobs[job].status = doubt ? "unknown" : "not_sent"
            journal.streams[index].jobs[job].inDoubt = inDoubt ?? journal.streams[index].jobs[job].inDoubt
            accepted(originals.count, index: index, job: job)
        case .refused(let stage, _, let status, let code, let originals):
            accepted(originals.count, index: index, job: job)
            // An expired bearer or a 401 is not the service refusing the batch: it is sent again
            // with a new bearer. A later refusal never makes an earlier doubt known.
            let expired = status == nil && authority.expiresAt <= clock()
            let notTaken = expired || status == 401
            journal.streams[index].jobs[job].status = earlier ? "unknown" : (notTaken ? "not_sent" : "refused")
            journal.streams[index].jobs[job].httpStatus = status
            journal.streams[index].jobs[job].code = code
            _ = save()
            publishCounts(a)
            await refusedBy(a, stage: stage, status: status, code: code, expired: expired)
            return
        }
        _ = save()
        publishCounts(a)
    }

    /// Originals the service accepted for a batch that itself was not accepted in that send.
    private func accepted(_ originals: Int, index: Int, job: Int) {
        guard originals > 0 else { return }
        journal.streams[index].jobs[job].acceptedOriginals = max(originals, journal.streams[index].jobs[job].acceptedOriginals ?? 0)
    }

    private func refusedBy(_ a: Active, stage: MacIngressStage, status: Int?, code: String?, expired: Bool) async {
        // Nothing more is requested once the record cannot be written.
        guard usable(a) else { return }
        switch (status, code) {
        case (nil, _) where expired, (401?, _):
            // A new child and bearer without consent.
            await reconnect(a)
        case (409?, "capture_stopped"?), (404?, _), (403?, _):
            await readState(a)
        default:
            break
        }
    }

    /// After a refusal that may mean the stream is no longer live.
    private func readState(_ a: Active) async {
        guard let authority = a.authority else { return }
        let control = CaptureControl(authority: authority, transport: transport())
        switch await control.read(journal.streams[a.index].registration) {
        case .ok(let state):
            journal.streams[a.index].state = state
            _ = save()
            if state.state != "live" { serviceEnded(a, state: state.state) }
        case .refused(let status, _) where status == 401:
            await reconnect(a)
        case .refused:
            authorityLost(a)
        case .unknown, .notSent:
            break
        }
    }

    // MARK: - Host loss and renewal

    /// The live stream's child exited: a tracked reconnection, which Stop waits for.
    private func hostExited(_ hostID: ObjectIdentifier) {
        guard let a = active, let host = a.host, ObjectIdentifier(host) == hostID, a.live, usable(a), !a.reconnecting else {
            return
        }
        a.live = false
        a.connecting = Task { await self.reconnect(a) }
    }

    /// A new child for the same registration without consent: sending resumes only if the stream
    /// is still live with exactly this identity. Never after Stop.
    private func reconnect(_ a: Active) async {
        guard case .success(let config) = config, usable(a), !a.reconnecting else { return }
        a.reconnecting = true
        defer { a.reconnecting = false }
        repeat {
            a.live = false
            // Not linked while its child is being replaced.
            publish(.connecting, detail: nil)
            a.reconnects += 1
            let old = a.host
            a.host = nil
            _ = await old?.end()
            guard usable(a) else { return }
            guard a.reconnects <= Self.reconnectsPerStart else {
                notConnected(a, "offline: the capture service was lost")
                return
            }
            _ = await connect(a, config: config, fresh: false)
            // A new child that already exited (its exit was not acted on) is replaced in turn.
        } while usable(a) && a.host?.hasExited == true
    }

    /// The service stopped or withdrew the stream (a believed state other than live).
    private func serviceEnded(_ a: Active, state: String) {
        a.live = false
        journal.streams[a.index].final = state
        _ = save()
        guard current(a) else { return }
        a.endedByService = true
        publish(.endedByService, detail: "the capture service \(state == "withdrawn" ? "withdrew" : "stopped") this stream")
        a.endCapture(state == "withdrawn" ? "server_withdrawn" : "server_stopped")
    }

    private func authorityLost(_ a: Active) {
        a.live = false
        note(a.index, "the capture service no longer permits this stream or its source")
        _ = save()
        guard current(a) else { return }
        a.endedByService = true
        publish(.endedByService, detail: "the capture service no longer permits this stream")
        a.endCapture("server_permission_lost")
    }

    // MARK: - Stop

    /// After the caller closed the capture gate (Stop, stream error, permission or display loss,
    /// sleep, quit or a server end): no new send, a bounded wait for the connection and an
    /// in-flight batch, the journaled Stop, a read back, then EOF to the child. Waits until done.
    public func stop() async {
        guard let a = active else {
            // A Start that has no stream yet (still settling earlier streams) ends first.
            await starting?.value
            return
        }
        if let stopping = a.stopping {
            await stopping.value
            return
        }
        let task = Task { await self.stopFlow(a) }
        a.stopping = task
        await task.value
    }

    /// `stop`, bounded for Quit: what does not finish is reconciled at the next launch. True when
    /// the Stop flow finished in time.
    @discardableResult
    public func quit(within seconds: TimeInterval) async -> Bool {
        let stopping = Task { await self.stop() }
        return await Self.bounded(stopping, nanoseconds: UInt64(max(seconds, 0) * 1_000_000_000))
    }

    private func stopFlow(_ a: Active) async {
        publish(.stopping, detail: "nothing new is sent")
        a.live = false
        // No new connection or reconnection starts once `stopping` is set.
        for task in [a.connecting, a.runner].compactMap({ $0 }) {
            let finished = await Self.bounded(task, nanoseconds: stopWait)
            if !finished {
                task.cancel()
                await task.value
            }
        }
        a.live = false
        let index = a.index
        for job in journal.streams[index].jobs.indices where journal.streams[index].jobs[job].status == "sending" {
            journal.streams[index].jobs[job].status = "unknown"
        }
        _ = save()
        var stream = journal.streams[index]
        if stream.final == nil, !stream.delivered || (!stream.registrationSent && stream.grant != "consumed") {
            // No child got the record, or the registration was never sent: it was never registered,
            // and it is never registered after this Stop.
            abandon(index)
        } else if stream.final == nil, fault == nil {
            if let control = await usableControl(a) {
                if !stream.registered {
                    switch await control.read(stream.registration) {
                    case .ok(let state):
                        _ = registered(index, state)
                        if state.state != "live" { journal.streams[index].final = state.state }
                    case .refused(404, _):
                        abandon(index)
                    case .refused, .unknown, .notSent:
                        note(index, "whether the stream was registered is not known")
                    }
                }
                stream = journal.streams[index]
                if stream.registered, stream.final == nil {
                    await sendStop(index, control: { await self.usableControl(a) }, renew: { await self.renewed(a) })
                }
            } else {
                note(index, "the Stop was not sent: no capture host is available; it is sent at the next launch")
            }
        }
        _ = save()
        _ = await a.host?.end()
        a.host = nil
        if let overview = try? RetainedSession.read(a.session, verifying: []) {
            a.kept = overview.frames.count
        }
        let final = journal.streams[index].final
        var detail: String
        switch final {
        case "stopped"?, "withdrawn"?: detail = "the stream is \(final ?? "")"
        case "abandoned"?: detail = "no stream was registered"
        default: detail = "the server Stop is not confirmed"
        }
        if let fault { detail = fault + "; " + detail }
        // "Not sent" counts frames whose batch was not accepted; some of their originals may be there.
        let orphaned = journal.streams[index].jobs.filter { $0.status == "not_sent" }.reduce(0) { $0 + ($1.acceptedOriginals ?? 0) }
        if orphaned > 0 {
            detail += "; \(orphaned) original file(s) of frames not sent were already accepted by the capture service"
        }
        var result = counts(a)
        result.state = a.endedByService ? .endedByService : .stopped
        result.detail = detail
        active = nil
        status = result
        onStatus?(result)
    }

    /// The current child's control, or a new child without consent when it is gone or its bearer
    /// is about to expire.
    private func usableControl(_ a: Active) async -> CaptureControl? {
        if let host = a.host, !host.hasExited, let authority = a.authority,
           authority.expiresAt.timeIntervalSince(clock()) > Self.renewBefore {
            return CaptureControl(authority: authority, transport: transport())
        }
        return await renewed(a)
    }

    private func renewed(_ a: Active) async -> CaptureControl? {
        guard case .success(let config) = config else { return nil }
        let old = a.host
        a.host = nil
        _ = await old?.end()
        guard case .success(let launched) = await launchHost(config, index: a.index, fresh: false) else { return nil }
        a.host = launched.0
        a.authority = launched.2
        return CaptureControl(authority: launched.2, transport: transport())
    }

    /// The journaled unknown-boundary Stop: written before dispatch, the same key and bytes on
    /// every retry, then the state read back.
    ///
    /// A Stop already recorded for exactly this stream and revision is the same command: its key
    /// and exact bytes are sent again, also after a restart, and a later refusal does not make its
    /// earlier possible commit known not taken. A new command is made only when there is none for
    /// the read revision (none yet, or the revision changed); a stale revision gets one such new
    /// Stop.
    private func sendStop(_ index: Int, control: () async -> CaptureControl?,
                          renew: () async -> CaptureControl?) async {
        for _ in 0..<2 {
            guard fault == nil, var current = await control() else { return }
            let registration = journal.streams[index].registration
            let revision = journal.streams[index].state?.revision ?? 1
            guard let body = try? DesktopJSON.encode(registration.stopBody(expectedRevision: revision)) else { return }
            let text = String(decoding: body, as: UTF8.self)
            let entry: Int
            // Whether this command may already have taken effect before this send.
            var inDoubt = false
            // A recorded known refusal, restored if nothing is sent after all.
            var refusedBefore: LinkStop?
            // Used only when its stored bytes are exactly this stream's Stop at this revision.
            if let recorded = journal.streams[index].stops.lastIndex(where: { $0.body.utf8.elementsEqual(text.utf8) }) {
                entry = recorded
                let earlier = journal.streams[index].stops[recorded]
                inDoubt = earlier.outcome != "refused"
                // The earlier answer stays in the notes; the entry then holds this send's answer.
                let answer = [earlier.httpStatus.map { String($0) }, earlier.code].compactMap { $0 }
                note(index, "the recorded Stop \(earlier.key) (\(([earlier.outcome] + answer).joined(separator: " "))) is sent "
                     + "again with the same bytes")
                if !inDoubt {
                    // In flight again: no longer known not taken until this send is answered.
                    refusedBefore = earlier
                    journal.streams[index].stops[recorded].outcome = "written"
                }
                journal.streams[index].stops[recorded].httpStatus = nil
                journal.streams[index].stops[recorded].code = nil
                journal.streams[index].stops[recorded].replays = (earlier.replays ?? 0) + 1
            } else {
                let key = registration.streamID + ".stop.\(journal.streams[index].stops.count + 1)"
                journal.streams[index].stops.append(LinkStop(key: key, body: text, outcome: "written"))
                entry = journal.streams[index].stops.count - 1
            }
            let key = journal.streams[index].stops[entry].key
            // An unwritten Stop is never sent.
            guard save() else { return }
            var outcome = await current.stop(registration, body: body, key: key)
            // A 401 asks for a new bearer: the same key and bytes go again through a new child. After
            // an attempt in doubt, a refusal of that resend does not make the doubt known.
            var renewal = false
            switch outcome {
            case .refused(401, _):
                renewal = true
            case .unknown(_, let later) where later?.status == 401:
                renewal = true
                inDoubt = true
            default:
                break
            }
            if renewal, let fresh = await renew() {
                current = fresh
                outcome = await current.stop(registration, body: body, key: key)
            }
            var again = false
            switch outcome {
            case .ok(let state):
                journal.streams[index].stops[entry].outcome = "stopped"
                journal.streams[index].state = state
                if state.state != "live" { journal.streams[index].final = state.state }
            case .refused(let status, let code):
                // The refusal answers this send only: an earlier doubt stays.
                journal.streams[index].stops[entry].outcome = inDoubt ? "unknown" : "refused"
                journal.streams[index].stops[entry].httpStatus = status
                journal.streams[index].stops[entry].code = code
                again = code == "stale_revision" || code == "invalid_transition"
            case .unknown(_, let later):
                journal.streams[index].stops[entry].outcome = "unknown"
                journal.streams[index].stops[entry].httpStatus = later?.status
                journal.streams[index].stops[entry].code = later?.code
            case .notSent:
                // Nothing was sent: a recorded known refusal is as it was.
                if let refusedBefore, !inDoubt {
                    journal.streams[index].stops[entry].outcome = refusedBefore.outcome
                    journal.streams[index].stops[entry].httpStatus = refusedBefore.httpStatus
                    journal.streams[index].stops[entry].code = refusedBefore.code
                }
            }
            // Nothing more is requested once the record cannot be written.
            guard save() else { return }
            // The state after the Stop, whatever its answer.
            if case .ok(let state) = await current.read(registration) {
                journal.streams[index].state = state
                if state.state != "live" {
                    journal.streams[index].final = state.state
                    again = false
                }
            } else {
                again = false
            }
            guard save(), again else { return }
        }
    }

    // MARK: - Status

    private func counts(_ a: Active) -> CaptureLinkStatus {
        var result = status
        let jobs = journal.streams[a.index].jobs
        func records(_ states: Set<String>) -> Int {
            jobs.filter { states.contains($0.status) }.reduce(0) { $0 + $1.callbacks.count }
        }
        result.stored = records(["committed"])
        result.awaiting = records(["sending"])
        result.unknown = records(["unknown"])
        result.refused = records(["refused", "unsendable"])
        result.notSent = max(0, a.kept - journal.streams[a.index].planned.count) + records(["not_sent"])
        result.earlierUnknown = journal.streams.indices.filter { $0 != a.index && journal.streams[$0].open }.count
        return result
    }

    private func publishCounts(_ a: Active) {
        var next = counts(a)
        // Once the capture gate has closed, the link is no longer shown as up.
        if next.state == .storing, !a.gate.isOpen {
            next.state = .stopping
            next.detail = "nothing new is sent"
        }
        status = next
        onStatus?(next)
    }

    private func publish(_ state: CaptureLinkStatus.State, detail: String?) {
        var next = active.map { counts($0) } ?? status
        next.state = state
        next.detail = detail
        if active == nil {
            next.earlierUnknown = journal.streams.filter(\.open).count
        }
        status = next
        onStatus?(next)
    }

    private func note(_ index: Int, _ text: String) {
        guard journal.streams.indices.contains(index) else { return }
        journal.streams[index].notes.append(text)
    }

    // MARK: - Journal

    /// Writes the whole record: owner-only, complete and flushed before it replaces the old one. A
    /// failure is sticky: nothing more is sent in this run, the Stop is not sent unwritten, the old
    /// record stays, earlier outcomes stay shown, and local capture continues.
    /// With `quiet`, a failure is not published here: the caller first corrects what it had
    /// counted on this write, then publishes once.
    @discardableResult
    private func save(quiet: Bool = false) -> Bool {
        guard fault == nil else { return false }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard (try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                         attributes: [.posixPermissions: 0o700])) != nil,
              let data = try? encoder.encode(journal),
              Self.writeComplete(data, to: directory.appending(path: "journal.json")) else {
            failed("the capture link record could not be written; nothing more is sent", quiet: quiet)
            return false
        }
        return true
    }

    /// The sticky fault: sending ends, the counts so far stay shown.
    private func failed(_ reason: String, quiet: Bool = false) {
        guard fault == nil else { return }
        fault = reason
        active?.live = false
        if quiet {
            status.state = .notConnected
            status.detail = reason
        } else {
            publish(.notConnected, detail: reason)
        }
    }

    /// A batch's exact bytes, written once; an existing different file is left as it is.
    private func writeBody(_ body: Data, to file: String) -> Bool {
        let url = directory.appending(path: file)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true,
                                                    attributes: [.posixPermissions: 0o700])
        } catch {
            return false
        }
        if RetainedOriginal.entryType(url) != nil {
            return (try? Data(contentsOf: url)) == body
        }
        return Self.writeComplete(body, to: url)
    }

    /// Writes all of `data` to a new owner-only file beside `url`, flushes it, then renames it over
    /// `url`. A failed, short or stalled write removes the new file and leaves `url` as it was.
    /// `write` is the system call, injectable for tests.
    static func writeComplete(_ data: Data, to url: URL,
                              write: (Int32, UnsafeRawPointer, Int) -> Int = systemWrite) -> Bool {
        let temporary = url.deletingLastPathComponent().appending(path: ".write-\(UUID().uuidString)")
        let path = temporary.path(percentEncoded: false)
        let descriptor = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { return false }
        var complete = data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) -> Bool in
            guard let base = buffer.baseAddress else { return data.isEmpty }
            var offset = 0
            while offset < buffer.count {
                let written = write(descriptor, base + offset, buffer.count - offset)
                if written < 0, errno == EINTR { continue }
                // An error or no progress: nothing is replaced.
                guard written > 0 else { return false }
                offset += written
            }
            return true
        }
        complete = complete && flush(descriptor)
        complete = close(descriptor) == 0 && complete
        guard complete, rename(path, url.path(percentEncoded: false)) == 0 else {
            unlink(path)
            return false
        }
        // The rename itself is made durable too.
        let parent = open(url.deletingLastPathComponent().path(percentEncoded: false), O_RDONLY | O_CLOEXEC)
        guard parent >= 0 else { return false }
        let durable = flush(parent)
        return close(parent) == 0 && durable
    }

    /// To stable storage: on Darwin, `fsync` alone leaves data in the drive's cache.
    static func flush(_ descriptor: Int32) -> Bool {
        #if canImport(Darwin)
        return fcntl(descriptor, F_FULLFSYNC) == 0 || fsync(descriptor) == 0
        #else
        return fsync(descriptor) == 0
        #endif
    }

    // MARK: - Helpers

    static func systemWrite(_ descriptor: Int32, _ bytes: UnsafeRawPointer, _ count: Int) -> Int {
        write(descriptor, bytes, count)
    }

    static func randomHex(_ bytes: Int) -> String {
        var generator = SystemRandomNumberGenerator()
        var text = ""
        for _ in 0..<bytes {
            let byte = UInt8.random(in: 0...255, using: &generator)
            text += String(format: "%02x", byte)
        }
        return text
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Whether `task` finished within the bound.
    static func bounded(_ task: Task<Void, Never>, nanoseconds: UInt64) async -> Bool {
        let done = OneShot<Bool>()
        Task {
            await task.value
            done.resolve(true)
        }
        Task {
            try? await Task.sleep(nanoseconds: nanoseconds)
            done.resolve(false)
        }
        return await done.wait()
    }
}
