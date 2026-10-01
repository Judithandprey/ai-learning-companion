import CoreGraphics
import CoreVideo
import Darwin
import Foundation
import XCTest
@testable import DesktopCapture

// A stand-in for the subscription connector, in this process: it answers the envelope of ADR 0003
// as scripted. It is not the connector, Codex, a login or a model: nothing here reaches a network,
// and every identity, URL and answer is synthetic.

final class FakeConnector: AskChildLauncher, @unchecked Sendable {
    enum AskMode {
        /// Answers with the request's own provenance and this text.
        case answer(String)
        /// Holds the answer until `release` is called.
        case hold
        case error(String)
        /// Answers with this result, built from the honest one.
        case altered(@Sendable ([String: Any]) -> [String: Any])
    }

    final class Child: AskChild, @unchecked Sendable {
        weak var owner: FakeConnector?
        private let lock = NSLock()
        private var exited = false
        var hasExited: Bool { lock.withLock { exited } }

        private var nextTicket = 0
        private var serving = 0

        /// Like the real child's one writer: a line waits behind the lines sent before it; a line
        /// the connector holds stays in the writer until it is released or taken back; and a
        /// line taken back after part of it was written ends the child.
        func send(_ line: Data, revocation: AskRevocation?) async -> Bool {
            let ticket: Int = lock.withLock {
                defer { nextTicket += 1 }
                return nextTicket
            }
            while lock.withLock({ serving }) != ticket {
                try? await Task.sleep(nanoseconds: 2_000_000)
            }
            defer { lock.withLock { serving += 1 } }
            guard !hasExited, let owner else { return false }
            let method = (try? JSONSerialization.jsonObject(with: line) as? [String: Any])?["method"] as? String ?? ""
            if owner.failsWrites.contains(method) {
                // Not taken in time: the real child is then ended.
                await end()
                return false
            }
            var held = false
            // Bounded like the real writer: a line not taken in time fails, and the child is ended.
            let deadline = Date().addingTimeInterval(8)
            while owner.holdsWrites.contains(method), !hasExited, revocation?.isRevoked != true {
                held = true
                guard Date() < deadline else {
                    await end()
                    return false
                }
                try? await Task.sleep(nanoseconds: 5_000_000)
            }
            guard !hasExited else { return false }
            let inPart = held && owner.heldWritesAreInPart
            if let revocation, revocation.attempt(remaining: 1, started: inPart, { 1 }) == nil {
                if inPart {
                    // Like the real connector: at EOF it refuses the part in a line that answers
                    // no call, and ends.
                    owner.emitRaw("{\"id\":null,\"error\":{\"code\":\"invalid_request\",\"message\":\"synthetic\"}}")
                    await end()
                }
                return false
            }
            owner.received(line)
            return true
        }

        /// Like the real child, every caller waits until it has ended.
        func end() async {
            guard !hasExited else { return }
            if let delay = owner?.endDelay, delay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
            let first: Bool = lock.withLock {
                let first = !exited
                exited = true
                return first
            }
            if first { owner?.childEnded() }
        }

        func markExited() { lock.withLock { exited = true } }
    }

    private let lock = NSLock()
    private var onLine: (@Sendable (Data) -> Void)?
    private var onExit: (@Sendable () -> Void)?
    private var child: Child?
    private var seen: [(method: String, id: String, params: [String: Any])] = []
    private var heldAsks: [(id: String, params: [String: Any])] = []
    private var launchCount = 0
    private var endCount = 0
    private var storedConnection: [String: Any] = FakeConnector.connection()
    private var storedAskMode: AskMode = .answer("Synthetic answer: the value is 42.")
    private var storedLoginURL = "https://auth.openai.com/synthetic-login?state=not-a-secret"
    private var storedCancelReply: [String: Any] = ["cancelled": true, "uncertain": false]
    private var storedSilent: Set<String> = []
    private var storedErrors: [String: String] = [:]
    private var storedOnAsk: (@Sendable ([String: Any]) -> Void)?
    private var storedAfterLoginStart: (@Sendable (FakeConnector) -> Void)?
    private var storedEndDelay: TimeInterval = 0
    private var storedAfterRead: (@Sendable (FakeConnector) -> Void)?
    private var storedHoldsWrites: Set<String> = []
    private var storedFailsWrites: Set<String> = []
    private var storedHeldInPart = false

    /// `otherImageModel` lists a second model as taking images, not the default, before the default.
    static func connection(state: String = "signed_in", mode: Any = "chatgpt", imageModels: Bool = true,
                           otherImageModel: Bool = false) -> [String: Any] {
        var models = [["id": "synthetic-text", "label": "Synthetic text", "image_input": false, "default": false] as [String: Any]]
        if otherImageModel {
            models.append(["id": "synthetic-vision-other", "label": "Synthetic vision other", "image_input": true, "default": false])
        }
        models.append(["id": "synthetic-vision", "label": "Synthetic vision", "image_input": imageModels, "default": true])
        return [
            "auth": ["state": state, "mode": mode, "plan": "synthetic-plan"] as [String: Any],
            "rate_limits": [["label": "5 hours", "used_percent": 12.5, "resets_at": "2026-10-01T10:00:00Z"] as [String: Any]],
            "models": models,
        ]
    }

    var connection: [String: Any] {
        get { lock.withLock { storedConnection } }
        set { lock.withLock { storedConnection = newValue } }
    }

    var askMode: AskMode {
        get { lock.withLock { storedAskMode } }
        set { lock.withLock { storedAskMode = newValue } }
    }

    var loginURL: String {
        get { lock.withLock { storedLoginURL } }
        set { lock.withLock { storedLoginURL = newValue } }
    }

    /// The result of `ask/cancel`.
    var cancelReply: [String: Any] {
        get { lock.withLock { storedCancelReply } }
        set { lock.withLock { storedCancelReply = newValue } }
    }

    /// Methods answered with this closed error code instead of a result.
    var errors: [String: String] {
        get { lock.withLock { storedErrors } }
        set { lock.withLock { storedErrors = newValue } }
    }

    /// Called with the params of each `ask/start` when it arrives, before it is answered.
    var onAsk: (@Sendable ([String: Any]) -> Void)? {
        get { lock.withLock { storedOnAsk } }
        set { lock.withLock { storedOnAsk = newValue } }
    }

    /// Methods that get no answer at all.
    var silent: Set<String> {
        get { lock.withLock { storedSilent } }
        set { lock.withLock { storedSilent = newValue } }
    }

    /// Called right behind the answer to each `connection/login/start`.
    var afterLoginStart: (@Sendable (FakeConnector) -> Void)? {
        get { lock.withLock { storedAfterLoginStart } }
        set { lock.withLock { storedAfterLoginStart = newValue } }
    }

    /// Methods whose line stays in the pipe's writer, not yet with the connector, while listed.
    var holdsWrites: Set<String> {
        get { lock.withLock { storedHoldsWrites } }
        set { lock.withLock { storedHoldsWrites = newValue } }
    }

    /// A held line has been written in part (true), or not at all (false).
    var heldWritesAreInPart: Bool {
        get { lock.withLock { storedHeldInPart } }
        set { lock.withLock { storedHeldInPart = newValue } }
    }

    /// Methods whose line the connector never takes: the write fails.
    var failsWrites: Set<String> {
        get { lock.withLock { storedFailsWrites } }
        set { lock.withLock { storedFailsWrites = newValue } }
    }

    /// Called right behind the answer to each `connection/read`.
    var afterRead: (@Sendable (FakeConnector) -> Void)? {
        get { lock.withLock { storedAfterRead } }
        set { lock.withLock { storedAfterRead = newValue } }
    }

    /// How long the child takes to end after EOF.
    var endDelay: TimeInterval {
        get { lock.withLock { storedEndDelay } }
        set { lock.withLock { storedEndDelay = newValue } }
    }

    /// The call IDs of the requests seen for `method`.
    func ids(_ method: String) -> [String] {
        lock.withLock { seen.filter { $0.method == method }.map(\.id) }
    }

    var launches: Int { lock.withLock { launchCount } }
    var ends: Int { lock.withLock { endCount } }
    var methods: [String] { lock.withLock { seen.map(\.method) } }

    func params(_ method: String) -> [[String: Any]] {
        lock.withLock { seen.filter { $0.method == method }.map(\.params) }
    }

    func launch(_ config: AskConnectorConfig, onLine: @escaping @Sendable (Data) -> Void,
                onExit: @escaping @Sendable () -> Void) -> (any AskChild)? {
        let child = Child()
        child.owner = self
        lock.withLock {
            self.onLine = onLine
            self.onExit = onExit
            self.child = child
            launchCount += 1
        }
        return child
    }

    /// One raw line to the app.
    func emit(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
        lock.withLock { onLine }?(data)
    }

    func emitRaw(_ line: String) {
        lock.withLock { onLine }?(Data(line.utf8))
    }

    /// The connector process has ended, and its exit is not reported yet.
    func endChildUnreported() {
        lock.withLock { child }?.markExited()
    }

    /// The connector process ends by itself.
    func exitChild() {
        let (child, onExit) = lock.withLock { (self.child, self.onExit) }
        child?.markExited()
        onExit?()
    }

    fileprivate func childEnded() {
        let onExit = lock.withLock { () -> (@Sendable () -> Void)? in
            endCount += 1
            return self.onExit
        }
        onExit?()
    }

    /// The honest result for an `ask/start`: its own provenance, through the subscription mode.
    static func honest(_ params: [String: Any], text: String) -> [String: Any] {
        var provenance = (params["request"] as? [String: Any]) ?? [:]
        var image = (provenance["image"] as? [String: Any]) ?? [:]
        image["png_base64"] = nil
        provenance["image"] = image
        return [
            "request_id": provenance["request_id"] ?? NSNull(), "text": text, "provenance": provenance,
            "model": params["model"] ?? NSNull(), "auth_mode": "chatgpt", "latency_ms": 1234,
            "thread_id": "synthetic-thread", "turn_id": "synthetic-turn", "kind": "generated_assistance",
        ]
    }

    /// Answers the oldest held `ask/start` now.
    func release(text: String = "Synthetic late answer.") {
        guard let held = lock.withLock({ heldAsks.isEmpty ? nil : heldAsks.removeFirst() }) else { return }
        emit(["id": held.id, "result": Self.honest(held.params, text: text)])
    }

    fileprivate func received(_ line: Data) {
        guard line.last == 0x0A, let object = (try? JSONSerialization.jsonObject(with: line.dropLast())) as? [String: Any],
              object["version"] as? String == "lc-subscription-ask/1", Set(object.keys) == ["version", "id", "method", "params"],
              let id = object["id"] as? String, let method = object["method"] as? String,
              let params = object["params"] as? [String: Any] else {
            lock.withLock { seen.append(("malformed", "", [:])) }
            return
        }
        lock.withLock { seen.append((method, id, params)) }
        if method == "ask/start" { onAsk?(params) }
        if silent.contains(method) { return }
        if let code = errors[method] {
            emit(["id": id, "error": ["code": code, "message": "synthetic connector detail that must never be shown"]])
            return
        }
        let mode = askMode
        switch method {
        case "connection/read":
            emit(["id": id, "result": connection])
            afterRead?(self)
        case "connection/login/start":
            emit(["id": id, "result": ["login_id": "synthetic-login-1", "auth_url": loginURL]])
            afterLoginStart?(self)
        case "connection/login/cancel", "session/stop":
            emit(["id": id, "result": [String: Any]()])
        case "ask/cancel":
            emit(["id": id, "result": cancelReply])
        case "ask/start":
            switch mode {
            case .answer(let text):
                emit(["id": id, "result": Self.honest(params, text: text)])
            case .hold:
                lock.withLock { heldAsks.append((id, params)) }
            case .error(let code):
                emit(["id": id, "error": ["code": code, "message": "synthetic connector detail that must never be shown"]])
            case .altered(let change):
                emit(["id": id, "result": change(Self.honest(params, text: "Synthetic answer for another request."))])
            }
        default:
            emit(["id": id, "error": ["code": "invalid_request", "message": "unknown method"]])
        }
    }
}

/// The subscription ASK of ADR 0003 on the Mac: the envelope, the selection's image and context,
/// the connection and sign-in status, and the card's lifecycle (explicit Submit, one question at a
/// time, cancel, new selection, capture stop, connector loss). Everything runs against the
/// in-process stand-in above or a stub shell script: no connector, no Codex, no sign-in, no model
/// and no network are exercised.
extension DesktopCaptureTests {
    final class AskLog: @unchecked Sendable {
        private let lock = NSLock()
        private var statuses: [AskStatus] = []
        func add(_ status: AskStatus) { lock.withLock { statuses.append(status) } }
        var all: [AskStatus] { lock.withLock { statuses } }
    }

    var askConfig: AskConnectorConfig {
        AskConnectorConfig(python: URL(fileURLWithPath: "/nonexistent-synthetic/python"),
                           repository: URL(fileURLWithPath: "/nonexistent-synthetic/repo"))
    }

    /// A BGRA buffer: mid-grey, or fixed pseudo-random pixels that no PNG encoder can make small.
    func greyBuffer(width: Int = 200, height: Int = 100, noise: Bool = false) throws -> CVPixelBuffer {
        var created: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
        XCTAssertEqual(CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, attributes, &created), kCVReturnSuccess)
        let buffer = try XCTUnwrap(created)
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = try XCTUnwrap(CVPixelBufferGetBaseAddress(buffer)).assumingMemoryBound(to: UInt8.self)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        var state: UInt32 = 0x1234_5678
        for y in 0..<height {
            for x in 0..<width {
                for channel in 0..<4 {
                    state = state &* 1_664_525 &+ 1_013_904_223
                    let value: UInt8 = channel == 3 ? 255 : (noise ? UInt8(truncatingIfNeeded: state >> 24) : 128)
                    base[y * rowBytes + x * 4 + channel] = value
                }
            }
        }
        return buffer
    }

    /// One capture with one kept 200×100 frame of a 100×50 pt display (whose global origin is
    /// negative), a stroke along y = 10 pt from x = 10 pt to `strokeEnd` (its part x 42…58 pt erased
    /// afterwards with `erased`), and a confirmed ASK region (20, 5)–(60, 25) pt drawn after it.
    /// Frozen as the app freezes it at Finish.
    func askFixture(_ name: String, excluded: Bool = true, withInk: Bool = true, strokeEnd: Double = 90, erased: Bool = false,
                    crop: Bool = true, regionFrom: (x: Double, y: Double) = (20, 5),
                    regionTo: (x: Double, y: Double) = (60, 25), large: Bool = false) throws -> (input: AskSelectionInput, session: URL, frame: FrameReference, document: InkDocument) {
        let scope = excluded ? DisplayFacts.appExcludedScope(showsCursor: true) : DisplayFacts.inkOverlayScope(showsCursor: true)
        // `large`: a 400×200 pt display kept as an 800×400 frame of pseudo-random pixels, so a
        // region of most of it makes a request far larger than a pipe's buffer.
        let (points, pixels) = large ? (CGSize(width: 400, height: 200), (800, 400)) : (CGSize(width: 100, height: 50), (200, 100))
        let (regionFrom, regionTo) = large ? ((x: 10.0, y: 10.0), (x: 390.0, y: 190.0)) : (regionFrom, regionTo)
        let display = DisplayFacts(displayID: 7, name: "Synthetic Display",
                                   frame: RecordedRect(CGRect(x: -100, y: 0, width: points.width, height: points.height)), pointPixelScale: 2,
                                   requestedWidth: pixels.0, requestedHeight: pixels.1, rotationDegrees: 0, isMain: false, scope: scope)
        let recorder = try CaptureRecorder(
            root: root.appending(path: name, directoryHint: .isDirectory), display: display,
            settings: CaptureSettings(minimumFrameInterval: 2, byteCap: 1 << 24, silenceLimit: 6, showsCursor: true),
            permissionPreflightAtStart: true, composesInk: excluded, wall: Date(timeIntervalSince1970: 1_790_000_000.25), host: 100)
        recorder.streamStarted(host: 100, wall: Date(timeIntervalSince1970: 1_790_000_000.5))
        recorder.frame(facts(.complete, source: 100.2), image: try greyBuffer(width: pixels.0, height: pixels.1, noise: large),
                       host: 100.3, accepted: true)
        let frame = FrameReference(try XCTUnwrap(recorder.status.lastKept))
        let ink = InkSession(document: InkDocument(displayID: 7, createdInSession: recorder.status.session,
                                                   createdWall: Date(timeIntervalSince1970: 1_790_000_000.5)))
        let anchor = InkAnchor(nativeSession: recorder.status.session, frame: frame, host: 101)
        if withInk {
            ink.setMode(.write, host: 100.5)
            XCTAssertEqual(ink.begin(at: InkPoint(x: 10, y: 10, eventTime: 101), device: .tabletPen, anchor: anchor), .accepted)
            ink.extend(to: InkPoint(x: strokeEnd, y: 10, eventTime: 101.1))
            XCTAssertEqual(ink.end(host: 101.2), .accepted)
        }
        if erased {
            ink.tool = .eraser
            XCTAssertEqual(ink.begin(at: InkPoint(x: 50, y: 0, eventTime: 101.3), device: .tabletPen, anchor: anchor), .accepted)
            ink.extend(to: InkPoint(x: 50, y: 20, eventTime: 101.4))
            XCTAssertEqual(ink.end(host: 101.5), .accepted)
            ink.tool = .pen
        }
        ink.setMode(.ask, host: 102)
        XCTAssertEqual(ink.begin(at: InkPoint(x: regionFrom.x, y: regionFrom.y, eventTime: 103), device: .mouse, anchor: anchor), .accepted)
        ink.extend(to: InkPoint(x: regionTo.x, y: regionTo.y, eventTime: 103.1))
        let context = SelectionContext(nativeSession: recorder.status.session, captureSession: recorder.directory, display: display,
                                       frame: frame, freshness: "live", geometryProblem: nil)
        XCTAssertEqual(ink.end(host: 103.2, selection: context), .accepted)
        let inkDirectory = recorder.directory.appending(path: "ink", directoryHint: .isDirectory)
        let selection = try XCTUnwrap(ink.finishAsk(geometryProblem: nil, inkDirectory: crop ? inkDirectory : nil, host: 104))
        let input = try XCTUnwrap(AskSelectionInput.freeze(selection: selection, document: ink.document,
                                                           captureSession: recorder.directory, display: display))
        return (input, recorder.directory, frame, ink.document)
    }

    func askLink(_ connector: FakeConnector, callTimeout: TimeInterval = 5, askTimeout: TimeInterval = 20,
                 changeInterval: TimeInterval = 0) -> AskLink {
        AskLink(config: .success(askConfig), launcher: connector, callTimeout: callTimeout, askTimeout: askTimeout,
                changeInterval: changeInterval)
    }

    /// The card the link shows now.
    func askCard(_ link: AskLink, _ note: String = "") async throws -> AskCard {
        let status = await link.currentStatus()
        return try XCTUnwrap(status.card, note)
    }

    func askRecord(_ session: URL, _ name: String) throws -> [String: Any] {
        try decodedObject(Data(contentsOf: session.appending(path: "asks/" + name)))
    }

    // MARK: - The envelope

    func testAskEnvelopeAndStrictAnswers() throws {
        let fixture = try askFixture("ask-wire")
        let prepared = try AskSelectionBuilder.prepare(fixture.input, cardID: "ask-a1-wire").get()
        let request = prepared.request(id: "ask-a1-wire-q1", question: "What does this step mean?", assistance: .hint)
        XCTAssertNil(request.problem)

        // One request line: exactly version, id, method and params, with a final newline.
        let line = try XCTUnwrap(AskWire.request(id: "c1", method: "ask/start",
                                                 params: .object(["request": request.json(includingImage: true),
                                                                  "model": .string("synthetic-vision")])))
        XCTAssertEqual(line.last, 0x0A)
        XCTAssertEqual(line.filter { $0 == 0x0A }.count, 1)
        let envelope = try decodedObject(Data(line.dropLast()))
        XCTAssertEqual(Set(envelope.keys), ["version", "id", "method", "params"])
        XCTAssertEqual(envelope["version"] as? String, "lc-subscription-ask/1")
        let params = try XCTUnwrap(envelope["params"] as? [String: Any])
        XCTAssertEqual(Set(params.keys), ["request", "model"])
        let sent = try XCTUnwrap(params["request"] as? [String: Any])
        XCTAssertEqual(Set(sent.keys), ["request_id", "question", "assistance", "image", "context"])
        XCTAssertEqual(sent["assistance"] as? String, "hint")
        let image = try XCTUnwrap(sent["image"] as? [String: Any])
        XCTAssertEqual(Set(image.keys), ["png_base64", "sha256", "width", "height"])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(image["png_base64"] as? String)), prepared.image)
        XCTAssertEqual([image["width"] as? Int, image["height"] as? Int], [80, 40])
        let context = try XCTUnwrap(sent["context"] as? [String: Any])
        XCTAssertEqual(Set(context.keys), ["capture_session_id", "frame_seq", "frame_captured_at", "frame_width", "frame_height",
                                           "display", "region_dip", "region_px", "ink_revision", "ink_sha256", "source_url",
                                           "source_version", "media_position"])
        // Unknown facts are explicit nulls, never read off the pixels.
        for key in ["frame_captured_at", "source_url", "source_version", "media_position"] {
            XCTAssertTrue(context[key] is NSNull, key)
        }
        let display = try XCTUnwrap(context["display"] as? [String: Any])
        XCTAssertEqual(Set(display.keys), ["id", "bounds", "scale_factor"])
        XCTAssertEqual(display["id"] as? String, "7", "the display is named by a text identifier, as the connector requires")
        XCTAssertEqual((display["bounds"] as? [String: Double])?["x"], -100, "the global origin may be negative")
        XCTAssertEqual(context["region_dip"] as? [String: Double], ["x": 20, "y": 5, "width": 40, "height": 20])
        XCTAssertEqual(context["region_px"] as? [String: Double], ["x": 40, "y": 10, "width": 80, "height": 40])
        XCTAssertEqual([context["frame_width"] as? Int, context["frame_height"] as? Int], [200, 100])

        // Without the image, the same object is the provenance an answer must echo in full.
        let honest = FakeConnector.honest(params, text: "Synthetic.")
        XCTAssertEqual(AskAnswer.parse(honest, request: request)?.text, "Synthetic.")
        func changed(_ change: (inout [String: Any]) -> Void) -> [String: Any] {
            var result = honest
            change(&result)
            return result
        }
        func provenance(_ change: (inout [String: Any]) -> Void) -> [String: Any] {
            changed { result in
                var value = (result["provenance"] as? [String: Any]) ?? [:]
                change(&value)
                result["provenance"] = value
            }
        }
        let refused: [(String, [String: Any])] = [
            ("another request", changed { $0["request_id"] = "ask-a1-wire-q2" }),
            ("not the subscription mode", changed { $0["auth_mode"] = "api_key" }),
            ("not labelled as generated assistance", changed { $0["kind"] = nil }),
            ("another kind", changed { $0["kind"] = "source" }),
            ("empty text", changed { $0["text"] = "  " }),
            ("too long", changed { $0["text"] = String(repeating: "a", count: 32_001) }),
            // Counted as code points: 16,001 flags are 32,002 of them.
            ("too long in code points", changed { $0["text"] = String(repeating: "\u{1F1E6}\u{1F1F9}", count: 16_001) }),
            ("no provenance", changed { $0["provenance"] = nil }),
            ("another question", provenance { $0["question"] = "Another question" }),
            ("another help level", provenance { $0["assistance"] = "full_solution" }),
            ("another image", provenance { $0["image"] = ["sha256": String(repeating: "0", count: 64), "width": 80, "height": 40] }),
            ("another ink", provenance { value in
                var context = (value["context"] as? [String: Any]) ?? [:]
                context["ink_sha256"] = String(repeating: "1", count: 64)
                value["context"] = context
            }),
            ("a missing null", provenance { value in
                var context = (value["context"] as? [String: Any]) ?? [:]
                context["media_position"] = nil
                value["context"] = context
            }),
            ("the image bytes echoed", provenance { value in
                var image = (value["image"] as? [String: Any]) ?? [:]
                image["png_base64"] = "AAAA"
                value["image"] = image
            }),
        ]
        for (name, result) in refused {
            XCTAssertNil(AskAnswer.parse(result, request: request), name)
        }
        XCTAssertNotNil(AskAnswer.parse(changed { $0["text"] = String(repeating: "a", count: 32_000) }, request: request))

        // Lines from the connector: exactly a result, an error with a closed code, or an event.
        func parse(_ text: String) -> AskWire.Incoming? { AskWire.parse(Data(text.utf8)) }
        if case .result(let id, _)? = parse("{\"id\":\"c1\",\"result\":{}}") { XCTAssertEqual(id, "c1") } else { XCTFail("result") }
        if case .error(_, let code)? = parse("{\"id\":\"c1\",\"error\":{\"code\":\"quota\",\"message\":\"x\"}}") {
            XCTAssertEqual(code, "quota")
        } else { XCTFail("error") }
        if case .error(_, let code)? = parse("{\"id\":\"c1\",\"error\":{\"code\":\"made_up\",\"message\":\"x\"}}") {
            XCTAssertEqual(code, "unavailable", "a code outside the closed set is not believed as itself")
        } else { XCTFail("unknown code") }
        if case .event(let method, _)? = parse("{\"method\":\"connection/login/completed\",\"params\":{}}") {
            XCTAssertEqual(method, "connection/login/completed")
        } else { XCTFail("event") }
        for bad in ["[]", "{\"id\":\"c1\"}", "{\"id\":\"c1\",\"result\":{},\"extra\":1}", "{\"id\":1,\"result\":{}}",
                    "{\"id\":\"c1\",\"error\":{\"code\":\"busy\"}}", "{\"method\":\"x\"}", "not json", "",
                    "{\"id\":\"" + String(repeating: "a", count: 129) + "\",\"result\":{}}"] {
            XCTAssertNil(parse(bad), bad)
        }
        // Identifiers: nonempty, at most 128 code points, no control characters.
        XCTAssertTrue(AskWire.isIdentifier(String(repeating: "a", count: 128)))
        for bad in [String(repeating: "a", count: 129), "", "a\u{7}b", String(repeating: "\u{1F1E6}\u{1F1F9}", count: 65)] {
            XCTAssertFalse(AskWire.isIdentifier(bad), "\(bad.count)")
        }
        // A request line is under 12 MiB, or it is not made at all.
        XCTAssertNotNil(AskWire.request(id: "c1", method: "x", params: .object(["a": .string(String(repeating: "a", count: 11 << 20))])))
        XCTAssertNil(AskWire.request(id: "c1", method: "x", params: .object(["a": .string(String(repeating: "a", count: 12 << 20))])))
        // Every closed code has its own fixed words.
        let words = ["busy": "another question is still being answered", "unauthenticated": "ChatGPT is not signed in",
                     "unsupported_model": "this model is not listed as taking images",
                     "invalid_request": "the question or image was refused", "session_stopped": "this capture has stopped",
                     "cancelled": "the question was cancelled",
                     "interrupt_unconfirmed": "the question was cancelled, but whether it was still answered is not known",
                     "quota": "the subscription's quota does not allow it now", "failed": "the answer did not complete",
                     "unavailable": "the connector is unavailable"]
        XCTAssertEqual(Set(words.keys), AskWire.errorCodes)
        for (code, expected) in words {
            XCTAssertEqual(AskWire.words(for: code), expected, code)
        }

        // The sign-in page: https, no user information, an official host or its subdomain.
        for good in ["https://auth.openai.com/authorize?x=1", "https://chatgpt.com/login", "https://openai.com/a",
                     "https://a.b.chatgpt.com:443/x", "https://auth.openai.com/a?" + String(repeating: "s", count: 16_358)] {
            XCTAssertNotNil(AskWire.loginURL(good), good)
        }
        for bad in ["http://auth.openai.com/x", "https://user@auth.openai.com/x", "https://user:pw@chatgpt.com/",
                    "https://chatgpt.com.example.org/x", "https://evilchatgpt.com/x", "https://openai.com.evil/x",
                    "https://auth.openai.com:8443/x", "file:///etc/hosts", "javascript:alert(1)", "https:///x",
                    "https://auth.openai.com/a b", "", "https://auth.openai.com.example.org/x", "https://x.chatgpt.com.evil.org/",
                    "https://openai.com.example.org/", "https://auth.openai.com/a?" + String(repeating: "s", count: 16_359)] {
            XCTAssertNil(AskWire.loginURL(bad), bad)
        }

        // Requests that must not be sent.
        func altered(_ change: (inout AskRequest) -> Void) -> AskRequest {
            var value = request
            change(&value)
            return value
        }
        XCTAssertNotNil(altered { $0.question = "   " }.problem)
        XCTAssertNotNil(altered { $0.question = String(repeating: "q", count: 4_001) }.problem)
        XCTAssertNil(altered { $0.question = String(repeating: "q", count: 4_000) }.problem)
        // Counted as code points, like the connector counts them: a flag is two.
        XCTAssertNil(altered { $0.question = String(repeating: "\u{1F1E6}\u{1F1F9}", count: 2_000) }.problem)
        XCTAssertNotNil(altered { $0.question = String(repeating: "\u{1F1E6}\u{1F1F9}", count: 2_001) }.problem)
        XCTAssertNotNil(altered { $0.image = Data() }.problem)
        XCTAssertNil(altered { $0.image = Data(count: 8 << 20) }.problem, "8 MiB")
        XCTAssertNotNil(altered { $0.image = Data(count: (8 << 20) + 1) }.problem, "more than 8 MiB")
        XCTAssertNil(altered { $0.imageWidth = 4_000; $0.imageHeight = 4_000 }.problem, "16 million pixels")
        XCTAssertNotNil(altered { $0.imageWidth = 8_000; $0.imageHeight = 2_001 }.problem, "more than 16 million pixels")
        XCTAssertNotNil(altered { $0.context.regionPx.x = 150 }.problem, "outside the frame")
        XCTAssertNotNil(altered { $0.context.regionDip.width = Double.infinity }.problem)
        XCTAssertNotNil(altered { $0.requestID = "has space" }.problem)
    }

    /// The requests of four synthetic selections exactly as they would be sent. With
    /// COMPANION_DESKTOP_ASK_FIXTURE_DIR set to a new directory they are kept there as
    /// `ask-start.jsonl` for `checks/validate_ask_request.py`, which runs the released validator
    /// of the connector over them (the PNG included).
    func testAskRequestsForTheReleasedValidator() throws {
        let fixtureDirectory = ProcessInfo.processInfo.environment["COMPANION_DESKTOP_ASK_FIXTURE_DIR"]
            .map { URL(fileURLWithPath: $0, isDirectory: true) }
        let output = fixtureDirectory ?? root.appending(path: "ask-fixture", directoryHint: .isDirectory)
        guard !FileManager.default.fileExists(atPath: output.path(percentEncoded: false)) else {
            XCTFail("fixtures are written only to a new directory: \(output.path(percentEncoded: false))")
            return
        }
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let lines = try askStartLines()
        XCTAssertEqual(lines.count, 4)
        try lines.map(\.line).reduce(Data(), +).write(to: output.appending(path: "ask-start.jsonl"))
        for (request, line) in lines {
            XCTAssertNil(request.problem)
            XCTAssertEqual(line.last, 0x0A)
            // A PNG the connector's validator admits: 8 bits a channel, RGB or RGBA, not interlaced.
            let header = [UInt8](request.image.prefix(29))
            XCTAssertEqual(Array(header.prefix(8)), [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            XCTAssertEqual(header[24], 8, "bit depth")
            XCTAssertTrue([2, 6].contains(header[25]), "colour type \(header[25])")
            XCTAssertEqual(header[28], 0, "not interlaced")
        }
    }

    /// One `ask/start` line for each of: ink drawn, a fractional region clamped at the display's
    /// edge, a capture that did not exclude this app (no ink hash), and no ink at all.
    func askStartLines() throws -> [(request: AskRequest, line: Data)] {
        let cases: [(String, () throws -> AskSelectionInput)] = [
            ("ink", { try self.askFixture("ask-fixture-ink").input }),
            ("wide", { try self.askFixture("ask-fixture-wide", regionFrom: (20.3, 5.7), regionTo: (140, 25.2)).input }),
            ("shared", { try self.askFixture("ask-fixture-shared", excluded: false).input }),
            ("bare", { try self.askFixture("ask-fixture-bare", withInk: false).input }),
        ]
        return try cases.enumerated().map { index, entry in
            let prepared = try AskSelectionBuilder.prepare(try entry.1(), cardID: "ask-fixture-" + entry.0).get()
            let request = prepared.request(id: "ask-fixture-\(entry.0)-q1", question: "What does this step mean? (\(entry.0))",
                                           assistance: AskAssistance.allCases[index % AskAssistance.allCases.count])
            let line = try XCTUnwrap(AskWire.request(id: "c\(index + 1)", method: "ask/start",
                                                     params: .object(["request": request.json(includingImage: true),
                                                                      "model": .string("synthetic-vision")])))
            return (request, line)
        }
    }

    // MARK: - The selection's image and context

    func testAskSelectionIsFrozenWithItsImageInkAndFacts() throws {
        let fixture = try askFixture("ask-selection")
        let originalFrame = try Data(contentsOf: fixture.session.appending(path: fixture.frame.file))
        let prepared = try AskSelectionBuilder.prepare(fixture.input, cardID: "ask-a1-frozen").get()

        // The image and the editable ink are kept once, beside the originals.
        let asks = fixture.session.appending(path: "asks", directoryHint: .isDirectory)
        XCTAssertEqual(try files(in: asks), ["ask-a1-frozen.ink.json", "ask-a1-frozen.png"])
        XCTAssertEqual(try Data(contentsOf: asks.appending(path: "ask-a1-frozen.png")), prepared.image)
        XCTAssertEqual(try FrameStore.digest(of: asks.appending(path: "ask-a1-frozen.png")).sha256, prepared.imageSHA256)
        let ink = try Data(contentsOf: asks.appending(path: "ask-a1-frozen.ink.json"))
        XCTAssertEqual(ink, fixture.input.documentBytes, "the exact frozen bytes")
        XCTAssertEqual(ink, try CaptureFiles.encoder.encode(fixture.document))
        XCTAssertEqual(prepared.context.inkSHA256, fixture.input.documentSHA256)
        XCTAssertEqual(prepared.context.inkRevision, 1)
        XCTAssertEqual(prepared.ink, .drawn)
        XCTAssertEqual(fixture.input.strokes.count, 1)
        XCTAssertEqual([prepared.imageWidth, prepared.imageHeight], [80, 40], "the PNG is exactly the whole-pixel region")
        XCTAssertEqual(prepared.context.regionPx, RecordedRect(CGRect(x: 40, y: 10, width: 80, height: 40)))
        XCTAssertEqual(prepared.context.regionDip, RecordedRect(CGRect(x: 20, y: 5, width: 40, height: 20)))
        XCTAssertEqual(prepared.context.frameSequence, fixture.frame.sequence)
        XCTAssertNil(prepared.context.frameCapturedAt, "no wall time is made up for the frame")
        XCTAssertTrue(prepared.composition.contains("1 stroke(s) visible at ink revision 1"), prepared.composition)
        XCTAssertEqual(try Data(contentsOf: fixture.session.appending(path: fixture.frame.file)), originalFrame, "only read")

        // Ink erased before the selection is not in it: only the strokes visible at its revision
        // are drawn, while the whole editable document is kept.
        let cut = try askFixture("ask-selection-erased", erased: true)
        XCTAssertEqual(cut.input.selection.inkRevision, 2)
        XCTAssertEqual(cut.document.strokes.count, 3, "the stroke as written and the two pieces left of it")
        XCTAssertEqual(cut.input.strokes.count, 2)
        XCTAssertTrue(cut.input.strokes.allSatisfy { $0.parent != nil }, "the erased stroke is not drawn back")
        let cutPrepared = try AskSelectionBuilder.prepare(cut.input, cardID: "ask-a1-erased").get()
        XCTAssertTrue(cutPrepared.composition.contains("2 stroke(s) visible at ink revision 2"), cutPrepared.composition)
        XCTAssertEqual(try Data(contentsOf: cut.session.appending(path: "asks/ask-a1-erased.ink.json")),
                       try CaptureFiles.encoder.encode(cut.document))

        // Nothing is replaced: the same card cannot be prepared twice.
        XCTAssertThrowsError(try AskSelectionBuilder.prepare(fixture.input, cardID: "ask-a1-frozen").get())
        XCTAssertEqual(try Data(contentsOf: asks.appending(path: "ask-a1-frozen.ink.json")), ink)

        // A region with fractional points that runs past the display: clamped to the display, and
        // its pixels follow the shared rule (start rounded down, end rounded up, within the frame).
        let wide = try askFixture("ask-selection-wide", regionFrom: (20.3, 5.7), regionTo: (140, 25.2))
        let widePrepared = try AskSelectionBuilder.prepare(wide.input, cardID: "ask-a1-wide").get()
        XCTAssertEqual(widePrepared.context.regionPx, RecordedRect(CGRect(x: 40, y: 11, width: 160, height: 40)))
        XCTAssertEqual([widePrepared.imageWidth, widePrepared.imageHeight], [160, 40])
        XCTAssertEqual(widePrepared.context.regionDip.x, 20.3)
        XCTAssertLessThanOrEqual(widePrepared.context.regionDip.x + widePrepared.context.regionDip.width, 100)
        XCTAssertNil(widePrepared.request(id: "ask-a1-wide-q1", question: "Why?", assistance: .hint).problem)
        // The same rule on its own, as the connector repeats it on the numbers it is sent.
        for (start, extent, display, frame) in [(20.3, 200.0, 100.0, 200), (0.1, 0.2, 1512.0, 3024), (33.3, 1478.7, 1512.0, 3024),
                                                (-5.0, 20.0, 982.0, 1964), (700.7, 11.1, 1440.0, 2560), (99.9, 5.0, 100.0, 150)] {
            let span = try XCTUnwrap(AskSelectionBuilder.span(start, extent, display: display, frame: frame), "\(start)")
            let scale = Double(frame) / display
            XCTAssertLessThanOrEqual(span.origin + span.size, display, "\(start)")
            XCTAssertEqual(Double(span.pixel), max(0, (span.origin * scale).rounded(.down)), "\(start)")
            XCTAssertEqual(Double(span.pixel + span.pixels), min(Double(frame), ((span.origin + span.size) * scale).rounded(.up)), "\(start)")
            XCTAssertGreaterThan(span.pixels, 0)
        }
        XCTAssertNil(AskSelectionBuilder.span(120, 30, display: 100, frame: 200), "wholly outside the display")
        XCTAssertNil(AskSelectionBuilder.span(10, 0, display: 100, frame: 200))

        // A capture that did not exclude this app: nothing is drawn, and the image is the raw region.
        let shared = try askFixture("ask-selection-shared", excluded: false)
        let plain = try AskSelectionBuilder.prepare(shared.input, cardID: "ask-a1-shared").get()
        XCTAssertTrue(plain.composition.contains("whether these pixels already hold the ink is unknown"), plain.composition)
        XCTAssertEqual(plain.ink, .unknown)
        // A known revision without a hash: the editable original is kept, but it is not bound to
        // pixels whose ink is not known.
        XCTAssertEqual(plain.context.inkRevision, 1)
        XCTAssertNil(plain.context.inkSHA256)
        XCTAssertEqual(try Data(contentsOf: shared.session.appending(path: "asks/ask-a1-shared.ink.json")), shared.input.documentBytes)
        // No ink at all: nothing is drawn.
        let bare = try askFixture("ask-selection-bare", withInk: false)
        let empty = try AskSelectionBuilder.prepare(bare.input, cardID: "ask-a1-bare").get()
        XCTAssertTrue(empty.composition.contains("no stroke was visible at ink revision 0"), empty.composition)
        XCTAssertEqual(empty.context.inkRevision, 0)
        XCTAssertEqual(empty.ink, .noneVisible)
        XCTAssertEqual(empty.context.inkSHA256, bare.input.documentSHA256)

        // A selection without pixels, a changed original, and a bad card ID are refused.
        let blind = try askFixture("ask-selection-blind", crop: false)
        XCTAssertThrowsError(try AskSelectionBuilder.prepare(blind.input, cardID: "ask-a1-blind").get()) { error in
            XCTAssertTrue((error as? MappingRefusal)?.reason.hasPrefix("this selection has no pixels") == true, "\(error)")
        }
        let altered = try askFixture("ask-selection-altered")
        let alteredFile = altered.session.appending(path: altered.frame.file)
        var bytes = try Data(contentsOf: alteredFile)
        bytes[bytes.count - 1] ^= 1
        try bytes.write(to: alteredFile)  // This test's own session.
        XCTAssertThrowsError(try AskSelectionBuilder.prepare(altered.input, cardID: "ask-a1-altered").get())
        XCTAssertFalse(FileManager.default.fileExists(atPath: altered.session.appending(path: "asks/ask-a1-altered.png").path(percentEncoded: false)))
        XCTAssertThrowsError(try AskSelectionBuilder.prepare(fixture.input, cardID: "../escape").get())
    }

    func testAskImageDrawsTheInkVisibleWhenTheRegionWasDrawn() throws {
        // Pixels: the stroke along y = 10 pt is row 20 of the frame, so row 10 of the region.
        let fixture = try askFixture("ask-pixels")
        let prepared = try AskSelectionBuilder.prepare(fixture.input, cardID: "ask-a1-pixels").get()
        let image = try rgba(fixture.session.appending(path: "asks/ask-a1-pixels.png"))
        XCTAssertEqual([image.width, image.height], [80, 40])
        func pixel(_ x: Int, _ y: Int) -> [Int] {
            (0..<4).map { Int(image.bytes[(y * image.width + x) * 4 + $0]) }
        }
        XCTAssertTrue(zip(pixel(40, 10), [255, 59, 48, 255]).allSatisfy { abs($0 - $1) <= 2 }, "ink at its place: \(pixel(40, 10))")
        XCTAssertTrue(zip(pixel(40, 30), [128, 128, 128, 255]).allSatisfy { abs($0 - $1) <= 2 }, "raw elsewhere: \(pixel(40, 30))")
        XCTAssertNotEqual(prepared.imageSHA256, fixture.input.selection.crop?.sha256, "not the ink-free crop")
        // Across: a stroke that ends at x = 40 pt (frame column 80) ends at column 40 of the region.
        let short = try askFixture("ask-pixels-short", strokeEnd: 40)
        _ = try AskSelectionBuilder.prepare(short.input, cardID: "ask-a1-pixels-short").get()
        let ended = try rgba(short.session.appending(path: "asks/ask-a1-pixels-short.png"))
        func across(_ x: Int) -> [Int] {
            (0..<4).map { Int(ended.bytes[(10 * ended.width + x) * 4 + $0]) }
        }
        XCTAssertTrue(zip(across(20), [255, 59, 48, 255]).allSatisfy { abs($0 - $1) <= 2 }, "ink before its end: \(across(20))")
        XCTAssertTrue(zip(across(60), [128, 128, 128, 255]).allSatisfy { abs($0 - $1) <= 2 }, "raw after its end: \(across(60))")
        // Without ink the image is the raw region.
        let bare = try askFixture("ask-pixels-bare", withInk: false)
        _ = try AskSelectionBuilder.prepare(bare.input, cardID: "ask-a1-pixels-bare").get()
        let plain = try rgba(bare.session.appending(path: "asks/ask-a1-pixels-bare.png"))
        XCTAssertTrue(plain.bytes.enumerated().allSatisfy { abs(Int($0.element) - ($0.offset % 4 == 3 ? 255 : 128)) <= 2 })
    }

    // MARK: - Connection and sign-in

    func testAskConnectionAndSignInStatus() async throws {
        let connector = FakeConnector()
        let link = askLink(connector)
        let log = AskLog()
        await link.setStatusHandler { log.add($0) }
        let initial = await link.currentStatus()
        XCTAssertEqual(initial.connection, .disconnected)
        XCTAssertEqual(connector.launches, 0, "nothing runs until the user connects")

        await link.connect()
        let signedIn = await link.currentStatus()
        XCTAssertEqual(signedIn.connection, .signedIn)
        XCTAssertEqual(signedIn.plan, "synthetic-plan")
        XCTAssertEqual(signedIn.rateLimits, [AskConnection.RateLimit(label: "5 hours", usedPercent: 12.5, resetsAt: "2026-10-01T10:00:00Z")])
        XCTAssertEqual(signedIn.imageModels.map(\.id), ["synthetic-vision"], "only models listed as taking images")
        XCTAssertEqual(connector.methods, ["connection/read"], "the handshake; no sign-in and no question")
        XCTAssertEqual(connector.launches, 1)
        XCTAssertEqual(signedIn.summaryLine, "Signed in to ChatGPT (synthetic-plan).")
        XCTAssertEqual(signedIn.quotaLine, "Quota: 5 hours 13% used, resets 2026-10-01T10:00:00Z.")
        XCTAssertEqual(signedIn.modelsLine, "Listed as taking images: Synthetic vision.")
        XCTAssertEqual(initial.summaryLine, "Not connected.")

        // Other states are shown as they are.
        connector.connection = FakeConnector.connection(state: "signed_in", mode: "api_key")
        await link.connect()
        let other = await link.currentStatus()
        XCTAssertEqual(other.connection, .otherMode, "another sign-in mode is not the subscription")
        connector.connection = FakeConnector.connection(state: "signed_in", mode: NSNull())
        await link.connect()
        let noMode = await link.currentStatus()
        XCTAssertEqual(noMode.connection, .otherMode)
        var unknownQuota = FakeConnector.connection(state: "signed_out", mode: NSNull())
        unknownQuota["rate_limits"] = NSNull()
        connector.connection = unknownQuota
        await link.connect()
        let signedOut = await link.currentStatus()
        XCTAssertEqual(signedOut.connection, .signedOut)
        XCTAssertNil(signedOut.rateLimits, "an unknown quota stays unknown")
        XCTAssertEqual([signedOut.summaryLine, signedOut.quotaLine], ["Not signed in to ChatGPT.", "Quota: not known."])
        XCTAssertEqual(other.summaryLine, "Not signed in with the ChatGPT subscription.")
        var malformed = FakeConnector.connection()
        malformed["models"] = [["id": "synthetic-vision", "label": "Synthetic vision", "default": true] as [String: Any]]
        connector.connection = malformed
        await link.connect()
        let notUnderstood = await link.currentStatus()
        XCTAssertEqual(notUnderstood.connection, .unknown, "a model without its image field is not assumed to take images")
        XCTAssertEqual(connector.launches, 1, "the same child")

        // Sign-in: the official page is returned for the user's click and is never in the status.
        connector.connection = FakeConnector.connection(state: "signed_out", mode: NSNull())
        await link.connect()
        XCTAssertEqual([connector.launches, connector.ends], [2, 1], "a connector whose answer was not understood is started again")
        let url = await link.startLogin()
        XCTAssertEqual(url?.absoluteString, "https://auth.openai.com/synthetic-login?state=not-a-secret")
        let pending = await link.currentStatus()
        XCTAssertTrue(pending.loginPending)
        XCTAssertFalse("\(log.all)".contains("synthetic-login"), "the sign-in page is not part of any status")
        // Its completion re-reads the connection.
        connector.connection = FakeConnector.connection()
        connector.emit(["method": "connection/login/completed",
                        "params": ["login_id": "synthetic-login-1", "success": true, "error": NSNull()]])
        let completed = await until(5) { await link.currentStatus().connection == .signedIn }
        XCTAssertTrue(completed)
        let after = await link.currentStatus()
        XCTAssertFalse(after.loginPending)

        // A failed sign-in, a cancelled one, and a page that is not official. Only fixed words are
        // shown: the connector's own text never reaches a status.
        _ = await link.startLogin()
        connector.emit(["method": "connection/login/completed",
                        "params": ["login_id": "synthetic-login-1", "success": false,
                                   "error": "synthetic sign-in refusal naming someone@example.org"]])
        let failed = await until(5) { await link.currentStatus().loginPending == false }
        XCTAssertTrue(failed)
        let failure = await link.currentStatus()
        XCTAssertEqual(failure.detail, "the sign-in did not complete")
        _ = await link.startLogin()
        connector.emit(["method": "connection/login/completed",
                        "params": ["login_id": "synthetic-login-1", "success": false, "error": "login_cancelled"]])
        let cancelledThere = await until(5) { await link.currentStatus().loginPending == false }
        XCTAssertTrue(cancelledThere)
        let cancelledThereStatus = await link.currentStatus()
        XCTAssertEqual(cancelledThereStatus.detail, "the sign-in was cancelled")
        XCTAssertFalse("\(log.all)".contains("synthetic sign-in refusal"), "the connector's own words are in no status")

        // A completion for another sign-in, or one not in its pinned shape, ends nothing.
        _ = await link.startLogin()
        for params: [String: Any] in [["login_id": "another-login", "success": true, "error": NSNull()],
                                      ["login_id": "synthetic-login-1", "success": false, "error": 7],
                                      ["login_id": "synthetic-login-1", "success": true]] {
            connector.emit(["method": "connection/login/completed", "params": params])
        }
        try await Task.sleep(nanoseconds: 300_000_000)
        let stillPending = await link.currentStatus()
        XCTAssertTrue(stillPending.loginPending)
        // Only one sign-in is started: a second click gets the pending page again.
        let started = connector.params("connection/login/start").count
        let samePage = await link.startLogin()
        XCTAssertEqual(samePage?.absoluteString, "https://auth.openai.com/synthetic-login?state=not-a-secret")
        XCTAssertEqual(connector.params("connection/login/start").count, started)
        await link.cancelLogin()
        // Two clicks at once start one sign-in.
        async let firstClick = link.startLogin()
        async let secondClick = link.startLogin()
        let clicks = await [firstClick, secondClick]
        XCTAssertFalse(clicks.compactMap { $0 }.isEmpty)
        XCTAssertEqual(connector.params("connection/login/start").count, started + 1)
        await link.cancelLogin()
        _ = await link.startLogin()
        await link.cancelLogin()
        XCTAssertEqual(connector.params("connection/login/cancel").last?["login_id"] as? String, "synthetic-login-1")
        let cancelled = await link.currentStatus()
        XCTAssertFalse(cancelled.loginPending)
        let noURL = await link.pendingLoginURL()
        XCTAssertNil(noURL)
        connector.loginURL = "https://chatgpt.com.example.org/login"
        let lookalike = await link.startLogin()
        XCTAssertNil(lookalike, "a lookalike host is never opened")
        let refusedLogin = await link.currentStatus()
        XCTAssertFalse(refusedLogin.loginPending)

        // A completion the connector writes right behind its answer to the start is not lost,
        // whichever of the two is handled first: the sign-in is over and nothing stays pending.
        connector.loginURL = "https://auth.openai.com/synthetic-login?state=not-a-secret"
        connector.afterLoginStart = { $0.emit(["method": "connection/login/completed",
                                                "params": ["login_id": "synthetic-login-1", "success": false, "error": "login_failed"]]) }
        for round in 0..<8 {
            _ = await link.startLogin()
            let over = await until(3) { await link.currentStatus().loginPending == false }
            XCTAssertTrue(over, "round \(round): the sign-in stayed pending")
            let ended = await link.currentStatus()
            XCTAssertEqual(ended.detail, "the sign-in did not complete")
            let page = await link.pendingLoginURL()
            XCTAssertNil(page)
        }
        connector.afterLoginStart = nil

        // Closing ends only this product's child: nothing is ever signed out.
        await link.shutdown()
        XCTAssertEqual(connector.ends, 2)
        let closed = await link.currentStatus()
        XCTAssertEqual(closed.connection, .disconnected)
        XCTAssertTrue(Set(connector.methods).isSubset(of: ["connection/read", "connection/login/start", "connection/login/cancel"]),
                      "\(connector.methods)")

        // Without a configuration nothing is started.
        let unconfigured = AskLink(config: .failure(.notConfigured), launcher: connector)
        await unconfigured.connect()
        let none = await unconfigured.currentStatus()
        XCTAssertEqual(none.connection, .notConfigured)
        XCTAssertEqual(connector.launches, 2)
        // And a confirmed selection gets no card and no file.
        let fixture = try askFixture("ask-unconfigured")
        await unconfigured.open(fixture.input)
        let noCard = await unconfigured.currentStatus()
        XCTAssertNil(noCard.card)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.session.appending(path: "asks").path(percentEncoded: false)))
        XCTAssertFalse(noCard.connection.opensCards)
        XCTAssertTrue(AskStatus.Connection.refused.opensCards && !AskStatus.Connection.refused.canBecomeSignedIn)

        // The connector ends right behind its answer to a sign-in start: whichever of the two is
        // handled first, no page is handed out for it and nothing is left pending.
        for round in 0..<6 {
            let ending = FakeConnector()
            ending.connection = FakeConnector.connection(state: "signed_out", mode: NSNull())
            // In the first round the exit is reported only after the sign-in start has returned.
            ending.afterLoginStart = round == 0 ? { $0.endChildUnreported() } : { $0.exitChild() }
            let endingLink = askLink(ending)
            await endingLink.connect()
            let page = await endingLink.startLogin()
            XCTAssertNil(page, "round \(round)")
            if round == 0 { ending.exitChild() }
            let gone = await until(5) { await endingLink.currentStatus().connection == .disconnected }
            XCTAssertTrue(gone)
            let afterEnd = await endingLink.currentStatus()
            XCTAssertFalse(afterEnd.loginPending)
            let noPending = await endingLink.pendingLoginURL()
            XCTAssertNil(noPending)
        }
    }

    func testAskConnectionChangesRefusalsAndSilenceAreShownAsTheyAre() async throws {
        // The connector says the connection changed: it is read again.
        let connector = FakeConnector()
        let link = askLink(connector)
        await link.connect()
        connector.connection = FakeConnector.connection(state: "signed_out", mode: NSNull())
        connector.emit(["method": "connection/changed", "params": [String: Any]()])
        let changed = await until(5) { await link.currentStatus().connection == .signedOut }
        XCTAssertTrue(changed)
        XCTAssertEqual(connector.params("connection/read").count, 2)

        // The connector refuses the connection itself (for example a Codex build it does not admit):
        // shown as unavailable in fixed words, nothing can be asked, and it can be checked again.
        connector.errors = ["connection/read": "unavailable"]
        await link.connect()
        let refused = await link.currentStatus()
        XCTAssertEqual(refused.connection, .refused)
        XCTAssertEqual(refused.summaryLine, "The connector reports the ChatGPT connection as unavailable: nothing can be asked.")
        XCTAssertEqual(refused.detail, "the connector is unavailable")
        XCTAssertFalse("\(refused)".contains("synthetic connector detail"))
        let fixture = try askFixture("ask-refused")
        await link.open(fixture.input)
        await link.submit(question: "Why?", assistance: .hint)
        let card = try await askCard(link)
        XCTAssertEqual(card.detail, "not sent: ChatGPT is not connected and signed in")
        XCTAssertFalse(connector.methods.contains("ask/start"))
        // The connector answers so and ends by itself, as it does when it cannot start Codex: still
        // shown as unavailable, and checking again starts it again.
        connector.exitChild()
        try await Task.sleep(nanoseconds: 300_000_000)
        let afterEnd = await link.currentStatus()
        XCTAssertEqual(afterEnd.connection, .refused)
        XCTAssertEqual(afterEnd.detail, "the connector is unavailable")
        await link.connect()
        XCTAssertEqual(connector.launches, 2)
        let again = await link.currentStatus()
        XCTAssertEqual(again.connection, .refused)
        connector.errors = ["connection/login/start": "unavailable"]
        let noPage = await link.startLogin()
        XCTAssertNil(noPage)
        let notStarted = await link.currentStatus()
        XCTAssertEqual(notStarted.detail, "the sign-in could not be started", "its own words, and the connection read again")
        XCTAssertFalse(notStarted.loginPending)
        XCTAssertEqual(notStarted.connection, .signedOut, "the read after it shows what the connector reports now")
        connector.errors = ["connection/login/start": "busy"]
        _ = await link.startLogin()
        let busy = await link.currentStatus()
        XCTAssertEqual(busy.detail, "the sign-in could not be started: the connector is busy with a question or another sign-in")
        XCTAssertEqual(busy.connection, .signedOut)
        // A cancel the connector does not confirm is said so; the sign-in is not shown as pending.
        connector.errors = ["connection/login/cancel": "failed"]
        _ = await link.startLogin()
        await link.cancelLogin()
        let unconfirmedCancel = await link.currentStatus()
        XCTAssertEqual(unconfirmedCancel.detail, "the connector did not confirm that the sign-in was cancelled")
        XCTAssertFalse(unconfirmedCancel.loginPending)
        connector.errors = [:]
        _ = await link.startLogin()
        await link.cancelLogin()
        let confirmedCancel = await link.currentStatus()
        XCTAssertEqual(confirmedCancel.detail, "the sign-in was cancelled")
        connector.errors = [:]
        connector.connection = FakeConnector.connection()
        await link.connect()
        let recovered = await link.currentStatus()
        XCTAssertEqual(recovered.connection, .signedIn)
        XCTAssertEqual([connector.launches, connector.ends], [2, 0], "the connector that reports the connection stays")
        await link.shutdown()

        // A connector that keeps a failure for good while it runs (the real one does after its
        // Codex client failed): the read gives no connection, and Check Again ends that connector
        // and starts a new one. Never while a question is on its way.
        let stuck = FakeConnector()
        let stuckLink = askLink(stuck)
        await stuckLink.connect()
        stuck.errors = ["connection/read": "quota", "connection/login/start": "quota", "ask/start": "quota"]
        await stuckLink.connect()
        let kept = await stuckLink.currentStatus()
        XCTAssertEqual(kept.connection, .unknown)
        XCTAssertEqual(kept.detail, "the connector could not report the connection; Check Again starts it again")
        XCTAssertEqual([stuck.launches, stuck.ends], [1, 0], "a connector that answered normally is not replaced")
        stuck.errors = [:]
        await stuckLink.connect()
        let replaced = await stuckLink.currentStatus()
        XCTAssertEqual(replaced.connection, .signedIn)
        XCTAssertEqual([stuck.launches, stuck.ends], [2, 1], "ended and started again by the user's Check Again")
        await stuckLink.connect()
        XCTAssertEqual(stuck.launches, 2, "a connector that reports the connection stays")
        // A question refused for a reason that may be the connection's own reads it again.
        stuck.errors = ["ask/start": "unavailable", "connection/read": "unavailable"]
        let stuckFixture = try askFixture("ask-stuck")
        await stuckLink.open(stuckFixture.input)
        await stuckLink.submit(question: "Why?", assistance: .hint)
        let stuckCard = try await askCard(stuckLink)
        XCTAssertEqual(stuckCard.detail, "the connector is unavailable")
        let afterRefusal = await stuckLink.currentStatus()
        XCTAssertEqual(afterRefusal.connection, .refused, "not left saying signed in")
        // With a question on its way the connector is never replaced.
        stuck.errors = ["connection/read": "failed"]
        stuck.askMode = .hold
        await stuckLink.connect()
        XCTAssertEqual(stuck.launches, 3)
        stuck.errors = [:]
        await stuckLink.connect()
        XCTAssertEqual(stuck.launches, 4)
        let asking = Task { await stuckLink.submit(question: "Why?", assistance: .hint) }
        let sending = await until(5) { stuck.params("ask/start").count == 2 }
        XCTAssertTrue(sending)
        stuck.errors = ["connection/read": "failed"]
        await stuckLink.connect()
        await stuckLink.connect()
        XCTAssertEqual(stuck.launches, 4, "not while a question is on its way")
        stuck.release()
        await asking.value
        await stuckLink.shutdown()

        // A sign-in pending on a connector that keeps a failure could never complete there: Check
        // Again ends it with that connector, and the sign-in can be started again.
        let waiting = FakeConnector()
        waiting.connection = FakeConnector.connection(state: "signed_out", mode: NSNull())
        let waitingLink = askLink(waiting)
        await waitingLink.connect()
        _ = await waitingLink.startLogin()
        waiting.errors = ["connection/read": "failed"]
        await waitingLink.connect()
        let keptPending = await waitingLink.currentStatus()
        XCTAssertEqual([keptPending.connection.rawValue, keptPending.loginPending ? "pending" : "not pending"], ["unknown", "pending"])
        waiting.errors = [:]
        await waitingLink.connect()
        let restarted = await waitingLink.currentStatus()
        XCTAssertEqual([restarted.connection.rawValue, restarted.loginPending ? "pending" : "not pending"], ["signedOut", "not pending"])
        XCTAssertEqual([waiting.launches, waiting.ends], [2, 1])
        let noOldPage = await waitingLink.pendingLoginURL()
        XCTAssertNil(noOldPage)
        await waitingLink.shutdown()

        // Quit while Check Again is replacing a connector: that connector has ended before Quit
        // goes on, and no new one is started.
        let slowEnd = FakeConnector()
        slowEnd.errors = ["connection/read": "failed"]
        slowEnd.endDelay = 1
        let slowEndLink = askLink(slowEnd)
        await slowEndLink.connect()
        let checking = Task { await slowEndLink.connect() }
        let replacingNow = await until(5) { await slowEndLink.currentStatus().connection == .connecting }
        XCTAssertTrue(replacingNow)
        await slowEndLink.shutdown()
        XCTAssertEqual(slowEnd.ends, 1, "ended before Quit goes on")
        await checking.value
        XCTAssertEqual(slowEnd.launches, 1, "no connector is started while the app closes")
        let closedStatus = await slowEndLink.currentStatus()
        XCTAssertEqual(closedStatus.connection, .disconnected)
        await slowEndLink.connect()
        XCTAssertEqual(slowEnd.launches, 1)

        // A connector that reports a change right behind every read does not keep the app reading
        // without end: at most one read in the interval, and one more after it.
        let stormy = FakeConnector()
        let stormyLink = askLink(stormy, changeInterval: 0.4)
        stormy.afterRead = { connector in
            // Bounded, so a link that read once for every event would fail here soon, not go on.
            guard connector.params("connection/read").count < 200 else { return }
            for _ in 0..<20 { connector.emit(["method": "connection/changed", "params": [String: Any]()]) }
        }
        await stormyLink.connect()
        try await Task.sleep(nanoseconds: 1_300_000_000)
        let stormReads = stormy.params("connection/read").count
        XCTAssertTrue((2...6).contains(stormReads), "\(stormReads) reads in 1.3 s for hundreds of events")
        stormy.afterRead = nil
        await stormyLink.shutdown()

        // A connector that does not answer: not known, never taken as signed in. Changes while that
        // read is on its way start no read of their own: it is asked once more, not once for each.
        let silent = FakeConnector()
        silent.silent = ["connection/read"]
        let silentLink = askLink(silent, callTimeout: 0.5)
        let reading = Task { await silentLink.connect() }
        let asked = await until(5) { silent.params("connection/read").count == 1 }
        XCTAssertTrue(asked)
        silent.emit(["method": "connection/changed", "params": [String: Any]()])
        silent.emit(["method": "connection/changed", "params": [String: Any]()])
        await reading.value
        let unknown = await silentLink.currentStatus()
        XCTAssertEqual(unknown.connection, .unknown)
        XCTAssertEqual(unknown.detail, "the connector did not answer")
        XCTAssertEqual(silent.params("connection/read").count, 2)
        await silentLink.shutdown()
    }

    // MARK: - The card: explicit Submit, and the answer on the same card

    func testAskSendsOnlyOnSubmitAndShowsTheAnswerOnItsCard() async throws {
        let connector = FakeConnector()
        // Two models are listed as taking images, and the default is not the first of them.
        connector.connection = FakeConnector.connection(otherImageModel: true)
        let link = askLink(connector)
        await link.connect()
        let fixture = try askFixture("ask-submit")
        // Whether each request was already kept when the connector received it.
        let keptFirst = EndLog()
        let asks = fixture.session.appending(path: "asks", directoryHint: .isDirectory)
        connector.onAsk = { params in
            let id = ((params["request"] as? [String: Any])?["request_id"] as? String) ?? "none"
            let kept = FileManager.default.fileExists(atPath: asks.appending(path: id + ".request.json").path(percentEncoded: false))
            keptFirst.add(kept ? "kept" : "not kept: " + id)
        }
        await link.open(fixture.input)
        let ready = try await askCard(link)
        XCTAssertEqual(ready.phase, .ready)
        XCTAssertEqual([ready.imageWidth, ready.imageHeight, ready.inkRevision, ready.frameSequence], [80, 40, 1, fixture.frame.sequence])
        XCTAssertEqual(ready.summaryLine, "Nothing is sent until you press Submit.")
        XCTAssertEqual(ready.imageLine, "Selection a1: 80×40 px of frame \(fixture.frame.sequence), with the ink of revision 1 drawn over it.")
        XCTAssertNil(ready.askedLine)
        // Selecting and opening the card sends nothing.
        XCTAssertEqual(connector.methods, ["connection/read"])
        let cardID = ready.cardID
        XCTAssertEqual(try files(in: fixture.session.appending(path: "asks")), [cardID + ".ink.json", cardID + ".png"])

        await link.submit(question: "Why is this step valid?", assistance: .hint)
        let answered = try await askCard(link)
        XCTAssertEqual(answered.phase, .answered)
        XCTAssertEqual(answered.answer, "Synthetic answer: the value is 42.")
        XCTAssertEqual(answered.cardID, cardID, "on the same card")
        XCTAssertEqual([answered.question, answered.assistance?.rawValue, answered.model],
                       ["Why is this step valid?", "hint", "synthetic-vision"])
        XCTAssertEqual(answered.latencyMS, 1234)
        XCTAssertEqual(answered.summaryLine, "Answer from synthetic-vision after 1 s.")
        XCTAssertEqual(answered.askedLine, "Asked for a hint: Why is this step valid?")

        // Exactly one request left, with exactly the kept image and context.
        XCTAssertEqual(connector.methods, ["connection/read", "ask/start"])
        let sent = try XCTUnwrap(connector.params("ask/start").first)
        XCTAssertEqual(sent["model"] as? String, "synthetic-vision", "the default model listed as taking images, not the first listed")
        XCTAssertEqual(keptFirst.all, ["kept"], "the request was kept before it was sent")
        let request = try XCTUnwrap(sent["request"] as? [String: Any])
        let requestID = cardID + "-q1"
        XCTAssertEqual(request["request_id"] as? String, requestID)
        XCTAssertEqual(request["assistance"] as? String, "hint", "the help level the user chose")
        let image = try XCTUnwrap(request["image"] as? [String: Any])
        let png = try Data(contentsOf: fixture.session.appending(path: "asks/" + cardID + ".png"))
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(image["png_base64"] as? String)), png)
        // The request was kept before it was sent, and the answer is kept apart from the originals.
        let kept = try askRecord(fixture.session, requestID + ".request.json")
        let keptRequest = try XCTUnwrap(kept["request"] as? [String: Any])
        var sentWithoutImage = request
        var sentImage = image
        sentImage["png_base64"] = nil
        sentWithoutImage["image"] = sentImage
        XCTAssertTrue(AskWire.sameJSON(keptRequest, sentWithoutImage))
        XCTAssertEqual(kept["image_file"] as? String, "asks/" + cardID + ".png")
        XCTAssertEqual(kept["model"] as? String, "synthetic-vision")
        let response = try askRecord(fixture.session, requestID + ".response.json")
        XCTAssertEqual(response["outcome"] as? String, "answered")
        XCTAssertEqual(response["text"] as? String, "Synthetic answer: the value is 42.")
        XCTAssertEqual(response["auth_mode"] as? String, "chatgpt")
        XCTAssertEqual(response["presentation"] as? String, "put on the card of this selection; display on screen is not recorded")
        XCTAssertEqual(try Data(contentsOf: fixture.session.appending(path: fixture.frame.file)).count, fixture.frame.byteLength)

        // A second question on the same card is a new request with the same image; nothing is replaced.
        connector.askMode = .answer("Synthetic second answer.")
        await link.submit(question: "Explain it fully.", assistance: .fullSolution, model: "synthetic-vision")
        let again = try await askCard(link)
        XCTAssertEqual([again.phase.rawValue, again.answer], ["answered", "Synthetic second answer."])
        XCTAssertEqual(connector.params("ask/start").count, 2)
        XCTAssertEqual((connector.params("ask/start").last?["request"] as? [String: Any])?["request_id"] as? String, cardID + "-q2")
        XCTAssertEqual(try askRecord(fixture.session, requestID + ".response.json")["text"] as? String,
                       "Synthetic answer: the value is 42.")

        // A question refused before it is sent leaves the answer on the card, with the question
        // and help level it was asked with.
        await link.submit(question: String(repeating: "q", count: 4_001), assistance: .hint)
        let stillAnswered = try await askCard(link)
        XCTAssertEqual([stillAnswered.phase.rawValue, stillAnswered.answer, stillAnswered.question],
                       ["answered", "Synthetic second answer.", "Explain it fully."])
        XCTAssertEqual(stillAnswered.detail, "not sent: the question is longer than 4000 characters")
        XCTAssertEqual(stillAnswered.askedLine, "Asked for the full solution: Explain it fully.")
        XCTAssertEqual(connector.params("ask/start").count, 2)

        // Answers that do not belong to the request are never shown.
        let wrong: [(String, @Sendable ([String: Any]) -> [String: Any])] = [
            ("another image", { result in
                var changed = result
                var provenance = (changed["provenance"] as? [String: Any]) ?? [:]
                provenance["image"] = ["sha256": String(repeating: "0", count: 64), "width": 80, "height": 40]
                changed["provenance"] = provenance
                return changed
            }),
            ("another mode", { result in
                var changed = result
                changed["auth_mode"] = "api_key"
                return changed
            }),
            ("another request", { result in
                var changed = result
                changed["request_id"] = "ask-other-q1"
                return changed
            }),
        ]
        for (name, change) in wrong {
            connector.askMode = .altered(change)
            await link.submit(question: "And this?", assistance: .explain)
            let card = try await askCard(link)
            XCTAssertEqual(card.phase, .failed, name)
            XCTAssertNil(card.answer, name)
            XCTAssertEqual(card.detail, "an answer came that does not belong to this question and image; it is not shown", name)
        }

        // Typed refusals are fixed words: the connector's own message is never shown.
        for code in ["quota", "failed", "unsupported_model", "busy", "made_up_code"] {
            connector.askMode = .error(code)
            await link.submit(question: "And this?", assistance: .hint)
            let card = try await askCard(link)
            XCTAssertEqual(card.phase, .failed, code)
            XCTAssertEqual(card.detail, AskWire.words(for: AskWire.errorCodes.contains(code) ? code : "unavailable"), code)
            XCTAssertFalse("\(card)".contains("synthetic connector detail"), code)
            XCTAssertEqual(card.askedLine, "Asked for a hint: And this?", "the question that got no answer")
        }
        XCTAssertFalse(connector.methods.contains("ask/cancel"), "nothing was cancelled or retried")

        // An outcome that cannot be kept is said so on the card; the file already there is not replaced.
        let lastID = try XCTUnwrap((connector.params("ask/start").last?["request"] as? [String: Any])?["request_id"] as? String)
        let number = try XCTUnwrap(Int(lastID.components(separatedBy: "-q").last ?? ""))
        let blocked = asks.appending(path: "\(cardID)-q\(number + 1).response.json")
        try Data("already here".utf8).write(to: blocked)
        connector.askMode = .answer("Synthetic answer whose record cannot be kept.")
        await link.submit(question: "And this?", assistance: .hint)
        let unkept = try await askCard(link)
        XCTAssertEqual([unkept.phase.rawValue, unkept.answer], ["answered", "Synthetic answer whose record cannot be kept."])
        XCTAssertEqual(unkept.detail, "this outcome could not be kept on this Mac")
        XCTAssertEqual(try Data(contentsOf: blocked), Data("already here".utf8))

        // Refused as not signed in: the connection is read again, so nothing goes on saying "signed in".
        connector.askMode = .error("unauthenticated")
        connector.connection = FakeConnector.connection(state: "signed_out", mode: NSNull())
        await link.submit(question: "And this?", assistance: .hint)
        let signedOutCard = try await askCard(link)
        XCTAssertEqual([signedOutCard.phase.rawValue, signedOutCard.detail], ["failed", "ChatGPT is not signed in"])
        let reread = await link.currentStatus()
        XCTAssertEqual(reread.connection, .signedOut)
        XCTAssertEqual(Set(keptFirst.all), ["kept"])
        XCTAssertEqual(keptFirst.all.count, connector.params("ask/start").count)
        await link.shutdown()

        // Submit starts no connector: without one, nothing is sent and nothing is started. A new
        // connector comes only from the user's own Connect.
        let lazy = FakeConnector()
        let lazyLink = askLink(lazy)
        var input = fixture.input
        input.selection.id = "a9"
        await lazyLink.open(input)
        await lazyLink.submit(question: "Why?", assistance: .hint)
        let lazyCard = try await askCard(lazyLink)
        XCTAssertEqual([lazyCard.phase.rawValue, lazyCard.detail], ["failed", "not sent: ChatGPT is not connected and signed in"])
        XCTAssertEqual([lazy.launches, lazy.methods.count], [0, 0])
        // The same after a connector was lost with a question on its way: that question's outcome
        // is not known, it is not asked again, and the next Submit starts nothing.
        lazy.askMode = .hold
        await lazyLink.connect()
        let lost = Task { await lazyLink.submit(question: "Why?", assistance: .hint) }
        let sendingLost = await until(5) { lazy.params("ask/start").count == 1 }
        XCTAssertTrue(sendingLost)
        lazy.exitChild()
        await lost.value
        let unknownCard = try await askCard(lazyLink)
        XCTAssertTrue(unknownCard.detail?.hasPrefix("no answer came; whether the question was answered by the service is not known") == true)
        await lazyLink.submit(question: "Why?", assistance: .hint)
        XCTAssertEqual([lazy.launches, lazy.params("ask/start").count], [1, 1], "no new connector and no second question by itself")
        lazy.askMode = .answer("Synthetic answer after the user's own Connect.")
        await lazyLink.connect()
        await lazyLink.submit(question: "Why?", assistance: .hint)
        let recoveredCard = try await askCard(lazyLink)
        XCTAssertEqual([recoveredCard.phase.rawValue, recoveredCard.answer], ["answered", "Synthetic answer after the user's own Connect."])
        XCTAssertEqual(lazy.launches, 2)

        // The card says what is known about the ink in its image, and no more.
        let shared = try askFixture("ask-submit-shared", excluded: false)
        await lazyLink.open(shared.input)
        let sharedCard = try await askCard(lazyLink)
        XCTAssertEqual(sharedCard.imageLine, "Selection a1: 80×40 px of frame \(shared.frame.sequence); whether these pixels hold the ink is not known.")
        let bare = try askFixture("ask-submit-bare", withInk: false)
        await lazyLink.open(bare.input)
        let bareCard = try await askCard(lazyLink)
        XCTAssertEqual(bareCard.imageLine, "Selection a1: 80×40 px of frame \(bare.frame.sequence), with no ink visible then.")
        await lazyLink.shutdown()
    }

    func testAskRefusesLocallyWithoutSendingAnything() async throws {
        let fixture = try askFixture("ask-local")
        func attempt(_ name: String, connection: [String: Any] = FakeConnector.connection(), question: String = "Why?",
                     model: String? = nil, connect: Bool = true) async throws -> AskCard {
            let connector = FakeConnector()
            connector.connection = connection
            let link = askLink(connector)
            if connect { await link.connect() }
            var input = fixture.input
            input.selection.id = "a" + name
            await link.open(input)
            await link.submit(question: question, assistance: .hint, model: model)
            XCTAssertTrue(Set(connector.methods).isSubset(of: ["connection/read"]), name)
            XCTAssertEqual(connector.launches, connect ? 1 : 0, name)
            let card = try await askCard(link, name)
            await link.shutdown()
            return card
        }
        let signedOut = try await attempt("1", connection: FakeConnector.connection(state: "signed_out", mode: NSNull()))
        XCTAssertEqual(signedOut.detail, "not sent: ChatGPT is not connected and signed in")
        let otherMode = try await attempt("2", connection: FakeConnector.connection(state: "signed_in", mode: "api_key"))
        XCTAssertEqual(otherMode.detail, "not sent: ChatGPT is not connected and signed in")
        let noVision = try await attempt("3", connection: FakeConnector.connection(imageModels: false))
        XCTAssertEqual(noVision.detail, "not sent: no such model in the catalog is listed as taking images")
        let textModel = try await attempt("4", model: "synthetic-text")
        XCTAssertEqual(textModel.detail, "not sent: no such model in the catalog is listed as taking images",
                       "a model that was asked for is never replaced by another")
        let empty = try await attempt("5", question: "  \n")
        XCTAssertEqual(empty.detail, "not sent: the question is empty")
        let long = try await attempt("6", question: String(repeating: "q", count: 4_001))
        XCTAssertEqual(long.detail, "not sent: the question is longer than 4000 characters")
        // Not connected yet: Submit starts nothing and sends nothing.
        let lazy = try await attempt("7", connection: FakeConnector.connection(state: "signed_out", mode: NSNull()), connect: false)
        XCTAssertEqual(lazy.detail, "not sent: ChatGPT is not connected and signed in")
        // While a sign-in is pending nothing is asked.
        let signing = FakeConnector()
        let signingLink = askLink(signing)
        await signingLink.connect()
        _ = await signingLink.startLogin()
        var waitingInput = fixture.input
        waitingInput.selection.id = "a8"
        await signingLink.open(waitingInput)
        await signingLink.submit(question: "Why?", assistance: .hint)
        let waitingCard = try await askCard(signingLink)
        XCTAssertEqual(waitingCard.detail, "not sent: a sign-in is still pending")
        XCTAssertFalse(signing.methods.contains("ask/start"))
        await signingLink.shutdown()
        // No request file is left for a question that was not sent.
        let asks = try files(in: fixture.session.appending(path: "asks"))
        XCTAssertFalse(asks.contains { $0.hasSuffix(".request.json") }, "\(asks)")

        // A selection without pixels has a card that cannot submit.
        let blind = try askFixture("ask-local-blind", crop: false)
        let connector = FakeConnector()
        let link = askLink(connector)
        await link.connect()
        await link.open(blind.input)
        let card = try await askCard(link)
        XCTAssertEqual(card.phase, .failed)
        XCTAssertFalse(card.canSubmit)
        await link.submit(question: "Why?", assistance: .hint)
        XCTAssertEqual(connector.methods, ["connection/read"])
    }

    // MARK: - Cancel, new selection, capture stop, connector loss

    func testAskCancelNewSelectionAndStopSuppressLaterAnswers() async throws {
        // Cancel: fenced at once, the connector is told, and the late answer is never shown.
        let connector = FakeConnector()
        connector.askMode = .hold
        connector.cancelReply = ["cancelled": true, "uncertain": true]
        let link = askLink(connector)
        await link.connect()
        let fixture = try askFixture("ask-cancel")
        await link.open(fixture.input)
        let first = try await askCard(link)
        let submitting = Task { await link.submit(question: "Why?", assistance: .hint) }
        let sending = await until(5) { await link.currentStatus().card?.phase == .sending }
        XCTAssertTrue(sending)
        // One question at a time.
        await link.submit(question: "Another?", assistance: .hint)
        XCTAssertEqual(connector.params("ask/start").count, 1)
        await link.cancelCard()
        let cancelled = try await askCard(link)
        XCTAssertEqual(cancelled.phase, .cancelled)
        XCTAssertEqual(cancelled.detail, "cancelled; whether the service still answered it is not known (it may have used quota). "
                       + "Its answer is not shown")
        XCTAssertEqual(connector.params("ask/cancel").first?["request_id"] as? String, first.cardID + "-q1")
        connector.release()
        await submitting.value
        let afterLate = try await askCard(link)
        XCTAssertEqual(afterLate.phase, .cancelled, "the late answer is not shown")
        XCTAssertNil(afterLate.answer)
        let record = try askRecord(fixture.session, first.cardID + "-q1.response.json")
        XCTAssertEqual(record["outcome"] as? String, "cancelled")
        XCTAssertEqual(record["interruption_uncertain"] as? Bool, true)
        XCTAssertEqual(record["connector_cancelled"] as? Bool, true)
        XCTAssertEqual(record["delivered_to_connector"] as? Bool, true, "the connector had the whole request")
        XCTAssertNil(record["text"], "the suppressed answer is not kept as an answer")

        // A new selection while a question is on its way: the old one is fenced, and its answer
        // never appears on the new card.
        connector.cancelReply = ["cancelled": true, "uncertain": false]
        let resubmitting = Task { await link.submit(question: "Why again?", assistance: .explain) }
        let sendingAgain = await until(5) { await link.currentStatus().card?.phase == .sending }
        XCTAssertTrue(sendingAgain)
        var next = fixture.input
        next.selection.id = "a2"
        await link.open(next)
        let second = try await askCard(link)
        XCTAssertEqual([second.selectionID, second.phase.rawValue], ["a2", "ready"])
        XCTAssertNotEqual(second.cardID, first.cardID)
        XCTAssertEqual(connector.params("ask/cancel").last?["request_id"] as? String, first.cardID + "-q2")
        connector.release()
        await resubmitting.value
        let untouched = try await askCard(link)
        XCTAssertEqual(untouched, second, "the old answer never reaches the new card")
        let superseded = try askRecord(fixture.session, first.cardID + "-q2.response.json")
        XCTAssertEqual(superseded["reason"] as? String, "a new selection was made")
        XCTAssertEqual([superseded["connector_cancelled"] as? Bool, superseded["interruption_uncertain"] as? Bool], [true, false])

        // The capture stops while a question is on its way: fenced, the connector is told, and
        // nothing more can be asked from that capture.
        let stopping = Task { await link.submit(question: "And now?", assistance: .hint) }
        let sendingThird = await until(5) { await link.currentStatus().card?.phase == .sending }
        XCTAssertTrue(sendingThird)
        let session = second.captureSessionID
        await link.sessionStopped(session)
        let stopped = try await askCard(link)
        XCTAssertEqual(stopped.phase, .cancelled)
        XCTAssertTrue(stopped.detail?.hasPrefix("the capture stopped") == true, stopped.detail ?? "")
        XCTAssertEqual(connector.params("session/stop").map { $0["capture_session_id"] as? String }, [session])
        connector.release()
        await stopping.value
        let afterStop = try await askCard(link)
        XCTAssertNil(afterStop.answer)
        let asked = connector.params("ask/start").count
        await link.submit(question: "After stop?", assistance: .hint)
        XCTAssertEqual(connector.params("ask/start").count, asked, "nothing is sent for a stopped capture")
        let refused = try await askCard(link)
        XCTAssertEqual(refused.phase, .stopped)
        // A selection of the stopped capture opened afterwards cannot submit either.
        var late = fixture.input
        late.selection.id = "a3"
        await link.open(late)
        let lateCard = try await askCard(link)
        XCTAssertEqual(lateCard.phase, .stopped)
        XCTAssertFalse(lateCard.canSubmit)
        await link.sessionStopped(session)
        XCTAssertEqual(connector.params("session/stop").count, 1, "told once")

        // A capture with another session can still ask.
        connector.askMode = .answer("Synthetic answer in a new capture.")
        let other = try askFixture("ask-cancel-next")
        await link.open(other.input)
        await link.submit(question: "Why?", assistance: .hint)
        let fresh = try await askCard(link)
        XCTAssertEqual(fresh.phase, .answered)
        // An answered card stays readable after its capture stops, but asks nothing more.
        await link.sessionStopped(fresh.captureSessionID)
        let kept = try await askCard(link)
        XCTAssertEqual([kept.phase.rawValue, kept.answer], ["answered", "Synthetic answer in a new capture."])
        let before = connector.params("ask/start").count
        await link.submit(question: "More?", assistance: .hint)
        XCTAssertEqual(connector.params("ask/start").count, before)
        let readable = try await askCard(link)
        XCTAssertEqual([readable.phase.rawValue, readable.answer, readable.detail],
                       ["answered", "Synthetic answer in a new capture.", "this capture has stopped; nothing can be asked from it"])
        await link.shutdown()

        // The connector does not confirm the stop: said so. This app's own fence holds without it.
        let unsure = FakeConnector()
        unsure.errors = ["session/stop": "interrupt_unconfirmed"]
        let unsureLink = askLink(unsure)
        await unsureLink.connect()
        let unconfirmed = try askFixture("ask-cancel-unconfirmed")
        await unsureLink.open(unconfirmed.input)
        let unconfirmedCard = try await askCard(unsureLink)
        await unsureLink.sessionStopped(unconfirmedCard.captureSessionID)
        let unsureStatus = await unsureLink.currentStatus()
        XCTAssertEqual(unsureStatus.detail, "the connector did not confirm that the capture stopped; this app sends nothing more for it")
        XCTAssertEqual(unsureStatus.card?.phase, .stopped)
        await unsureLink.submit(question: "After stop?", assistance: .hint)
        XCTAssertFalse(unsure.methods.contains("ask/start"))
        await unsureLink.shutdown()
    }

    func testAskLateAnswersCloseAndQuitWithAQuestionOnItsWay() async throws {
        // A late answer to a cancelled question never reaches the next question on the same card.
        let connector = FakeConnector()
        connector.askMode = .hold
        let link = askLink(connector)
        await link.connect()
        let fixture = try askFixture("ask-late")
        await link.open(fixture.input)
        let card = try await askCard(link)
        let first = Task { await link.submit(question: "First question?", assistance: .hint) }
        let sendingFirst = await until(5) { connector.params("ask/start").count == 1 }
        XCTAssertTrue(sendingFirst)
        await link.cancelCard()
        let second = Task { await link.submit(question: "Second question?", assistance: .explain) }
        let sendingSecond = await until(5) { connector.params("ask/start").count == 2 }
        XCTAssertTrue(sendingSecond)
        connector.release(text: "LATE ANSWER TO THE FIRST QUESTION")
        await first.value
        let waiting = try await askCard(link)
        XCTAssertEqual([waiting.phase.rawValue, waiting.question], ["sending", "Second question?"])
        XCTAssertNil(waiting.answer)
        connector.release(text: "Synthetic answer to the second question.")
        await second.value
        let answered = try await askCard(link)
        XCTAssertEqual([answered.phase.rawValue, answered.answer, answered.question],
                       ["answered", "Synthetic answer to the second question.", "Second question?"])
        XCTAssertEqual(try askRecord(fixture.session, card.cardID + "-q1.response.json")["outcome"] as? String, "cancelled")
        XCTAssertEqual(try askRecord(fixture.session, card.cardID + "-q2.response.json")["outcome"] as? String, "answered")

        // Closing the card with a question on its way: fenced, the connector is told, and the
        // record says why. Its answer opens no card.
        let third = Task { await link.submit(question: "Third question?", assistance: .hint) }
        let sendingThird = await until(5) { connector.params("ask/start").count == 3 }
        XCTAssertTrue(sendingThird)
        await link.closeCard()
        let closed = await link.currentStatus()
        XCTAssertNil(closed.card)
        XCTAssertEqual(connector.params("ask/cancel").last?["request_id"] as? String, card.cardID + "-q3")
        let closedRecord = try askRecord(fixture.session, card.cardID + "-q3.response.json")
        XCTAssertEqual([closedRecord["outcome"] as? String, closedRecord["reason"] as? String], ["cancelled", "the card was closed"])
        connector.release()
        await third.value
        let stillClosed = await link.currentStatus()
        XCTAssertNil(stillClosed.card)
        // Cancel on a card with nothing on its way closes it, and tells the connector nothing.
        var next = fixture.input
        next.selection.id = "a2"
        await link.open(next)
        await link.cancelCard()
        let idleClosed = await link.currentStatus()
        XCTAssertNil(idleClosed.card)
        XCTAssertEqual(connector.params("ask/cancel").count, 2)

        // The connector had nothing left to interrupt, or its answer is not in the pinned shape:
        // the question may already have been answered, so that stays not known.
        let replies: [([String: Any], Bool?)] = [(["cancelled": false, "uncertain": false], false), (["cancelled": true], nil),
                                                 (["cancelled": "yes", "uncertain": false], nil)]
        for (index, (reply, connectorCancelled)) in replies.enumerated() {
            connector.cancelReply = reply
            next.selection.id = "b\(index)"
            await link.open(next)
            let opened = try await askCard(link)
            let asked = connector.params("ask/start").count
            let asking = Task { await link.submit(question: "Why?", assistance: .hint) }
            let sending = await until(5) { connector.params("ask/start").count == asked + 1 }
            XCTAssertTrue(sending)
            await link.cancelCard()
            let cancelled = try await askCard(link)
            XCTAssertEqual(cancelled.detail, "cancelled; whether the service still answered it is not known (it may have used quota). "
                           + "Its answer is not shown", "\(reply)")
            let requestID = try XCTUnwrap(connector.params("ask/cancel").last?["request_id"] as? String)
            XCTAssertTrue(requestID.hasPrefix(opened.cardID))
            let record = try askRecord(fixture.session, requestID + ".response.json")
            XCTAssertEqual(record["interruption_uncertain"] as? Bool, true, "\(reply)")
            XCTAssertEqual(record["connector_cancelled"] as? Bool, connectorCancelled, "\(reply)")
            connector.release()
            await asking.value
        }
        await link.shutdown()

        // A new selection while the connector does not answer the cancel: the new card is there at
        // once, and a Submit goes out with the new selection, never the old one.
        let quiet = FakeConnector()
        quiet.askMode = .hold
        quiet.silent = ["ask/cancel"]
        let quietLink = askLink(quiet, callTimeout: 3)
        await quietLink.connect()
        let old = try askFixture("ask-late-old")
        await quietLink.open(old.input)
        let oldCard = try await askCard(quietLink)
        let pending = Task { await quietLink.submit(question: "Old question?", assistance: .hint) }
        let sendingOld = await until(5) { quiet.params("ask/start").count == 1 }
        XCTAssertTrue(sendingOld)
        let other = try askFixture("ask-late-new")
        let began = Date()
        let opening = Task { await quietLink.open(other.input) }
        let shownAtOnce = await until(1) { await quietLink.currentStatus().card?.captureSessionID == other.input.selection.nativeSession }
        XCTAssertTrue(shownAtOnce, "the new card does not wait for the connector")
        let newCard = try await askCard(quietLink)
        XCTAssertEqual(newCard.phase, .ready)
        let resubmit = Task { await quietLink.submit(question: "New question?", assistance: .hint) }
        let sentNew = await until(1) { quiet.params("ask/start").count == 2 }
        XCTAssertTrue(sentNew)
        XCTAssertLessThan(Date().timeIntervalSince(began), 2.5, "while the cancel was still unanswered")
        let newRequest = try XCTUnwrap(quiet.params("ask/start").last?["request"] as? [String: Any])
        XCTAssertEqual(newRequest["request_id"] as? String, newCard.cardID + "-q2")
        XCTAssertEqual((newRequest["context"] as? [String: Any])?["capture_session_id"] as? String, newCard.captureSessionID)
        XCTAssertNotEqual(newCard.captureSessionID, oldCard.captureSessionID)
        await opening.value
        let oldRecord = try askRecord(old.session, oldCard.cardID + "-q1.response.json")
        XCTAssertEqual([oldRecord["outcome"] as? String, oldRecord["reason"] as? String], ["cancelled", "a new selection was made"])
        XCTAssertEqual(oldRecord["interruption_uncertain"] as? Bool, true, "no answer to the cancel: not known")
        XCTAssertTrue(oldRecord["connector_cancelled"] is NSNull)
        quiet.release(text: "LATE ANSWER TO THE OLD SELECTION")
        await pending.value
        let untouched = try await askCard(quietLink)
        XCTAssertEqual([untouched.cardID, untouched.phase.rawValue], [newCard.cardID, "sending"])
        quiet.release(text: "Synthetic answer to the new selection.")
        await resubmit.value
        let newAnswered = try await askCard(quietLink)
        XCTAssertEqual([newAnswered.cardID, newAnswered.answer], [newCard.cardID, "Synthetic answer to the new selection."])
        await quietLink.shutdown()

        // Quit with a question on its way: fenced, and its record is written before shutdown returns.
        let closing = FakeConnector()
        closing.askMode = .hold
        let closingLink = askLink(closing)
        await closingLink.connect()
        let quitting = try askFixture("ask-late-quit")
        await closingLink.open(quitting.input)
        let quitCard = try await askCard(closingLink)
        let asking = Task { await closingLink.submit(question: "Why?", assistance: .hint) }
        let sendingQuit = await until(5) { closing.params("ask/start").count == 1 }
        XCTAssertTrue(sendingQuit)
        await closingLink.shutdown()
        let quitRecord = try askRecord(quitting.session, quitCard.cardID + "-q1.response.json")
        XCTAssertEqual([quitRecord["outcome"] as? String, quitRecord["reason"] as? String], ["cancelled", "the app is closing"])
        XCTAssertEqual(quitRecord["interruption_uncertain"] as? Bool, true)
        XCTAssertEqual(closing.ends, 1)
        await asking.value
        let afterQuit = try await askCard(closingLink)
        XCTAssertEqual(afterQuit.phase, .cancelled)
        XCTAssertNil(afterQuit.answer)

        // Quit while the capture's stop still waits for the connector's answer to the cancel: the
        // wait ends with the child, and the record is written before shutdown returns.
        let stuck = FakeConnector()
        stuck.askMode = .hold
        stuck.silent = ["ask/cancel"]
        let stuckLink = askLink(stuck)
        await stuckLink.connect()
        let stopping = try askFixture("ask-late-stop")
        await stuckLink.open(stopping.input)
        let stopCard = try await askCard(stuckLink)
        let stuckAsk = Task { await stuckLink.submit(question: "Why?", assistance: .hint) }
        let sendingStuck = await until(5) { stuck.params("ask/start").count == 1 }
        XCTAssertTrue(sendingStuck)
        let stop = Task { await stuckLink.sessionStopped(stopCard.captureSessionID) }
        let told = await until(5) { stuck.methods.contains("ask/cancel") }
        XCTAssertTrue(told)
        let quitBegan = Date()
        await stuckLink.shutdown()
        XCTAssertLessThan(Date().timeIntervalSince(quitBegan), 3, "not the whole time the connector may take to answer")
        let stopRecord = try askRecord(stopping.session, stopCard.cardID + "-q1.response.json")
        XCTAssertEqual([stopRecord["outcome"] as? String, stopRecord["reason"] as? String], ["cancelled", "the capture stopped"])
        XCTAssertEqual(stopRecord["interruption_uncertain"] as? Bool, true)
        await stop.value
        await stuckAsk.value
    }

    // MARK: - A request that has not reached the connector yet

    func testAskTakesBackARequestThatHasNotReachedTheConnector() async throws {
        let notDelivered = "; it had not reached the connector, so nothing was sent to the service"
        /// A link whose `ask/start` stays in the pipe's writer, with a question submitted on a new card.
        func held(_ name: String, inPart: Bool = false) async throws
            -> (connector: FakeConnector, link: AskLink, card: AskCard, session: URL, asking: Task<Void, Never>) {
            let connector = FakeConnector()
            connector.holdsWrites = ["ask/start"]
            connector.heldWritesAreInPart = inPart
            let link = askLink(connector)
            await link.connect()
            let fixture = try askFixture(name)
            await link.open(fixture.input)
            let card = try await askCard(link)
            let asking = Task { await link.submit(question: "Why?", assistance: .hint) }
            let sending = await until(5) { await link.currentStatus().card?.phase == .sending }
            XCTAssertTrue(sending, name)
            XCTAssertEqual(connector.methods, ["connection/read"], "the request is not with the connector yet")
            return (connector, link, card, fixture.session, asking)
        }
        /// After the writer is released: the connector never got the request or a cancel for it.
        func neverDelivered(_ connector: FakeConnector, _ asking: Task<Void, Never>, _ name: String) async throws {
            connector.holdsWrites = []
            await asking.value
            try await Task.sleep(nanoseconds: 200_000_000)
            XCTAssertFalse(connector.methods.contains("ask/start"), "\(name): \(connector.methods)")
            XCTAssertFalse(connector.methods.contains("ask/cancel"), "\(name): nothing to interrupt")
        }
        func notDeliveredRecord(_ session: URL, _ card: AskCard, reason: String, _ name: String) throws {
            let record = try askRecord(session, card.cardID + "-q1.response.json")
            XCTAssertEqual([record["outcome"] as? String, record["reason"] as? String], ["cancelled", reason], name)
            XCTAssertEqual(record["delivered_to_connector"] as? Bool, false, name)
            XCTAssertEqual(record["interruption_uncertain"] as? Bool, false, "\(name): nothing was sent, so nothing is uncertain")
            XCTAssertTrue(record["connector_cancelled"] is NSNull, name)
        }

        // Cancel: the request is taken back. It is never delivered, also after the writer runs
        // again, and the same connector answers the next question.
        let cancelled = try await held("ask-held-cancel")
        await cancelled.link.cancelCard()
        let cancelledCard = try await askCard(cancelled.link)
        XCTAssertEqual([cancelledCard.phase.rawValue, cancelledCard.detail], ["cancelled", "cancelled" + notDelivered])
        try await neverDelivered(cancelled.connector, cancelled.asking, "cancel")
        try notDeliveredRecord(cancelled.session, cancelled.card, reason: "cancelled", "cancel")
        let afterCancel = try await askCard(cancelled.link)
        XCTAssertEqual(afterCancel.detail, "cancelled" + notDelivered, "the card still says what happened")
        await cancelled.link.submit(question: "Why, then?", assistance: .hint)
        let answered = try await askCard(cancelled.link)
        XCTAssertEqual([answered.phase.rawValue, answered.answer], ["answered", "Synthetic answer: the value is 42."])
        XCTAssertEqual([cancelled.connector.launches, cancelled.connector.ends], [1, 0], "the same connector: its pipe was untouched")
        XCTAssertEqual(cancelled.connector.params("ask/start").count, 1, "only the question submitted afterwards")
        await cancelled.link.shutdown()

        // Stop: taken back, and the connector is told of the stop behind it, never of the request.
        let stopped = try await held("ask-held-stop")
        await stopped.link.sessionStopped(stopped.card.captureSessionID)
        let stoppedCard = try await askCard(stopped.link)
        XCTAssertEqual([stoppedCard.phase.rawValue, stoppedCard.detail], ["cancelled", "the capture stopped" + notDelivered])
        try await neverDelivered(stopped.connector, stopped.asking, "stop")
        XCTAssertEqual(stopped.connector.methods, ["connection/read", "session/stop"])
        try notDeliveredRecord(stopped.session, stopped.card, reason: "the capture stopped", "stop")
        await stopped.link.submit(question: "After stop?", assistance: .hint)
        XCTAssertFalse(stopped.connector.methods.contains("ask/start"))
        await stopped.link.shutdown()

        // A new selection, and Close.
        let replaced = try await held("ask-held-new")
        let other = try askFixture("ask-held-new-other")
        await replaced.link.open(other.input)
        let newCard = try await askCard(replaced.link)
        XCTAssertEqual([newCard.phase.rawValue, newCard.captureSessionID], ["ready", other.input.selection.nativeSession ?? ""])
        try await neverDelivered(replaced.connector, replaced.asking, "new selection")
        try notDeliveredRecord(replaced.session, replaced.card, reason: "a new selection was made", "new selection")
        await replaced.link.shutdown()
        let closed = try await held("ask-held-close")
        await closed.link.closeCard()
        try await neverDelivered(closed.connector, closed.asking, "close")
        try notDeliveredRecord(closed.session, closed.card, reason: "the card was closed", "close")
        await closed.link.shutdown()

        // Quit: taken back at once, and Quit does not wait for the held writer.
        let quitting = try await held("ask-held-quit")
        let quitBegan = Date()
        await quitting.link.shutdown()
        XCTAssertLessThan(Date().timeIntervalSince(quitBegan), 2)
        try notDeliveredRecord(quitting.session, quitting.card, reason: "the app is closing", "quit")
        quitting.connector.holdsWrites = []
        await quitting.asking.value
        XCTAssertFalse(quitting.connector.methods.contains("ask/start"))
        XCTAssertEqual(quitting.connector.ends, 1)

        // Taken back after part of it was written: that connector is ended (its pipe can carry
        // nothing more), nothing is sent in the request's place, and no connector is started
        // until the user's own Connect.
        let cut = try await held("ask-held-part", inPart: true)
        await cut.link.cancelCard()
        let ended = await until(5) { await cut.link.currentStatus().connection == .disconnected }
        XCTAssertTrue(ended)
        let cutStatus = await cut.link.currentStatus()
        XCTAssertEqual(cutStatus.detail, "the connector was ended, because a cancelled question had been written to it in part; "
                       + "nothing of it was sent to the service. Connect starts the connector again")
        XCTAssertEqual(cutStatus.card?.detail, "cancelled" + notDelivered)
        try await neverDelivered(cut.connector, cut.asking, "in part")
        try notDeliveredRecord(cut.session, cut.card, reason: "cancelled", "in part")
        XCTAssertEqual([cut.connector.launches, cut.connector.ends], [1, 1])
        await cut.link.submit(question: "Again?", assistance: .hint)
        XCTAssertEqual(cut.connector.launches, 1, "no connector by itself")
        await cut.link.connect()
        await cut.link.submit(question: "Again?", assistance: .hint)
        let recovered = try await askCard(cut.link)
        XCTAssertEqual([recovered.phase.rawValue, recovered.answer], ["answered", "Synthetic answer: the value is 42."])
        XCTAssertEqual(cut.connector.launches, 2, "started by the user's Connect")
        XCTAssertEqual(cut.connector.params("ask/start").count, 1)
        // That new connector's own end, later, is said as its own.
        cut.connector.exitChild()
        let endedAgain = await until(5) { await cut.link.currentStatus().connection == .disconnected }
        XCTAssertTrue(endedAgain)
        let ownEnd = await cut.link.currentStatus()
        XCTAssertEqual(ownEnd.detail, "the connector ended")
        await cut.link.shutdown()

        // While the app is closing, a Submit sends nothing, also before the connector has ended.
        let closing = FakeConnector()
        closing.endDelay = 1
        let closingLink = askLink(closing)
        await closingLink.connect()
        let lateFixture = try askFixture("ask-held-closing")
        await closingLink.open(lateFixture.input)
        let quit = Task { await closingLink.shutdown() }
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertEqual(closing.ends, 0, "still ending")
        await closingLink.submit(question: "Too late?", assistance: .hint)
        await quit.value
        XCTAssertFalse(closing.methods.contains("ask/start"))

        // A request the connector does not take in time, with no Cancel: said as not sent (that
        // is known), not as an unknown outcome, and not sent again.
        let refusing = FakeConnector()
        refusing.failsWrites = ["ask/start"]
        let refusingLink = askLink(refusing)
        await refusingLink.connect()
        let untaken = try askFixture("ask-held-untaken")
        await refusingLink.open(untaken.input)
        await refusingLink.submit(question: "Why?", assistance: .hint)
        let untakenCard = try await askCard(refusingLink)
        XCTAssertEqual([untakenCard.phase.rawValue, untakenCard.detail],
                       ["failed", "not sent: the connector did not take the request, so nothing reached the service"])
        XCTAssertEqual(try askRecord(untaken.session, untakenCard.cardID + "-q1.response.json")["outcome"] as? String, "not_sent")
        XCTAssertEqual(refusing.methods, ["connection/read"])
        await refusingLink.shutdown()

        // The handle itself: a line delivered whole cannot be taken back, and one taken back is
        // never marked delivered.
        let whole = AskRevocation()
        XCTAssertEqual(whole.attempt(remaining: 10, started: false) { 4 }, 4)
        XCTAssertEqual(whole.attempt(remaining: 6, started: true) { 6 }, 6)
        XCTAssertFalse(whole.revoke(), "already with the connector")
        XCTAssertFalse(whole.isRevoked || whole.wasWrittenInPart)
        let partial = AskRevocation()
        XCTAssertEqual(partial.attempt(remaining: 10, started: false) { 4 }, 4)
        XCTAssertTrue(partial.revoke())
        XCTAssertNil(partial.attempt(remaining: 6, started: true) { XCTFail("written after it was taken back"); return 6 })
        XCTAssertTrue(partial.isRevoked && partial.wasWrittenInPart)
        XCTAssertTrue(partial.revoke(), "still taken back")
        // Taking back and writing the last byte exclude each other: a take-back that comes while
        // the last byte is being written waits for it, and then learns the line was delivered.
        let racing = AskRevocation()
        let race = EndLog()
        let lastStep = racing.attempt(remaining: 5, started: true) {
            DispatchQueue.global().async { race.add(racing.revoke() ? "taken back" : "already delivered") }
            Thread.sleep(forTimeInterval: 0.3)
            XCTAssertEqual(race.all, [], "taken back while its last byte was being written")
            return 5
        }
        XCTAssertEqual(lastStep, 5)
        let raced = await until(5) { race.all.count == 1 }
        XCTAssertTrue(raced)
        XCTAssertEqual(race.all, ["already delivered"])
    }

    func testAskConnectorLossAndTimeoutAreUnknownAndNeverRetried() async throws {
        // The connector ends while a question is on its way.
        let connector = FakeConnector()
        connector.askMode = .hold
        let link = askLink(connector)
        await link.connect()
        let fixture = try askFixture("ask-loss")
        await link.open(fixture.input)
        let submitting = Task { await link.submit(question: "Why?", assistance: .hint) }
        let sending = await until(5) { await link.currentStatus().card?.phase == .sending }
        XCTAssertTrue(sending)
        connector.exitChild()
        await submitting.value
        let lost = try await askCard(link)
        XCTAssertEqual(lost.phase, .failed)
        XCTAssertEqual(lost.detail, "no answer came; whether the question was answered by the service is not known. "
                       + "It is not asked again by itself")
        let status = await link.currentStatus()
        XCTAssertEqual(status.connection, .disconnected)
        XCTAssertEqual(status.detail, "the connector ended")
        XCTAssertEqual(connector.params("ask/start").count, 1, "not asked again")
        XCTAssertEqual(try askRecord(fixture.session, lost.cardID + "-q1.response.json")["outcome"] as? String, "unknown")

        // No answer in time: unknown, the connector is asked to interrupt, and nothing is retried.
        let slow = FakeConnector()
        slow.askMode = .hold
        let slowLink = askLink(slow, askTimeout: 0.5)
        await slowLink.connect()
        var input = fixture.input
        input.selection.id = "a2"
        await slowLink.open(input)
        await slowLink.submit(question: "Why?", assistance: .hint)
        let timedOut = try await askCard(slowLink)
        XCTAssertEqual(timedOut.phase, .failed)
        XCTAssertTrue(timedOut.detail?.hasPrefix("no answer came") == true)
        let interrupted = await until(5) { slow.methods.contains("ask/cancel") }
        XCTAssertTrue(interrupted)
        slow.release()
        try await Task.sleep(nanoseconds: 300_000_000)
        let afterLate = try await askCard(slowLink)
        XCTAssertNil(afterLate.answer, "an answer after the bound is never shown")
        XCTAssertEqual(slow.params("ask/start").count, 1)

        // A line that is not the connector's protocol ends the connection: nothing more is believed.
        let odd = FakeConnector()
        let oddLink = askLink(odd)
        await oddLink.connect()
        odd.emitRaw("this is not a connector line")
        let ended = await until(5) { await oddLink.currentStatus().connection == .disconnected }
        XCTAssertTrue(ended)
        XCTAssertEqual(odd.ends, 1)
        await slowLink.shutdown()
        await link.shutdown()
    }

    // MARK: - The real child process

    func testAskConnectorChildGetsAPrivatePipeAndAMinimalEnvironment() async throws {
        let directory = root.appending(path: "ask-child", directoryHint: .isDirectory)
        let connectors = directory.appending(path: "repo/services/worker/connectors", directoryHint: .isDirectory)
        let log = directory.appending(path: "log", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: connectors, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: log, withIntermediateDirectories: true)
        try Data().write(to: connectors.appending(path: "chatgpt_local.py"))
        func stub(_ mode: String) throws -> URL {
            let script = """
            #!/bin/sh
            log='\(log.path(percentEncoded: false))'
            printf '%s\\n' "$#" "$@" > "$log/argv"
            if [ -p /dev/stdin ]; then echo fifo > "$log/stdin"; else echo other > "$log/stdin"; fi
            env | sort > "$log/env"
            pwd > "$log/cwd"
            case '\(mode)' in
              echo) while IFS= read -r line; do printf '%s\\n' "$line" >> "$log/lines"; printf '{"id":"seen","result":{}}\\n'; done ;;
              count) wc -c > "$log/bytes" ;;
              flood) echo $$ > "$log/pid"; trap '' TERM; head -c 300000 /dev/zero | tr '\\0' 'a'; echo
                sleep 1 < /dev/null > /dev/null 2>&1; printf '{"id":"late","result":{}}\\n'
                # Bounded: if a test run is cut short, this stand-in still ends by itself.
                i=0; while [ $i -lt 40 ]; do sleep 1 < /dev/null > /dev/null 2>&1; i=$((i+1)); done ;;
            esac
            echo eof >> "$log/ends"

            """
            let python = directory.appending(path: "python-" + mode)
            try Data(script.utf8).write(to: python)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: python.path(percentEncoded: false))
            return python
        }
        func lines(_ name: String) -> [String] {
            ((try? String(contentsOf: log.appending(path: name), encoding: .utf8)) ?? "").split(separator: "\n").map(String.init)
        }
        let received = EndLog()
        let exits = EndLog()
        func launch(_ mode: String, state: URL? = nil) throws -> any AskChild {
            let config = AskConnectorConfig(python: try stub(mode), repository: directory.appending(path: "repo", directoryHint: .isDirectory),
                                            stateDirectory: state)
            return try XCTUnwrap(ProcessAskLauncher(sendTimeout: 10, endGrace: 3).launch(
                config, onLine: { received.add(String(decoding: $0, as: UTF8.self)) }, onExit: { exits.add(mode) }))
        }

        // The parent holds secrets and settings the child must not get.
        setenv("OPENAI_API_KEY", "synthetic-not-a-key", 1)
        setenv("LC_DATABASE_URL", "synthetic-not-a-dsn", 1)
        setenv("PYTHONPATH", "/synthetic", 1)
        defer {
            unsetenv("OPENAI_API_KEY")
            unsetenv("LC_DATABASE_URL")
            unsetenv("PYTHONPATH")
        }
        let state = directory.appending(path: "product-state", directoryHint: .isDirectory)
        let child = try launch("echo", state: state)
        let sent = await child.send(Data("{\"probe\":1}\n".utf8))
        XCTAssertTrue(sent)
        let answered = await until(10) { received.all == ["{\"id\":\"seen\",\"result\":{}}"] }
        XCTAssertTrue(answered, "\(received.all)")
        XCTAssertEqual(lines("argv"), ["2", "-m", "services.worker.connectors.chatgpt_local"], "exactly the module in argv")
        XCTAssertEqual(lines("stdin"), ["fifo"])
        XCTAssertEqual(lines("lines"), ["{\"probe\":1}"])
        XCTAssertTrue(lines("cwd").first?.hasSuffix("/repo") == true)
        let environment = lines("env")
        let names = Set(environment.compactMap { $0.split(separator: "=").first.map(String.init) })
        XCTAssertTrue(names.isSubset(of: ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "SHELL", "PYTHONDONTWRITEBYTECODE",
                                         "LC_SUBSCRIPTION_STATE_DIR", "PWD", "SHLVL", "_", "OLDPWD", "__CF_USER_TEXT_ENCODING"]), "\(names)")
        XCTAssertTrue(environment.contains("LC_SUBSCRIPTION_STATE_DIR=" + state.path(percentEncoded: false)))
        XCTAssertFalse(environment.joined().contains("synthetic-not-a"))
        XCTAssertFalse(child.hasExited, "stdin stays open for the child's life")
        await child.end()
        XCTAssertEqual(lines("ends"), ["eof"], "EOF ends the child")
        XCTAssertTrue(child.hasExited)
        let reported = await until(5) { exits.all == ["echo"] }
        XCTAssertTrue(reported, "\(exits.all)")
        let afterEnd = await child.send(Data("{}\n".utf8))
        XCTAssertFalse(afterEnd)

        // A request of several megabytes reaches the child whole.
        let counting = try launch("count")
        var large = Data(repeating: 0x61, count: 3 * 1024 * 1024)
        large.append(0x0A)
        let largeSent = await counting.send(large)
        XCTAssertTrue(largeSent)
        await counting.end()
        XCTAssertEqual(lines("bytes").first?.trimmingCharacters(in: .whitespaces), String(large.count))

        // A line longer than the bound is not a connector line: the child is reported gone at once,
        // nothing it writes afterwards is passed on, and a child that ignores EOF and SIGTERM is
        // killed (that process only). The stand-in ends by itself after 40 s in any case, so a run
        // that is cut short leaves no process behind.
        let endsBefore = lines("ends").count
        let flooding = try launch("flood")
        let reportedGone = await until(2) { exits.all.contains("flood") }
        XCTAssertTrue(reportedGone, "reported when it broke the line rule, before it has ended")
        XCTAssertFalse(flooding.hasExited)
        let ended = await until(20) { flooding.hasExited }
        XCTAssertTrue(ended, "ended after it ignored EOF and SIGTERM")
        XCTAssertFalse(received.all.contains { $0.count > AskWire.maxIncomingLine || $0.contains("late") }, "nothing more is passed on")
        XCTAssertEqual(exits.all.filter { $0 == "flood" }.count, 1, "reported once")
        XCTAssertEqual(lines("ends").count, endsBefore, "it did not end by itself")
        let pid = try XCTUnwrap(Int32(lines("pid").first ?? ""))
        XCTAssertEqual(kill(pid, 0), -1, "the child is gone")

        // Check Again replacing a real child: the exit of the one it ended is never taken as the
        // exit of the one it started, although the new child object may get the old one's address.
        let failing = log.appending(path: "fail")
        let answering = directory.appending(path: "python-answer")
        let answer = """
        #!/bin/sh
        log='\(log.path(percentEncoded: false))'
        while IFS= read -r line; do
          id=${line#*\\"id\\":\\"}; id=${id%%\\"*}
          if [ -e "$log/fail" ]; then printf '{"id":"%s","error":{"code":"failed","message":"synthetic"}}\\n' "$id"
          else printf '{"id":"%s","result":{"auth":{"state":"signed_in","mode":"chatgpt","plan":null},"rate_limits":null,"models":[]}}\\n' "$id"; fi
        done

        """
        try Data(answer.utf8).write(to: answering)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: answering.path(percentEncoded: false))
        let replacingLink = AskLink(config: .success(AskConnectorConfig(python: answering, repository: directory.appending(path: "repo", directoryHint: .isDirectory))),
                                    launcher: ProcessAskLauncher(sendTimeout: 10, endGrace: 3), callTimeout: 10)
        for round in 0..<6 {
            try Data().write(to: failing)
            await replacingLink.connect()
            let keptFailure = await replacingLink.currentStatus()
            XCTAssertEqual(keptFailure.connection, .unknown, "round \(round)")
            try FileManager.default.removeItem(at: failing)
            await replacingLink.connect()
            let fresh = await replacingLink.currentStatus()
            XCTAssertEqual(fresh.connection, .signedIn, "round \(round): the new connector was not kept (\(fresh.detail ?? "no detail"))")
        }
        await replacingLink.shutdown()

        // A missing interpreter does not start.
        let missing = AskConnectorConfig(python: directory.appending(path: "no-such-python"),
                                         repository: directory.appending(path: "repo", directoryHint: .isDirectory))
        XCTAssertNil(ProcessAskLauncher().launch(missing, onLine: { _ in }, onExit: {}))
    }

    /// The held reader of the lead's review, with real processes and real pipes: a child that does
    /// not read, so a request larger than the pipe's buffer stays in the writer part way.
    func testAskRealChildNeverGetsARequestTakenBackInThePipe() async throws {
        let directory = root.appending(path: "ask-held-child", directoryHint: .isDirectory)
        let connectors = directory.appending(path: "repo/services/worker/connectors", directoryHint: .isDirectory)
        let log = directory.appending(path: "log", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: connectors, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: log, withIntermediateDirectories: true)
        try Data().write(to: connectors.appending(path: "chatgpt_local.py"))
        // Answers the first line as a signed-in connection, then reads nothing until `release`
        // exists, then keeps every byte that still comes, up to EOF, in `rest-<launch>`. With
        // `slow` it reads at once, but only about 4 KiB every 50 ms.
        let script = """
        #!/bin/sh
        log='\(log.path(percentEncoded: false))'
        echo launch >> "$log/launches"
        launch=$(wc -l < "$log/launches" | tr -d ' ')
        IFS= read -r line
        id=${line#*\\"id\\":\\"}; id=${id%%\\"*}
        printf '{"id":"%s","result":{"auth":{"state":"signed_in","mode":"chatgpt","plan":null},"rate_limits":null,"models":[{"id":"synthetic-vision","label":"Synthetic vision","image_input":true,"default":true}]}}\\n' "$id"
        # Bounded: if a test run is cut short, this stand-in still ends by itself.
        i=0; while [ ! -e "$log/release" ]; do
          sleep 0.1 < /dev/null > /dev/null 2>&1; i=$((i+1)); [ $i -lt 600 ] || exit 0
        done
        if [ -e "$log/slow" ]; then
          : > "$log/rest-$launch"
          while :; do
            dd bs=4096 count=1 2> /dev/null > "$log/chunk-$launch"
            [ -s "$log/chunk-$launch" ] || break
            cat "$log/chunk-$launch" >> "$log/rest-$launch"
            sleep 0.05 < /dev/null > /dev/null 2>&1
          done
        else
          cat > "$log/rest-$launch"
        fi

        """
        let python = directory.appending(path: "python-held")
        try Data(script.utf8).write(to: python)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: python.path(percentEncoded: false))
        let config = AskConnectorConfig(python: python, repository: directory.appending(path: "repo", directoryHint: .isDirectory))
        let release = log.appending(path: "release")
        func launches() -> Int {
            ((try? String(contentsOf: log.appending(path: "launches"), encoding: .utf8)) ?? "").split(separator: "\n").count
        }
        /// What launch `number` got after its first line, once it has ended.
        func rest(_ number: Int) async -> Data {
            let file = log.appending(path: "rest-\(number)")
            var size = -1
            // Complete once the child has ended: the size no longer changes.
            _ = await until(10) {
                let now = ((try? FileManager.default.attributesOfItem(atPath: file.path(percentEncoded: false)))?[.size] as? Int) ?? -1
                defer { size = now }
                return now >= 0 && now == size
            }
            return (try? Data(contentsOf: file)) ?? Data()
        }

        // The transport by itself. A line of 2 MiB is in the writer part way; a small line waits
        // behind it. Taken back: it is never completed, nothing is appended to it, and both
        // sends say so soon.
        let lines = EndLog()
        let transport = try XCTUnwrap(ProcessAskLauncher(sendTimeout: 20, endGrace: 3).launch(
            config, onLine: { lines.add(String(decoding: $0, as: UTF8.self)) }, onExit: {}))
        let first = await transport.send(Data("{\"id\":\"t1\"}\n".utf8))
        XCTAssertTrue(first)
        let answered = await until(10) { lines.all.count == 1 }
        XCTAssertTrue(answered)
        var big = Data(repeating: 0x62, count: 2 << 20)
        big.append(0x0A)
        let handle = AskRevocation()
        let sendingBig = Task { await transport.send(big, revocation: handle) }
        let sendingBehind = Task { () -> Bool in
            try? await Task.sleep(nanoseconds: 300_000_000)
            return await transport.send(Data("{\"behind\":1}\n".utf8))
        }
        try await Task.sleep(nanoseconds: 800_000_000)
        XCTAssertTrue(handle.revoke(), "not delivered whole: it can still be taken back")
        try Data().write(to: release)
        let takenBack = Date()
        let bigDelivered = await sendingBig.value
        let behindDelivered = await sendingBehind.value
        XCTAssertFalse(bigDelivered)
        XCTAssertFalse(behindDelivered, "nothing follows a line that was cut off")
        XCTAssertLessThan(Date().timeIntervalSince(takenBack), 6)
        XCTAssertTrue(handle.wasWrittenInPart)
        let cutOff = await rest(1)
        XCTAssertTrue(cutOff.count > 0 && cutOff.count < big.count, "\(cutOff.count) bytes: a part, not the line")
        XCTAssertFalse(cutOff.contains(0x0A), "no line the connector could act on")
        XCTAssertNil(cutOff.range(of: Data("behind".utf8)), "nothing was appended to the part")
        XCTAssertTrue(transport.hasExited)

        // A line taken back before its first byte leaves the pipe as it was: the large line in
        // front of it arrives whole, and so does a line sent afterwards. (The reader still holds.)
        try FileManager.default.removeItem(at: release)
        let intact = try XCTUnwrap(ProcessAskLauncher(sendTimeout: 20, endGrace: 3).launch(config, onLine: { _ in }, onExit: {}))
        let intactFirst = await intact.send(Data("{\"id\":\"t2\"}\n".utf8))
        XCTAssertTrue(intactFirst)
        let frontHandle = AskRevocation()
        let front = Task { await intact.send(big, revocation: frontHandle) }
        let queuedHandle = AskRevocation()
        let queued = Task { () -> Bool in
            try? await Task.sleep(nanoseconds: 300_000_000)
            return await intact.send(Data("{\"queued\":1}\n".utf8), revocation: queuedHandle)
        }
        try await Task.sleep(nanoseconds: 800_000_000)
        XCTAssertTrue(queuedHandle.revoke())
        try Data().write(to: release)
        let frontDelivered = await front.value
        let queuedDelivered = await queued.value
        XCTAssertTrue(frontDelivered, "the clean path: a large line reaches a reader that was slow, whole")
        XCTAssertFalse(frontHandle.revoke(), "the real writer marked it delivered: it cannot be taken back any more")
        XCTAssertFalse(queuedDelivered)
        XCTAssertFalse(queuedHandle.wasWrittenInPart)
        XCTAssertFalse(intact.hasExited, "taking back a line that was not begun ends nothing")
        let later = await intact.send(Data("{\"later\":1}\n".utf8))
        XCTAssertTrue(later)
        await intact.end()
        let whole = await rest(2)
        XCTAssertEqual(whole, big + Data("{\"later\":1}\n".utf8), "the large line and the later line, and nothing of the one taken back")

        // A reader that is slow but reads: the pipe has room again and again. A line taken back
        // part way is still not completed, and the line queued behind it is not appended to it.
        try Data().write(to: log.appending(path: "slow"))
        let slow = try XCTUnwrap(ProcessAskLauncher(sendTimeout: 20, endGrace: 3).launch(config, onLine: { _ in }, onExit: {}))
        let slowFirst = await slow.send(Data("{\"id\":\"t4\"}\n".utf8))
        XCTAssertTrue(slowFirst)
        let slowHandle = AskRevocation()
        let slowBig = Task { await slow.send(big, revocation: slowHandle) }
        let slowBehind = Task { () -> Bool in
            try? await Task.sleep(nanoseconds: 300_000_000)
            return await slow.send(Data("{\"behind\":1}\n".utf8))
        }
        try await Task.sleep(nanoseconds: 800_000_000)
        // The concurrency threads are kept busy for a moment, so the sender's own follow-up (ending
        // the child) comes late: the writer's queue alone has to refuse the line behind.
        for _ in 0..<(ProcessInfo.processInfo.activeProcessorCount * 2) {
            Task.detached {
                let busyUntil = Date().addingTimeInterval(0.5)
                while Date() < busyUntil {}
            }
        }
        XCTAssertTrue(slowHandle.revoke())
        let slowBigDelivered = await slowBig.value
        let slowBehindDelivered = await slowBehind.value
        XCTAssertFalse(slowBigDelivered || slowBehindDelivered)
        let drained = await rest(3)
        XCTAssertTrue(drained.count > 0 && drained.count < big.count, "\(drained.count) bytes")
        XCTAssertFalse(drained.contains(0x0A), "no line the connector could act on")
        XCTAssertNil(drained.range(of: Data("behind".utf8)), "nothing was appended to the part")
        try FileManager.default.removeItem(at: log.appending(path: "slow"))

        // Ending the child does not wait for a write that cannot finish.
        try FileManager.default.removeItem(at: release)
        let stuck = try XCTUnwrap(ProcessAskLauncher(sendTimeout: 20, endGrace: 3).launch(config, onLine: { _ in }, onExit: {}))
        let stuckFirst = await stuck.send(Data("{\"id\":\"t3\"}\n".utf8))
        XCTAssertTrue(stuckFirst)
        let stuckSend = Task { await stuck.send(big) }
        try await Task.sleep(nanoseconds: 500_000_000)
        let ending = Date()
        await stuck.end()
        XCTAssertLessThan(Date().timeIntervalSince(ending), 10, "bounded by the end's own grace, not by the write's 20 s")
        let stuckDelivered = await stuckSend.value
        XCTAssertFalse(stuckDelivered)
        XCTAssertTrue(stuck.hasExited)

        // The whole path: Stop, then Cancel, while the selected image is in the pipe part way.
        for (round, action) in ["stop", "cancel"].enumerated() {
            try? FileManager.default.removeItem(at: release)
            let started = launches()
            let link = AskLink(config: .success(config), launcher: ProcessAskLauncher(sendTimeout: 20, endGrace: 3), callTimeout: 10,
                               askTimeout: 5)
            await link.connect()
            let connected = await link.currentStatus()
            XCTAssertEqual(connected.connection, .signedIn, action)
            let fixture = try askFixture("ask-held-child-\(action)", large: true)
            await link.open(fixture.input)
            let card = try await askCard(link, action)
            XCTAssertGreaterThan(Int(card.imageWidth ?? 0) * Int(card.imageHeight ?? 0), 200_000, "a selection far larger than a pipe's buffer")
            let asking = Task { await link.submit(question: "Why?", assistance: .hint) }
            let sending = await until(5) { await link.currentStatus().card?.phase == .sending }
            XCTAssertTrue(sending, action)
            try await Task.sleep(nanoseconds: 800_000_000)
            if action == "stop" {
                await link.sessionStopped(card.captureSessionID)
            } else {
                await link.cancelCard()
            }
            let fenced = try await askCard(link, action)
            XCTAssertEqual(fenced.phase, .cancelled, action)
            XCTAssertTrue(fenced.detail?.hasSuffix("; it had not reached the connector, so nothing was sent to the service") == true,
                          "\(action): \(fenced.detail ?? "")")
            // Only now does the child read again.
            try Data().write(to: release)
            await asking.value
            let lost = await until(15) { await link.currentStatus().connection == .disconnected }
            XCTAssertTrue(lost, action)
            let after = await link.currentStatus()
            XCTAssertTrue(after.detail?.hasPrefix("the connector was ended, because a cancelled question had been written to it in part") == true,
                          "\(action): \(after.detail ?? "")")
            let got = await rest(started + 1)
            XCTAssertGreaterThan(got.count, 0, "\(action): a part was in the pipe")
            XCTAssertFalse(got.contains(0x0A), "\(action): no request the connector could act on, after the local \(action)")
            XCTAssertNil(got.range(of: Data("ask/cancel".utf8)), action)
            XCTAssertNil(got.range(of: Data("session/stop".utf8)), action)
            let record = try askRecord(fixture.session, card.cardID + "-q1.response.json")
            XCTAssertEqual([record["outcome"] as? String, record["delivered_to_connector"] as? Bool == false ? "not delivered" : "delivered"],
                           ["cancelled", "not delivered"], action)
            // No connector by itself; the user's Connect starts one.
            await link.submit(question: "Again?", assistance: .hint)
            try await Task.sleep(nanoseconds: 300_000_000)
            XCTAssertEqual(launches(), started + 1, action)
            await link.connect()
            let recovered = await link.currentStatus()
            XCTAssertEqual(recovered.connection, .signedIn, action)
            XCTAssertEqual(launches(), started + 2, action)

            // The clean path on that new connector, which reads: the same large request arrives
            // whole, once. This stand-in never answers, so the outcome is said as not known.
            if round == 1 {
                let clean = try askFixture("ask-held-child-clean", large: true)
                let cleanLink = AskLink(config: .success(config), launcher: ProcessAskLauncher(sendTimeout: 20, endGrace: 3),
                                        callTimeout: 1.5, askTimeout: 1.5)
                let before = launches()
                await cleanLink.connect()
                await cleanLink.open(clean.input)
                await cleanLink.submit(question: "Why?", assistance: .hint)
                let unanswered = try await askCard(cleanLink)
                XCTAssertTrue(unanswered.detail?.hasPrefix("no answer came; whether the question was answered by the service is not known") == true,
                              unanswered.detail ?? "")
                // Cancel after the real writer delivered the request whole: it cannot be taken
                // back, so the connector is asked to interrupt it, and (this stand-in never
                // answers) the outcome is said and kept as not known, never as "not sent".
                let secondAsk = Task { await cleanLink.submit(question: "And then?", assistance: .hint) }
                let sendingAgain = await until(5) { await cleanLink.currentStatus().card?.phase == .sending }
                XCTAssertTrue(sendingAgain)
                try await Task.sleep(nanoseconds: 800_000_000)
                await cleanLink.cancelCard()
                let deliveredCard = try await askCard(cleanLink)
                XCTAssertEqual(deliveredCard.detail, "cancelled; whether the service still answered it is not known (it may have used quota). "
                               + "Its answer is not shown")
                let deliveredRecord = try askRecord(clean.session, unanswered.cardID + "-q2.response.json")
                XCTAssertEqual(deliveredRecord["delivered_to_connector"] as? Bool, true)
                XCTAssertEqual(deliveredRecord["interruption_uncertain"] as? Bool, true)
                await secondAsk.value
                let quitting = Date()
                await cleanLink.shutdown()
                XCTAssertLessThan(Date().timeIntervalSince(quitting), 10)
                let delivered = await rest(before + 1)
                let received = delivered.split(separator: 0x0A, omittingEmptySubsequences: false)
                XCTAssertEqual(delivered.last, 0x0A)
                XCTAssertEqual(received.filter { $0.range(of: Data("\"method\":\"ask/start\"".utf8)) != nil }.count, 2,
                               "each delivered whole, once")
                XCTAssertGreaterThan(received.first?.count ?? 0, 1_000_000)
                XCTAssertEqual(received.filter { $0.range(of: Data("\"method\":\"ask/cancel\"".utf8)) != nil }.count, 2,
                               "the timed-out question and the cancelled one are both interrupted at the connector")
            }
            await link.shutdown()
        }
    }

    func testAskConnectorConfiguration() throws {
        let directory = root.appending(path: "ask-config", directoryHint: .isDirectory)
        let connectors = directory.appending(path: "repo/services/worker/connectors", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: connectors, withIntermediateDirectories: true)
        let file = directory.appending(path: "ask-connector.json")
        XCTAssertEqual(AskConnectorConfig.load(file), .failure(.notConfigured), "no file: not set up, never a stand-in")
        let python = directory.appending(path: "python")
        try Data("#!/bin/sh\n".utf8).write(to: python)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: python.path(percentEncoded: false))
        let repository = directory.appending(path: "repo", directoryHint: .isDirectory)
        func write(_ object: [String: Any]) throws {
            try JSONSerialization.data(withJSONObject: object).write(to: file)
        }
        var object: [String: Any] = ["format": "lc-macos-dev-ask-connector/v1", "python": python.path(percentEncoded: false),
                                     "repository": repository.path(percentEncoded: false)]
        try write(object)
        guard case .failure(.invalid) = AskConnectorConfig.load(file) else { return XCTFail("a repository without the module was accepted") }
        try Data().write(to: connectors.appending(path: "chatgpt_local.py"))
        XCTAssertEqual(AskConnectorConfig.load(file), .success(AskConnectorConfig(python: python, repository: repository)))
        object["state_dir"] = directory.appending(path: "state").path(percentEncoded: false)
        object["codex_bin"] = python.path(percentEncoded: false)
        try write(object)
        let full = try AskConnectorConfig.load(file).get()
        XCTAssertEqual(full.stateDirectory?.lastPathComponent, "state")
        let environment = full.environment(["PATH": "/usr/bin", "HOME": "/tmp", "OPENAI_API_KEY": "x", "CODEX_HOME": "x",
                                            "LC_DATABASE_URL": "x", "ANTHROPIC_API_KEY": "x", "PYTHONPATH": "x"])
        XCTAssertEqual(environment, ["PATH": "/usr/bin", "HOME": "/tmp", "PYTHONDONTWRITEBYTECODE": "1",
                                     "LC_SUBSCRIPTION_STATE_DIR": directory.appending(path: "state").path(percentEncoded: false),
                                     "LC_SUBSCRIPTION_CODEX_BIN": python.path(percentEncoded: false)])
        let changes: [(String, Any)] = [("format", "other"), ("python", "relative/python"), ("python", "/etc/hosts"),
                                        ("state_dir", "relative"), ("codex_bin", "/etc/hosts"), ("token", "x")]
        for (key, value) in changes {
            var changed = object
            changed[key] = value
            try write(changed)
            guard case .failure(.invalid) = AskConnectorConfig.load(file) else { return XCTFail("\(key)=\(value) was accepted") }
        }
    }
}
