import Foundation

// One bounded live companion session with the user's ChatGPT subscription, through this app's own
// connector child (ADR 0004, `lc-subscription-live/1`). The connector and Codex own the official
// login, the session's enforcement and the model call; this link owns what leaves this Mac, what
// is kept here, and what may be shown.
//
// - Nothing is sent before the user's explicit Start of the AI for the display being captured.
//   Start says what it does: ChatGPT is given pictures of that whole display, within the bounds
//   the user set. A session ends by Stop, the capture's end, its own time, or a failure; it is
//   never renewed or started again by this app.
// - Every picture is the whole kept frame, with the ink that could be drawn over it. A selection
//   is a focus inside that picture, never a crop of it.
// - An unattended look goes at most once in the session's interval, only when nothing else is
//   out, and never from the requests kept for the user's own. Its answer is context for later
//   requests; it is never put on a card.
// - Finishing a selection sends it as a focus at once, for a small hint, with no question and no
//   second press. Typed words are an optional follow-up on the same card.
// - An answer is put on its card only while that card still waits for exactly that request, the
//   session still runs, and its provenance equals the request in full. Cancel, a new selection,
//   Stop and Quit fence a request in the same step, and take it back if it has not reached the
//   connector whole (`AskRevocation`).
// - A request that may have reached the service uses one of the session's requests and is never
//   sent again. A refusal that may be the account's or the service's ends the session.
// - Each request is kept beside the originals before it is sent, and its outcome after it.
// No credential, login URL or connector message is logged; refusals are fixed words.

/// What the connection, the session and the current card show.
public struct LiveStatus: Equatable, Sendable {
    public var connection: AskStatus.Connection
    /// Fixed words.
    public var detail: String?
    public var plan: String?
    /// The account's usage as last read, and when (UTC). Nil when it was not read.
    public var quota: LiveQuota?
    public var quotaReadAt: String?
    public var models: [AskConnection.Model]
    /// A sign-in was started and has not completed or been cancelled. Its URL is never part of
    /// the status.
    public var loginPending = false
    public var session = LiveSessionInfo(state: .off(nil))
    public var card: LiveCard?

    public init(connection: AskStatus.Connection, detail: String? = nil) {
        self.connection = connection
        self.detail = detail
        self.models = []
    }

    /// The models a session can be started with, the default first.
    public var usableModels: [AskConnection.Model] {
        models.filter(LiveWire.isUsableModel).sorted { $0.isDefault && !$1.isDefault }
    }

    /// The connection in fixed words (the same as for a single question).
    public var summaryLine: String {
        var status = AskStatus(connection: connection)
        status.plan = plan
        return status.summaryLine
    }

    /// Why the AI cannot be started now, or nil.
    public var startProblem: String? {
        switch connection {
        case .notConfigured: return "the ChatGPT connector is not set up on this Mac"
        case .signedIn: break
        default: return "check the connection and sign in first"
        }
        if loginPending { return "a sign-in is pending" }
        if usableModels.isEmpty { return "no model that takes pictures is listed" }
        return nil
    }
}

/// The card of one confirmed selection: what the AI was asked about it, and what it answered.
public struct LiveCard: Equatable, Sendable {
    public enum Phase: String, Equatable, Sendable {
        /// The selection is kept, and nothing is out for it.
        case idle
        /// A request about it is on its way.
        case asking
        case answered
        /// The last request got no answer.
        case refused
        case cancelled
    }

    /// Where the user's focus was in the request the card shows.
    public enum Focus: String, Equatable, Sendable {
        case onThisPicture
        case onAnEarlierPicture
        case none
    }

    public var cardID: String
    public var selectionID: String
    public var captureSessionID: String
    public var phase: Phase
    /// Fixed words.
    public var detail: String?
    /// The request the card shows: its ID, the user's words (nil for the selection alone), the
    /// help asked for, when it was asked (UTC), and where the focus was.
    public var requestID: String?
    public var question: String?
    public var assistance: LiveAssistance?
    public var askedAt: String?
    public var focus: Focus = .none
    /// The retained frame the request's picture is, and whether the ink is in it.
    public var frameFile: String?
    public var ink: PreparedSelection.Ink?
    public var answer: String?
    public var model: String?
    public var latencyMS: Int?
    /// Local display authority; never serialized to the connector or original source records.
    public var presentation: LiveAnswerPresentation? = nil

    /// What the request was, in fixed words.
    public var askedLine: String? {
        guard let askedAt else { return nil }
        let about = "the whole display as kept in \(frameFile ?? "a frame")"
        let inkWords: String
        switch ink {
        case .drawn?: inkWords = " with your ink drawn over it"
        case .noneVisible?: inkWords = ""
        default: inkWords = " (whether it shows your ink is not known)"
        }
        let focusWords: String
        switch focus {
        case .onThisPicture: focusWords = ", with your selection as the focus"
        case .onAnEarlierPicture: focusWords = ". The screen had changed since your selection: ChatGPT was told where it was, without its pixels"
        case .none: focusWords = ". Your selection was not part of this request"
        }
        let help: String
        switch assistance {
        case .explain?: help = "an explanation"
        case .fullSolution?: help = "the full solution"
        default: help = "a small hint"
        }
        return "Asked at \(askedAt) for \(help): \(about)\(inkWords)\(focusWords)." + (question.map { " Your words: \($0)" } ?? "")
    }

    /// The card's state in fixed words.
    public var summaryLine: String {
        switch phase {
        case .idle: return "Kept on this Mac."
        case .asking: return "Waiting for the response…"
        case .answered: return "From ChatGPT" + (model.map { " (\($0))" } ?? "") + (latencyMS.map { " in \($0 / 1000) s" } ?? "")
            + " · generated text, apart from your screen and ink. It can be wrong."
        case .refused: return "No answer."
        case .cancelled: return "Cancelled: no answer is shown."
        }
    }
}

public actor LiveLink {
    public typealias StatusHandler = @Sendable (LiveStatus) -> Void

    private enum Event: Sendable {
        case line(Data)
        case exit
    }

    /// One request on its way.
    private struct Out {
        let turn: LiveTurn
        let line: AskRevocation
        let directory: URL
        let cardID: String?
        let source: LiveFrameInput
        /// Fenced: its answer is never shown. With the reason, in fixed words.
        var fenced: String?
        var interrupted = false
    }

    /// What became of one request.
    private enum Outcome {
        case answered(LiveAnswer)
        case refused(LiveError)
        /// Not kept beside the originals, or no connector to give it to: nothing was sent.
        case notKept
        /// The line never reached the connector whole: nothing was sent.
        case notDelivered
        /// Delivered, and no answer came in time or the connector ended.
        case noAnswer
        /// A result came that is not this request's.
        case unbound
    }

    /// One request after it was sent: what became of it, and why the session is over with it.
    private struct Sent {
        let outcome: Outcome
        let ends: String?
    }

    private struct Card {
        let id: String
        let selectionID: String
        let captureSessionID: String
        let directory: URL
        /// The selection's own frame and ink, and its region in display-local points.
        let input: LiveFrameInput
        let rect: RecordedRect
        /// Why the region cannot be found in that frame's pixels, or nil.
        let unlocated: String?
        /// The answered request that carried the selection as a focus, and the session it was in.
        var origin: LiveTurn?
        var originSession: String?
        var requests = 0
        var requestID: String?
        var presentationGate: LiveGate?
        var answerSource: LiveFrameInput?
    }

    private let config: Result<AskConnectorConfig, CaptureHostProblem>
    private let launcher: any AskChildLauncher
    /// How long a connection or control call, and a request, may wait for its answer (engineering
    /// defaults; the connector gives a request 120 s after its own checks).
    private let callTimeout: TimeInterval
    private let turnTimeout: TimeInterval
    private let changeInterval: TimeInterval
    private let clock: @Sendable () -> Double
    private let makePicture: @Sendable (LiveFrameInput) -> Result<LiveRendered, MappingRefusal>
    private var status: LiveStatus
    private var onStatus: StatusHandler?

    // The connector child: the same rules as for a single question (`AskLink`).
    private var child: (any AskChild)?
    private var launch = 0
    private var retiring: [any AskChild] = []
    private var closed = false
    private var reader: Task<Void, Never>?
    private var nextCall = 1
    private var waiting: [String: OneShot<LiveWire.Incoming?>] = [:]
    private var login: (id: String, url: URL)?
    private var loginStarting = false
    private var earlyCompletions: [[String: Any]] = []
    private var reading = false
    private var readAgain = false
    private var lastChangeRead = Date.distantPast
    private var changeReadPending = false
    /// A request line that was taken back, to say why a connector ended.
    private var takenBack: AskRevocation?

    // The session.
    private var session: LiveSession?
    private var sessionDirectory: URL?
    private var sessionCaptureGate: LiveGate?
    private var sessionDispatchGate: LiveGate?
    private var starting: String?
    /// Stop, Quit or the capture's end came while the Start was on its way.
    private var startFenced = false
    private var out: [String: Out] = [:]
    private var card: Card?
    private var lookTimer = false
    /// Capture sessions that stopped: no session is started for them.
    private var stopped: Set<String> = []
    private let presentationOwner = UUID()

    public init(config: Result<AskConnectorConfig, CaptureHostProblem>,
                launcher: any AskChildLauncher = ProcessAskLauncher(maxIncomingLine: LiveWire.maxIncomingLine),
                callTimeout: TimeInterval = 30, turnTimeout: TimeInterval = 180, changeInterval: TimeInterval = 1,
                clock: @escaping @Sendable () -> Double = { HostClock.now() },
                makePicture: @escaping @Sendable (LiveFrameInput) -> Result<LiveRendered, MappingRefusal> = { LiveFrameBuilder.render($0) }) {
        self.config = config
        self.launcher = launcher
        self.callTimeout = callTimeout
        self.turnTimeout = turnTimeout
        self.changeInterval = changeInterval
        self.clock = clock
        self.makePicture = makePicture
        switch config {
        case .failure(.notConfigured): status = LiveStatus(connection: .notConfigured)
        case .failure(.invalid(let reason)): status = LiveStatus(connection: .unavailable, detail: reason)
        case .success: status = LiveStatus(connection: .disconnected)
        }
    }

    public func setStatusHandler(_ handler: @escaping StatusHandler) {
        onStatus = handler
        handler(status)
    }

    public func currentStatus() -> LiveStatus {
        status
    }

    // MARK: - Connection

    /// The user's Connect or Check Again: starts the connector if it is not running and reads the
    /// connection and the account's usage. Sends no picture, starts no sign-in and no session.
    ///
    /// A running connector whose last read gave no connection is ended and started again, as for a
    /// single question; never while a session runs or a request is out.
    public func connect() async {
        guard !closed else { return }
        if let running = child, !running.hasExited, [.refused, .unknown].contains(status.connection),
           out.isEmpty, session?.isRunning != true, starting == nil, !loginStarting, !reading {
            child = nil
            login = nil
            status.loginPending = false
            status.connection = .connecting
            status.detail = nil
            publish()
            resolveWaiting()
            await retire(running)
        }
        // A connector that is still ending has ended before the next one starts.
        await retired()
        guard await ensureChild() else { return }
        await readConnection()
    }

    private func retire(_ ending: any AskChild) async {
        if !retiring.contains(where: { $0 === ending }) { retiring.append(ending) }
        await ending.end()
        retiring.removeAll { $0 === ending }
    }

    private func retired() async {
        while let ending = retiring.first {
            await ending.end()
            retiring.removeAll { $0 === ending }
        }
    }

    private func resolveWaiting() {
        let pending = waiting
        waiting = [:]
        pending.values.forEach { $0.resolve(nil) }
    }

    private func ensureChild() async -> Bool {
        guard case .success(let config) = config, !closed else { return false }
        if let child, !child.hasExited { return true }
        status.connection = .connecting
        status.detail = nil
        publish()
        let (stream, continuation) = AsyncStream<Event>.makeStream()
        guard let launched = launcher.launch(config, onLine: { continuation.yield(.line($0)) },
                                             onExit: { continuation.yield(.exit); continuation.finish() }) else {
            continuation.finish()
            status.connection = .disconnected
            status.detail = "the connector could not be started"
            publish()
            return false
        }
        child = launched
        takenBack = nil
        launch += 1
        let serial = launch
        // One reader, so lines are handled in the order the child wrote them.
        reader = Task { [weak self] in
            for await event in stream {
                await self?.received(event, from: serial)
            }
        }
        return true
    }

    /// Reads the connection. One read at a time; a change during it makes it read once more. A
    /// read never starts, ends or resumes a session.
    private func readConnection() async {
        guard !reading else {
            readAgain = true
            return
        }
        reading = true
        defer { reading = false }
        while true {
            readAgain = false
            guard let asked = child else { return }
            let reply = await call("connection/read", .object([:]), timeout: callTimeout)
            guard let child, child === asked else {
                // A connector that cannot start answers its first line with "unavailable" and ends.
                if self.child == nil, case .error(_, let error)? = reply, error.code == "unavailable" { describe(reply) }
                return
            }
            if readAgain { continue }
            describe(reply)
            return
        }
    }

    private func describe(_ reply: LiveWire.Incoming?) {
        switch reply {
        case .result(_, let result)?:
            guard let connection = LiveConnection.parse(result) else {
                status.connection = .unknown
                status.detail = "the connector's answer was not understood"
                publish()
                return
            }
            status.plan = connection.plan
            status.quota = connection.quota
            status.quotaReadAt = LiveWire.utc(Date())
            status.models = connection.models
            status.detail = nil
            switch connection.auth {
            case .signedIn: status.connection = .signedIn
            case .signedOut: status.connection = .signedOut
            case .otherMode:
                status.connection = .otherMode
                status.detail = "Codex is signed in another way; this product uses only the ChatGPT subscription sign-in"
            case .unknown: status.connection = .unknown
            }
        case .error(_, let error)? where error.code == "busy" && session?.isRunning == true:
            // The session goes on; only this read was not made.
            status.detail = "the connector was busy, so the connection and usage were not read again"
        case .error(_, let error)?:
            status.connection = error.code == "unavailable" ? .refused : .unknown
            status.detail = error.code == "unavailable" ? "the connector is unavailable"
                : "the connector could not report the connection; Check Again starts it again"
        default:
            status.connection = .unknown
            status.detail = "the connector did not answer"
        }
        publish()
    }

    /// Starts the official managed sign-in and returns its page, to be opened in the browser by the
    /// user's own click. Only one is started; it starts no connector. The connector refuses it
    /// while a session runs.
    public func startLogin() async -> URL? {
        if let pending = login { return pending.url }
        guard !loginStarting else { return nil }
        guard let running = child, !running.hasExited else { return nil }
        loginStarting = true
        earlyCompletions = []
        defer {
            loginStarting = false
            earlyCompletions = []
        }
        let reply = await call("connection/login/start", .object([:]), timeout: callTimeout)
        guard let current = child, current === running, !current.hasExited else { return nil }
        guard case .result(_, let result)? = reply, Set(result.keys) == ["login_id", "auth_url"],
              let id = result["login_id"] as? String, AskWire.isIdentifier(id),
              let url = AskWire.loginURL(result["auth_url"] as? String) else {
            if case .error(_, let error)? = reply {
                await unconfirmed("the sign-in could not be started"
                    + (error.code == "busy" ? ": the connector is busy with a session, a request or another sign-in" : ""))
            } else {
                status.detail = "the sign-in could not be started, or its page is not an official ChatGPT address"
                publish()
            }
            return nil
        }
        login = (id, url)
        status.loginPending = true
        status.detail = "sign in on the official page in your browser; this app never sees your password or token"
        publish()
        let early = earlyCompletions
        earlyCompletions = []
        early.forEach { handle("connection/login/completed", $0) }
        return login == nil ? nil : url
    }

    public func pendingLoginURL() -> URL? {
        login?.url
    }

    /// Cancels only this product's pending sign-in. Nothing else is signed out.
    public func cancelLogin() async {
        guard let pending = login else { return }
        login = nil
        status.loginPending = false
        status.detail = "the sign-in was cancelled"
        publish()
        let reply = await call("connection/login/cancel", .object(["login_id": .string(pending.id)]), timeout: callTimeout)
        if case .result(_, let result)? = reply, result.isEmpty { return }
        await unconfirmed("the connector did not confirm that the sign-in was cancelled")
    }

    private func unconfirmed(_ words: String) async {
        await readConnection()
        guard ![.refused, .unknown].contains(status.connection) else { return }
        status.detail = words
        publish()
    }

    // MARK: - The session

    /// The user's Start of the AI for the capture `captureSessionID`, kept in `captureSession`:
    /// one session with exactly the bounds `policy`, on `model` (a listed model that takes
    /// pictures; nil takes the default). Nothing is clamped, and nothing is started when the bounds
    /// are not valid, the account is not signed in, or a session already runs. A session whose
    /// requests are all used is ended first: this is the user's own new Start.
    public func startSession(policy: LivePolicy, captureSession: URL, captureSessionID: String, model: String? = nil,
                             captureGate: LiveGate? = nil, dispatchGate: LiveGate? = nil) async {
        guard !closed, starting == nil, session?.isRunning != true || session?.isUsedUp == true else { return }
        status.card?.presentation?.revoke()
        func refuse(_ reason: String) {
            if session?.isRunning == true {
                status.detail = "the AI was not started again: " + reason
            } else {
                status.session = LiveSessionInfo(state: .off(reason))
            }
            publish()
        }
        if let problem = policy.problem { return refuse(problem) }
        if dispatchGate?.isOpen == false { return refuse("this Start was stopped before it began") }
        if captureGate?.isOpen == false { return refuse("this capture has stopped") }
        guard !stopped.contains(captureSessionID), AskWire.isIdentifier(captureSessionID) else {
            return refuse("this capture has stopped")
        }
        if let problem = status.startProblem { return refuse(problem) }
        guard let running = child, !running.hasExited else { return refuse("the connector is not running; Connect first") }
        let listed = status.usableModels
        guard let chosen = model.map({ id in listed.first { $0.id == id } }) ?? listed.first else {
            return refuse("no such model is listed as taking pictures")
        }
        let id = "live-" + CaptureLink.randomHex(8)
        let directory = captureSession.appending(path: "live", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        starting = id
        startFenced = false
        if session?.isRunning == true {
            await endSession("all of its requests were used, and you started the AI again")
        }
        session = nil
        status.session = LiveSessionInfo(state: .starting)
        publish()
        let began = clock()
        let params: JSONValue = .object([
            "session_id": .string(id), "capture_session_id": .string(captureSessionID), "epoch": .integer(LiveSession.epoch),
            "model": .string(chosen.id), "policy": policy.json,
            // Only the screen. Speaking to the AI and the sound of the lesson are not connected.
            "permissions": .object(["screen": .bool(true), "microphone": .bool(false), "system_audio": .bool(false)]),
        ])
        let reply = await call("companion/start", params, timeout: callTimeout)
        var record: [String: JSONValue] = [
            "format": .string("lc-macos-live-session/v1"), "session_id": .string(id), "capture_session_id": .string(captureSessionID),
            "model": .string(chosen.id), "policy": policy.json,
        ]
        defer { _ = AskFiles.writeNew(.object(record), to: directory.appending(path: id + ".session.json")) }
        // Stop, Quit or the capture's end came while it was starting: it is never used.
        let fenced = startFenced || closed || stopped.contains(captureSessionID)
            || dispatchGate?.isOpen == false || captureGate?.isOpen == false
        starting = nil
        startFenced = false
        guard case .result(_, let result)? = reply,
              let granted = LiveWire.started(result, sessionID: id, epoch: LiveSession.epoch, policy: policy), !fenced else {
            if case .error(_, let error)? = reply {
                record["outcome"] = .string("refused")
                record["code"] = .string(error.code)
                refuse(error.code == "busy" ? "the connector is busy with a sign-in or an earlier session" : error.words)
                // A refusal that may be the account's own is read again.
                if error.code == "unauthenticated" { await readConnection() }
                return
            }
            // It may have started there: it is stopped, and never used.
            record["outcome"] = .string(fenced ? "stopped_while_starting" : "not_understood")
            if let running = self.child, !running.hasExited {
                _ = await call("companion/stop", .object(["session_id": .string(id), "epoch": .integer(LiveSession.epoch)]),
                               timeout: callTimeout)
            }
            return refuse(fenced ? "it was stopped while it was starting" : "the connector did not confirm the start")
        }
        record["outcome"] = .string("started")
        record["remaining_submissions"] = .integer(granted.remaining)
        record["expires_in_ms"] = .integer(granted.expiresInMS)
        // The time runs from when Start was asked: never longer than the connector's own count.
        session = LiveSession(id: id, captureSessionID: captureSessionID, model: chosen.id, policy: policy,
                              remaining: granted.remaining, expiresHost: began + Double(granted.expiresInMS) / 1_000)
        sessionDirectory = directory
        sessionCaptureGate = captureGate
        sessionDispatchGate = dispatchGate
        publishSession()
        let wait = max(0, began + Double(granted.expiresInMS) / 1_000 - clock())
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            await self?.expired(id)
        }
    }

    private func expired(_ id: String) async {
        guard session?.id == id else { return }
        await endSession("this session's time is over")
    }

    /// The user's Stop of the AI: the capture goes on, and nothing more is sent.
    public func stopSession() async {
        if starting != nil {
            // The Start's own answer is still on its way: it is stopped when it comes.
            startFenced = true
            status.session = LiveSessionInfo(state: .off("stopped by you"))
            publish()
        }
        await endSession("stopped by you")
    }

    /// The capture `captureSessionID` stopped: its session ends, and none is started for it again.
    public func captureStopped(_ captureSessionID: String) async {
        stopped.insert(captureSessionID)
        if session?.captureSessionID == captureSessionID {
            await endSession("the capture was stopped")
        }
        if card?.captureSessionID == captureSessionID, status.card?.phase == .idle {
            status.card?.detail = "This capture has stopped; nothing more can be asked from it."
            publish()
        }
    }

    /// Ends the session, once: every request on its way is fenced and, if it has not reached the
    /// connector whole, taken back; the connector is told to stop; nothing is sent afterwards.
    private func endSession(_ reason: String, timeout: TimeInterval? = nil) async {
        guard session?.isRunning == true else { return }
        if let permit = status.card?.presentation, permit.shownAt != nil {
            answerShown(permit.requestID, presentation: permit)
        }
        guard var ending = session else { return }
        sessionDispatchGate?.close(reason)
        status.card?.presentation?.revoke()
        ending.end(reason)
        session = ending
        for id in out.keys {
            fence(id, reason: "the AI session ended (\(reason))")
        }
        publishSession()
        var stopWords = "not asked: the connector was not running"
        if let running = child, !running.hasExited {
            let reply = await call("companion/stop", .object(["session_id": .string(ending.id), "epoch": .integer(LiveSession.epoch)]),
                                   timeout: timeout ?? callTimeout)
            if case .result(_, let result)? = reply, let control = LiveWire.control(result), !control.uncertain {
                stopWords = control.cancelled ? "confirmed; a request was cancelled" : "confirmed"
            } else {
                stopWords = "not confirmed by the connector"
                if session?.id == ending.id {
                    status.detail = "the connector did not confirm that the AI session stopped; this app sends nothing more in it"
                    publish()
                }
            }
        }
        if let directory = sessionDirectory {
            _ = AskFiles.writeNew(.object([
                "format": .string("lc-macos-live-session-end/v1"), "session_id": .string(ending.id), "reason": .string(reason),
                // Counted when this was written; a request still out is counted by its own outcome.
                "requests_used": .integer(session?.id == ending.id ? session?.used ?? ending.used : ending.used),
                "requests_still_out": .integer(out.values.filter { $0.turn.sessionID == ending.id }.count),
                "pictures_numbered": .integer(ending.frames), "stop": .string(stopWords),
            ]), to: directory.appending(path: ending.id + ".end.json"))
        }
    }

    // MARK: - Unattended looks

    /// A newly kept frame, or new ink over the newest one, while the AI observes this capture: it
    /// waits to be looked at, replacing an older frame still waiting. Nothing is sent from a
    /// capture other than the session's own.
    public func offer(_ input: LiveFrameInput) async {
        guard take(input) else { return }
        await pump()
    }

    /// The app has new pixels or ink and no current picture of them (the newest pixels were not
    /// kept): said on the session line, so the AI is not shown as observing what it is not given.
    public func noPicture(_ reason: String) {
        guard var current = session, current.isRunning else { return }
        if current.recordSourceLoss(reason, at: LiveWire.utc(Date())) {
            if let directory = sessionDirectory {
                _ = AskFiles.writeNew(.object(["format": .string("lc-macos-live-source-loss/v1"),
                    "session_id": .string(current.id), "noticed_at": .string(LiveWire.utc(Date())),
                    "reason": .string(reason), "what": .string("local source-state loss; no current pixels claimed")]),
                    to: directory.appending(path: "\(current.id).source-loss-\(current.history.count).json"))
            }
        }
        current.pictureUnavailable(reason)
        session = current
        // A completed line may already be a useful historical observation. Only withdraw a line
        // that has not reached the connector whole; the writer keeps its partial-line fence.
        for (id, request) in out where request.turn.trigger == .observation || request.source.currentSourceProblem != nil {
            if request.turn.presents, request.source.currentSourceProblem != nil {
                fence(id, reason: reason)
                Task { await self.interrupt(id) }
            } else if request.line.revoke() { fence(id, reason: reason) }
        }
        if card?.answerSource?.currentSourceProblem != nil { status.card?.presentation?.revoke() }
        publishSession()
    }

    /// As `offer`, without waiting for a look it starts: for the app's ordered stream of frames,
    /// so each is numbered when it comes and only the newest one waits.
    public func enqueue(_ input: LiveFrameInput) {
        guard take(input) else { return }
        Task { await self.pump() }
    }

    /// A frame from an earlier local Start is refused without declaring a source loss in the
    /// replacement session. An input cannot substitute its own open gate for the session's gate.
    private func dispatchAuthorityMatches(_ input: LiveFrameInput) -> Bool {
        guard sessionDispatchGate?.isOpen != false, input.dispatchGate?.isOpen != false else { return false }
        if let supplied = input.dispatchGate, let active = sessionDispatchGate, supplied !== active { return false }
        return true
    }

    private func take(_ input: LiveFrameInput) -> Bool {
        guard var current = session, current.isRunning, current.captureSessionID == input.captureSessionID else { return false }
        guard dispatchAuthorityMatches(input) else { return false }
        if let problem = input.dispatchProblem {
            if let loss = Freshness.sourceLossProblem(problem) { noPicture(loss) }
            return false
        }
        current.offer(input)
        session = current
        publishSession()
        return true
    }

    /// Sends the waiting frame as an unattended look when the session's rules allow it now.
    private func pump() async {
        guard var current = session, !closed, sessionDispatchGate?.isOpen != false,
              status.card?.phase != .asking else { return }
        let now = clock()
        guard let next = current.nextLook(nowHost: now) else {
            session = current
            publishSession()
            // Waiting only for the interval: looked at again when it has passed.
            if let at = current.nextLookHost, at > now, current.out == 0, !lookTimer {
                lookTimer = true
                let wait = at - now
                Task { [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(max(wait, 0) * 1_000_000_000))
                    await self?.lookDue()
                }
            }
            return
        }
        // Counted as out before the picture is made, so nothing else is sent meanwhile.
        current.out += 1
        session = current
        publishSession()
        let id = current.id
        let makePicture = self.makePicture
        let rendered = await Task.detached(priority: .utility) { makePicture(next.input) }.value
        guard var session = self.session, session.id == id else { return }
        func missed(_ reason: String, _ gap: LiveGap.Reason) {
            session.out -= 1
            session.missed = reason
            session.gap(next.seq, gap)
            self.session = session
            publishSession()
        }
        guard session.isRunning else { return missed("the session ended", .notObserved) }
        guard dispatchAuthorityMatches(next.input) else { return missed("the AI session authority ended", .notObserved) }
        guard session.canObserve(next.seq) else {
            return missed(session.missed ?? "an explicit request took priority over this look", .notObserved)
        }
        if let problem = next.input.dispatchProblem {
            missed(problem, .notObserved)
            if let loss = Freshness.sourceLossProblem(problem) {
                noPicture(loss)
                return
            }
            // A healthy newer frame may already be waiting behind this obsolete render.
            return await pump()
        }
        guard case .success(let made) = rendered else {
            if case .failure(let refusal) = rendered { missed(refusal.reason, .notObserved) }
            return await pump()
        }
        // The very picture the model was given last, and looked at or answered: nothing is new,
        // so no request is used on it.
        if session.hasSeen(made.picture) {
            session.out -= 1
            session.missed = nil
            session.gap(next.seq, .coalesced)
            self.session = session
            publishSession()
            return await pump()
        }
        let context = session.context(for: next.seq)
        let turn = LiveTurn(requestID: "\(id).look.\(next.seq)", sessionID: id, epoch: LiveSession.epoch,
                            permissionRevision: LiveSession.permissionRevision, trigger: .observation, assistance: .none,
                            presents: false, userText: nil, picture: made.picture, frameSeq: next.seq, focus: nil,
                            history: context.history, gaps: context.gaps)
        if let problem = turn.problem {
            missed(problem, .notObserved)
            return await pump()
        }
        self.session = session
        let sent = await send(turn, made: made, source: next.input, cardID: nil, alreadyCounted: true)
        guard var after = self.session, after.id == id else { return }
        switch sent.outcome {
        case .answered(let answer):
            // Kept as context only: an unattended look is never shown as help.
            after.looked(turn, text: answer.text, at: LiveWire.utc(Date()))
        case .refused(let error):
            if after.canObserve(next.seq) { after.missed = error.words }
            if error.code == "budget_reached", error.submission == .notSubmitted {
                after.pauseLooks("the connector keeps the requests left in this session for your own selections and questions")
                after.gap(next.seq, .budget)
            } else {
                after.gap(next.seq, ["busy", "stale_context"].contains(error.code) ? .backpressure : .notObserved)
            }
        case .notKept, .notDelivered, .noAnswer, .unbound:
            if after.canObserve(next.seq) { after.missed = "the look was not completed" }
            after.gap(next.seq, .notObserved)
        }
        self.session = after
        publishSession()
        await conclude(sent)
        await pump()
    }

    private func lookDue() async {
        lookTimer = false
        await pump()
    }

    // MARK: - The card

    /// A confirmed selection: its card opens and, when the AI observes this capture, it is sent at
    /// once as the user's focus in the whole picture, for a small hint. No question and no second
    /// press are needed. A request of the card before it is fenced first, in the same step.
    /// `input` is the frame the selection was pinned to, with the ink visible when it was drawn;
    /// `rect` is the region in display-local points. Without a usable connector there is no card.
    /// `unlocated` says why the region cannot be found in that frame's pixels (the display changed,
    /// or the frame was older than what was on screen): such a selection is kept and never sent as
    /// a focus, and words about it go with the newest picture alone.
    public func selected(_ input: LiveFrameInput, rect: RecordedRect, selectionID: String, unlocated: String? = nil,
                         presentationGate: LiveGate? = nil) async {
        guard case .success = config, !closed else { return }
        dropCard(reason: "a new selection was made")
        let id = "focus-" + selectionID + "-" + CaptureLink.randomHex(4)
        let directory = input.captureSession.appending(path: "live", directoryHint: .isDirectory)
        card = Card(id: id, selectionID: selectionID, captureSessionID: input.captureSessionID, directory: directory,
                    input: input, rect: rect, unlocated: unlocated, presentationGate: presentationGate)
        status.card = LiveCard(cardID: id, selectionID: selectionID, captureSessionID: input.captureSessionID, phase: .idle,
                               frameFile: input.frame.file)
        publish()
        await ask(cardID: id, words: nil, assistance: .hint, fresh: nil)
    }

    /// The user's typed words about the card's selection, with the help they chose. `fresh` is the
    /// current picture: the newest kept frame with the ink as it is now, or nil when there is none
    /// (the newest pixels were not kept). On the unchanged picture the selection stays the focus;
    /// after the screen changed the request carries the new picture, and says where the selection
    /// was without its pixels. A selection the model was not given yet goes with its own picture.
    public func followUp(_ words: String, assistance: LiveAssistance, fresh: LiveFrameInput?,
                         presentationGate: LiveGate? = nil) async {
        guard let card, status.card?.phase != .asking else { return }
        self.card?.presentationGate = presentationGate
        await ask(cardID: card.id, words: words, assistance: assistance, fresh: fresh)
    }

    private func ask(cardID: String, words: String?, assistance: LiveAssistance, fresh: LiveFrameInput?) async {
        guard let card, card.id == cardID else { return }
        status.card?.presentation?.revoke()
        if status.card?.presentation?.shownAt == nil {
            status.card?.answer = nil
            status.card?.presentation = nil
        }
        func idle(_ detail: String) {
            guard self.card?.id == cardID else { return }
            let phase: LiveCard.Phase = status.card?.answer == nil ? .idle : .answered
            status.card?.phase = phase
            status.card?.detail = detail
            publish()
        }
        let notAsked = words == nil ? "Kept on this Mac. The AI was not asked: " : "Not sent: "
        guard let current = session, current.isRunning, sessionDispatchGate?.isOpen != false,
              current.captureSessionID == card.captureSessionID else {
            let reason = starting != nil ? "the AI is being started"
                : session.map { $0.captureSessionID == card.captureSessionID ? "the AI session has ended; start it again"
                    : "the AI observes another capture" } ?? "the AI is not started for this display"
            return idle(notAsked + reason + ".")
        }
        guard !current.isUsedUp else {
            return idle(notAsked + "all of this AI session's requests are used; start the AI again.")
        }
        // A selection that cannot be found in its picture is never sent as a focus.
        if words == nil, let unlocated = card.unlocated {
            return idle("Kept on this Mac. The AI was not asked: " + unlocated + ".")
        }
        let id = current.id
        // Shown as on its way before the picture is made, so a second press does nothing.
        status.card?.phase = .asking
        status.card?.detail = nil
        publish()
        // End the earlier request before preparing this one. Rendering also owns an out slot:
        // otherwise a newer focus can overtake an older look still being rendered.
        if var pending = self.session, pending.id == id {
            pending.supersedeLooks()
            self.session = pending
        }
        for requestID in Array(out.keys) {
            fence(requestID, reason: "a new explicit request took priority")
            await interrupt(requestID)
        }
        while let pending = self.session, pending.id == id, pending.isRunning, pending.out > 0 {
            guard self.card?.id == cardID, status.card?.phase == .asking else { return }
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        guard self.card?.id == cardID, status.card?.phase == .asking else { return }
        guard var reserved = self.session, reserved.id == id, reserved.isRunning,
              sessionDispatchGate?.isOpen != false else {
            return idle("Not sent: the AI session ended.")
        }
        guard !reserved.isUsedUp else {
            return idle("Not sent: all of this AI session's requests are used; start the AI again.")
        }
        reserved.out += 1
        self.session = reserved
        var ownsReservation = true
        defer {
            if ownsReservation, var remaining = self.session, remaining.id == id {
                remaining.out -= 1
                self.session = remaining
                publishSession()
                Task { await self.pump() }
            }
        }
        // The model has the selection only through an answered request of this session. Until then
        // a request carries the selection's own picture, with the selection as its focus; after
        // that a follow-up carries the newest picture.
        let origin = card.originSession == id ? card.origin : nil
        let ownPicture = origin == nil && card.unlocated == nil
        guard var input = ownPicture ? card.input : fresh else {
            // Never an older picture in the place of the current one.
            return idle("Not sent: there is no current picture of this display on record (its newest pixels were not kept).")
        }
        if ownPicture { input.dispatchGate = sessionDispatchGate }
        guard dispatchAuthorityMatches(input) else { return idle("Not sent: this AI request authority has ended.") }
        let makePicture = self.makePicture
        let rendered = await Task.detached(priority: .userInitiated) { makePicture(input) }.value
        // Only if this is still the card, and the session, it was pressed in.
        guard self.card?.id == cardID, status.card?.phase == .asking else { return }
        guard var session = self.session, session.id == id, session.isRunning else { return idle("Not sent: the AI session ended.") }
        guard dispatchAuthorityMatches(input) else { return idle("Not sent: this AI request authority has ended.") }
        if let problem = input.dispatchProblem {
            if input.currentSourceProblem != nil, let loss = Freshness.sourceLossProblem(problem) { noPicture(loss) }
            return idle("Not sent: \(problem).")
        }
        guard case .success(let made) = rendered else {
            if case .failure(let refusal) = rendered { idle("Not sent: " + refusal.reason + ".") }
            return
        }
        // Where the selection is in this request. The session's own copy is changed here and kept
        // only when the request is really sent.
        let seq: Int
        var focus: LiveFocus?
        var about = LiveCard.Focus.none
        var extra: LiveHistoryEntry?
        if let origin, session.isLatest(origin.frameSeq, made.picture) {
            // The unchanged picture: the same frame, and the focus that was made on it.
            seq = origin.frameSeq
            focus = origin.focus
            about = .onThisPicture
        } else if let origin {
            // The screen changed: the new picture, and the earlier focus named without its pixels.
            seq = session.number(made.picture)
            extra = LiveSession.focusReference(origin)
            about = extra == nil ? .none : .onAnEarlierPicture
        } else {
            seq = session.number(made.picture)
            if ownPicture {
                focus = LiveFocus.make(card.rect, frameSeq: seq, display: made.picture.displayBounds, frameWidth: made.picture.width,
                                       frameHeight: made.picture.height)
            }
            about = focus == nil ? .none : .onThisPicture
        }
        guard words != nil || focus != nil else {
            return idle("Kept on this Mac. The AI was not asked: "
                + (card.unlocated ?? "the selection lies outside this display's picture") + ".")
        }
        let number = (self.card?.requests ?? 0) + 1
        let context = session.context(for: seq, extra: extra)
        let turn = LiveTurn(requestID: "\(cardID).\(number)", sessionID: id, epoch: LiveSession.epoch,
                            permissionRevision: LiveSession.permissionRevision, trigger: words == nil ? .focus : .textFollowup,
                            assistance: assistance, presents: true, userText: words, picture: made.picture, frameSeq: seq,
                            focus: focus, history: context.history, gaps: context.gaps)
        if let problem = turn.problem {
            return idle("Not sent: " + problem + ".")
        }
        self.session = session
        self.card?.requests = number
        self.card?.requestID = turn.requestID
        self.card?.answerSource = input
        let askedAt = LiveWire.utc(Date())
        status.card?.requestID = turn.requestID
        status.card?.question = words
        status.card?.assistance = assistance
        status.card?.askedAt = askedAt
        status.card?.focus = about
        status.card?.frameFile = made.frame.file
        status.card?.ink = made.ink
        status.card?.answer = nil
        status.card?.model = session.model
        status.card?.latencyMS = nil
        publish()

        ownsReservation = false
        let sent = await send(turn, made: made, source: input, cardID: cardID, alreadyCounted: true)
        show(sent.outcome, of: turn, askedAt: askedAt)
        publishSession()
        await conclude(sent)
        await pump()
    }

    /// Puts the outcome of the card's request on the card: only while that card still waits for
    /// exactly this request, in the session it was asked in. A fenced request was already said on
    /// the card, and its answer is never given to it.
    private func show(_ outcome: Outcome, of turn: LiveTurn, askedAt: String) {
        guard let card, card.requestID == turn.requestID, status.card?.phase == .asking else { return }
        switch outcome {
        case .answered(let answer):
            guard var current = session, current.id == turn.sessionID, current.isRunning else {
                status.card?.phase = .cancelled
                status.card?.detail = "The AI session ended before the answer could be shown."
                return
            }
            current.answered(turn, text: answer.text, askedAt: askedAt, at: LiveWire.utc(Date()))
            session = current
            if turn.focus != nil, card.originSession != turn.sessionID {
                // From now on the model has this selection: a later follow-up can refer to it.
                self.card?.origin = turn
                self.card?.originSession = turn.sessionID
            }
            status.card?.phase = .answered
            status.card?.answer = answer.text
            status.card?.latencyMS = answer.latencyMS
            status.card?.presentation = LiveAnswerPresentation(turn: turn, captureSessionID: card.captureSessionID,
                owner: presentationOwner, directory: card.directory, generation: card.presentationGate,
                capture: card.answerSource?.captureGate ?? sessionCaptureGate, sourceProblem: card.answerSource?.presentationSourceProblem,
                expiresHost: current.expiresHost, clock: clock)
        case .refused(let error):
            status.card?.phase = .refused
            status.card?.detail = "No answer: \(error.words). \(error.submission.words); it is not sent again."
        case .notKept:
            status.card?.phase = .refused
            status.card?.detail = "Not sent: the request could not be kept on this Mac, or the connector is not running."
        case .notDelivered:
            status.card?.phase = .refused
            status.card?.detail = "Not sent: the connector did not take the request, so nothing reached ChatGPT."
        case .noAnswer:
            status.card?.phase = .refused
            status.card?.detail = "No answer came; whether ChatGPT worked on it is not known. It is not sent again by itself."
        case .unbound:
            status.card?.phase = .refused
            status.card?.detail = "An answer came that does not belong to this request; it is not shown."
        }
    }

    /// The card reports that the answer of `requestID` is displayed. Recorded apart from the answer
    /// itself: an answer that was put on a card is not thereby one the user saw.
    public func answerShown(_ requestID: String, presentation supplied: LiveAnswerPresentation? = nil) {
        guard let permit = supplied ?? status.card?.presentation,
              permit.owner == presentationOwner, permit.requestID == requestID else { return }
        if permit.shownAt == nil {
            guard let card, card.requestID == requestID, status.card?.phase == .answered,
                  let current = session, current.isRunning, current.id == permit.sessionID,
                  current.captureSessionID == permit.captureSessionID, !stopped.contains(permit.captureSessionID),
                  permit.whileAllowed({ true }) else { return }
        }
        guard let shownAt = permit.shownAt else { return }
        if session?.id == permit.sessionID { session?.presented(requestID, shown: true) }
        _ = AskFiles.writeNew(.object(["format": .string("lc-macos-live-shown/v1"), "request_id": .string(requestID),
                                        "shown_at": .string(shownAt),
                                        "what": .string("the app put this answer on its card panel while the panel was on screen; "
                                            + "that it was read is not recorded")]),
                              to: permit.directory.appending(path: requestID + ".shown.json"))
    }

    /// The user's Cancel: a request on its way is fenced at once, taken back if it has not reached
    /// the connector, and interrupted there otherwise. A card with nothing on its way is closed.
    public func cancelCard() async {
        guard let card else { return }
        status.card?.presentation?.revoke()
        guard status.card?.phase == .asking, let requestID = card.requestID, out[requestID] != nil else {
            if status.card?.phase == .asking {
                // Its picture is still being made: nothing was sent.
                status.card?.phase = .cancelled
                status.card?.detail = "Cancelled before it was sent."
                publish()
                return
            }
            closeCard()
            return
        }
        fence(requestID, reason: "cancelled")
        await interrupt(requestID)
    }

    /// Closes the card. A request on its way is fenced first, and its answer is never shown.
    public func closeCard() {
        dropCard(reason: "the card was closed")
        publish()
    }

    /// Fences the card's request and removes the card, in one step. An answer that was put on the
    /// card and never reported as displayed is recorded as not presented.
    private func dropCard(reason: String) {
        guard let dropped = card else { return }
        if let permit = status.card?.presentation, permit.shownAt != nil {
            answerShown(permit.requestID, presentation: permit)
        }
        status.card?.presentation?.revoke()
        if let requestID = dropped.requestID {
            if out[requestID] != nil {
                fence(requestID, reason: reason)
                Task { await self.interrupt(requestID) }
            } else if status.card?.phase == .answered {
                session?.presented(requestID, shown: false)
            }
        }
        card = nil
        status.card = nil
    }

    /// Fences a request on its way, with no wait: its answer is never shown, the card says so at
    /// once, and its line is taken back if it has not reached the connector whole.
    private func fence(_ requestID: String, reason: String) {
        guard var request = out[requestID], request.fenced == nil else { return }
        let taken = request.line.revoke()
        if taken { takenBack = request.line }
        request.fenced = reason
        out[requestID] = request
        if let cardID = request.cardID, card?.id == cardID, card?.requestID == requestID, status.card?.phase == .asking {
            status.card?.phase = .cancelled
            status.card?.detail = "Cancelled (\(reason))" + (taken ? "; it had not reached the connector, so nothing was sent to ChatGPT."
                : ". Its answer, if one comes, is not shown.")
            publish()
        }
    }

    /// Asks the connector to interrupt a fenced request that it had been given whole. An
    /// interruption it does not confirm ends the session: nothing more is sent by itself.
    private func interrupt(_ requestID: String) async {
        guard var request = out[requestID], !request.interrupted, !request.line.isRevoked,
              let current = session, current.id == request.turn.sessionID else { return }
        request.interrupted = true
        out[requestID] = request
        let reply = await call("companion/interrupt", .object([
            "session_id": .string(current.id), "epoch": .integer(LiveSession.epoch), "request_id": .string(requestID),
        ]), timeout: callTimeout)
        var control: (cancelled: Bool, uncertain: Bool)?
        if case .result(_, let result)? = reply { control = LiveWire.control(result) }
        // Kept apart from the request's own outcome, which may come before or after this answer.
        _ = AskFiles.writeNew(.object([
            "format": .string("lc-macos-live-interrupt/v1"), "request_id": .string(requestID),
            "connector_reply": .string(control.map { $0.uncertain ? "uncertain" : $0.cancelled ? "cancelled" : "nothing to cancel" }
                ?? "none, or not in this interface's shape"),
            "confirmed": .bool(control?.uncertain == false), "at": .string(LiveWire.utc(Date())),
        ]), to: request.directory.appending(path: requestID + ".interrupt.json"))
        if control?.uncertain != false, session?.id == current.id {
            await endSession("a request was interrupted, and whether ChatGPT stopped working on it is not confirmed; "
                + "nothing more is sent by itself")
        }
    }

    // MARK: - One request

    /// Keeps the request beside the originals, writes it, waits for its one answer, keeps the
    /// outcome, and accounts for it in the session. Nothing is retried.
    private func send(_ turn: LiveTurn, made: LiveRendered, source: LiveFrameInput, cardID: String?, alreadyCounted: Bool) async -> Sent {
        guard var current = session, current.id == turn.sessionID, let directory = sessionDirectory else {
            return Sent(outcome: .notKept, ends: nil)
        }
        guard current.isRunning, dispatchAuthorityMatches(source), clock() < current.expiresHost else {
            if alreadyCounted { current.out -= 1; session = current; publishSession() }
            return Sent(outcome: .notDelivered, ends: nil)
        }
        if !alreadyCounted { current.out += 1 }
        session = current
        var source = source
        if source.captureGate == nil { source.captureGate = sessionCaptureGate }
        if source.dispatchGate == nil { source.dispatchGate = sessionDispatchGate }
        let admittedSource = source
        let activeSessionGate = sessionDispatchGate
        let expiry = current.expiresHost
        let dispatchClock = clock
        // Kept before anything is sent.
        let record: JSONValue = .object([
            "format": .string("lc-macos-live-request/v1"), "turn": turn.json(includingImage: false),
            "picture_file": .string(made.file), "frame_file": .string(made.frame.file),
            "frame_capture_sequence": .integer(made.frame.sequence), "ink_file": made.inkFile.map(JSONValue.string) ?? .null,
            "picture_composition": .string(made.composition), "model": .string(current.model),
            "asked_at": .string(LiveWire.utc(Date())),
        ])
        var outcome = Outcome.notKept
        var request: Out?
        if AskFiles.writeNew(record, to: directory.appending(path: turn.requestID + ".request.json")),
           let running = child, !running.hasExited,
           let line = LiveWire.request(id: "c\(nextCall)", method: "companion/turn", params: turn.json(includingImage: true)) {
            let callID = "c\(nextCall)"
            nextCall += 1
            let handle = AskRevocation(allowed: {
                admittedSource.dispatchProblem == nil && activeSessionGate?.isOpen != false && dispatchClock() < expiry
            }, gates: [activeSessionGate, admittedSource.captureGate].compactMap { $0 })
            out[turn.requestID] = Out(turn: turn, line: handle, directory: directory, cardID: cardID, source: source)
            let answer = OneShot<LiveWire.Incoming?>()
            waiting[callID] = answer
            publishSession()
            outcome = .notDelivered
            if let problem = source.dispatchProblem {
                fence(turn.requestID, reason: problem)
                if source.currentSourceProblem != nil, let loss = Freshness.sourceLossProblem(problem) { noPicture(loss) }
            }
            if await running.send(line, revocation: handle) {
                if var session = self.session, session.id == turn.sessionID {
                    session.sent(turn, nowHost: clock())
                    self.session = session
                }
                DispatchQueue.global().asyncAfter(deadline: .now() + max(turnTimeout, 0)) { answer.resolve(nil) }
                switch await answer.wait() {
                case .result(_, let result)?:
                    outcome = LiveAnswer.parse(result, turn: turn, model: current.model).map(Outcome.answered) ?? .unbound
                case .error(_, let error)?:
                    outcome = .refused(error)
                default:
                    outcome = .noAnswer
                }
            }
            if handle.isRevoked, out[turn.requestID]?.fenced == nil {
                // A temporary source refusal remains a refusal even if fresh callbacks recover
                // before the writer returns. It is not a new connector transport failure.
                let sourceProblem = source.dispatchProblem
                let problem = sourceProblem ?? "request authority was withdrawn before complete delivery"
                fence(turn.requestID, reason: problem)
                if source.currentSourceProblem != nil, sourceProblem != nil,
                   let loss = Freshness.sourceLossProblem(sourceProblem) { noPicture(loss) }
            }
            waiting[callID] = nil
            request = out.removeValue(forKey: turn.requestID)
        }
        let fenced = request?.fenced

        // The account of the session: a request that may have reached the service uses one.
        var ends: String?
        if var session = self.session, session.id == turn.sessionID {
            session.out -= 1
            var given = false
            var backpressure = false
            switch outcome {
            case .answered:
                session.spend()
                given = true
            case .refused(let error):
                if error.submission != .notSubmitted { session.spend() }
                backpressure = ["busy", "stale_context"].contains(error.code)
                if error.code == "budget_reached", error.submission == .notSubmitted {
                    // For an unattended look this is the connector keeping the rest for the user.
                    if turn.trigger != .observation { ends = "this session's own bound (requests or time) was reached" }
                } else if error.endsSession, fenced == nil || !["cancelled", "session_stopped"].contains(error.code) {
                    ends = error.words + "; nothing more is sent by itself"
                }
            case .noAnswer:
                session.spend()
                ends = "no answer came to a request; whether ChatGPT worked on it is not known. Nothing more is sent by itself"
            case .unbound:
                session.spend()
                ends = "an answer came that does not belong to its request; it is not shown, and nothing more is sent by itself"
            case .notDelivered:
                if fenced == nil { ends = "the connector did not take a request; nothing more is sent by itself" }
            case .notKept:
                break
            }
            // A picture of the user's own request that the model was not given is a stated gap
            // (`pump` states it for an unattended look).
            if turn.trigger != .observation, !given, !session.isAccountedFor(turn.frameSeq) {
                session.gap(turn.frameSeq, backpressure ? .backpressure : .notObserved)
            }
            self.session = session
        }
        keep(outcome, of: turn, fenced: fenced, request: request, in: directory)
        // A fenced request's answer is never given to its card.
        if fenced != nil, case .answered = outcome { outcome = .noAnswer }
        return Sent(outcome: outcome, ends: session?.id == turn.sessionID ? ends : nil)
    }

    /// After the outcome was said where it belongs: the session is ended if that outcome ends it,
    /// and the account is read again when the refusal was the sign-in's. Called with no wait in
    /// between, so nothing is sent in a session that is over.
    private func conclude(_ sent: Sent) async {
        guard let ends = sent.ends else { return }
        await endSession(ends)
        if case .refused(let error) = sent.outcome, error.code == "unauthenticated" { await readConnection() }
    }


    /// The kept outcome of one request. A fenced request's answer text is not kept as an answer.
    private func keep(_ outcome: Outcome, of turn: LiveTurn, fenced: String?, request: Out?, in directory: URL) {
        var record: [String: JSONValue] = ["format": .string("lc-macos-live-response/v1"), "request_id": .string(turn.requestID),
                                           "ended_at": .string(LiveWire.utc(Date()))]
        if let fenced {
            let taken = request?.line.isRevoked == true
            var ended = "unknown"
            switch outcome {
            case .refused(let error): ended = error.code + "/" + error.submission.rawValue
            // The text of an answer that came after all is not kept: it was never to be shown.
            case .answered: ended = "an answer, which is not kept"
            default: break
            }
            record["outcome"] = .string("cancelled")
            record["reason"] = .string(fenced)
            record["delivered_to_connector"] = .bool(!taken)
            // What the connector said of the request itself. Whether an interruption was confirmed
            // is kept apart, in `<request>.interrupt.json`, when one was asked for.
            record["connector_answer"] = .string(taken ? "none: nothing was sent" : ended)
        } else {
            switch outcome {
            case .answered(let answer):
                record["outcome"] = .string(turn.trigger == .observation ? "observed" : "answered")
                record["text"] = .string(answer.text)
                record["model"] = .string(answer.model)
                record["auth_mode"] = .string("chatgpt")
                record["latency_ms"] = answer.latencyMS.map(JSONValue.integer) ?? .null
                record["thread_id"] = .string(answer.threadID)
                record["turn_id"] = .string(answer.turnID)
                record["provenance"] = .string("equal in full to the kept request")
                record["presentation"] = .string(turn.trigger == .observation
                    ? "never shown: an unattended look is context for later requests only"
                    : "put on the card of this selection; whether it was displayed is recorded apart")
            case .refused(let error):
                record["outcome"] = .string("refused")
                record["code"] = .string(error.code)
                record["submission"] = .string(error.submission.rawValue)
            case .notKept, .notDelivered:
                record["outcome"] = .string("not_sent")
            case .noAnswer:
                record["outcome"] = .string("unknown")
            case .unbound:
                record["outcome"] = .string("not_corresponding")
            }
        }
        if !AskFiles.writeNew(.object(record), to: directory.appending(path: turn.requestID + ".response.json")),
           card?.requestID == turn.requestID {
            let detail = (status.card?.detail.map { $0 + " " } ?? "") + "This outcome could not be kept on this Mac."
            status.card?.detail = detail
        }
    }

    // MARK: - Quit

    /// Ends the session and the connector child (and with it its Codex child): EOF, bounded.
    /// Requests on their way are fenced and taken back first. Nothing is signed out.
    public func shutdown() async {
        closed = true
        dropCard(reason: "the app is closing")
        // The connector's end at EOF stops whatever a Stop it did not answer in time left running.
        await endSession("the app is closing", timeout: min(callTimeout, 5))
        let ending = child
        login = nil
        status.loginPending = false
        await ending?.end()
        if let ending, let current = child, current === ending { child = nil }
        await retired()
        resolveWaiting()
        if case .success = config {
            status.connection = .disconnected
            status.detail = nil
        }
        publish()
    }

    // MARK: - The child's lines

    private func call(_ method: String, _ params: JSONValue, timeout: TimeInterval) async -> LiveWire.Incoming? {
        guard let child, !child.hasExited else { return nil }
        let id = "c\(nextCall)"
        nextCall += 1
        guard let line = LiveWire.request(id: id, method: method, params: params) else { return nil }
        let answer = OneShot<LiveWire.Incoming?>()
        waiting[id] = answer
        guard await child.send(line, revocation: nil) else {
            waiting[id] = nil
            return nil
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + max(timeout, 0)) { answer.resolve(nil) }
        let reply = await answer.wait()
        waiting[id] = nil
        return reply
    }

    private func received(_ event: Event, from serial: Int) async {
        guard child != nil, serial == launch else { return }
        switch event {
        case .line(let line):
            switch LiveWire.parse(line) {
            case .result(let id, let result)?:
                waiting[id]?.resolve(.result(id: id, result))
            case .error(let id?, let error)?:
                waiting[id]?.resolve(.error(id: id, error))
            case .event(let method, let params)?:
                handle(method, params)
            case .error(nil, _)?, nil:
                // A line that answers no request of ours, or is not the protocol: the connector
                // could not read a line and ends, or cannot be believed. After a request of ours
                // was cut off, that is this app's own doing, and is said as that.
                await lost(endsForACutOffRequest() ? Self.cutOffWords : "the connector wrote something that is not its protocol")
            }
        case .exit:
            let cutOff = endsForACutOffRequest()
            await lost(cutOff ? Self.cutOffWords : "the connector ended", keepsRefusal: !cutOff)
        }
    }

    private func handle(_ method: String, _ params: [String: Any]) {
        if method == "connection/changed", params.isEmpty {
            // Read at once, but at most once in `changeInterval`, however many events come.
            guard !changeReadPending else { return }
            let wait = changeInterval - Date().timeIntervalSince(lastChangeRead)
            if wait <= 0 {
                lastChangeRead = Date()
                Task { await self.readConnection() }
            } else {
                changeReadPending = true
                Task {
                    try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                    await self.changeReadDue()
                }
            }
            return
        }
        guard method == "connection/login/completed" else { return }
        if login == nil, loginStarting {
            earlyCompletions.append(params)
            return
        }
        guard Set(params.keys) == ["login_id", "success", "error"],
              let pending = login, MacIngressUpload.same(params["login_id"], pending.id),
              let success = MacIngressUpload.boolean(params["success"]),
              params["error"] is NSNull || params["error"] is String else { return }
        login = nil
        status.loginPending = false
        if success {
            status.detail = "signed in; reading the connection"
            publish()
            Task { await self.readConnection() }
        } else {
            status.detail = MacIngressUpload.same(params["error"], "login_cancelled") ? "the sign-in was cancelled"
                : "the sign-in did not complete"
            publish()
        }
    }

    private static let cutOffWords = "the connector was ended, because a cancelled request had been written to it in part; "
        + "nothing of it was sent to ChatGPT. Connect starts the connector again"

    private func endsForACutOffRequest() -> Bool {
        takenBack?.wasWrittenInPart == true
    }

    private func changeReadDue() async {
        changeReadPending = false
        lastChangeRead = Date()
        await readConnection()
    }

    /// The child is gone or cannot be believed: every waiting call ends without an answer, and a
    /// running session is over. Nothing is started again by itself.
    private func lost(_ detail: String, keepsRefusal: Bool = false) async {
        let ending = child
        // Retain ownership before the first await, so Quit/Connect joins this child even while
        // ending the old session is suspended.
        if let ending { retiring.append(ending) }
        child = nil
        login = nil
        status.loginPending = false
        if !(keepsRefusal && status.connection == .refused) {
            status.connection = .disconnected
            status.detail = detail
        }
        publish()
        resolveWaiting()
        await endSession("the connection to ChatGPT was lost")
        if let ending { await retire(ending) }
    }

    private func publishSession() {
        if let session {
            status.session = session.info
        }
        publish()
    }

    private func publish() {
        onStatus?(status)
    }
}
