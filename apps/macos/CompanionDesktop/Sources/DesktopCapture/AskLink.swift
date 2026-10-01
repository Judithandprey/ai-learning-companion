import Foundation

// One selected image and one question to the user's ChatGPT subscription, through this app's own
// connector child (ADR 0003). The connector and Codex own the official login and the model call.
//
// - Nothing is sent by capturing, writing, erasing or selecting. A request leaves only when the
//   user presses Submit on the card of a confirmed selection, with their own question and the
//   level of help they chose.
// - The image and context are those fixed when the selection was confirmed (`AskSelectionBuilder`),
//   and the request is kept beside the originals before it is sent.
// - One question at a time. Nothing is retried, and nothing is sent again by itself.
// - An answer is shown only on the card it was asked from, while that card still waits for exactly
//   that request, and only when its provenance equals the request in full. Cancel, a new selection,
//   the end of the capture or of the connector make a later answer never shown.
// - Model text is data: it is shown as plain text and never run.
// No credential, login URL or connector message is logged; errors are fixed words.

/// What the connection and the current card show.
public struct AskStatus: Equatable, Sendable {
    public enum Connection: String, Equatable, Sendable {
        /// No configuration file: the connector is not set up on this Mac.
        case notConfigured
        case unavailable
        /// Configured; the connector is not running.
        case disconnected
        /// The connector runs but reports the subscription connection as unavailable.
        case refused
        case connecting
        case signedOut
        /// Signed in to the managed ChatGPT account, as Codex reports it. Not proof of an answer.
        case signedIn
        /// Signed in some other way, which this product does not use.
        case otherMode
        case unknown
    }

    public var connection: Connection
    /// Fixed words.
    public var detail: String?
    public var plan: String?
    /// Nil when the quota is not known.
    public var rateLimits: [AskConnection.RateLimit]?
    public var models: [AskConnection.Model]
    /// A sign-in was started and has not completed or been cancelled. Its URL is never part of
    /// the status.
    public var loginPending = false
    public var card: AskCard?

    public init(connection: Connection, detail: String? = nil) {
        self.connection = connection
        self.detail = detail
        self.models = []
    }

    /// The models the catalog lists as taking images, the default first.
    public var imageModels: [AskConnection.Model] {
        models.filter(\.imageInput).sorted { $0.isDefault && !$1.isDefault }
    }
}

/// The card of one confirmed selection.
public struct AskCard: Equatable, Sendable {
    public enum Phase: String, Equatable, Sendable {
        /// The selection's image is fixed; a question can be submitted.
        case ready
        case sending
        case answered
        case failed
        case cancelled
        /// Its capture stopped: nothing more can be submitted from it.
        case stopped
    }

    public var cardID: String
    public var selectionID: String
    public var captureSessionID: String
    public var phase: Phase
    /// Fixed words.
    public var detail: String?
    /// The facts of the image a question is sent with.
    public var frameSequence: Int?
    public var imageWidth: Int?
    public var imageHeight: Int?
    public var imageSHA256: String?
    public var inkRevision: Int?
    /// Whether the ink is in the image: drawn over it, none visible, or not known.
    public var ink: PreparedSelection.Ink?
    /// The question and help level last sent, and its answer. They stay with the answer when a
    /// later question is refused before it is sent.
    public var question: String?
    public var assistance: AskAssistance?
    public var answer: String?
    public var model: String?
    public var latencyMS: Int?

    public var canSubmit: Bool {
        imageSHA256 != nil && [.ready, .answered, .failed, .cancelled].contains(phase)
    }
}

extension AskStatus.Connection {
    /// Whether a confirmed selection gets a card: only when the connector is set up on this Mac.
    public var opensCards: Bool {
        self != .notConfigured && self != .unavailable
    }

    /// Whether Connect and Sign In in the main window can lead to a question being sent.
    public var canBecomeSignedIn: Bool {
        [.disconnected, .connecting, .signedOut, .otherMode, .unknown].contains(self)
    }
}

extension AskStatus {
    /// The connection in fixed words. "Signed in" is what Codex reports, not proof of an answer.
    public var summaryLine: String {
        switch connection {
        case .notConfigured: return "Not set up on this Mac (no ask-connector.json): nothing can be asked."
        case .unavailable: return "Unavailable: nothing can be asked."
        case .disconnected: return "Not connected."
        case .refused: return "The connector reports the ChatGPT connection as unavailable: nothing can be asked."
        case .connecting: return "Connecting."
        case .signedOut: return "Not signed in to ChatGPT."
        case .signedIn: return "Signed in to ChatGPT" + (plan.map { " (\($0))" } ?? "") + "."
        case .otherMode: return "Not signed in with the ChatGPT subscription."
        case .unknown: return "The sign-in state is not known."
        }
    }

    /// The quota windows as the connector reported them, or that they are not known.
    public var quotaLine: String {
        guard let rateLimits else { return "Quota: not known." }
        guard !rateLimits.isEmpty else { return "Quota: none reported." }
        return "Quota: " + rateLimits.map { limit in
            "\(limit.label) \(Int(limit.usedPercent.rounded()))% used" + (limit.resetsAt.map { ", resets \($0)" } ?? "")
        }.joined(separator: "; ") + "."
    }

    /// The models the catalog lists as taking images. Listing is not proof of an answer.
    public var modelsLine: String {
        let listed = imageModels
        return listed.isEmpty ? "No model is listed as taking images."
            : "Listed as taking images: " + listed.map(\.label).joined(separator: ", ") + "."
    }
}

extension AskCard {
    /// The card's state in fixed words.
    public var summaryLine: String {
        switch phase {
        case .ready: return "Nothing is sent until you press Submit."
        case .sending: return "Sent. Waiting for the answer."
        case .answered: return "Answer" + (model.map { " from \($0)" } ?? "") + (latencyMS.map { " after \($0 / 1000) s" } ?? "") + "."
        case .failed: return "No answer."
        case .cancelled: return "Cancelled."
        case .stopped: return "This capture has stopped."
        }
    }

    /// What the shown answer was asked with.
    public var askedLine: String? {
        guard let question, let assistance else { return nil }
        let help: String
        switch assistance {
        case .hint: help = "a hint"
        case .explain: help = "an explanation"
        case .fullSolution: help = "the full solution"
        }
        return "Asked for \(help): \(question)"
    }

    /// The image a question is sent with, by its captured facts.
    public var imageLine: String {
        guard let imageWidth, let imageHeight, let frameSequence else { return "This selection has no image." }
        let inkWords: String
        switch (ink, inkRevision) {
        case (.drawn?, let revision?): inkWords = ", with the ink of revision \(revision) drawn over it"
        case (.noneVisible?, _): inkWords = ", with no ink visible then"
        default: inkWords = "; whether these pixels hold the ink is not known"
        }
        return "Selection \(selectionID): \(imageWidth)×\(imageHeight) px of frame \(frameSequence)" + inkWords + "."
    }
}

public actor AskLink {
    public typealias StatusHandler = @Sendable (AskStatus) -> Void

    private enum Event: Sendable {
        case line(Data)
        case exit
    }

    /// A question that was on its way and is now fenced: its answer is never shown.
    private struct Fenced {
        let request: AskRequest
        let directory: URL
        let cardID: String
        let detail: String
    }

    private let config: Result<AskConnectorConfig, CaptureHostProblem>
    private let launcher: any AskChildLauncher
    /// How long a connection call and a question may wait for their answer (engineering defaults).
    private let callTimeout: TimeInterval
    private let askTimeout: TimeInterval
    /// The connection is read at most once in this time for `connection/changed` events, however
    /// many come (an engineering default).
    private let changeInterval: TimeInterval
    private var lastChangeRead = Date.distantPast
    private var changeReadPending = false
    private var status: AskStatus
    private var onStatus: StatusHandler?
    private var child: (any AskChild)?
    /// Which launch `child` is. Lines and the exit of an earlier launch are told apart by this
    /// number, never by the child object: a new one may get the address of the one it replaces.
    private var launch = 0
    /// A connector being ended by Check Again, until it has ended.
    private var replacing: (any AskChild)?
    /// The app is closing: no connector is started any more.
    private var closed = false
    private var reader: Task<Void, Never>?
    private var nextCall = 1
    private var waiting: [String: OneShot<AskWire.Incoming?>] = [:]
    private var login: (id: String, url: URL)?
    private var loginStarting = false
    /// Completions that came while the sign-in's own answer was still on its way to `startLogin`.
    private var earlyCompletions: [[String: Any]] = []
    /// One connection read at a time; a change during it makes it read once more.
    private var reading = false
    private var readAgain = false
    private var prepared: PreparedSelection?
    /// The request the current card waits for.
    private var inFlight: AskRequest?
    private var requests = 0
    /// Fenced questions whose record is still being settled.
    private var fencing = 0
    /// Capture sessions that stopped: nothing more is submitted for them.
    private var stopped: Set<String> = []

    public init(config: Result<AskConnectorConfig, CaptureHostProblem>, launcher: any AskChildLauncher = ProcessAskLauncher(),
                callTimeout: TimeInterval = 30, askTimeout: TimeInterval = 180, changeInterval: TimeInterval = 1) {
        self.config = config
        self.launcher = launcher
        self.callTimeout = callTimeout
        self.askTimeout = askTimeout
        self.changeInterval = changeInterval
        switch config {
        case .failure(.notConfigured): status = AskStatus(connection: .notConfigured)
        case .failure(.invalid(let reason)): status = AskStatus(connection: .unavailable, detail: reason)
        case .success: status = AskStatus(connection: .disconnected)
        }
    }

    public func setStatusHandler(_ handler: @escaping StatusHandler) {
        onStatus = handler
        handler(status)
    }

    public func currentStatus() -> AskStatus {
        status
    }

    // MARK: - Connection

    /// The user's Connect or Check Again: starts the connector if it is not running and reads the
    /// connection. Sends no image and no question, and starts no sign-in.
    ///
    /// A running connector whose last read gave no connection (it refused, was not understood or
    /// did not answer) is ended and started again: the real connector keeps such a failure for
    /// the rest of its life, so asking the same one again could never show a different state.
    /// Never while a question is on its way. A sign-in pending on that connector ends with it:
    /// it could not complete there any more.
    public func connect() async {
        guard !closed else { return }
        if let running = child, !running.hasExited, [.refused, .unknown].contains(status.connection),
           inFlight == nil, fencing == 0, !loginStarting, !reading, replacing == nil {
            child = nil
            replacing = running
            login = nil
            status.loginPending = false
            status.connection = .connecting
            status.detail = nil
            publish()
            let pending = waiting
            waiting = [:]
            pending.values.forEach { $0.resolve(nil) }
            await running.end()
            replacing = nil
        }
        guard await ensureChild() else { return }
        await readConnection()
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

    /// Reads the connection. While one read is on its way another is not started: the one on its
    /// way is not believed (it may describe the state before the change) and is asked once more.
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
            // Only the child that was asked is described.
            guard let child, child === asked else {
                // A connector that cannot start answers its first read with "unavailable" and ends:
                // that answer, not its end, is why nothing is connected.
                if self.child == nil, case .error(_, "unavailable")? = reply { describe(reply) }
                return
            }
            if readAgain { continue }
            describe(reply)
            return
        }
    }

    private func describe(_ reply: AskWire.Incoming?) {
        switch reply {
        case .result(_, let result)?:
            guard let connection = AskConnection.parse(result) else {
                status.connection = .unknown
                status.detail = "the connector's answer was not understood"
                publish()
                return
            }
            status.plan = connection.plan
            status.rateLimits = connection.rateLimits
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
        case .error(_, let code)?:
            // The connector's own refusal, for example a Codex build it does not admit. Any other
            // code here is a failure it keeps, not a fact about the account.
            status.connection = code == "unavailable" ? .refused : .unknown
            status.detail = code == "unavailable" ? AskWire.words(for: code)
                : "the connector could not report the connection; Check Again starts it again"
        default:
            status.connection = .unknown
            status.detail = "the connector did not answer"
        }
        publish()
    }

    /// Starts the official managed sign-in and returns its page, to be opened in the browser by the
    /// user's own click. A sign-in already pending returns its own page: only one is started. Nil
    /// with a fixed-word detail when it cannot be started. It starts no connector: the connection
    /// is read first, by Connect.
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
        // The connector that was asked is still the one running.
        guard let current = child, current === running, !current.hasExited else { return nil }
        guard case .result(_, let result)? = reply, Set(result.keys) == ["login_id", "auth_url"],
              let id = result["login_id"] as? String, AskWire.isIdentifier(id),
              let url = AskWire.loginURL(result["auth_url"] as? String) else {
            if case .error(_, let code)? = reply {
                // Its own words, not a question's; and what the connector is now is read again.
                await unconfirmed("the sign-in could not be started"
                    + (code == "busy" ? ": the connector is busy with a question or another sign-in" : ""))
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
        // A completion the connector wrote right behind its answer was read before this resumed.
        let early = earlyCompletions
        earlyCompletions = []
        early.forEach { handle("connection/login/completed", $0) }
        // Already over: there is no page to open.
        return login == nil ? nil : url
    }

    /// The pending sign-in's page, for opening it again.
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
        // Not confirmed by the connector: said so, and what it reports now is read again.
        await unconfirmed("the connector did not confirm that the sign-in was cancelled")
    }

    /// After a call the connector did not confirm: reads the connection again, then says so in
    /// fixed words, unless the read itself shows the connector has nothing to report.
    private func unconfirmed(_ words: String) async {
        await readConnection()
        guard ![.refused, .unknown].contains(status.connection) else { return }
        status.detail = words
        publish()
    }

    // MARK: - The card

    /// A confirmed selection: its image and context are fixed now, and its card opens. Sends nothing.
    /// A card still waiting for an answer is fenced first, in the same step: its answer is never
    /// shown, and nothing can be submitted from it any more.
    /// Without a usable connector configuration there is no card and nothing is written: the
    /// selection itself is kept by the ink document as before.
    public func open(_ input: AskSelectionInput) async {
        guard case .success = config else { return }
        let fenced = fenceLocally(detail: "a new selection was made")
        let cardID = "ask-" + input.selection.id + "-" + CaptureLink.randomHex(4)
        var card = AskCard(cardID: cardID, selectionID: input.selection.id,
                           captureSessionID: input.selection.nativeSession ?? "", phase: .ready)
        switch AskSelectionBuilder.prepare(input, cardID: cardID) {
        case .success(let ready):
            prepared = ready
            card.frameSequence = ready.context.frameSequence
            card.imageWidth = ready.imageWidth
            card.imageHeight = ready.imageHeight
            card.imageSHA256 = ready.imageSHA256
            card.inkRevision = ready.context.inkRevision
            card.ink = ready.ink
            if stopped.contains(ready.captureSessionID) {
                card.phase = .stopped
                card.detail = "this capture has stopped; nothing can be asked from it"
            }
        case .failure(let refusal):
            prepared = nil
            card.phase = .failed
            card.detail = "this selection cannot be asked about: " + refusal.reason
        }
        status.card = card
        publish()
        if let fenced { await settle(fenced) }
    }

    /// The user's explicit Submit: this question, this help level and the card's image go to the
    /// connector once. `model` is a catalog model listed as taking images; nil takes the default.
    public func submit(question: String, assistance: AskAssistance, model: String? = nil) async {
        // Submit starts no connector and no sign-in: after a connector was lost, a new one is
        // started only by the user's own Connect.
        guard var card = status.card, card.canSubmit, inFlight == nil, let prepared, prepared.cardID == card.cardID else { return }
        func refuse(_ detail: String) {
            // Nothing was sent: an answer already on the card stays, with the question it was asked with.
            card.phase = card.answer == nil ? .failed : .answered
            card.detail = detail
            status.card = card
            publish()
        }
        guard !stopped.contains(prepared.captureSessionID) else {
            if card.answer == nil { card.phase = .stopped }
            card.detail = "this capture has stopped; nothing can be asked from it"
            status.card = card
            publish()
            return
        }
        guard status.connection == .signedIn, let running = child, !running.hasExited else {
            return refuse("not sent: ChatGPT is not connected and signed in")
        }
        guard login == nil, !loginStarting else {
            return refuse("not sent: a sign-in is still pending")
        }
        // Only a model the catalog lists as taking images; one that was asked for is never replaced.
        let listed = status.imageModels
        let wanted: AskConnection.Model?
        if let model {
            wanted = listed.first { $0.id == model }
        } else {
            wanted = listed.first
        }
        guard let chosen = wanted else {
            return refuse("not sent: no such model in the catalog is listed as taking images")
        }
        requests += 1
        let request = prepared.request(id: "\(prepared.cardID)-q\(requests)", question: question, assistance: assistance)
        if let problem = request.problem {
            return refuse("not sent: " + problem)
        }
        // Kept beside the originals before anything is sent.
        let record: JSONValue = .object([
            "format": .string("lc-macos-ask-request/v1"), "request": request.json(includingImage: false),
            "model": .string(chosen.id), "selection_id": .string(prepared.selectionID),
            "image_file": .string("asks/" + prepared.cardID + ".png"), "ink_file": .string("asks/" + prepared.cardID + ".ink.json"),
            "image_composition": .string(prepared.composition),
        ])
        guard AskFiles.writeNew(record, to: prepared.directory.appending(path: request.requestID + ".request.json")) else {
            return refuse("not sent: the request could not be kept on this Mac")
        }
        card.phase = .sending
        card.detail = nil
        card.question = question
        card.assistance = assistance
        card.answer = nil
        card.model = chosen.id
        card.latencyMS = nil
        status.card = card
        inFlight = request
        publish()

        let reply = await call("ask/start", .object(["request": request.json(includingImage: true), "model": .string(chosen.id)]),
                               timeout: askTimeout)
        // Shown only on the card that still waits for exactly this request.
        guard inFlight?.requestID == request.requestID, var waitingCard = status.card, waitingCard.cardID == prepared.cardID,
              waitingCard.phase == .sending else { return }
        inFlight = nil
        var outcome: [String: JSONValue] = ["format": .string("lc-macos-ask-response/v1"), "request_id": .string(request.requestID)]
        var reread = false
        switch reply {
        case .result(_, let result)?:
            if let answer = AskAnswer.parse(result, request: request) {
                waitingCard.phase = .answered
                waitingCard.answer = answer.text
                waitingCard.model = answer.model
                waitingCard.latencyMS = answer.latencyMS
                outcome["outcome"] = .string("answered")
                outcome["text"] = .string(answer.text)
                outcome["model"] = .string(answer.model)
                outcome["auth_mode"] = .string("chatgpt")
                outcome["latency_ms"] = answer.latencyMS.map(JSONValue.integer) ?? .null
                outcome["thread_id"] = answer.threadID.map(JSONValue.string) ?? .null
                outcome["turn_id"] = answer.turnID.map(JSONValue.string) ?? .null
                outcome["provenance"] = .string("equal in full to the kept request")
                // What this record knows: the answer was put on the card. Not that a window showed it.
                outcome["presentation"] = .string("put on the card of this selection; display on screen is not recorded")
            } else {
                waitingCard.phase = .failed
                waitingCard.detail = "an answer came that does not belong to this question and image; it is not shown"
                outcome["outcome"] = .string("not_corresponding")
            }
        case .error(_, let code)?:
            waitingCard.phase = code == "cancelled" || code == "interrupt_unconfirmed" ? .cancelled : .failed
            waitingCard.detail = AskWire.words(for: code)
            outcome["outcome"] = .string("refused")
            outcome["code"] = .string(code)
            reread = ["unauthenticated", "quota", "failed", "unavailable"].contains(code)
        default:
            // No answer in time, or the connector ended: it may still have been answered there.
            waitingCard.phase = .failed
            waitingCard.detail = "no answer came; whether the question was answered by the service is not known. It is not asked again by itself"
            outcome["outcome"] = .string("unknown")
            if let running = self.child, !running.hasExited {
                Task { _ = await self.call("ask/cancel", .object(["request_id": .string(request.requestID)]), timeout: self.callTimeout) }
            }
        }
        if !AskFiles.writeNew(.object(outcome), to: prepared.directory.appending(path: request.requestID + ".response.json")) {
            waitingCard.detail = (waitingCard.detail.map { $0 + "; " } ?? "") + "this outcome could not be kept on this Mac"
        }
        status.card = waitingCard
        publish()
        // The refusal may be about the connection itself (the sign-in is gone, the quota is used
        // up, the connector failed): it is read again, so it does not go on saying "signed in".
        if reread { await readConnection() }
    }

    /// The user's Cancel: a question on its way is fenced at once, so its answer is never shown;
    /// a card with nothing on its way is closed.
    public func cancelCard() async {
        guard let card = status.card else { return }
        guard card.phase == .sending else {
            status.card = nil
            prepared = nil
            publish()
            return
        }
        if let fenced = fenceLocally(detail: "cancelled") { await settle(fenced) }
    }

    /// Closes the card. A question on its way is fenced first.
    public func closeCard() async {
        let fenced = fenceLocally(detail: "the card was closed")
        status.card = nil
        prepared = nil
        publish()
        if let fenced { await settle(fenced) }
    }

    /// The capture `captureSessionID` stopped: nothing more is submitted for it, a question on its
    /// way is fenced, and the connector is told.
    public func sessionStopped(_ captureSessionID: String) async {
        guard stopped.insert(captureSessionID).inserted else { return }
        var fenced: Fenced?
        if var card = status.card, card.captureSessionID == captureSessionID {
            if card.phase == .sending {
                fenced = fenceLocally(detail: "the capture stopped")
            } else if card.phase != .answered {
                card.phase = .stopped
                card.detail = "this capture has stopped; nothing can be asked from it"
                status.card = card
                publish()
            }
        }
        if let fenced { await settle(fenced) }
        guard let asked = child, !asked.hasExited, AskWire.isIdentifier(captureSessionID) else { return }
        let reply = await call("session/stop", .object(["capture_session_id": .string(captureSessionID)]), timeout: callTimeout)
        if case .result(_, let result)? = reply, result.isEmpty { return }
        // Not confirmed by the connector: said so. This app's own fence does not depend on it.
        guard let child, child === asked else { return }
        status.detail = "the connector did not confirm that the capture stopped; this app sends nothing more for it"
        publish()
    }

    /// Ends the connector child (and with it its Codex child): EOF, bounded. A question on its way
    /// is fenced and its record written before this returns. Nothing is signed out.
    public func shutdown() async {
        closed = true
        // A connector that Check Again is replacing is ended here as well, before this returns.
        await replacing?.end()
        let ending = child
        if let fenced = fenceLocally(detail: "the app is closing") {
            // EOF ends the question with the child: whether it was still answered is not known.
            record(fenced, cancelled: nil, uncertain: true)
        }
        login = nil
        status.loginPending = false
        // The child stays set while it ends, so answers already on their way are still read.
        await ending?.end()
        if let ending, let current = child, current === ending { child = nil }
        let pending = waiting
        waiting = [:]
        pending.values.forEach { $0.resolve(nil) }
        // Fences that were waiting for the connector settle now; their records are written.
        while fencing > 0 { await Task.yield() }
        if case .success = config {
            status.connection = .disconnected
            status.detail = nil
        }
        publish()
    }

    /// Fences the card's question on its way, in one step with no wait: the card says so at once
    /// and can submit nothing with the old request still counted. Nil when nothing was on its way.
    private func fenceLocally(detail: String) -> Fenced? {
        guard var card = status.card, card.phase == .sending, let request = inFlight, let prepared else { return nil }
        inFlight = nil
        card.phase = .cancelled
        card.detail = detail + "; its answer, if one comes, is not shown"
        status.card = card
        publish()
        return Fenced(request: request, directory: prepared.directory, cardID: card.cardID, detail: detail)
    }

    /// Asks the connector to interrupt a fenced question, and keeps its record. The connector's
    /// answer says whether it was interrupted for certain; anything else is not known.
    private func settle(_ fenced: Fenced) async {
        fencing += 1
        defer { fencing -= 1 }
        var cancelled: Bool?
        var uncertain = true
        let reply = await call("ask/cancel", .object(["request_id": .string(fenced.request.requestID)]), timeout: callTimeout)
        if case .result(_, let result)? = reply, Set(result.keys) == ["cancelled", "uncertain"],
           let wasCancelled = MacIngressUpload.boolean(result["cancelled"]),
           let reported = MacIngressUpload.boolean(result["uncertain"]) {
            cancelled = wasCancelled
            // Nothing left to interrupt may mean it had already been answered.
            uncertain = !(wasCancelled && !reported)
        }
        record(fenced, cancelled: cancelled, uncertain: uncertain)
        // An interruption the connector could not confirm may have ended its Codex client: the
        // connection is read again, apart from this fence.
        if uncertain, child != nil { Task { await self.readConnection() } }
        // Only if the same card is still shown as cancelled: a newer card is never touched.
        if var shown = status.card, shown.cardID == fenced.cardID, shown.phase == .cancelled {
            shown.detail = fenced.detail + (uncertain
                ? "; whether the service still answered it is not known (it may have used quota). Its answer is not shown"
                : "; its answer, if one comes, is not shown")
            status.card = shown
            publish()
        }
    }

    /// The kept outcome of a fenced question. `cancelled` is the connector's own word, nil when it
    /// gave none.
    private func record(_ fenced: Fenced, cancelled: Bool?, uncertain: Bool) {
        _ = AskFiles.writeNew(.object([
            "format": .string("lc-macos-ask-response/v1"), "request_id": .string(fenced.request.requestID),
            "outcome": .string("cancelled"), "reason": .string(fenced.detail),
            "connector_cancelled": cancelled.map(JSONValue.bool) ?? .null, "interruption_uncertain": .bool(uncertain),
        ]), to: fenced.directory.appending(path: fenced.request.requestID + ".response.json"))
    }

    // MARK: - The child's lines

    private func call(_ method: String, _ params: JSONValue, timeout: TimeInterval) async -> AskWire.Incoming? {
        guard let child, !child.hasExited else { return nil }
        let id = "c\(nextCall)"
        nextCall += 1
        guard let line = AskWire.request(id: id, method: method, params: params) else { return nil }
        let answer = OneShot<AskWire.Incoming?>()
        waiting[id] = answer
        guard await child.send(line) else {
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
            switch AskWire.parse(line) {
            case .result(let id, let result)?:
                waiting[id]?.resolve(.result(id: id, result))
            case .error(let id, let code)?:
                waiting[id]?.resolve(.error(id: id, code: code))
            case .event(let method, let params)?:
                // Not awaited here: acting on it may wait for answers this reader has to deliver.
                handle(method, params)
            case nil:
                // Not a connector line: nothing is believed from this child any more.
                await lost("the connector wrote something that is not its protocol")
            }
        case .exit:
            await lost("the connector ended", keepsRefusal: true)
        }
    }

    private func handle(_ method: String, _ params: [String: Any]) {
        if method == "connection/changed", params.isEmpty {
            // Read at once, but at most once in `changeInterval`: events that come faster lead to
            // one later read, never to a read for each.
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
            // Fixed words only: the connector's own text is never shown.
            status.detail = MacIngressUpload.same(params["error"], "login_cancelled") ? "the sign-in was cancelled"
                : "the sign-in did not complete"
            publish()
        }
    }

    private func changeReadDue() async {
        changeReadPending = false
        lastChangeRead = Date()
        await readConnection()
    }

    /// The child is gone or cannot be believed: every waiting call ends without an answer. With
    /// `keepsRefusal`, a connector that said it is unavailable and then ended stays shown as that.
    private func lost(_ detail: String, keepsRefusal: Bool = false) async {
        let ending = child
        child = nil
        login = nil
        status.loginPending = false
        if !(keepsRefusal && status.connection == .refused) {
            status.connection = .disconnected
            status.detail = detail
        }
        publish()
        let pending = waiting
        waiting = [:]
        pending.values.forEach { $0.resolve(nil) }
        await ending?.end()
    }

    private func publish() {
        onStatus?(status)
    }
}
