import CoreGraphics
import CoreVideo
import Darwin
import Foundation
import XCTest
@testable import DesktopCapture

// A stand-in for the subscription connector speaking `lc-subscription-live/1`, in this process: it
// answers the envelope of ADR 0004 as scripted. It is not the connector, Codex, a login or a
// model, and it enforces none of the connector's session rules: nothing here reaches a network,
// and every identity, URL, usage figure and answer is synthetic.

final class FakeLiveConnector: AskChildLauncher, FakeChildOwner, @unchecked Sendable {
    enum Reply {
        /// Answers with the request's own provenance and this text.
        case answer(String)
        /// Holds the answer until `release`, an interrupt of it, or Stop.
        case hold
        case error(String, String)
        /// Answers with this result, built from the honest one.
        case altered(@Sendable ([String: Any]) -> [String: Any])
        case silent
    }

    private let lock = NSLock()
    private var onLine: (@Sendable (Data) -> Void)?
    private var onExit: (@Sendable () -> Void)?
    private var child: FakeConnector.Child?
    private var seen: [(method: String, id: String, params: [String: Any])] = []
    private var raw: [Data] = []
    private var held: [(id: String, params: [String: Any])] = []
    private var launchCount = 0
    private var endCount = 0
    private var overlapCount = 0
    private var storedEndDelay: TimeInterval = 0
    private var model = "synthetic-vision"
    private var storedConnection: [String: Any] = FakeLiveConnector.connection()
    private var storedOnTurn: (@Sendable ([String: Any]) -> Reply)?
    private var storedErrors: [String: (String, String)] = [:]
    private var storedSilent: Set<String> = []
    private var storedHoldsWrites: Set<String> = []
    private var storedHeldInPart = false
    private var storedInterruptReply: [String: Any] = ["cancelled": true, "uncertain": false]
    private var storedStopReply: [String: Any] = ["cancelled": false, "uncertain": false]
    private var storedStartResult: (@Sendable ([String: Any]) -> [String: Any])?
    private var storedAfterLoginStart: (@Sendable (FakeLiveConnector) -> Void)?

    static func connection(state: String = "signed_in", mode: Any = "chatgpt", quota: [String: Any]? = nil,
                           imageModels: Bool = true) -> [String: Any] {
        [
            "auth": ["state": state, "mode": mode, "plan": "synthetic-plan"] as [String: Any],
            "quota": quota ?? ["available": false, "ordinary_usage_allowed": NSNull(), "windows": [Any]()] as [String: Any],
            "models": [
                ["id": "synthetic-text", "label": "Synthetic text", "image_input": false, "default": false] as [String: Any],
                ["id": "synthetic-vision-other", "label": "Synthetic vision other", "image_input": imageModels, "default": false],
                ["id": "synthetic-vision", "label": "Synthetic vision", "image_input": imageModels, "default": true],
            ],
        ]
    }

    /// A usage report with one bucket; every figure is made up.
    static func quota(allowed: Any = true, credits: Any = ["has_credits": true, "unlimited": false, "balance": "12.50"] as [String: Any],
                      reached: Any = NSNull()) -> [String: Any] {
        ["available": true, "ordinary_usage_allowed": allowed, "windows": [[
            "limit_id": "synthetic-bucket", "normal_model_slug": "synthetic-vision",
            "primary": ["used_percent": 12, "window_duration_mins": 300, "resets_at": "2026-10-01T10:00:00Z"] as [String: Any],
            "secondary": NSNull(), "credits": credits, "rate_limit_reached_type": reached, "spend_control_reached": false,
            "individual_limit": NSNull(),
        ] as [String: Any]]]
    }

    var connection: [String: Any] {
        get { lock.withLock { storedConnection } }
        set { lock.withLock { storedConnection = newValue } }
    }

    /// What each `companion/turn` is answered with; without it, a fixed synthetic text.
    var onTurn: (@Sendable ([String: Any]) -> Reply)? {
        get { lock.withLock { storedOnTurn } }
        set { lock.withLock { storedOnTurn = newValue } }
    }

    /// Methods answered with this closed error code and submission instead of a result.
    var errors: [String: (String, String)] {
        get { lock.withLock { storedErrors } }
        set { lock.withLock { storedErrors = newValue } }
    }

    /// Methods that get no answer at all.
    var silent: Set<String> {
        get { lock.withLock { storedSilent } }
        set { lock.withLock { storedSilent = newValue } }
    }

    var holdsWrites: Set<String> {
        get { lock.withLock { storedHoldsWrites } }
        set { lock.withLock { storedHoldsWrites = newValue } }
    }

    var heldWritesAreInPart: Bool {
        get { lock.withLock { storedHeldInPart } }
        set { lock.withLock { storedHeldInPart = newValue } }
    }

    var interruptReply: [String: Any] {
        get { lock.withLock { storedInterruptReply } }
        set { lock.withLock { storedInterruptReply = newValue } }
    }

    var stopReply: [String: Any] {
        get { lock.withLock { storedStopReply } }
        set { lock.withLock { storedStopReply = newValue } }
    }

    /// The result of `companion/start`, from its params; without it, the honest one.
    var startResult: (@Sendable ([String: Any]) -> [String: Any])? {
        get { lock.withLock { storedStartResult } }
        set { lock.withLock { storedStartResult = newValue } }
    }

    var afterLoginStart: (@Sendable (FakeLiveConnector) -> Void)? {
        get { lock.withLock { storedAfterLoginStart } }
        set { lock.withLock { storedAfterLoginStart = newValue } }
    }

    let failsWrites: Set<String> = []
    var endDelay: TimeInterval {
        get { lock.withLock { storedEndDelay } }
        set { lock.withLock { storedEndDelay = newValue } }
    }
    var launches: Int { lock.withLock { launchCount } }
    var ends: Int { lock.withLock { endCount } }
    var overlaps: Int { lock.withLock { overlapCount } }
    var methods: [String] { lock.withLock { seen.map(\.method) } }
    /// Every line the app wrote, exactly as written.
    var lines: [Data] { lock.withLock { raw } }

    func params(_ method: String) -> [[String: Any]] {
        lock.withLock { seen.filter { $0.method == method }.map(\.params) }
    }

    /// The `companion/turn` requests seen, in order.
    var turns: [[String: Any]] { params("companion/turn") }

    func launch(_ config: AskConnectorConfig, onLine: @escaping @Sendable (Data) -> Void,
                onExit: @escaping @Sendable () -> Void) -> (any AskChild)? {
        let child = FakeConnector.Child()
        child.owner = self
        lock.withLock {
            if let previous = self.child, !previous.hasExited { overlapCount += 1 }
            self.onLine = onLine
            self.onExit = onExit
            self.child = child
            launchCount += 1
        }
        return child
    }

    func emit(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
        lock.withLock { onLine }?(data)
    }

    func emitRaw(_ line: String) {
        lock.withLock { onLine }?(Data(line.utf8))
    }

    /// The connector process ends by itself.
    func exitChild() {
        let (child, onExit) = lock.withLock { (self.child, self.onExit) }
        child?.markExited()
        onExit?()
    }

    func childEnded() {
        let onExit = lock.withLock { () -> (@Sendable () -> Void)? in
            endCount += 1
            return self.onExit
        }
        onExit?()
    }

    /// The honest result for a `companion/turn`: its own provenance, through the subscription mode.
    static func honest(_ turn: [String: Any], text: String, model: String) -> [String: Any] {
        var provenance = turn
        var image = (provenance["image"] as? [String: Any]) ?? [:]
        image["png_base64"] = nil
        provenance["image"] = image
        return [
            "request_id": turn["request_id"] ?? NSNull(), "text": text, "provenance": provenance, "model": model,
            "auth_mode": "chatgpt", "latency_ms": 1234, "thread_id": "synthetic-thread", "turn_id": "synthetic-turn",
            "kind": turn["trigger"] as? String == "observation" ? "observation" : "generated_assistance",
        ]
    }

    private func fail(_ id: String, _ code: String, _ submission: String) {
        emit(["id": id, "error": ["code": code, "submission": submission]])
    }

    /// Answers the oldest held turn now.
    func release(text: String = "Synthetic late answer.") {
        guard let turn = lock.withLock({ held.isEmpty ? nil : held.removeFirst() }) else { return }
        emit(["id": turn.id, "result": Self.honest(turn.params, text: text, model: lock.withLock { model })])
    }

    func received(_ line: Data) {
        lock.withLock { raw.append(line) }
        guard line.last == 0x0A, let object = (try? JSONSerialization.jsonObject(with: line.dropLast())) as? [String: Any],
              object["version"] as? String == "lc-subscription-live/1", Set(object.keys) == ["version", "id", "method", "params"],
              let id = object["id"] as? String, let method = object["method"] as? String,
              let params = object["params"] as? [String: Any] else {
            lock.withLock { seen.append(("malformed", "", [:])) }
            return
        }
        lock.withLock { seen.append((method, id, params)) }
        if silent.contains(method) { return }
        if let (code, submission) = errors[method] { return fail(id, code, submission) }
        switch method {
        case "connection/read":
            emit(["id": id, "result": connection])
        case "connection/login/start":
            emit(["id": id, "result": ["login_id": "synthetic-login-1", "auth_url": "https://auth.openai.com/synthetic-login?state=not-a-secret"]])
            afterLoginStart?(self)
        case "connection/login/cancel":
            emit(["id": id, "result": [String: Any]()])
        case "companion/start":
            lock.withLock { model = params["model"] as? String ?? "" }
            let policy = (params["policy"] as? [String: Any]) ?? [:]
            emit(["id": id, "result": startResult?(params) ?? [
                "session_id": params["session_id"] ?? NSNull(), "epoch": params["epoch"] ?? NSNull(),
                "remaining_submissions": policy["max_submissions"] ?? NSNull(), "expires_in_ms": policy["max_session_ms"] ?? NSNull(),
            ]])
        case "companion/turn":
            let model = lock.withLock { self.model }
            switch onTurn?(params) ?? .answer("Synthetic text about the picture.") {
            case .answer(let text): emit(["id": id, "result": Self.honest(params, text: text, model: model)])
            case .hold: lock.withLock { held.append((id, params)) }
            case .error(let code, let submission): fail(id, code, submission)
            case .altered(let change): emit(["id": id, "result": change(Self.honest(params, text: "Synthetic text for another request.", model: model))])
            case .silent: break
            }
        case "companion/interrupt":
            // A held turn that is interrupted ends as cancelled, after it had been submitted; one
            // whose interruption is not confirmed ends as that, with its outcome not known.
            let target = params["request_id"] as? String
            let turn = lock.withLock { () -> (id: String, params: [String: Any])? in
                guard let index = held.firstIndex(where: { $0.params["request_id"] as? String == target }) else { return nil }
                return held.remove(at: index)
            }
            if let turn {
                if interruptReply["uncertain"] as? Bool == false {
                    fail(turn.id, "cancelled", "submitted")
                } else {
                    fail(turn.id, "interrupt_unconfirmed", "unknown")
                }
            }
            emit(["id": id, "result": interruptReply])
        case "companion/stop":
            let stopped = lock.withLock { () -> [(id: String, params: [String: Any])] in
                defer { held = [] }
                return held
            }
            stopped.forEach { fail($0.id, "session_stopped", "submitted") }
            emit(["id": id, "result": stopReply])
        default:
            fail(id, "invalid_request", "not_submitted")
        }
    }
}

extension Optional {
    func unwrapped() throws -> Wrapped { try XCTUnwrap(self) }
}

/// The Mac consumer of the live companion interface (ADR 0004): the wire shapes, the account's
/// usage as reported, the session's local account, the whole-display picture, and the link's
/// lifecycle (explicit Start, bounded looks, automatic focus, follow-up, cancel, Stop, loss).
/// Everything runs against the in-process stand-in above or a stub shell script: no connector, no
/// Codex, no sign-in, no model and no network are exercised.
extension DesktopCaptureTests {
    final class LiveLog: @unchecked Sendable {
        private let lock = NSLock()
        private var statuses: [LiveStatus] = []
        func add(_ status: LiveStatus) { lock.withLock { statuses.append(status) } }
        var all: [LiveStatus] { lock.withLock { statuses } }
    }

    final class LiveClock: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Double
        init(_ value: Double) { self.value = value }
        var now: Double { lock.withLock { value } }
        func advance(_ seconds: Double) { lock.withLock { value += seconds } }
    }

    /// One capture of a 100×50 pt display kept as 200×100 frames, with its editable ink.
    struct LiveStand {
        let recorder: CaptureRecorder
        let display: DisplayFacts
        let ink: InkSession
        var session: URL { recorder.directory }
        var id: String { recorder.status.session }
    }

    func liveStand(_ name: String, excluded: Bool = true) throws -> LiveStand {
        let scope = excluded ? DisplayFacts.appExcludedScope(showsCursor: true) : DisplayFacts.inkOverlayScope(showsCursor: true)
        let display = DisplayFacts(displayID: 7, name: "Synthetic Display", frame: RecordedRect(CGRect(x: -100, y: 0, width: 100, height: 50)),
                                   pointPixelScale: 2, requestedWidth: 200, requestedHeight: 100, rotationDegrees: 0, isMain: false,
                                   scope: scope)
        let recorder = try CaptureRecorder(
            root: root.appending(path: name, directoryHint: .isDirectory), display: display,
            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 24, silenceLimit: 6, showsCursor: true),
            permissionPreflightAtStart: true, composesInk: excluded, wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        recorder.streamStarted(host: 100, wall: Date(timeIntervalSince1970: 1_790_000_000.5))
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: recorder.status.session,
                                                   createdWall: Date(timeIntervalSince1970: 1_790_000_000.5)))
        return LiveStand(recorder: recorder, display: display, ink: ink)
    }

    /// Keeps one more frame of the stand's display, a plain grey of `shade`.
    func liveKeep(_ stand: LiveStand, host: Double, shade: UInt8 = 128) throws -> FrameReference {
        stand.recorder.frame(facts(.complete, source: host - 0.1), image: try greyBuffer(shade: shade), host: host, accepted: true)
        let frame = FrameReference(try XCTUnwrap(stand.recorder.status.lastKept))
        return frame
    }

    /// `frame` with the ink as it is now, as the app freezes it for a look or a follow-up.
    func liveInput(_ stand: LiveStand, _ frame: FrameReference, geometryProblem: String? = nil) -> LiveFrameInput {
        LiveFrameInput.freeze(frame: frame, document: stand.ink.document, captureSession: stand.session, captureSessionID: stand.id,
                              display: stand.display, geometryProblem: geometryProblem)
    }

    /// One pen stroke along `y` pt from x = 10 pt to `toX`.
    func liveDraw(_ stand: LiveStand, on frame: FrameReference, y: Double = 10, toX: Double = 90, host: Double) {
        let anchor = InkAnchor(nativeSession: stand.id, frame: frame, host: host)
        stand.ink.setMode(.write, host: host)
        XCTAssertEqual(stand.ink.begin(at: InkPoint(x: 10, y: y, eventTime: host), device: .tabletPen, anchor: anchor), .accepted)
        stand.ink.extend(to: InkPoint(x: toX, y: y, eventTime: host + 0.1))
        XCTAssertEqual(stand.ink.end(host: host + 0.2), .accepted)
    }

    /// A confirmed selection on `frame`, frozen as the app freezes it at Finish.
    func liveSelect(_ stand: LiveStand, on frame: FrameReference, from: (x: Double, y: Double) = (20, 5),
                    to: (x: Double, y: Double) = (60, 25), host: Double) throws -> (input: LiveFrameInput, rect: RecordedRect, id: String) {
        let anchor = InkAnchor(nativeSession: stand.id, frame: frame, host: host)
        stand.ink.setMode(.ask, host: host)
        XCTAssertEqual(stand.ink.begin(at: InkPoint(x: from.x, y: from.y, eventTime: host), device: .mouse, anchor: anchor), .accepted)
        stand.ink.extend(to: InkPoint(x: to.x, y: to.y, eventTime: host + 0.1))
        let context = SelectionContext(nativeSession: stand.id, captureSession: stand.session, display: stand.display, frame: frame,
                                       freshness: "live", geometryProblem: nil)
        XCTAssertEqual(stand.ink.end(host: host + 0.2, selection: context), .accepted)
        let selection = try XCTUnwrap(stand.ink.finishAsk(geometryProblem: nil, inkDirectory: nil, host: host + 0.3))
        let frozen = try XCTUnwrap(AskSelectionInput.freeze(selection: selection, document: stand.ink.document,
                                                            captureSession: stand.session, display: stand.display))
        return (try XCTUnwrap(LiveFrameInput(selection: frozen)), selection.rect, selection.id)
    }

    func liveLink(_ connector: FakeLiveConnector, callTimeout: TimeInterval = 5, turnTimeout: TimeInterval = 20,
                  clock: LiveClock? = nil) -> LiveLink {
        if let clock {
            return LiveLink(config: .success(askConfig), launcher: connector, callTimeout: callTimeout, turnTimeout: turnTimeout,
                            changeInterval: 0, clock: { clock.now })
        }
        return LiveLink(config: .success(askConfig), launcher: connector, callTimeout: callTimeout, turnTimeout: turnTimeout,
                        changeInterval: 0)
    }

    /// The card the link shows now.
    func liveCard(_ link: LiveLink) async throws -> LiveCard {
        let status = await link.currentStatus()
        return try XCTUnwrap(status.card)
    }

    func liveRecord(_ session: URL, _ name: String) throws -> [String: Any] {
        try decodedObject(Data(contentsOf: session.appending(path: "live/" + name)))
    }

    /// A connected link with a started session on `stand`.
    func liveStarted(_ connector: FakeLiveConnector, _ stand: LiveStand, policy: LivePolicy = LivePolicy(
        maxSubmissions: 10, maxSessionMS: 600_000, minObservationIntervalMS: 30_000), clock: LiveClock? = nil,
                     turnTimeout: TimeInterval = 20) async -> LiveLink {
        let link = liveLink(connector, turnTimeout: turnTimeout, clock: clock)
        await link.connect()
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        return link
    }

    /// The gaps a request states, as "from-to reason".
    func liveGaps(_ turn: [String: Any]) -> [String] {
        ((turn["gaps"] as? [[String: Any]]) ?? []).map {
            "\(($0["from_frame_seq"] as? Int) ?? -1)-\(($0["to_frame_seq"] as? Int) ?? -1) \(($0["reason"] as? String) ?? "?")"
        }
    }

    func turnField<T>(_ turn: [String: Any], _ path: String...) -> T? {
        var value: Any? = turn
        for key in path { value = (value as? [String: Any])?[key] }
        return value as? T
    }

    // MARK: - The wire

    func testLiveEnvelopePolicyAndStrictAnswers() throws {
        let line = try XCTUnwrap(LiveWire.request(id: "c1", method: "connection/read", params: .object([:])))
        XCTAssertEqual(String(decoding: line, as: UTF8.self),
                       "{\"id\":\"c1\",\"method\":\"connection/read\",\"params\":{},\"version\":\"lc-subscription-live/1\"}\n")

        func incoming(_ text: String) -> LiveWire.Incoming? { LiveWire.parse(Data(text.utf8)) }
        guard case .result(let id, let result)? = incoming("{\"id\":\"c1\",\"result\":{\"a\":1}}") else { return XCTFail("result") }
        XCTAssertEqual(id, "c1")
        XCTAssertEqual(result["a"] as? Int, 1)
        guard case .error(let failed, let error)? = incoming("{\"id\":\"c2\",\"error\":{\"code\":\"busy\",\"submission\":\"not_submitted\"}}") else {
            return XCTFail("error")
        }
        XCTAssertEqual(failed, "c2")
        XCTAssertEqual(error, LiveError(code: "busy", submission: .notSubmitted))
        guard case .error(nil, _)? = incoming("{\"id\":null,\"error\":{\"code\":\"invalid_request\",\"submission\":\"not_submitted\"}}") else {
            return XCTFail("error without a request")
        }
        guard case .event("connection/changed", let params)? = incoming("{\"method\":\"connection/changed\",\"params\":{}}") else {
            return XCTFail("event")
        }
        XCTAssertTrue(params.isEmpty)
        // A code or submission outside the closed sets is a failure whose outcome is not known.
        guard case .error(_, let unknownCode)? = incoming("{\"id\":\"c3\",\"error\":{\"code\":\"made_up\",\"submission\":\"not_submitted\"}}"),
              case .error(_, let unknownSubmission)? = incoming("{\"id\":\"c3\",\"error\":{\"code\":\"failed\",\"submission\":\"maybe\"}}") else {
            return XCTFail("open values")
        }
        XCTAssertEqual(unknownCode, LiveError(code: "failed", submission: .unknown))
        XCTAssertEqual(unknownSubmission, LiveError(code: "failed", submission: .unknown))
        // Anything else is not a line of this interface: a message text, an extra key, both forms.
        for text in ["{\"id\":\"c1\",\"error\":{\"code\":\"busy\",\"message\":\"x\"}}",
                     "{\"id\":\"c1\",\"error\":{\"code\":\"busy\",\"submission\":\"not_submitted\",\"message\":\"x\"}}",
                     "{\"id\":\"c1\",\"result\":{},\"error\":{\"code\":\"busy\",\"submission\":\"not_submitted\"}}",
                     "{\"id\":\"c1\",\"result\":{},\"extra\":1}", "{\"id\":\"\",\"result\":{}}", "{\"id\":7,\"result\":{}}",
                     "{\"method\":\"connection/changed\"}", "{\"method\":\"x\",\"params\":{},\"id\":\"c1\"}", "[]", "not json"] {
            XCTAssertNil(incoming(text), text)
        }

        // The bounds are the user's: out of range is refused, never clamped.
        XCTAssertNil(LivePolicy.preset.problem)
        XCTAssertEqual([LivePolicy.preset.maxSubmissions, LivePolicy.preset.maxSessionMS, LivePolicy.preset.minObservationIntervalMS],
                       [60, 1_800_000, 30_000])
        XCTAssertNotNil(LivePolicy(maxSubmissions: 0, maxSessionMS: 60_000, minObservationIntervalMS: 1_000).problem)
        XCTAssertNotNil(LivePolicy(maxSubmissions: 101, maxSessionMS: 60_000, minObservationIntervalMS: 1_000).problem)
        XCTAssertNotNil(LivePolicy(maxSubmissions: 5, maxSessionMS: 999, minObservationIntervalMS: 1_000).problem)
        XCTAssertNotNil(LivePolicy(maxSubmissions: 5, maxSessionMS: 3_600_001, minObservationIntervalMS: 1_000).problem)
        XCTAssertNotNil(LivePolicy(maxSubmissions: 5, maxSessionMS: 60_000, minObservationIntervalMS: 499).problem)
        XCTAssertNotNil(LivePolicy(maxSubmissions: 5, maxSessionMS: 60_000, minObservationIntervalMS: 60_001).problem)
        // The connector's own rule for the requests kept for the user: one fifth, at least one.
        for (requests, looks) in [(1, 0), (2, 1), (5, 4), (6, 4), (12, 9), (60, 48), (100, 80)] {
            XCTAssertEqual(LivePolicy(maxSubmissions: requests, maxSessionMS: 60_000, minObservationIntervalMS: 1_000).observationLimit,
                           looks, "\(requests)")
        }

        // The answer to Start is for exactly the session and bounds that were asked for.
        let policy = LivePolicy(maxSubmissions: 10, maxSessionMS: 60_000, minObservationIntervalMS: 1_000)
        let started: [String: Any] = ["session_id": "live-1", "epoch": 1, "remaining_submissions": 10, "expires_in_ms": 59_990]
        XCTAssertEqual(LiveWire.started(started, sessionID: "live-1", epoch: 1, policy: policy)?.expiresInMS, 59_990)
        for (name, change) in [("another session", ["session_id": "live-2"]), ("another epoch", ["epoch": 2]),
                               ("more requests", ["remaining_submissions": 11]), ("more time", ["expires_in_ms": 60_001]),
                               ("an extra key", ["extra": 1])] as [(String, [String: Any])] {
            XCTAssertNil(LiveWire.started(started.merging(change) { $1 }, sessionID: "live-1", epoch: 1, policy: policy), name)
        }
        XCTAssertEqual(LiveWire.control(["cancelled": true, "uncertain": false])?.cancelled, true)
        XCTAssertNil(LiveWire.control(["cancelled": true]))
        XCTAssertNil(LiveWire.control(["cancelled": 1, "uncertain": 0]))

        // Which refusals end the session, and that every code has fixed words of its own.
        let leaves: Set<String> = ["busy", "cancelled", "stale_context", "invalid_request", "budget_reached"]
        for code in LiveWire.errorCodes {
            XCTAssertEqual(LiveError(code: code, submission: .notSubmitted).endsSession, !leaves.contains(code), code)
            XCTAssertTrue(LiveError(code: code, submission: .unknown).endsSession, code)
            XCTAssertNotEqual(LiveError(code: code, submission: .notSubmitted).words, code == "failed" ? "" : "the request failed", code)
        }
        XCTAssertTrue(LiveError(code: "budget_reached", submission: .submitted).endsSession)
        XCTAssertNotEqual(LiveError(code: "budget_reached", submission: .submitted).words,
                          LiveError(code: "budget_reached", submission: .notSubmitted).words)
        XCTAssertEqual(Set(LiveWire.errorCodes.map { LiveError(code: $0, submission: .notSubmitted).words }).count, LiveWire.errorCodes.count)
        XCTAssertTrue(LiveError(code: "rate_limited", submission: .notSubmitted).words.contains("not a used-up allowance"))
    }

    func testLiveUsageIsShownAsReportedAndNeverGuessed() throws {
        func parsed(_ connection: [String: Any]) -> LiveConnection? { LiveConnection.parse(connection) }
        // Unavailable is not zero, and states nothing.
        let unavailable = try XCTUnwrap(parsed(FakeLiveConnector.connection()))
        XCTAssertEqual(unavailable.auth, .signedIn)
        XCTAssertEqual(unavailable.quota.lines(readAt: "2026-10-01T09:00:00Z"),
                       ["Usage as ChatGPT reported it at 2026-10-01T09:00:00Z: not available then (not known; this is not zero)."])
        XCTAssertNil(parsed(FakeLiveConnector.connection(quota: ["available": false, "ordinary_usage_allowed": true, "windows": [Any]()])))

        let reported = try XCTUnwrap(parsed(FakeLiveConnector.connection(quota: FakeLiveConnector.quota())))
        let lines = reported.quota.lines(readAt: "2026-10-01T09:00:00Z")
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(lines[0], "Usage as ChatGPT reported it at 2026-10-01T09:00:00Z (the account's, not this app's session bounds; "
            + "Check Again reads it again): included usage was allowed then.")
        XCTAssertEqual(lines[1], "synthetic-bucket (synthetic-vision): first window 12% used (5-hour), resets 2026-10-01T10:00:00Z; "
            + "credits: some, balance 12.50 as ChatGPT states it (not an amount of money); no spend control is reached.")

        // Null is not false, false says nothing about credits, and a missing balance is not zero.
        let notAllowed = try XCTUnwrap(parsed(FakeLiveConnector.connection(quota: FakeLiveConnector.quota(
            allowed: false, credits: ["has_credits": false, "unlimited": false, "balance": NSNull()] as [String: Any],
            reached: "workspace_member_credits_depleted"))))
        let refusedLines = notAllowed.quota.lines(readAt: "t")
        XCTAssertTrue(refusedLines[0].hasSuffix("included usage was NOT allowed then (this alone says nothing about credits)."))
        XCTAssertTrue(refusedLines[1].contains("credits: none, balance not reported; reached: this member's credits are used up"))
        let notReported = try XCTUnwrap(parsed(FakeLiveConnector.connection(quota: FakeLiveConnector.quota(allowed: NSNull(), credits: NSNull()))))
        XCTAssertTrue(notReported.quota.lines(readAt: "t")[0].hasSuffix("whether included usage was allowed was not reported."))
        XCTAssertTrue(notReported.quota.lines(readAt: "t")[1].contains("credits not reported"))
        let unlimited = try XCTUnwrap(parsed(FakeLiveConnector.connection(quota: FakeLiveConnector.quota(
            credits: ["has_credits": true, "unlimited": true, "balance": NSNull()] as [String: Any]))))
        XCTAssertTrue(unlimited.quota.lines(readAt: "t")[1].contains("credits: unlimited"))

        // The shape is closed: a changed or missing fact is not read as another one.
        func changed(_ change: (inout [String: Any]) -> Void) -> [String: Any] {
            var quota = FakeLiveConnector.quota()
            var window = (quota["windows"] as? [[String: Any]])?[0] ?? [:]
            change(&window)
            quota["windows"] = [window]
            return FakeLiveConnector.connection(quota: quota)
        }
        XCTAssertNil(parsed(changed { $0["individual_limit"] = nil }), "a missing key")
        XCTAssertNil(parsed(changed { $0["extra"] = 1 }), "an extra key")
        XCTAssertNil(parsed(changed { $0["rate_limit_reached_type"] = "made_up" }), "an unknown reached type")
        XCTAssertNil(parsed(changed { $0["spend_control_reached"] = 0 }), "a number for a boolean")
        XCTAssertNil(parsed(changed { $0["credits"] = ["has_credits": true, "unlimited": false, "balance": 12.5] as [String: Any] }),
                     "a balance as a number")
        XCTAssertNil(parsed(changed { $0["primary"] = ["used_percent": -1, "window_duration_mins": 300, "resets_at": NSNull()] as [String: Any] }))
        var old = FakeLiveConnector.connection()
        old["rate_limits"] = NSNull()
        XCTAssertNil(parsed(old), "the single-question shape is not this one")

        // Signed in another way is not the managed subscription; and only models that take pictures count.
        XCTAssertNil(parsed(FakeLiveConnector.connection(mode: "api_key")))
        XCTAssertEqual(parsed(FakeLiveConnector.connection(mode: NSNull()))?.auth, .otherMode)
        XCTAssertEqual(parsed(FakeLiveConnector.connection(state: "signed_out", mode: NSNull()))?.auth, .signedOut)
        var status = LiveStatus(connection: .signedIn)
        status.models = reported.models
        XCTAssertEqual(status.usableModels.map(\.id), ["synthetic-vision", "synthetic-vision-other"], "the default first")
        XCTAssertNil(status.startProblem)
        status.models = [AskConnection.Model(id: "-odd id", label: "Odd", imageInput: true, isDefault: true)]
        XCTAssertEqual(status.startProblem, "no model that takes pictures is listed")
        status.connection = .signedOut
        XCTAssertEqual(status.startProblem, "check the connection and sign in first")
    }

    // MARK: - The session's own account

    func testLiveSessionNumbersLooksReserveAndGaps() throws {
        let stand = try liveStand("live-session")
        let frame = try liveKeep(stand, host: 100.3)
        let input = liveInput(stand, frame)
        let policy = LivePolicy(maxSubmissions: 5, maxSessionMS: 60_000, minObservationIntervalMS: 10_000)
        var session = LiveSession(id: "live-1", captureSessionID: stand.id, model: "synthetic-vision", policy: policy, remaining: 5,
                                  expiresHost: 160)
        func turn(_ seq: Int, _ picture: LivePicture, id: String) -> LiveTurn {
            LiveTurn(requestID: id, sessionID: "live-1", epoch: 1, permissionRevision: 1, trigger: .observation, assistance: .none,
                     presents: false, userText: nil, picture: picture, frameSeq: seq, focus: nil, history: [], gaps: [])
        }
        let picture = try LiveFrameBuilder.render(input).get().picture

        // Nothing waits, nothing goes.
        XCTAssertNil(session.nextLook(nowHost: 100))
        // The newest waiting frame replaces the one before it, which is a stated gap.
        session.offer(input)
        session.offer(input)
        XCTAssertEqual(session.gaps, [LiveGap(from: 1, to: 1, reason: .coalesced)])
        let first = try XCTUnwrap(session.nextLook(nowHost: 100))
        XCTAssertEqual(first.seq, 2)
        session.out = 1
        XCTAssertNil(session.nextLookHost, "the interval runs from when a look is written")
        session.sent(turn(2, picture, id: "live-1.look.2"), nowHost: 100)
        // While a request is out, and until the interval has passed, no look goes.
        session.offer(input)
        XCTAssertNil(session.nextLook(nowHost: 120), "a request is out")
        session.out = 0
        session.spend()
        session.looked(turn(2, picture, id: "live-1.look.2"), text: "Synthetic look.", at: "2026-10-01T09:00:00Z")
        XCTAssertNil(session.nextLook(nowHost: 109.9), "the interval has not passed")
        XCTAssertEqual(session.nextLookHost, 110)
        XCTAssertEqual(try XCTUnwrap(session.nextLook(nowHost: 110)).seq, 3)
        XCTAssertEqual(session.info.seenFrame, 2)

        // The user's own picture: the latest sent picture's number when it is that very frame and
        // nothing newer was numbered; else the next number.
        XCTAssertTrue(session.hasSeen(picture), "the very picture of look 2: there is nothing new in it")
        session.sent(turn(3, picture, id: "live-1.look.3"), nowHost: 110)
        XCTAssertFalse(session.hasSeen(picture), "written, and not looked at yet")
        session.looked(turn(3, picture, id: "live-1.look.3"), text: "Synthetic look.", at: "2026-10-01T09:00:10Z")
        XCTAssertTrue(session.hasSeen(picture))
        XCTAssertEqual(session.number(picture), 3)
        XCTAssertTrue(session.isLatest(3, picture))
        var other = picture
        other.sha256 = String(repeating: "1", count: 64)
        XCTAssertEqual(session.number(other), 4)
        XCTAssertFalse(session.isLatest(3, other))
        XCTAssertEqual(session.number(picture), 5, "a newer picture was numbered in between")

        // Requests are never given back; when only the ones kept for the user are left (1 of 5),
        // looks stop for the rest of the session, and frames after that are stated as not given.
        session.spend()
        session.spend()
        session.spend()
        XCTAssertEqual(session.used, 4)
        session.offer(input)
        XCTAssertNil(session.nextLook(nowHost: 200))
        XCTAssertNotNil(session.info.paused)
        XCTAssertEqual(session.gaps.last, LiveGap(from: 6, to: 6, reason: .budget))
        session.offer(input)
        XCTAssertEqual(session.gaps.last, LiveGap(from: 6, to: 7, reason: .budget), "neighbouring frames are one run")
        XCTAssertFalse(session.isUsedUp)
        session.spend()
        XCTAssertTrue(session.isUsedUp)
        XCTAssertEqual(session.info.state, .usedUp)
        session.end("stopped by you")
        XCTAssertEqual(session.info.state, .ended("stopped by you"))
        session.offer(input)
        XCTAssertEqual(session.frames, 7, "nothing is offered to an ended session")

        // The session line: its own bounds, in fixed words, apart from the account's usage.
        var running = LiveSession(id: "live-2", captureSessionID: stand.id, model: "synthetic-vision", policy: policy, remaining: 5,
                                  expiresHost: 160)
        XCTAssertEqual(running.info.line(nowHost: 100),
                       "AI: ChatGPT (synthetic-vision) observes this whole display as it changes, at most once every 10 s. "
                        + "0 of 5 requests used (5 left; the last 1 is kept for your own selections and questions); about 1 min left. "
                        + "These are this session's own bounds, counted on this Mac, not ChatGPT's quota. "
                        + "ChatGPT has not completed a look yet (0 picture(s) offered).")
        running.end("this session's time is over")
        XCTAssertEqual(running.info.line(nowHost: 170),
                       "AI: stopped observing this display: this session's time is over. 0 of 5 requests used (5 left; the last 1 is "
                        + "kept for your own selections and questions). Nothing is sent to ChatGPT now; Start the AI starts a new session.")
        XCTAssertEqual(LiveSessionInfo(state: .off(nil)).line(nowHost: 0),
                       "AI: not observing this display (it was not started). Frames and ink stay on this Mac.")
    }

    func testLiveContextIsWholeEntriesWithinBoundsAndStatedGaps() throws {
        let stand = try liveStand("live-context")
        let frame = try liveKeep(stand, host: 100.3)
        let picture = try LiveFrameBuilder.render(liveInput(stand, frame)).get().picture
        let policy = LivePolicy(maxSubmissions: 100, maxSessionMS: 60_000, minObservationIntervalMS: 500)
        var session = LiveSession(id: "live-1", captureSessionID: stand.id, model: "synthetic-vision", policy: policy, remaining: 100,
                                  expiresHost: 160)
        func turn(_ seq: Int, words: String? = nil, focus: LiveFocus? = nil) -> LiveTurn {
            LiveTurn(requestID: "r\(seq)", sessionID: "live-1", epoch: 1, permissionRevision: 1,
                     trigger: words == nil ? (focus == nil ? .observation : .focus) : .textFollowup,
                     assistance: words == nil && focus == nil ? .none : .hint, presents: words != nil || focus != nil, userText: words,
                     picture: picture, frameSeq: seq, focus: focus, history: [], gaps: [])
        }
        // 30 looks of 1,000 characters each: more than the bounds take.
        for seq in 1...30 {
            session.looked(turn(seq), text: String(repeating: "x", count: 1_000), at: "2026-10-01T09:00:00Z")
        }
        let context = session.context(for: 31)
        XCTAssertEqual(context.history.count, 23, "one entry is kept free for an earlier focus")
        XCTAssertEqual(context.history.map(\.frameSeq), Array(8...30), "the newest whole entries, in order")
        XCTAssertEqual(context.gaps, [LiveGap(from: 1, to: 7, reason: .budget)], "what is left out is stated")
        XCTAssertEqual(session.history.count, 30, "nothing is deleted from the session's own record")

        // An entry too long to be sent at all is skipped, never cut.
        session.looked(turn(31), text: String(repeating: "y", count: 4_001), at: "2026-10-01T09:00:00Z")
        let skipped = session.context(for: 32)
        XCTAssertFalse(skipped.history.contains { $0.frameSeq == 31 })
        XCTAssertTrue(skipped.gaps.contains(LiveGap(from: 31, to: 31, reason: .budget)))
        XCTAssertTrue(skipped.history.allSatisfy { $0.text.unicodeScalars.count == 1_000 })
        // Only what came before the request's own picture, and gaps end before it.
        let earlier = session.context(for: 10)
        XCTAssertEqual(earlier.history.map(\.frameSeq), Array(1...10))
        XCTAssertTrue(earlier.gaps.isEmpty)

        // Whether the user saw an answer is recorded apart from the answer.
        session.answered(turn(32, words: "Why?"), text: "Synthetic hint.", askedAt: "2026-10-01T09:01:00Z", at: "2026-10-01T09:01:05Z")
        XCTAssertEqual(session.history.suffix(2).map(\.kind), [.user, .assistant])
        XCTAssertEqual(session.history.last?.presentation, "unconfirmed")
        session.presented("r32", shown: true)
        XCTAssertEqual(session.history.last?.presentation, "shown")
        session.presented("r32", shown: false)
        XCTAssertEqual(session.history.last?.presentation, "shown", "a recorded display is not taken back")

        // An earlier focus is named with its own picture and the plain statement that its pixels
        // are not part of the request; the old rectangle is never put on a newer picture.
        let focus = try XCTUnwrap(LiveFocus.make(RecordedRect(CGRect(x: 20, y: 5, width: 40, height: 20)), frameSeq: 32,
                                                 display: picture.displayBounds, frameWidth: 200, frameHeight: 100))
        let reference = try XCTUnwrap(LiveSession.focusReference(turn(32, focus: focus)))
        XCTAssertEqual([reference.kind.rawValue, reference.presentation, reference.requestID], ["observation", "not_presented", "r32"])
        XCTAssertEqual(reference.frameSeq, 32)
        let text = try decodedObject(Data(reference.text.utf8))
        XCTAssertEqual(Set(text.keys), ["kind", "request_id", "image", "context", "focus", "pixels_attached_to_this_request",
                                        "provider_retention", "limitation"])
        XCTAssertEqual(text["kind"] as? String, "historical_focus_reference")
        XCTAssertEqual(text["pixels_attached_to_this_request"] as? Bool, false)
        XCTAssertEqual(text["provider_retention"] as? String, "unverified")
        XCTAssertNil((text["image"] as? [String: Any])?["png_base64"])
        XCTAssertNil(LiveSession.focusReference(turn(32)), "no focus, no reference")
        let withReference = session.context(for: 40, extra: reference)
        XCTAssertEqual(withReference.history.last, reference)
        XCTAssertLessThanOrEqual(withReference.history.count, LiveTurn.maxHistoryEntries)

        func freshSession() -> LiveSession {
            LiveSession(id: "live-1", captureSessionID: stand.id, model: "synthetic-vision", policy: policy, remaining: 100,
                        expiresHost: 160)
        }
        func notice(_ entries: [LiveHistoryEntry]) -> LiveHistoryEntry? {
            entries.first { $0.text.hasPrefix("Bounded context omission metadata (not a screen observation).") }
        }

        // An available user row or current image cannot stand in for a missing answer on that
        // same frame. The omission is explicit even when this request uses the original sequence.
        var partial = freshSession()
        let longAnswer = String(repeating: "z", count: LiveTurn.maxTextCharacters + 1)
        partial.answered(turn(1, words: "Why?"), text: longAnswer, askedAt: "2026-10-01T09:01:00Z", at: "2026-10-01T09:01:05Z")
        for requestedSeq in [1, 2] {
            let projection = partial.context(for: requestedSeq)
            XCTAssertEqual(projection.history.filter { $0.kind == .user }.map(\.text), ["Why?"])
            XCTAssertFalse(projection.history.contains { $0.text == longAnswer })
            XCTAssertTrue(projection.gaps.isEmpty, "missing dialogue is not a missing image on the partly retained/current frame")
            let omission = try XCTUnwrap(notice(projection.history))
            XCTAssertTrue(omission.text.contains("Unrepresented original history entries: 1; known frame bounds: 1 through 1"))
            XCTAssertTrue(omission.text.contains("entries on the request's current frame: \(requestedSeq == 1 ? 1 : 0)"))
            XCTAssertNil(omission.frameSeq, "metadata is not a new observation on a frame")
            XCTAssertNil(omission.requestID)
            XCTAssertNil(omission.at)
            XCTAssertEqual(omission.presentation, "not_presented")
            var request = turn(requestedSeq, words: "What about that hint?")
            request.history = projection.history
            request.gaps = projection.gaps
            XCTAssertNil(request.problem)
        }
        XCTAssertEqual(partial.history.map(\.text), ["Why?", longAnswer], "the whole original dialogue remains intact")

        // More than the wire's gap limit keeps recent exact ranges and declares omitted older
        // coverage. A range bound does not invent observations or claim all intervening frames.
        var crowded = freshSession()
        for number in 1...65 { crowded.gap(number, number.isMultiple(of: 2) ? .backpressure : .coalesced) }
        let bounded = crowded.context(for: 66)
        XCTAssertEqual(bounded.gaps.count, LiveTurn.maxGaps)
        XCTAssertEqual(bounded.gaps.first?.from, 2)
        let coverage = try XCTUnwrap(notice(bounded.history))
        XCTAssertTrue(coverage.text.contains("Gap range records omitted: 1; frame bounds: 1 through 1"))
        XCTAssertTrue(coverage.text.contains("they do not assert that each intervening frame is missing"))
        XCTAssertEqual(crowded.gaps.count, 65, "the original coverage is not truncated")

        // Current-frame partial omission and overflowing coverage share one metadata entry.
        crowded.gap(66, .backpressure)
        crowded.answered(turn(67, words: "Why?"), text: longAnswer, askedAt: "2026-10-01T09:01:00Z", at: "2026-10-01T09:01:05Z")
        let combined = crowded.context(for: 67)
        XCTAssertEqual(combined.history.filter { $0.text.hasPrefix("Bounded context omission metadata") }.count, 1)
        let combinedNotice = try XCTUnwrap(notice(combined.history))
        XCTAssertTrue(combinedNotice.text.contains("entries on the request's current frame: 1"))
        XCTAssertTrue(combinedNotice.text.contains("Gap range records omitted: 2; frame bounds: 1 through 2"))
        XCTAssertEqual(combined.gaps.count, LiveTurn.maxGaps)
        XCTAssertTrue(combined.gaps.allSatisfy { $0.to < 67 })
        XCTAssertEqual(crowded.gaps.count, 66)
        XCTAssertEqual(crowded.history.last?.text, longAnswer)

        // A notice and explicit historical focus also fit when all ordinary history slots and
        // character headroom were occupied: only whole oldest entries leave the projection.
        var full = freshSession()
        for number in 1...23 { full.looked(turn(number), text: String(repeating: "x", count: 1_000), at: "2026-10-01T09:00:00Z") }
        for number in 40...104 { full.gap(number, number.isMultiple(of: 2) ? .backpressure : .coalesced) }
        let fitted = full.context(for: 105, extra: reference)
        XCTAssertNotNil(notice(fitted.history))
        XCTAssertEqual(fitted.history.last, reference, "the explicitly supplied focus is preserved")
        XCTAssertLessThanOrEqual(fitted.history.count, LiveTurn.maxHistoryEntries)
        XCTAssertLessThanOrEqual(fitted.history.reduce(0) { $0 + $1.text.unicodeScalars.count }, LiveSession.historyCharacters)
        XCTAssertLessThanOrEqual(fitted.gaps.count, LiveTurn.maxGaps)
        XCTAssertTrue(fitted.history.allSatisfy { $0.text.unicodeScalars.count <= LiveTurn.maxTextCharacters })
        XCTAssertEqual(full.history.count, 23)
        XCTAssertEqual(full.gaps.count, 65)
        var fittedRequest = turn(105, words: "What about that hint?")
        fittedRequest.history = fitted.history
        fittedRequest.gaps = fitted.gaps
        XCTAssertNil(fittedRequest.problem)
    }

    // MARK: - The picture

    func testLivePictureIsTheWholeKeptFrameAndASelectionIsAFocusInIt() throws {
        let stand = try liveStand("live-picture")
        let frame = try liveKeep(stand, host: 100.3)
        let raw = try Data(contentsOf: stand.session.appending(path: frame.file))

        // No ink document, or none visible: the picture is the retained frame's own bytes, and no new file is made.
        let bare = try LiveFrameBuilder.render(LiveFrameInput.freeze(frame: frame, document: nil, captureSession: stand.session,
                                                                      captureSessionID: stand.id, display: stand.display)).get()
        XCTAssertEqual(bare.picture.png, raw)
        XCTAssertEqual([bare.picture.width, bare.picture.height], [200, 100])
        XCTAssertEqual([bare.file, bare.picture.sha256], [frame.file, frame.sha256])
        XCTAssertEqual(bare.ink, .noneVisible)
        XCTAssertNil(bare.inkFile)
        XCTAssertNil(bare.picture.inkRevision)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stand.session.appending(path: "live/pictures").path(percentEncoded: false)))
        let empty = try LiveFrameBuilder.render(liveInput(stand, frame)).get()
        XCTAssertEqual(empty.picture.png, raw)
        XCTAssertEqual(empty.picture.inkRevision, 0)
        XCTAssertEqual(empty.inkFile.map { $0.hasPrefix("live/ink/") }, true, "the editable ink is kept with the picture")

        // The capture did not exclude this app: nothing is drawn, and the ink in the pixels is not known.
        let shared = try liveStand("live-picture-shared", excluded: false)
        let sharedFrame = try liveKeep(shared, host: 100.3)
        liveDraw(shared, on: sharedFrame, host: 101)
        let unknown = try LiveFrameBuilder.render(liveInput(shared, sharedFrame)).get()
        XCTAssertEqual(unknown.ink, .unknown)
        XCTAssertEqual(unknown.file, sharedFrame.file)
        XCTAssertNotNil(unknown.picture.inkRevision)
        XCTAssertNil(unknown.picture.inkSHA256, "no editable original is bound to pixels whose ink is not known")
        // A changed display size: the ink is not drawn either, and that is said.
        liveDraw(stand, on: frame, host: 101)
        let moved = try LiveFrameBuilder.render(liveInput(stand, frame, geometryProblem: "the display's size changed")).get()
        XCTAssertEqual(moved.ink, .unknown)
        XCTAssertTrue(moved.composition.contains("the ink is not drawn (the display's size changed)"))

        // A selection is a focus inside the whole picture: its points, and the pixels they cover by the interface's rule.
        let focus = try XCTUnwrap(LiveFocus.make(RecordedRect(CGRect(x: 10.3, y: 20.7, width: 40.2, height: 30.1)), frameSeq: 4,
                                                 display: RecordedRect(CGRect(x: 0, y: 0, width: 200, height: 120)),
                                                 frameWidth: 400, frameHeight: 240))
        XCTAssertEqual([focus.regionPx.x, focus.regionPx.y, focus.regionPx.width, focus.regionPx.height], [20, 41, 81, 61])
        let retina = try XCTUnwrap(LiveFocus.make(RecordedRect(CGRect(x: 100.5, y: 200.25, width: 300.75, height: 150.5)), frameSeq: 4,
                                                  display: RecordedRect(CGRect(x: 0, y: 0, width: 1512, height: 982)),
                                                  frameWidth: 3024, frameHeight: 1964))
        XCTAssertEqual([retina.regionPx.x, retina.regionPx.y, retina.regionPx.width, retina.regionPx.height], [201, 400, 602, 302])
        XCTAssertNil(LiveFocus.make(RecordedRect(CGRect(x: 300, y: 5, width: 10, height: 10)), frameSeq: 4,
                                    display: RecordedRect(CGRect(x: 0, y: 0, width: 200, height: 120)), frameWidth: 400, frameHeight: 240))

        // Frames the connector would not take are refused here, with the reason.
        var huge = frame
        huge.width = 5_000
        huge.height = 4_000
        let refused = LiveFrameBuilder.render(LiveFrameInput.freeze(frame: huge, document: nil, captureSession: stand.session,
                                                                    captureSessionID: stand.id, display: stand.display))
        guard case .failure(let refusal) = refused else { return XCTFail("a 20-million-pixel frame was taken") }
        XCTAssertTrue(refusal.reason.contains("more pixels"))
        // The retained original is only read.
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: frame.file)), raw)
    }

    /// The ink visible at the frozen revision is drawn over the whole frame and kept as its own file.
    func testLivePictureDrawsTheVisibleInkOverTheWholeFrame() throws {
        let stand = try liveStand("live-picture-ink")
        let frame = try liveKeep(stand, host: 100.3)
        let raw = try Data(contentsOf: stand.session.appending(path: frame.file))
        liveDraw(stand, on: frame, host: 101)
        let drawn = try LiveFrameBuilder.render(liveInput(stand, frame)).get()
        XCTAssertEqual(drawn.ink, .drawn)
        XCTAssertEqual(drawn.file, "live/pictures/" + drawn.picture.sha256 + ".png")
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: drawn.file)), drawn.picture.png)
        XCTAssertEqual([drawn.picture.width, drawn.picture.height], [200, 100], "still the whole frame")
        XCTAssertEqual(drawn.picture.inkRevision, stand.ink.document.revision)
        XCTAssertNotNil(drawn.picture.inkSHA256)
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: try XCTUnwrap(drawn.inkFile))),
                       try CaptureFiles.encoder.encode(stand.ink.document), "the editable original, byte for byte")
        // The stroke is in the picture at y = 10 pt (20 px), and not in the retained frame.
        let pixels = try rgba(stand.session.appending(path: drawn.file))
        func pixel(_ x: Int, _ y: Int) -> [Int] { pixels.bytes[(y * pixels.width + x) * 4..<(y * pixels.width + x) * 4 + 3].map { Int($0) } }
        // The same tolerance as the other ink pictures: the encoder may move a value by one or two.
        XCTAssertTrue(zip(pixel(100, 20), [255, 59, 48]).allSatisfy { abs($0 - $1) <= 2 }, "the stroke, in the ink colour: \(pixel(100, 20))")
        XCTAssertTrue(zip(pixel(100, 60), [128, 128, 128]).allSatisfy { abs($0 - $1) <= 2 }, "away from the stroke: \(pixel(100, 60))")
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: frame.file)), raw, "the retained frame is untouched")
        // Made again, it is the same bytes and the same file.
        let again = try LiveFrameBuilder.render(liveInput(stand, frame)).get()
        XCTAssertEqual(again.picture.sha256, drawn.picture.sha256)
        XCTAssertEqual(try files(in: stand.session.appending(path: "live/pictures")), [drawn.picture.sha256 + ".png"])
    }

    // MARK: - Requests as the connector's own validator sees them

    /// Every line of one synthetic session exactly as the link wrote it to the connector. With
    /// COMPANION_DESKTOP_LIVE_FIXTURE_DIR set to a new directory they are kept there as
    /// `live-session.jsonl` for `checks/validate_live_session.py`, which runs the released contract
    /// validator, the connector's own request check (the PNG included) and its focus rule over them.
    func testLiveSessionLinesForTheReleasedValidator() async throws {
        let fixtureDirectory = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_LIVE_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
        let output = fixtureDirectory ?? root.appending(path: "live-fixture", directoryHint: .isDirectory)
        guard !FileManager.default.fileExists(atPath: output.path(percentEncoded: false)) else {
            XCTFail("fixtures are written only to a new directory: \(output.path(percentEncoded: false))")
            return
        }
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let session = try await liveSessionLines()
        XCTAssertEqual(session.methods, ["connection/read", "companion/start", "companion/turn", "companion/turn", "companion/turn",
                                         "companion/turn", "companion/turn", "companion/turn", "companion/interrupt", "companion/stop"])
        XCTAssertEqual(session.turns.map { $0["trigger"] as? String },
                       ["observation", "focus", "text_followup", "observation", "text_followup", "focus"])
        XCTAssertTrue(session.lines.allSatisfy { $0.last == 0x0A && $0.dropLast().allSatisfy { $0 != 0x0A } }, "one line each")
        try session.lines.reduce(Data(), +).write(to: output.appending(path: "live-session.jsonl"))
    }

    /// One session through the link: a look, a selection (focus), a follow-up on the unchanged
    /// picture, a look at a new frame with new ink, a follow-up after the screen changed, a second
    /// selection that is cancelled on its way, and Stop.
    func liveSessionLines() async throws -> FakeLiveConnector {
        let connector = FakeLiveConnector()
        let clock = LiveClock(1_000)
        let stand = try liveStand("live-fixture-capture")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, clock: clock)
        await link.offer(liveInput(stand, first))
        let selection = try liveSelect(stand, on: first, from: (20.3, 5.7), to: (60, 25.2), host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        await link.followUp("Why is this step valid?", assistance: .explain, fresh: liveInput(stand, first))
        let second = try liveKeep(stand, host: 106, shade: 90)
        liveDraw(stand, on: second, y: 30, host: 107)
        clock.advance(31)
        await link.offer(liveInput(stand, second))
        await link.followUp("And now?", assistance: .fullSolution, fresh: liveInput(stand, second))
        connector.onTurn = { _ in .hold }
        let again = try liveSelect(stand, on: second, from: (5, 5), to: (30, 30), host: 110)
        let asking = Task { [link] in await link.selected(again.input, rect: again.rect, selectionID: again.id) }
        let sent = await until(5) { connector.turns.count == 6 }
        XCTAssertTrue(sent)
        await link.cancelCard()
        await asking.value
        await link.stopSession()
        await link.shutdown()
        return connector
    }

    // MARK: - Start, Stop and the session's bounds

    func testLiveNothingIsSentBeforeAnExplicitStartAndASessionIsNeverRenewed() async throws {
        let connector = FakeLiveConnector()
        connector.connection = FakeLiveConnector.connection(quota: FakeLiveConnector.quota())
        let stand = try liveStand("live-start")
        let frame = try liveKeep(stand, host: 100.3)
        let link = liveLink(connector)
        let log = LiveLog()
        await link.setStatusHandler { log.add($0) }

        // Before Connect and before Start, frames and selections send nothing.
        await link.offer(liveInput(stand, frame))
        XCTAssertEqual(connector.launches, 0)
        await link.connect()
        let connected = await link.currentStatus()
        XCTAssertEqual(connected.connection, .signedIn)
        XCTAssertEqual(connected.session.state, .off(nil))
        XCTAssertEqual(connected.quota?.windows.count, 1)
        XCTAssertNotNil(connected.quotaReadAt)
        await link.offer(liveInput(stand, frame))
        let selection = try liveSelect(stand, on: frame, host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        let idle = try await liveCard(link)
        XCTAssertEqual(idle.phase, .idle)
        XCTAssertEqual(idle.detail, "Kept on this Mac. The AI was not asked: the AI is not started for this display.")
        XCTAssertEqual(connector.methods, ["connection/read"], "nothing but the connection was read")
        XCTAssertFalse(FileManager.default.fileExists(atPath: stand.session.appending(path: "live").path(percentEncoded: false)))

        // Bounds out of range are refused, not clamped; so is a model that is not listed.
        await link.startSession(policy: LivePolicy(maxSubmissions: 0, maxSessionMS: 60_000, minObservationIntervalMS: 1_000),
                                captureSession: stand.session, captureSessionID: stand.id)
        var status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .off("the requests must be a whole number from 1 to 100"))
        let policy = LivePolicy(maxSubmissions: 4, maxSessionMS: 1_000, minObservationIntervalMS: 500)
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id, model: "synthetic-text")
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .off("no such model is listed as taking pictures"))
        XCTAssertEqual(connector.methods, ["connection/read"])

        // Start: exactly the user's bounds, the screen only, and the default model that takes pictures.
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual([status.session.used, status.session.policy?.maxSubmissions], [0, 4])
        let start = try XCTUnwrap(connector.params("companion/start").first)
        XCTAssertEqual(Set(start.keys), ["session_id", "capture_session_id", "epoch", "model", "policy", "permissions"])
        XCTAssertEqual([start["capture_session_id"] as? String, start["model"] as? String], [stand.id, "synthetic-vision"])
        XCTAssertEqual(start["epoch"] as? Int, 1)
        XCTAssertEqual(start["policy"] as? [String: Int], ["max_submissions": 4, "max_session_ms": 1_000, "min_observation_interval_ms": 500])
        XCTAssertEqual(start["permissions"] as? [String: Bool], ["screen": true, "microphone": false, "system_audio": false])
        let sessionID = try XCTUnwrap(start["session_id"] as? String)
        XCTAssertEqual(try liveRecord(stand.session, sessionID + ".session.json")["outcome"] as? String, "started")
        // A second Start while it runs does nothing.
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        XCTAssertEqual(connector.params("companion/start").count, 1)

        // The session ends by its own time: the connector is told once, and nothing is renewed.
        let ended = await until(5) { await link.currentStatus().session.state == .ended("this session's time is over") }
        XCTAssertTrue(ended)
        // The state is ended at once; the connector's answer to Stop and the end record follow.
        let recorded = await until(5) { (try? self.liveRecord(stand.session, sessionID + ".end.json")) != nil }
        XCTAssertTrue(recorded)
        XCTAssertEqual(connector.params("companion/stop").count, 1)
        XCTAssertEqual(connector.params("companion/stop").first?["session_id"] as? String, sessionID)
        let end = try liveRecord(stand.session, sessionID + ".end.json")
        XCTAssertEqual([end["reason"] as? String, end["stop"] as? String], ["this session's time is over", "confirmed"])
        await link.offer(liveInput(stand, frame))
        await link.followUp("Anything?", assistance: .hint, fresh: liveInput(stand, frame))
        XCTAssertTrue(connector.turns.isEmpty, "nothing is sent after the session ended")
        do {
            let card = try await liveCard(link)
            XCTAssertEqual(card.detail, "Not sent: the AI session has ended; start it again.")
        }
        XCTAssertEqual(connector.params("companion/start").count, 1, "it was not started again by itself")

        // The user's own Start again is a new session with a new name.
        await link.startSession(policy: LivePolicy(maxSubmissions: 4, maxSessionMS: 60_000, minObservationIntervalMS: 500),
                                captureSession: stand.session, captureSessionID: stand.id, model: "synthetic-vision-other")
        XCTAssertEqual(connector.params("companion/start").count, 2)
        let again = try XCTUnwrap(connector.params("companion/start").last)
        XCTAssertNotEqual(again["session_id"] as? String, sessionID)
        XCTAssertEqual(again["model"] as? String, "synthetic-vision-other", "the model the user chose")

        // Stop is the user's: told to the connector once; the capture's frames then send nothing.
        await link.stopSession()
        await link.stopSession()
        XCTAssertEqual(connector.params("companion/stop").count, 2, "one Stop for each session")
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .ended("stopped by you"))
        await link.offer(liveInput(stand, frame))
        XCTAssertTrue(connector.turns.isEmpty)

        // The capture stopped: no session is started for it again.
        await link.captureStopped(stand.id)
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .off("this capture has stopped"))
        XCTAssertEqual(connector.params("companion/start").count, 2)
        // No status ever held the sign-in page, a token or a balance beyond the reported text.
        XCTAssertFalse(log.all.contains { "\($0)".contains("auth.openai.com") })
        await link.shutdown()
    }

    func testLiveStartRefusalsAndAStartThatIsStoppedOrNotConfirmed() async throws {
        let stand = try liveStand("live-start-refused")
        let policy = LivePolicy(maxSubmissions: 4, maxSessionMS: 60_000, minObservationIntervalMS: 500)

        // Not signed in: nothing is started.
        let signedOut = FakeLiveConnector()
        signedOut.connection = FakeLiveConnector.connection(state: "signed_out", mode: NSNull())
        var link = liveLink(signedOut)
        await link.connect()
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        var status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .off("check the connection and sign in first"))
        XCTAssertFalse(signedOut.methods.contains("companion/start"))
        await link.shutdown()

        // The connector's typed refusals of Start, in fixed words; the account is read again when it says not signed in.
        for (code, words) in [("busy", "the connector is busy with a sign-in or an earlier session"),
                              ("unauthenticated", "ChatGPT is not signed in"),
                              ("unsupported_model", "the chosen model is not available for pictures"),
                              ("unavailable", "the ChatGPT connection is not available")] {
            let connector = FakeLiveConnector()
            link = liveLink(connector)
            await link.connect()
            connector.errors = ["companion/start": (code, "not_submitted")]
            await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
            status = await link.currentStatus()
            XCTAssertEqual(status.session.state, .off(words), code)
            XCTAssertEqual(connector.methods.filter { $0 == "connection/read" }.count, code == "unauthenticated" ? 2 : 1, code)
            XCTAssertFalse(connector.methods.contains("companion/stop"), code)
            await link.shutdown()
        }

        // An answer that grants more than was asked, or is for another session, is not a start:
        // the session is stopped at the connector and never used.
        for (name, change) in [("more requests", ["remaining_submissions": 5]), ("another session", ["session_id": "live-other"])]
            as [(String, [String: Any])] {
            let connector = FakeLiveConnector()
            connector.startResult = { params in
                let policy = (params["policy"] as? [String: Any]) ?? [:]
                let honest: [String: Any] = ["session_id": params["session_id"] ?? "", "epoch": 1,
                                             "remaining_submissions": policy["max_submissions"] ?? 0,
                                             "expires_in_ms": policy["max_session_ms"] ?? 0]
                return honest.merging(change) { $1 }
            }
            link = liveLink(connector)
            await link.connect()
            await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
            status = await link.currentStatus()
            XCTAssertEqual(status.session.state, .off("the connector did not confirm the start"), name)
            XCTAssertEqual(connector.methods.suffix(2), ["companion/start", "companion/stop"], name)
            await link.shutdown()
        }

        // Stop while the Start is on its way: the session is stopped when its answer comes, and never used.
        let slow = FakeLiveConnector()
        slow.holdsWrites = ["companion/start"]
        link = liveLink(slow)
        await link.connect()
        let starting = Task { [link] in
            await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        }
        let isStarting = await until(5) { await link.currentStatus().session.state == .starting }
        XCTAssertTrue(isStarting)
        await link.stopSession()
        slow.holdsWrites = []
        await starting.value
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .off("it was stopped while it was starting"))
        XCTAssertEqual(slow.methods.suffix(2), ["companion/start", "companion/stop"])
        let frame = try liveKeep(stand, host: 100.3)
        await link.offer(liveInput(stand, frame))
        XCTAssertTrue(slow.turns.isEmpty)
        // A later Start of the user's own works.
        await link.startSession(policy: policy, captureSession: stand.session, captureSessionID: stand.id)
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .on)
        await link.shutdown()
    }

    // MARK: - Unattended looks

    func testLiveLooksGiveWholeFramesAtTheIntervalAndAreNeverShown() async throws {
        let connector = FakeLiveConnector()
        let clock = LiveClock(1_000)
        let stand = try liveStand("live-looks")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, clock: clock)
        connector.onTurn = { _ in .answer("Synthetic look: the full answer is 42.") }

        await link.offer(liveInput(stand, first))
        XCTAssertEqual(connector.turns.count, 1)
        let look = connector.turns[0]
        let sessionID = try XCTUnwrap(look["session_id"] as? String)
        XCTAssertEqual(look["request_id"] as? String, sessionID + ".look.1")
        XCTAssertEqual([look["trigger"] as? String, look["allowed_assistance"] as? String, look["presentation"] as? String],
                       ["observation", "none", "none"], "a look asks for no help and presents nothing")
        XCTAssertTrue(look["user_text"] is NSNull)
        XCTAssertTrue(look["focus"] is NSNull)
        // The whole retained frame, with the captured facts.
        let raw = try Data(contentsOf: stand.session.appending(path: first.file))
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(turnField(look, "image", "png_base64") as String?)), raw)
        XCTAssertEqual([turnField(look, "image", "width") as Int?, turnField(look, "image", "height") as Int?], [200, 100])
        XCTAssertEqual(turnField(look, "context", "frame_seq") as Int?, 1)
        XCTAssertEqual(turnField(look, "context", "display", "id") as String?, "7")
        XCTAssertEqual(turnField(look, "context", "region_px") as [String: Int]?, ["x": 0, "y": 0, "width": 200, "height": 100])
        XCTAssertEqual(turnField(look, "context", "region_dip") as [String: Double]?, ["x": 0, "y": 0, "width": 100, "height": 50])
        XCTAssertTrue(((look["context"] as? [String: Any])?["frame_captured_at"]) is NSNull, "no wall time is estimated")

        // Its text is context for later requests only: no card, and the record says so.
        var status = await link.currentStatus()
        XCTAssertNil(status.card, "a look is never shown as help")
        XCTAssertFalse("\(status)".contains("the full answer is 42"), "its text is nowhere in what the app shows")
        XCTAssertEqual([status.session.used, status.session.seenFrame, status.session.frames], [1, 1, 1])
        let request = try liveRecord(stand.session, sessionID + ".look.1.request.json")
        XCTAssertEqual([request["frame_file"] as? String, request["picture_file"] as? String], [first.file, first.file])
        XCTAssertNil(((request["turn"] as? [String: Any])?["image"] as? [String: Any])?["png_base64"], "the record names the file")
        let response = try liveRecord(stand.session, sessionID + ".look.1.response.json")
        XCTAssertEqual(response["outcome"] as? String, "observed")
        XCTAssertEqual(response["presentation"] as? String, "never shown: an unattended look is context for later requests only")

        // Within the interval nothing more goes; the newest waiting frame replaces the older one.
        let second = try liveKeep(stand, host: 103, shade: 100)
        let third = try liveKeep(stand, host: 106, shade: 90)
        await link.offer(liveInput(stand, second))
        clock.advance(29)
        await link.offer(liveInput(stand, third))
        XCTAssertEqual(connector.turns.count, 1, "the interval has not passed")
        clock.advance(1)
        let fourth = try liveKeep(stand, host: 109, shade: 80)
        await link.offer(liveInput(stand, fourth))
        XCTAssertEqual(connector.turns.count, 2)
        let next = connector.turns[1]
        XCTAssertEqual(turnField(next, "context", "frame_seq") as Int?, 4)
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(turnField(next, "image", "png_base64") as String?)),
                       try Data(contentsOf: stand.session.appending(path: fourth.file)), "the newest frame")
        XCTAssertEqual(liveGaps(next), ["2-3 coalesced"], "the frames passed over are stated")
        let history = try XCTUnwrap(next["history"] as? [[String: Any]])
        XCTAssertEqual(history.count, 1)
        XCTAssertEqual([history[0]["kind"] as? String, history[0]["text"] as? String, history[0]["presentation"] as? String],
                       ["observation", "Synthetic look: the full answer is 42.", "not_presented"])

        // A look the connector does not take is a stated gap; the session goes on.
        connector.onTurn = { _ in .error("busy", "not_submitted") }
        clock.advance(30)
        await link.offer(liveInput(stand, try liveKeep(stand, host: 112, shade: 70)))
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(status.session.missed, "another request of yours is still waiting, so this one was not taken")
        XCTAssertEqual(status.session.used, 2, "a request that did not reach ChatGPT uses nothing")
        connector.onTurn = nil
        clock.advance(30)
        await link.offer(liveInput(stand, try liveKeep(stand, host: 115, shade: 60)))
        XCTAssertEqual(connector.turns.count, 4)
        XCTAssertEqual(liveGaps(connector.turns[3]), ["2-3 coalesced", "5-5 backpressure"])
        // A picture the model has already looked at is not sent again: no request is used on it.
        let unchanged = try XCTUnwrap(stand.recorder.status.lastKept.map(FrameReference.init))
        clock.advance(30)
        await link.offer(liveInput(stand, unchanged))
        XCTAssertEqual(connector.turns.count, 4)
        status = await link.currentStatus()
        XCTAssertEqual([status.session.used, status.session.out], [3, 0])
        XCTAssertNil(status.session.missed)
        // New ink over the same frame is a new picture.
        liveDraw(stand, on: unchanged, host: 120)
        await link.offer(liveInput(stand, unchanged))
        XCTAssertEqual(connector.turns.count, 5)
        XCTAssertEqual(turnField(connector.turns[4], "context", "ink_revision") as Int?, stand.ink.document.revision)
        XCTAssertEqual(liveGaps(connector.turns[4]).last, "7-7 coalesced")
        do {
            let value = await link.currentStatus().card
            XCTAssertNil(value)
        }
        // Every request went once.
        XCTAssertEqual(Set(connector.turns.compactMap { $0["request_id"] as? String }).count, connector.turns.count)
        await link.shutdown()
    }

    func testLiveLooksWaitForTheirTurnAndStopAtTheRequestsKeptForTheUser() async throws {
        // The interval by the real clock: a frame that came early is looked at when it has passed.
        let connector = FakeLiveConnector()
        let stand = try liveStand("live-reserve")
        let first = try liveKeep(stand, host: 100.3)
        var link = await liveStarted(connector, stand, policy: LivePolicy(maxSubmissions: 5, maxSessionMS: 60_000,
                                                                          minObservationIntervalMS: 500))
        await link.offer(liveInput(stand, first))
        let second = try liveKeep(stand, host: 103, shade: 100)
        let offered = Date()
        await link.offer(liveInput(stand, second))
        XCTAssertEqual(connector.turns.count, 1)
        let looked = await until(5) { connector.turns.count == 2 }
        XCTAssertTrue(looked, "the waiting frame was not looked at by itself")
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(offered), 0.3)
        XCTAssertEqual(turnField(connector.turns[1], "context", "frame_seq") as Int?, 2)
        await link.shutdown()

        // 5 requests: the last one is kept for the user. After 4 are used, looks stop and frames
        // are stated as not given; the user's own selection still goes.
        let bounded = FakeLiveConnector()
        let clock = LiveClock(1_000)
        let capture = try liveStand("live-reserve-bound")
        link = await liveStarted(bounded, capture, policy: LivePolicy(maxSubmissions: 5, maxSessionMS: 60_000,
                                                                      minObservationIntervalMS: 500), clock: clock)
        var frames: [FrameReference] = []
        for index in 0..<6 {
            frames.append(try liveKeep(capture, host: 100.3 + Double(index) * 3, shade: UInt8(120 - index * 10)))
            await link.offer(liveInput(capture, frames[index]))
            clock.advance(1)
        }
        XCTAssertEqual(bounded.turns.count, 4, "four looks, and then none")
        var status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(status.session.paused, "the requests left in this session are kept for your own selections and questions")
        XCTAssertTrue(status.session.line(nowHost: clock.now).contains("looks only when you select or ask"))
        let selection = try liveSelect(capture, on: frames[5], host: 130)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        XCTAssertEqual(bounded.turns.count, 5)
        XCTAssertEqual(bounded.turns[4]["trigger"] as? String, "focus")
        XCTAssertEqual(liveGaps(bounded.turns[4]), ["5-6 budget"])
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .usedUp)
        XCTAssertEqual(status.card?.phase, .answered)
        // History retention below applies to an answer actually displayed, not a queued answer
        // whose first-display permission the new explicit action revokes.
        await link.answerShown(try XCTUnwrap(status.card?.requestID))
        // Used up: nothing more is sent, and the card says why.
        await link.followUp("One more?", assistance: .hint, fresh: liveInput(capture, frames[5]))
        XCTAssertEqual(bounded.turns.count, 5)
        do {
            let card = try await liveCard(link)
            XCTAssertEqual(card.detail, "Not sent: all of this AI session's requests are used; start the AI again.")
        }
        do {
            let card = try await liveCard(link)
            XCTAssertEqual(card.phase, .answered, "the answer stays")
        }
        // The user's own Start ends the used-up session and starts a new one.
        await link.startSession(policy: LivePolicy(maxSubmissions: 5, maxSessionMS: 60_000, minObservationIntervalMS: 500),
                                captureSession: capture.session, captureSessionID: capture.id)
        XCTAssertEqual(bounded.methods.filter { $0.hasPrefix("companion/st") }, ["companion/start", "companion/stop", "companion/start"])
        do {
            let value = await link.currentStatus().session.state
            XCTAssertEqual(value, .on)
        }
        await link.shutdown()

        // The connector itself keeps the rest for the user: looks stop, the session goes on.
        let strict = FakeLiveConnector()
        let other = try liveStand("live-reserve-connector")
        link = await liveStarted(strict, other, clock: LiveClock(1_000))
        strict.onTurn = { turn in turn["trigger"] as? String == "observation" ? .error("budget_reached", "not_submitted") : .answer("Synthetic hint.") }
        let frame = try liveKeep(other, host: 100.3)
        await link.offer(liveInput(other, frame))
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(status.session.used, 0)
        XCTAssertEqual(status.session.paused, "the connector keeps the requests left in this session for your own selections and questions")
        let chosen = try liveSelect(other, on: frame, host: 103)
        await link.selected(chosen.input, rect: chosen.rect, selectionID: chosen.id)
        do {
            let card = try await liveCard(link)
            XCTAssertEqual(card.answer, "Synthetic hint.")
        }
        await link.shutdown()
    }

    // MARK: - Selection and follow-up

    func testLiveSelectionIsSentAtOnceAsAFocusAndAFollowUpKeepsOrNamesIt() async throws {
        let connector = FakeLiveConnector()
        let clock = LiveClock(1_000)
        let stand = try liveStand("live-focus")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, clock: clock)
        connector.onTurn = { turn in
            switch turn["trigger"] as? String {
            case "focus": return .answer("Synthetic hint: look at the sign.")
            case "text_followup": return .answer("Synthetic explanation.")
            default: return .answer("Synthetic look.")
            }
        }
        // Whether each request was already kept when the connector received it.
        let keptFirst = EndLog()
        let live = stand.session.appending(path: "live", directoryHint: .isDirectory)
        let answer = connector.onTurn
        connector.onTurn = { turn in
            let id = (turn["request_id"] as? String) ?? "none"
            keptFirst.add(FileManager.default.fileExists(atPath: live.appending(path: id + ".request.json").path(percentEncoded: false))
                ? "kept" : "not kept: " + id)
            return answer?(turn) ?? .silent
        }

        // Finishing a selection is all it takes: no question, no second press.
        let selection = try liveSelect(stand, on: first, from: (20.3, 5.7), to: (60, 25.2), host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        var card = try await liveCard(link)
        XCTAssertEqual([card.phase.rawValue, card.answer], ["answered", "Synthetic hint: look at the sign."])
        XCTAssertNil(card.question)
        XCTAssertEqual(card.assistance, .hint)
        XCTAssertEqual(card.focus, .onThisPicture)
        XCTAssertEqual(card.summaryLine, "From ChatGPT (synthetic-vision) in 1 s · generated text, apart from your screen and ink. It can be wrong.")
        XCTAssertEqual(connector.turns.count, 1)
        let focus = connector.turns[0]
        let cardID = card.cardID
        XCTAssertEqual(focus["request_id"] as? String, cardID + ".1")
        XCTAssertEqual([focus["trigger"] as? String, focus["allowed_assistance"] as? String, focus["presentation"] as? String],
                       ["focus", "hint", "silent"], "a selection alone asks for a small hint")
        XCTAssertTrue(focus["user_text"] is NSNull)
        // The picture is the whole frame the selection was pinned to; the selection is the focus in it.
        XCTAssertEqual([turnField(focus, "image", "width") as Int?, turnField(focus, "image", "height") as Int?], [200, 100])
        XCTAssertEqual(turnField(focus, "context", "region_px") as [String: Int]?, ["x": 0, "y": 0, "width": 200, "height": 100])
        XCTAssertEqual(turnField(focus, "focus", "frame_seq") as Int?, turnField(focus, "context", "frame_seq") as Int?)
        XCTAssertEqual(turnField(focus, "focus", "region_px") as [String: Int]?, ["x": 40, "y": 11, "width": 80, "height": 40])
        let dip = try XCTUnwrap(turnField(focus, "focus", "region_dip") as [String: Double]?)
        XCTAssertEqual(dip["x"] ?? 0, 20.3, accuracy: 1e-9)
        XCTAssertEqual(keptFirst.all, ["kept"], "the request was kept before it was sent")
        let record = try liveRecord(stand.session, cardID + ".1.response.json")
        XCTAssertEqual([record["outcome"] as? String, record["text"] as? String, record["provenance"] as? String],
                       ["answered", "Synthetic hint: look at the sign.", "equal in full to the kept request"])
        XCTAssertEqual(record["presentation"] as? String, "put on the card of this selection; whether it was displayed is recorded apart")
        // Displayed is recorded apart, when the card reports it.
        XCTAssertFalse(FileManager.default.fileExists(atPath: live.appending(path: cardID + ".1.shown.json").path(percentEncoded: false)))
        await link.answerShown(cardID + ".1")
        XCTAssertEqual(try liveRecord(stand.session, cardID + ".1.shown.json")["request_id"] as? String, cardID + ".1")

        // A follow-up on the unchanged picture: the same number, the identical image and context,
        // and the same focus; the help is the user's choice.
        await link.followUp("Why is this step valid?", assistance: .explain, fresh: liveInput(stand, first))
        card = try await liveCard(link)
        XCTAssertEqual([card.phase.rawValue, card.answer, card.question], ["answered", "Synthetic explanation.", "Why is this step valid?"])
        XCTAssertEqual(card.focus, .onThisPicture)
        XCTAssertEqual(connector.turns.count, 2)
        let same = connector.turns[1]
        XCTAssertEqual(same["request_id"] as? String, cardID + ".2")
        XCTAssertEqual([same["trigger"] as? String, same["allowed_assistance"] as? String, same["user_text"] as? String],
                       ["text_followup", "explain", "Why is this step valid?"])
        XCTAssertTrue(AskWire.sameJSON(same["context"] as Any, focus["context"] as Any), "the identical context")
        XCTAssertTrue(AskWire.sameJSON(same["image"] as Any, focus["image"] as Any), "the identical image")
        XCTAssertTrue(AskWire.sameJSON(same["focus"] as Any, focus["focus"] as Any), "the focus is kept")
        let said = try XCTUnwrap(same["history"] as? [[String: Any]])
        XCTAssertEqual(said.map { $0["kind"] as? String }, ["assistant"])
        XCTAssertEqual([said[0]["text"] as? String, said[0]["presentation"] as? String, said[0]["request_id"] as? String],
                       ["Synthetic hint: look at the sign.", "shown", cardID + ".1"])

        // The screen changed and was looked at: a follow-up carries the new picture, no rectangle
        // from the old one, and names the earlier focus without its pixels.
        let second = try liveKeep(stand, host: 106, shade: 90)
        clock.advance(31)
        await link.offer(liveInput(stand, second))
        XCTAssertEqual(connector.turns.count, 3)
        await link.followUp("And now?", assistance: .fullSolution, fresh: liveInput(stand, second))
        card = try await liveCard(link)
        XCTAssertEqual(card.focus, .onAnEarlierPicture)
        XCTAssertTrue(try XCTUnwrap(card.askedLine).contains("ChatGPT was told where it was, without its pixels"))
        XCTAssertEqual(card.frameFile, second.file)
        let later = connector.turns[3]
        XCTAssertEqual([later["trigger"] as? String, later["allowed_assistance"] as? String], ["text_followup", "full_solution"])
        XCTAssertTrue(later["focus"] is NSNull, "the old rectangle is not put on the new picture")
        XCTAssertEqual(turnField(later, "context", "frame_seq") as Int?, turnField(connector.turns[2], "context", "frame_seq") as Int?,
                       "the very picture of the last look keeps its number")
        XCTAssertTrue(AskWire.sameJSON(later["image"] as Any, connector.turns[2]["image"] as Any))
        let rows = try XCTUnwrap(later["history"] as? [[String: Any]])
        let reference = try XCTUnwrap(rows.last)
        XCTAssertEqual([reference["kind"] as? String, reference["presentation"] as? String, reference["request_id"] as? String],
                       ["observation", "not_presented", cardID + ".1"])
        let named = try decodedObject(Data(try XCTUnwrap(reference["text"] as? String).utf8))
        XCTAssertEqual(named["kind"] as? String, "historical_focus_reference")
        XCTAssertEqual(named["pixels_attached_to_this_request"] as? Bool, false)
        XCTAssertTrue(AskWire.sameJSON(named["focus"] as Any, focus["focus"] as Any))
        XCTAssertEqual(rows.dropLast().map { $0["kind"] as? String }, ["assistant", "user", "assistant", "observation"])
        XCTAssertEqual(rows[2]["presentation"] as? String, "unconfirmed", "an answer not reported as displayed")

        // Words that cannot be sent leave the answer on the card.
        await link.answerShown(try XCTUnwrap(card.requestID))
        await link.followUp("   ", assistance: .hint, fresh: liveInput(stand, second))
        card = try await liveCard(link)
        XCTAssertEqual([card.phase.rawValue, card.detail], ["answered", "Not sent: the question is empty."])
        XCTAssertEqual(connector.turns.count, 4)

        // A new selection replaces the card and is sent at once, on its own frame.
        let next = try liveSelect(stand, on: second, from: (5, 5), to: (30, 30), host: 110)
        await link.selected(next.input, rect: next.rect, selectionID: next.id)
        let replaced = try await liveCard(link)
        XCTAssertNotEqual(replaced.cardID, cardID)
        XCTAssertEqual(replaced.phase, .answered)
        XCTAssertEqual(connector.turns.count, 5)
        XCTAssertEqual(connector.turns[4]["trigger"] as? String, "focus")
        // The originals are as they were.
        XCTAssertEqual(try Data(contentsOf: stand.session.appending(path: first.file)).count, first.byteLength)
        let status = await link.currentStatus()
        XCTAssertEqual(status.session.used, 5)
        await link.shutdown()
    }

    func testLiveSelectionMadeBeforeStartKeepsItsOwnPictureAsFocusWhenAsked() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("live-focus-late")
        let first = try liveKeep(stand, host: 100.3)
        let link = liveLink(connector)
        await link.connect()
        let selection = try liveSelect(stand, on: first, host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        XCTAssertTrue(connector.turns.isEmpty)
        await link.startSession(policy: LivePolicy(maxSubmissions: 10, maxSessionMS: 60_000, minObservationIntervalMS: 30_000),
                                captureSession: stand.session, captureSessionID: stand.id)
        // Starting the AI does not send a selection made before it by itself.
        XCTAssertTrue(connector.turns.isEmpty)
        // The user's words then go with the selection's own picture, and the selection as its focus,
        // although a newer frame is there: the model has not been given the selection before.
        let second = try liveKeep(stand, host: 106, shade: 90)
        await link.followUp("What is this?", assistance: .hint, fresh: liveInput(stand, second))
        let turn = try XCTUnwrap(connector.turns.first)
        XCTAssertEqual(turn["trigger"] as? String, "text_followup")
        XCTAssertFalse(turn["focus"] is NSNull)
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(turnField(turn, "image", "png_base64") as String?)),
                       try Data(contentsOf: stand.session.appending(path: first.file)))
        let card = try await liveCard(link)
        XCTAssertEqual(card.focus, .onThisPicture)
        XCTAssertEqual(card.frameFile, first.file)

        // No current picture (the newest pixels were not kept): an older picture is never sent in
        // its place, and the session line says what is not given.
        await link.answerShown(try XCTUnwrap(card.requestID))
        await link.followUp("And now?", assistance: .hint, fresh: nil)
        var later = try await liveCard(link)
        XCTAssertEqual([later.phase.rawValue, later.detail],
                       ["answered", "Not sent: there is no current picture of this display on record (its newest pixels were not kept)."])
        XCTAssertEqual(connector.turns.count, 1)
        await link.noPicture("the newest pixels of this display were not kept on this Mac, so there is no current picture to give")
        let status = await link.currentStatus()
        XCTAssertEqual(status.session.missed, "the newest pixels of this display were not kept on this Mac, so there is no current picture to give")
        XCTAssertTrue(status.session.line(nowHost: 0).contains("the newest look was not made (the newest pixels of this display were not kept"))

        // A selection whose region cannot be found in its frame's pixels (the display changed, or
        // the frame was older than the screen) is kept and never sent as a focus.
        let moved = try liveSelect(stand, on: second, host: 110)
        await link.selected(moved.input, rect: moved.rect, selectionID: moved.id, unlocated: "the display's size changed")
        later = try await liveCard(link)
        XCTAssertEqual([later.phase.rawValue, later.detail],
                       ["idle", "Kept on this Mac. The AI was not asked: the display's size changed."])
        XCTAssertEqual(connector.turns.count, 1, "no focus was sent")
        // Words about it go with the current picture alone, and the card says the selection was not part of it.
        await link.followUp("What changed?", assistance: .hint, fresh: liveInput(stand, second))
        later = try await liveCard(link)
        XCTAssertEqual([later.phase, later.focus == LiveCard.Focus.none ? .answered : .refused], [.answered, .answered])
        XCTAssertTrue(try XCTUnwrap(later.askedLine).contains("Your selection was not part of this request"))
        let alone = try XCTUnwrap(connector.turns.last)
        XCTAssertEqual(connector.turns.count, 2)
        XCTAssertTrue(alone["focus"] is NSNull)
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(turnField(alone, "image", "png_base64") as String?)),
                       try Data(contentsOf: stand.session.appending(path: second.file)))
        XCTAssertFalse(((alone["history"] as? [[String: Any]]) ?? []).contains { ($0["text"] as? String)?.contains("historical_focus_reference") == true })
        await link.followUp("Without a picture?", assistance: .hint, fresh: nil)
        XCTAssertEqual(connector.turns.count, 2)
        await link.shutdown()
    }

    func testLiveMalformedLatencyIsRefusedWithoutIntegerOverflow() throws {
        let stand = try liveStand("live-latency-bound")
        let frame = try liveKeep(stand, host: 100.3)
        let picture = try LiveFrameBuilder.render(liveInput(stand, frame)).get().picture
        let turn = LiveTurn(requestID: "r1", sessionID: "live-1", epoch: 1, permissionRevision: 1,
                            trigger: .observation, assistance: .none, presents: false, userText: nil,
                            picture: picture, frameSeq: 1, focus: nil, history: [], gaps: [])
        let params = try decodedObject(DesktopJSON.encode(turn.json(includingImage: true)))
        let result = FakeLiveConnector.honest(params, text: "Synthetic observation.", model: "synthetic-vision")
        for value: Any in [1e100, 9_007_199_254_740_992.0, -1, true, "1"] {
            var invalid = result
            invalid["latency_ms"] = value
            XCTAssertNil(LiveAnswer.parse(invalid, turn: turn, model: "synthetic-vision"), "\(value)")
        }
        var boundary = result
        boundary["latency_ms"] = 9_007_199_254_740_991.0
        XCTAssertEqual(LiveAnswer.parse(boundary, turn: turn, model: "synthetic-vision")?.latencyMS, 9_007_199_254_740_991)
    }

    func testLiveMissingCurrentPictureDropsWaitingLooksAndSurvivesLateResults() async throws {
        let connector = FakeLiveConnector()
        let clock = LiveClock(1_000)
        let stand = try liveStand("live-missing-current")
        let first = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, policy: LivePolicy(maxSubmissions: 10, maxSessionMS: 60_000,
                                                                         minObservationIntervalMS: 500), clock: clock)
        connector.onTurn = { _ in .hold }
        let observing = Task { await link.offer(self.liveInput(stand, first)) }
        let delivered = await until(5) { connector.turns.count == 1 }
        XCTAssertTrue(delivered)
        let missing = "the newest pixels were not kept"
        await link.noPicture(missing)
        connector.release()
        await observing.value
        var status = await link.currentStatus()
        XCTAssertEqual(status.session.missed, missing, "an older completed look does not restore current pixels")
        XCTAssertEqual(status.session.seenFrame, 1, "the completed historical look remains recorded")
        XCTAssertEqual(connector.params("companion/interrupt").count, 0, "a delivered historical look need not be interrupted")

        connector.onTurn = nil
        clock.advance(1)
        let second = try liveKeep(stand, host: 103, shade: 100)
        await link.offer(liveInput(stand, second))
        status = await link.currentStatus()
        XCTAssertNil(status.session.missed, "a genuinely newer completed look restores coverage")
        let waiting = try liveKeep(stand, host: 106, shade: 90)
        await link.offer(liveInput(stand, waiting))
        await link.noPicture(missing)
        clock.advance(1)
        try await Task.sleep(nanoseconds: 650_000_000)
        XCTAssertEqual(connector.turns.count, 2, "the timer never sends the old waiting picture")
        status = await link.currentStatus()
        XCTAssertEqual(status.session.missed, missing)
        let fresh = try liveKeep(stand, host: 109, shade: 80)
        await link.offer(liveInput(stand, fresh))
        XCTAssertEqual(connector.turns.count, 3)
        XCTAssertTrue(liveGaps(connector.turns[2]).contains("3-3 not_observed"))
        await link.shutdown()
    }

    func testLiveExplicitFocusJoinsAnInterruptedObservationBeforeSending() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("live-focus-serialization")
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand)
        connector.onTurn = { turn in turn["trigger"] as? String == "observation" ? .hold : .answer("Synthetic hint.") }
        let observing = Task { await link.offer(self.liveInput(stand, frame)) }
        let delivered = await until(5) { connector.turns.count == 1 }
        XCTAssertTrue(delivered)
        let selection = try liveSelect(stand, on: frame, host: 103)
        await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
        await observing.value
        XCTAssertEqual(connector.turns.map { $0["trigger"] as? String }, ["observation", "focus"])
        let methods = connector.methods
        XCTAssertLessThan(try XCTUnwrap(methods.firstIndex(of: "companion/interrupt")),
                          try XCTUnwrap(methods.lastIndex(of: "companion/turn")))
        let status = await link.currentStatus()
        XCTAssertEqual(status.card?.phase, .answered)
        XCTAssertEqual(status.session.out, 0)
        XCTAssertEqual(status.session.used, 2, "an interrupted submitted observation still uses its slot")
        await link.shutdown()
    }

    func testLiveFocusAndStopCannotBeOvertakenByAnOlderRenderingLook() async throws {
        for stop in [false, true] {
            let connector = FakeLiveConnector()
            let stand = try liveStand(stop ? "live-render-stop" : "live-render-focus")
            let frame = try liveKeep(stand, host: 100.3)
            let renders = EndLog()
            let release = DispatchSemaphore(value: 0)
            let link = LiveLink(config: .success(askConfig), launcher: connector, callTimeout: 5, turnTimeout: 20,
                                makePicture: { input in
                let first = renders.all.isEmpty
                renders.add("render")
                if first { _ = release.wait(timeout: .now() + 5) }
                return LiveFrameBuilder.render(input)
            })
            await link.connect()
            await link.startSession(policy: LivePolicy(maxSubmissions: 10, maxSessionMS: 60_000, minObservationIntervalMS: 500),
                                    captureSession: stand.session, captureSessionID: stand.id)
            let observing = Task { await link.offer(self.liveInput(stand, frame)) }
            let rendering = await until(5) { renders.all.count == 1 }
            XCTAssertTrue(rendering)
            let selection = try liveSelect(stand, on: frame, host: 103)
            let asking = Task { await link.selected(selection.input, rect: selection.rect, selectionID: selection.id) }
            let queued = await until(5) { await link.currentStatus().card?.phase == .asking }
            XCTAssertTrue(queued)
            XCTAssertEqual(renders.all.count, 1, "the explicit request joins the older render before preparing pixels")
            if stop { await link.stopSession() }
            release.signal()
            await observing.value
            await asking.value
            XCTAssertEqual(connector.turns.map { $0["trigger"] as? String }, stop ? [] : ["focus"],
                           "the older look is never written after the focus or Stop")
            let status = await link.currentStatus()
            XCTAssertEqual(status.session.out, 0, "every rendering reservation is released")
            XCTAssertEqual(status.session.used, stop ? 0 : 1)
            await link.shutdown()
        }
    }

    func testLiveQuitAndConnectJoinTheRetiringChild() async throws {
        for reconnect in [false, true] {
            let connector = FakeLiveConnector()
            connector.endDelay = 0.2
            let stand = try liveStand(reconnect ? "live-retired-connect" : "live-retired-quit")
            let link = await liveStarted(connector, stand)
            connector.emitRaw("not a connector line")
            let lost = await until(5) { await link.currentStatus().connection == .disconnected }
            XCTAssertTrue(lost)
            XCTAssertEqual(connector.ends, 0, "the old child is still retiring")
            if reconnect {
                await link.connect()
                XCTAssertEqual(connector.launches, 2)
                XCTAssertEqual(connector.overlaps, 0, "the next child starts after the old one ended")
                XCTAssertEqual(connector.ends, 1)
            } else {
                await link.shutdown()
                XCTAssertEqual(connector.ends, 1, "Quit joins the retired child before returning")
                XCTAssertEqual(connector.launches, 1)
            }
            await link.shutdown()
        }
    }

    // MARK: - Cancel, replacement, Stop, Quit

    func testLiveCancelNewSelectionStopAndQuitFenceARequestOnItsWay() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("live-cancel")
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, clock: LiveClock(1_000))
        connector.onTurn = { _ in .hold }
        func select(_ host: Double) async throws -> Task<Void, Never> {
            let selection = try liveSelect(stand, on: frame, host: host)
            let before = connector.turns.count
            let task = Task { [link] in await link.selected(selection.input, rect: selection.rect, selectionID: selection.id) }
            let sent = await until(5) { connector.turns.count == before + 1 }
            XCTAssertTrue(sent)
            return task
        }

        // Cancel: fenced at once, interrupted at the connector, and a late answer is never shown.
        var asking = try await select(103)
        var card = try await liveCard(link)
        XCTAssertEqual(card.phase, .asking)
        let firstID = try XCTUnwrap(card.requestID)
        await link.cancelCard()
        await asking.value
        card = try await liveCard(link)
        XCTAssertEqual([card.phase.rawValue, card.detail], ["cancelled", "Cancelled (cancelled). Its answer, if one comes, is not shown."])
        XCTAssertNil(card.answer)
        XCTAssertEqual(connector.params("companion/interrupt").map { $0["request_id"] as? String }, [firstID])
        var record = try liveRecord(stand.session, firstID + ".response.json")
        XCTAssertEqual([record["outcome"] as? String, record["connector_answer"] as? String], ["cancelled", "cancelled/submitted"])
        XCTAssertNil(record["text"])
        let interrupted = await until(5) { (try? self.liveRecord(stand.session, firstID + ".interrupt.json")) != nil }
        XCTAssertTrue(interrupted)
        var interrupt = try liveRecord(stand.session, firstID + ".interrupt.json")
        XCTAssertEqual([interrupt["connector_reply"] as? String, "\(interrupt["confirmed"] as? Bool ?? false)"], ["cancelled", "true"])
        var status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .on, "a confirmed interruption leaves the session usable")
        XCTAssertEqual(status.session.used, 1, "it had reached ChatGPT, so it used a request")

        // A new selection fences the request before it in the same step.
        asking = try await select(110)
        let secondID = try await liveCard(link).requestID.unwrapped()
        let replacing = try await select(120)
        await asking.value
        card = try await liveCard(link)
        XCTAssertEqual(card.phase, .asking, "the new selection's own request")
        XCTAssertNotEqual(card.requestID, secondID)
        XCTAssertTrue(connector.params("companion/interrupt").contains { $0["request_id"] as? String == secondID })
        XCTAssertEqual(try liveRecord(stand.session, secondID + ".response.json")["reason"] as? String, "a new selection was made")

        // An answer that comes although the request was fenced is never shown and never kept as an answer.
        let thirdID = try XCTUnwrap(card.requestID)
        connector.interruptReply = ["cancelled": false, "uncertain": false]
        await link.closeCard()
        do {
            let value = await link.currentStatus().card
            XCTAssertNil(value)
        }
        connector.release(text: "Synthetic answer that came too late.")
        await replacing.value
        do {
            let value = await link.currentStatus().card
            XCTAssertNil(value)
        }
        record = try liveRecord(stand.session, thirdID + ".response.json")
        XCTAssertEqual([record["outcome"] as? String, record["reason"] as? String, record["connector_answer"] as? String],
                       ["cancelled", "the card was closed", "an answer, which is not kept"])
        XCTAssertNil(record["text"])
        XCTAssertFalse("\(record)".contains("came too late"))
        let asked = await until(5) { (try? self.liveRecord(stand.session, thirdID + ".interrupt.json")) != nil }
        XCTAssertTrue(asked)
        interrupt = try liveRecord(stand.session, thirdID + ".interrupt.json")
        XCTAssertEqual(interrupt["connector_reply"] as? String, "nothing to cancel")
        connector.interruptReply = ["cancelled": true, "uncertain": false]

        // Stop with a request on its way: fenced, the connector told once, nothing shown.
        asking = try await select(130)
        let fourthID = try await liveCard(link).requestID.unwrapped()
        await link.stopSession()
        await asking.value
        card = try await liveCard(link)
        XCTAssertEqual(card.phase, .cancelled)
        XCTAssertEqual(card.detail, "Cancelled (the AI session ended (stopped by you)). Its answer, if one comes, is not shown.")
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .ended("stopped by you"))
        XCTAssertEqual(connector.params("companion/stop").count, 1)
        XCTAssertEqual(try liveRecord(stand.session, fourthID + ".response.json")["connector_answer"] as? String,
                       "session_stopped/submitted")
        let turnsAtStop = connector.turns.count
        await link.followUp("Still there?", assistance: .hint, fresh: liveInput(stand, frame))
        XCTAssertEqual(connector.turns.count, turnsAtStop)

        // Quit: the session is stopped and the connector ended; nothing is signed out.
        await link.shutdown()
        XCTAssertEqual(connector.ends, 1)
        XCTAssertFalse(connector.methods.contains { $0.contains("logout") })

        // An interruption the connector does not confirm ends the session: nothing more is sent by itself.
        let unsure = FakeLiveConnector()
        let other = await liveStarted(unsure, stand, clock: LiveClock(1_000))
        unsure.onTurn = { _ in .hold }
        unsure.interruptReply = ["cancelled": false, "uncertain": true]
        let pending = try liveSelect(stand, on: frame, host: 140)
        let waiting = Task { [other] in await other.selected(pending.input, rect: pending.rect, selectionID: pending.id) }
        let flying = await until(5) { unsure.turns.count == 1 }
        XCTAssertTrue(flying)
        await other.cancelCard()
        await waiting.value
        let after = await other.currentStatus()
        // The request's own refusal and the interruption's answer both say it; whichever comes first ends the session.
        guard case .ended(let why) = after.session.state else { return XCTFail("the session goes on: \(after.session.state)") }
        XCTAssertTrue(why.contains("not confirmed") && why.hasSuffix("nothing more is sent by itself"), why)
        XCTAssertEqual(after.card?.phase, .cancelled)
        XCTAssertEqual(after.session.used, 1)
        XCTAssertEqual(unsure.params("companion/stop").count, 1)
        let uncertain = try liveRecord(stand.session, try XCTUnwrap(after.card?.requestID) + ".interrupt.json")
        XCTAssertEqual([uncertain["connector_reply"] as? String, "\(uncertain["confirmed"] as? Bool ?? true)"], ["uncertain", "false"])
        await other.shutdown()
        do {
            let value = await link.currentStatus().connection
            XCTAssertEqual(value, .disconnected)
        }
    }

    func testLiveTakesBackARequestThatHasNotReachedTheConnector() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("live-take-back")
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, clock: LiveClock(1_000))
        // The line stays in the pipe's writer: the connector has not got it.
        connector.holdsWrites = ["companion/turn"]
        let selection = try liveSelect(stand, on: frame, host: 103)
        let asking = Task { [link] in await link.selected(selection.input, rect: selection.rect, selectionID: selection.id) }
        let waiting = await until(5) { await link.currentStatus().card.map { $0.selectionID == selection.id && $0.requestID != nil } == true }
        XCTAssertTrue(waiting)
        let requestID = try await liveCard(link).requestID.unwrapped()
        await link.cancelCard()
        await asking.value
        let card = try await liveCard(link)
        XCTAssertEqual(card.detail, "Cancelled (cancelled); it had not reached the connector, so nothing was sent to ChatGPT.")
        XCTAssertTrue(connector.turns.isEmpty, "the connector never got it")
        XCTAssertFalse(connector.methods.contains("companion/interrupt"), "there is nothing to interrupt")
        let record = try liveRecord(stand.session, requestID + ".response.json")
        XCTAssertEqual(record["delivered_to_connector"] as? Bool, false)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stand.session.appending(path: "live/" + requestID + ".interrupt.json")
            .path(percentEncoded: false)))
        XCTAssertEqual(record["connector_answer"] as? String, "none: nothing was sent")
        var status = await link.currentStatus()
        XCTAssertEqual([status.session.used, status.session.out], [0, 0], "nothing was used")
        XCTAssertEqual(status.session.state, .on)

        // Stop takes back a look that is still in the writer, too.
        let look = Task { [link, stand] in await link.offer(self.liveInput(stand, frame)) }
        let out = await until(5) { await link.currentStatus().session.out == 1 }
        XCTAssertTrue(out)
        await link.stopSession()
        await look.value
        XCTAssertTrue(connector.turns.isEmpty)
        status = await link.currentStatus()
        XCTAssertEqual(status.session.used, 0)

        // A line cut off part way ends the connector, and that is said as this app's own doing.
        connector.holdsWrites = []
        await link.startSession(policy: LivePolicy(maxSubmissions: 10, maxSessionMS: 60_000, minObservationIntervalMS: 500),
                                captureSession: stand.session, captureSessionID: stand.id)
        connector.holdsWrites = ["companion/turn"]
        connector.heldWritesAreInPart = true
        let again = try liveSelect(stand, on: frame, host: 110)
        let cut = Task { [link] in await link.selected(again.input, rect: again.rect, selectionID: again.id) }
        let held = await until(5) { await link.currentStatus().card.map { $0.selectionID == again.id && $0.requestID != nil } == true }
        XCTAssertTrue(held)
        await link.cancelCard()
        await cut.value
        let gone = await until(5) { await link.currentStatus().connection == .disconnected }
        XCTAssertTrue(gone)
        status = await link.currentStatus()
        XCTAssertTrue(status.detail?.hasPrefix("the connector was ended, because a cancelled request had been written to it in part") == true)
        XCTAssertEqual(status.session.state, .ended("the connection to ChatGPT was lost"))
        XCTAssertTrue(connector.turns.isEmpty)
        XCTAssertEqual(connector.launches, 1, "no connector is started again by itself")
        await link.shutdown()
    }

    // MARK: - Typed refusals, answers that do not belong, silence and loss

    func testLiveTypedRefusalsSpendAndEndTheSessionAsTheConnectorDoes() async throws {
        let stand = try liveStand("live-errors")
        let frame = try liveKeep(stand, host: 100.3)
        var host = 103.0
        /// One focus request answered with `reply`, in a fresh session.
        func ask(_ reply: @escaping @Sendable ([String: Any]) -> FakeLiveConnector.Reply) async throws -> (LiveStatus, FakeLiveConnector, LiveLink) {
            let connector = FakeLiveConnector()
            let link = await liveStarted(connector, stand, clock: LiveClock(1_000), turnTimeout: 1)
            connector.onTurn = reply
            host += 5
            let selection = try liveSelect(stand, on: frame, host: host)
            await link.selected(selection.input, rect: selection.rect, selectionID: selection.id)
            return (await link.currentStatus(), connector, link)
        }
        // code, submission → requests used, session state afterwards.
        let cases: [(String, String, Int, Bool)] = [
            ("busy", "not_submitted", 0, true), ("invalid_request", "not_submitted", 0, true),
            ("stale_context", "submitted", 1, true), ("cancelled", "submitted", 1, true),
            ("allowance_exhausted", "not_submitted", 0, false), ("rate_limited", "submitted", 1, false),
            ("allowance_unknown", "unknown", 1, false), ("workspace_limit", "not_submitted", 0, false),
            ("ordinary_usage_not_allowed", "not_submitted", 0, false), ("unauthenticated", "not_submitted", 0, false),
            ("unsupported_model", "not_submitted", 0, false), ("overloaded", "submitted", 1, false),
            ("context_limit", "submitted", 1, false), ("interrupt_unconfirmed", "unknown", 1, false),
            ("failed", "unknown", 1, false), ("unavailable", "not_submitted", 0, false),
            ("session_stopped", "not_submitted", 0, false), ("budget_reached", "submitted", 1, false),
            ("budget_reached", "not_submitted", 0, false), ("busy", "unknown", 1, false),
        ]
        for (code, submission, used, running) in cases {
            let (status, connector, link) = try await ask { _ in .error(code, submission) }
            let name = code + "/" + submission
            let card = try XCTUnwrap(status.card, name)
            XCTAssertEqual(card.phase, .refused, name)
            XCTAssertNil(card.answer, name)
            let error = LiveError(code: code, submission: LiveSubmission(rawValue: submission) ?? .unknown)
            XCTAssertEqual(card.detail, "No answer: \(error.words). \(error.submission.words); it is not sent again.", name)
            XCTAssertEqual(status.session.used, used, name)
            XCTAssertEqual(status.session.isRunning, running, name)
            if !running {
                guard case .ended(let reason) = status.session.state else { XCTFail(name); continue }
                XCTAssertTrue(reason.hasPrefix(code == "budget_reached" && submission == "not_submitted"
                    ? "this session's own bound" : error.words), name + ": " + reason)
                XCTAssertEqual(connector.params("companion/stop").count, 1, name)
            }
            XCTAssertEqual(connector.turns.count, 1, name + ": never sent again")
            let record = try liveRecord(stand.session, try XCTUnwrap(card.requestID) + ".response.json")
            XCTAssertEqual([record["outcome"] as? String, record["code"] as? String, record["submission"] as? String],
                           ["refused", code, submission], name)
            // An account refusal is read again, and never turned into another request.
            XCTAssertEqual(connector.methods.filter { $0 == "connection/read" }.count, code == "unauthenticated" ? 2 : 1, name)
            await link.shutdown()
        }

        // Answers that do not belong to the request are never shown, and end the session.
        let wrong: [(String, @Sendable ([String: Any]) -> [String: Any])] = [
            ("another image", { result in
                var changed = result
                var provenance = (changed["provenance"] as? [String: Any]) ?? [:]
                provenance["image"] = ["sha256": String(repeating: "0", count: 64), "width": 200, "height": 100]
                changed["provenance"] = provenance
                return changed
            }),
            ("another focus", { result in
                var changed = result
                var provenance = (changed["provenance"] as? [String: Any]) ?? [:]
                provenance["focus"] = NSNull()
                changed["provenance"] = provenance
                return changed
            }),
            ("another mode", { $0.merging(["auth_mode": "api_key"]) { $1 } }),
            ("another model", { $0.merging(["model": "synthetic-vision-other"]) { $1 } }),
            ("another request", { $0.merging(["request_id": "focus-other.1"]) { $1 } }),
            ("a look's kind", { $0.merging(["kind": "observation"]) { $1 } }),
            ("an extra key", { $0.merging(["extra": 1]) { $1 } }),
            ("an empty text", { $0.merging(["text": "  "]) { $1 } }),
        ]
        for (name, change) in wrong {
            let (status, connector, link) = try await ask { _ in .altered(change) }
            let card = try XCTUnwrap(status.card, name)
            XCTAssertEqual([card.phase.rawValue, card.detail],
                           ["refused", "An answer came that does not belong to this request; it is not shown."], name)
            XCTAssertNil(card.answer, name)
            XCTAssertFalse("\(status)".contains("Synthetic text for another request"), name)
            XCTAssertEqual(status.session.used, 1, name)
            XCTAssertFalse(status.session.isRunning, name)
            XCTAssertEqual(connector.turns.count, 1, name)
            XCTAssertEqual(try liveRecord(stand.session, try XCTUnwrap(card.requestID) + ".response.json")["outcome"] as? String,
                           "not_corresponding", name)
            await link.shutdown()
        }

        // Silence: the outcome is not known; the request counts as used, and nothing is sent again.
        let (silent, quiet, quietLink) = try await ask { _ in .silent }
        XCTAssertEqual(silent.card?.detail, "No answer came; whether ChatGPT worked on it is not known. It is not sent again by itself.")
        XCTAssertEqual(silent.session.used, 1)
        XCTAssertFalse(silent.session.isRunning)
        XCTAssertEqual(quiet.turns.count, 1)
        await quietLink.shutdown()
    }

    func testLiveConnectorLossEndsTheSessionAndNothingStartsAgainByItself() async throws {
        let connector = FakeLiveConnector()
        let stand = try liveStand("live-loss")
        let frame = try liveKeep(stand, host: 100.3)
        let link = await liveStarted(connector, stand, clock: LiveClock(1_000))
        connector.onTurn = { _ in .hold }
        let selection = try liveSelect(stand, on: frame, host: 103)
        let asking = Task { [link] in await link.selected(selection.input, rect: selection.rect, selectionID: selection.id) }
        let sent = await until(5) { connector.turns.count == 1 }
        XCTAssertTrue(sent)
        connector.exitChild()
        await asking.value
        var status = await link.currentStatus()
        XCTAssertEqual(status.connection, .disconnected)
        XCTAssertEqual(status.detail, "the connector ended")
        XCTAssertEqual(status.session.state, .ended("the connection to ChatGPT was lost"))
        XCTAssertEqual(status.session.used, 1, "whether it was worked on is not known, so it counts")
        let card = try XCTUnwrap(status.card)
        XCTAssertEqual(card.phase, .cancelled)
        XCTAssertNil(card.answer)
        let record = try liveRecord(stand.session, try XCTUnwrap(card.requestID) + ".response.json")
        XCTAssertEqual([record["outcome"] as? String, record["connector_answer"] as? String], ["cancelled", "unknown"])
        let sessionID = try XCTUnwrap(connector.params("companion/start").first?["session_id"] as? String)
        XCTAssertEqual(try liveRecord(stand.session, sessionID + ".end.json")["stop"] as? String, "not asked: the connector was not running")

        // Frames, follow-ups and Start send nothing without the user's own Connect.
        await link.offer(liveInput(stand, frame))
        await link.followUp("Still there?", assistance: .hint, fresh: liveInput(stand, frame))
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id)
        XCTAssertEqual(connector.launches, 1)
        XCTAssertEqual(connector.turns.count, 1)
        status = await link.currentStatus()
        XCTAssertEqual(status.session.state, .off("check the connection and sign in first"), "why the Start was refused")

        // Connect is the user's: a new connector; a session is the user's Start again.
        await link.connect()
        XCTAssertEqual(connector.launches, 2)
        do {
            let value = await link.currentStatus().connection
            XCTAssertEqual(value, .signedIn)
        }
        XCTAssertEqual(connector.params("companion/start").count, 1, "Connect starts no session")
        connector.onTurn = nil
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id)
        do {
            let value = await link.currentStatus().session.state
            XCTAssertEqual(value, .on)
        }
        // A line that is not the protocol: the connector is not believed any more.
        connector.emitRaw("{\"id\":\"c1\",\"error\":{\"code\":\"failed\",\"message\":\"synthetic detail\"}}")
        let lost = await until(5) { await link.currentStatus().connection == .disconnected }
        XCTAssertTrue(lost)
        status = await link.currentStatus()
        XCTAssertEqual(status.detail, "the connector wrote something that is not its protocol")
        XCTAssertFalse("\(status)".contains("synthetic detail"))
        await link.shutdown()
    }

    // MARK: - Connection and sign-in

    func testLiveConnectionSignInAndUsageAreReadOnlyWhenAsked() async throws {
        let connector = FakeLiveConnector()
        connector.connection = FakeLiveConnector.connection(state: "signed_out", mode: NSNull())
        let link = liveLink(connector)
        let log = LiveLog()
        await link.setStatusHandler { log.add($0) }
        do {
            let value = await link.currentStatus().connection
            XCTAssertEqual(value, .disconnected)
        }
        do {
            let value = await link.startLogin()
            XCTAssertNil(value, "no sign-in without a connector")
        }
        await link.connect()
        var status = await link.currentStatus()
        XCTAssertEqual(status.connection, .signedOut)
        XCTAssertEqual(status.quota?.available, false)

        // The official sign-in: its page is returned for the user's own click, and never kept in a status.
        let url = await link.startLogin()
        XCTAssertEqual(url?.host, "auth.openai.com")
        do {
            let value = await link.startLogin()
            XCTAssertEqual(value, url, "only one sign-in is started")
        }
        XCTAssertEqual(connector.methods.filter { $0 == "connection/login/start" }.count, 1)
        status = await link.currentStatus()
        XCTAssertTrue(status.loginPending)
        XCTAssertEqual(status.startProblem, "check the connection and sign in first")
        connector.connection = FakeLiveConnector.connection(quota: FakeLiveConnector.quota())
        connector.emit(["method": "connection/login/completed", "params": ["login_id": "synthetic-login-1", "success": true, "error": NSNull()]])
        let signedIn = await until(5) { await link.currentStatus().connection == .signedIn }
        XCTAssertTrue(signedIn)
        status = await link.currentStatus()
        XCTAssertFalse(status.loginPending)
        XCTAssertEqual(status.summaryLine.contains("synthetic-plan"), true)
        XCTAssertEqual(status.quota?.windows.first?.credits?.balance, "12.50")
        XCTAssertFalse(log.all.contains { "\($0)".contains("synthetic-login?state") }, "the sign-in page is never part of a status")

        // A changed account is read again, at once; usage is read only by such a read.
        let reads = connector.methods.filter { $0 == "connection/read" }.count
        connector.connection = FakeLiveConnector.connection(quota: FakeLiveConnector.quota(allowed: false))
        connector.emit(["method": "connection/changed", "params": [String: Any]()])
        let changed = await until(5) { await link.currentStatus().quota?.ordinaryUsageAllowed == false }
        XCTAssertTrue(changed)
        XCTAssertEqual(connector.methods.filter { $0 == "connection/read" }.count, reads + 1)
        do {
            let value = await link.currentStatus().startProblem
            XCTAssertNil(value, "a reported usage fact refuses nothing by itself")
        }

        // During a session a busy read leaves the session and the connection as they are.
        let stand = try liveStand("live-connection")
        await link.startSession(policy: .preset, captureSession: stand.session, captureSessionID: stand.id)
        connector.errors = ["connection/read": ("busy", "not_submitted")]
        await link.connect()
        status = await link.currentStatus()
        XCTAssertEqual(status.connection, .signedIn)
        XCTAssertEqual(status.detail, "the connector was busy, so the connection and usage were not read again")
        XCTAssertEqual(status.session.state, .on)
        XCTAssertEqual(connector.launches, 1, "Check Again does not replace a connector with a running session")
        connector.errors = [:]

        // Signed in another way is not this product's sign-in.
        connector.connection = FakeLiveConnector.connection(mode: NSNull())
        await link.connect()
        status = await link.currentStatus()
        XCTAssertEqual(status.connection, .otherMode)
        // An answer in another shape is not understood, and is not read as signed in.
        var old = FakeLiveConnector.connection()
        old["rate_limits"] = NSNull()
        connector.connection = old
        await link.connect()
        do {
            let value = await link.currentStatus().connection
            XCTAssertEqual(value, .unknown)
        }
        // While the session runs, Check Again asks the same connector again: it is not replaced under the session.
        await link.connect()
        let kept = await link.currentStatus()
        XCTAssertEqual(connector.launches, 1)
        XCTAssertEqual(kept.session.state, .on)
        await link.shutdown()
        XCTAssertEqual(connector.methods.filter { $0 == "companion/stop" }.count, 1, "Quit stops the running session")

        // Not set up: nothing is launched, and there is no card.
        let none = LiveLink(config: .failure(.notConfigured), launcher: connector)
        await none.connect()
        do {
            let value = await none.currentStatus().connection
            XCTAssertEqual(value, .notConfigured)
        }
        do {
            let value = await none.currentStatus().startProblem
            XCTAssertEqual(value, "the ChatGPT connector is not set up on this Mac")
        }
        XCTAssertEqual(connector.launches, 1)
    }

    /// The real child, with real pipes: a line from the connector may be as long as this version
    /// allows (1 MiB), which is longer than a single question's version takes.
    func testLiveChildTakesLinesUpToThisVersionsBound() async throws {
        let directory = root.appending(path: "live-child", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory.appending(path: "repo", directoryHint: .isDirectory),
                                                withIntermediateDirectories: true)
        // 600,000 bytes in one line, then a short line; with `flood`, more than 1 MiB in one line.
        func stub(_ name: String, _ bytes: Int) throws -> URL {
            let script = """
            #!/bin/sh
            head -c \(bytes) /dev/zero | tr '\\0' 'a'; echo
            printf 'after\\n'
            IFS= read -r line

            """
            let python = directory.appending(path: "python-" + name)
            try Data(script.utf8).write(to: python)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: python.path(percentEncoded: false))
            return python
        }
        func run(_ name: String, _ bytes: Int, bound: Int) async throws -> (lines: [Int], exits: Int) {
            let received = EndLog()
            let exits = EndLog()
            let config = AskConnectorConfig(python: try stub(name, bytes), repository: directory.appending(path: "repo", directoryHint: .isDirectory))
            let child = try XCTUnwrap(ProcessAskLauncher(sendTimeout: 10, endGrace: 3, maxIncomingLine: bound).launch(
                config, onLine: { received.add(String($0.count)) }, onExit: { exits.add(name) }))
            _ = await until(10) { received.all.count == 2 || !exits.all.isEmpty }
            await child.end()
            return (received.all.compactMap { Int($0) }, exits.all.count)
        }
        let live = try await run("long", 600_000, bound: LiveWire.maxIncomingLine)
        XCTAssertEqual(live.lines, [600_000, 5], "a 600,000-byte line is a line of this version")
        let single = try await run("long-ask", 600_000, bound: AskWire.maxIncomingLine)
        XCTAssertEqual(single.lines, [], "the same line breaks the single-question version's bound")
        let flood = try await run("flood", 1_100_000, bound: LiveWire.maxIncomingLine)
        XCTAssertEqual(flood.lines, [], "more than 1 MiB in one line is not a connector line")
        XCTAssertEqual(LiveWire.maxIncomingLine, 1_048_576)
    }
}
