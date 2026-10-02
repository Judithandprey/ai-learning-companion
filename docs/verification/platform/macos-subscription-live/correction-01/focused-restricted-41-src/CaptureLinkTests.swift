import Foundation
import FoundationNetworking
import Glibc
import Foundation
import XCTest

private extension Array {
    /// The element at `index`, or nil: a short array is then a failed assertion, never a trap.
    func at(_ index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - A loopback HTTP/1.1 server (at file scope, so the socket calls are the system's)

final class LoopbackServer: @unchecked Sendable {
    struct Request: Sendable {
        let method: String
        let target: String
        let headers: [(String, String)]
        let body: Data

        func header(_ name: String) -> [String] {
            headers.filter { $0.0.lowercased() == name.lowercased() }.map { $0.1 }
        }
    }

    struct Reply: Sendable {
        var status: Int
        var headers: [(String, String)] = []
        var body = Data()
        var delay: TimeInterval = 0
    }

    /// nil closes the connection without an answer.
    typealias Respond = @Sendable (Request, Int) -> Reply?

    let port: UInt16
    var origin: String { "http://127.0.0.1:\(port)" }
    private let listener: Int32
    private let respond: Respond
    private let lock = NSLock()
    private var received: [Request] = []
    private var stopped = false

    init(respond: @escaping Respond) throws {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw URLError(.cannotConnectToHost) }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let size = socklen_t(MemoryLayout<sockaddr_in>.size)
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(descriptor, $0, size) }
        }
        var length = size
        let named = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &length) }
        }
        guard bound == 0, named == 0, listen(descriptor, 16) == 0 else {
            close(descriptor)
            throw URLError(.cannotConnectToHost)
        }
        listener = descriptor
        port = UInt16(bigEndian: address.sin_port)
        self.respond = respond
        let thread = Thread { [self] in self.serve() }
        thread.start()
    }

    var requests: [Request] { lock.withLock { received } }

    func stop() {
        lock.withLock { stopped = true }
    }

    /// One connection at a time; each is closed after its answer.
    private func serve() {
        while !lock.withLock({ stopped }) {
            var descriptor = pollfd(fd: listener, events: Int16(POLLIN), revents: 0)
            guard poll(&descriptor, 1, 100) > 0 else { continue }
            let client = accept(listener, nil, nil)
            guard client >= 0 else { continue }
            var yes: Int32 = 1
            _ = setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout<Int32>.size))
            handle(client)
            close(client)
        }
        close(listener)
    }

    private func handle(_ client: Int32) {
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 65_536)
        let separator = Data("\r\n\r\n".utf8)
        var headerEnd: Range<Data.Index>?
        while headerEnd == nil {
            let count = read(client, &buffer, buffer.count)
            if count <= 0 { return }
            data.append(buffer, count: count)
            headerEnd = data.range(of: separator)
        }
        guard let end = headerEnd else { return }
        let head = String(decoding: data[data.startIndex..<end.lowerBound], as: UTF8.self)
        var lines = head.components(separatedBy: "\r\n")
        let requestLine = lines.removeFirst().split(separator: " ").map(String.init)
        guard requestLine.count == 3 else { return }
        var headers: [(String, String)] = []
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = String(line[line.startIndex..<colon])
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            headers.append((name, value))
        }
        let length = headers.first { $0.0.lowercased() == "content-length" }.flatMap { Int($0.1) } ?? 0
        var body = Data(data[end.upperBound...])
        while body.count < length {
            let count = read(client, &buffer, buffer.count)
            if count <= 0 { return }
            body.append(buffer, count: count)
        }
        let request = Request(method: requestLine[0], target: requestLine[1], headers: headers, body: body)
        let index: Int = lock.withLock {
            received.append(request)
            return received.count - 1
        }
        guard let reply = respond(request, index) else { return }
        if reply.delay > 0 { Thread.sleep(forTimeInterval: reply.delay) }
        var text = "HTTP/1.1 \(reply.status) Status\r\nContent-Type: application/json\r\n"
        text += "Content-Length: \(reply.body.count)\r\nConnection: close\r\n"
        for (name, value) in reply.headers { text += "\(name): \(value)\r\n" }
        text += "\r\n"
        var output = Data(text.utf8)
        output.append(reply.body)
        output.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            guard let base = raw.baseAddress else { return }
            var offset = 0
            while offset < raw.count {
                let written = write(client, base + offset, raw.count - offset)
                if written <= 0 { return }
                offset += written
            }
        }
    }
}

// MARK: - The released routes, answered by a stand-in

/// Control 0.2.1 streams, the 0.2.4 display source and (through `StandInHost.honest`) the
/// originals and the 0.2.12 batch. Once a stream is not live, its originals are refused 403 and
/// its batches 409 capture_stopped, as the released routes do. A Stop under a key that already
/// committed with the same bytes answers the current state; another revision is 409
/// stale_revision.
final class ServiceStandIn: @unchecked Sendable {
    typealias Stream = (registration: [String: Any], state: String, revision: Int)
    /// `.some(reply)` answers instead of the stand-in (`.some(nil)` drops the connection); nil
    /// lets the stand-in answer.
    typealias Override = @Sendable (LoopbackServer.Request, Int) -> LoopbackServer.Reply??

    let ingress = DesktopCaptureTests.StandInHost()
    let user = "synthetic-user"
    private let lock = NSLock()
    private var streams: [String: Stream] = [:]
    private var sources: [String: String] = [:]
    private var commands: [String: Data] = [:]
    var override: Override?

    func respond(_ request: LoopbackServer.Request, _ index: Int) -> LoopbackServer.Reply? {
        if let override, let decided = override(request, index) { return decided }
        return route(request)
    }

    func setState(_ streamID: String, _ state: String) {
        lock.withLock {
            guard var stream = streams[streamID] else { return }
            stream.state = state
            stream.revision += 1
            streams[streamID] = stream
        }
    }

    func route(_ request: LoopbackServer.Request) -> LoopbackServer.Reply {
        let path = request.target
        let body = ((try? JSONSerialization.jsonObject(with: request.body)) as? [String: Any]) ?? [:]
        if request.method == "POST", path == "/v2/process/streams" {
            let id = (body["stream_id"] as? String) ?? ""
            let stream: Stream = lock.withLock {
                if let existing = streams[id] { return existing }
                let created: Stream = (registration: body, state: "live", revision: 1)
                streams[id] = created
                return created
            }
            return reply(200, stateObject(id, stream))
        }
        if path.hasPrefix("/v2/process/streams/") {
            var id = String(path.dropFirst("/v2/process/streams/".count))
            let command = id.hasSuffix(":control")
            if command { id = String(id.dropLast(":control".count)) }
            guard let current = lock.withLock({ streams[id] }) else { return typed(404, "not_found", "0.2.1") }
            if request.method == "GET" { return reply(200, stateObject(id, current)) }
            let key = id + " " + (request.header("Idempotency-Key").first ?? "")
            if let committed = lock.withLock({ commands[key] }) {
                guard committed == request.body else { return typed(409, "idempotency_conflict", "0.2.1") }
                return reply(200, stateObject(id, current))
            }
            guard (body["expected_revision"] as? Int) == current.revision else { return typed(409, "stale_revision", "0.2.1") }
            guard current.state == "live" else { return typed(409, "invalid_transition", "0.2.1") }
            let stopped: Stream = (registration: current.registration, state: "stopped", revision: current.revision + 1)
            lock.withLock {
                streams[id] = stopped
                commands[key] = request.body
            }
            return reply(200, stateObject(id, stopped))
        }
        if request.method == "PUT", path.hasPrefix("/v2/process/display-sources/") {
            let streamID = (body["stream_id"] as? String) ?? ""
            let sourceID = (body["source_id"] as? String) ?? ""
            guard let stream = lock.withLock({ streams[streamID] }), stream.state == "live" else {
                return typed(403, "forbidden", "0.2.4")
            }
            lock.withLock { sources[sourceID] = streamID }
            var snapshot: [String: Any] = ["contract_version": "0.2.3", "user_id": user, "source_version": 1]
            snapshot["source_id"] = sourceID
            snapshot["type"] = "shared_display"
            snapshot["device_id"] = stream.registration["device_id"]
            snapshot["session_id"] = stream.registration["session_id"]
            snapshot["stream_id"] = streamID
            snapshot["project_id"] = NSNull()
            snapshot["created_at"] = "2026-09-30T21:00:00.123456Z"
            snapshot["source_timezone"] = body["source_timezone"]
            return reply(200, snapshot)
        }
        // The originals and the batch: refused once their stream is not live.
        let streamID: String?
        if request.method == "PUT" {
            let source = (body["source"] as? [String: Any])?["source_id"] as? String
            streamID = lock.withLock { sources[source ?? ""] }
        } else {
            streamID = (body["batch"] as? [String: Any])?["stream_id"] as? String
        }
        if let streamID, let stream = lock.withLock({ streams[streamID] }), stream.state != "live" {
            return request.method == "PUT" ? typed(403, "forbidden", "0.2.4") : typed(409, "capture_stopped", "0.2.12")
        }
        let headers = Dictionary(request.headers, uniquingKeysWith: { first, _ in first })
        let answer = ingress.honest(DesktopCaptureTests.SentRequest(method: request.method, path: path, headers: headers, body: request.body))
        return LoopbackServer.Reply(status: answer.status, body: answer.body ?? Data())
    }

    func stateObject(_ id: String, _ stream: Stream) -> [String: Any] {
        var state: [String: Any] = ["contract_version": "0.2.1", "stream_id": id, "user_id": user]
        state["device_id"] = stream.registration["device_id"]
        state["session_id"] = stream.registration["session_id"]
        state["authorization_generation"] = stream.registration["authorization_generation"]
        state["membership_revision"] = stream.registration["membership_revision"]
        state["continuity"] = stream.registration["continuity"]
        state["revision"] = stream.revision
        state["state"] = stream.state
        state["pre_stop_sequence"] = NSNull()
        return state
    }

    func reply(_ status: Int, _ object: [String: Any]) -> LoopbackServer.Reply {
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data()
        return LoopbackServer.Reply(status: status, body: data)
    }

    func typed(_ status: Int, _ code: String, _ version: String) -> LoopbackServer.Reply {
        reply(status, ["contract_version": version, "error": code, "retryable": false])
    }
}

/// The app-parent link: host configuration and secrets, the host child over a private pipe, and
/// the Start → register → source → store → Stop flow, Stop races, lineage, restart reconciliation,
/// a service withdrawal and the link record, on the synthetic retained session of the Mac
/// retained-frame tests. The host child is a stub shell script standing in for
/// `services.api.desktop_local` (it logs its argv, stdin kind, environment and startup record, and
/// answers READY); the service is `ServiceStandIn`, answering like the released routes on a real
/// loopback HTTP socket, so URLSession's actual headers, redirect refusal and reply bounds are
/// exercised. Neither is the Backend, PostgreSQL or a Mac capture permission. Every identity and
/// secret here is synthetic.
extension DesktopCaptureTests {
    // MARK: - A stub host child

    struct StubHost {
        let config: CaptureHostConfig
        let log: URL

        func lines(_ name: String) -> [String] {
            let text = (try? String(contentsOf: log.appending(path: name), encoding: .utf8)) ?? ""
            return text.split(separator: "\n").map(String.init)
        }

        /// Every startup record the stub received, decoded (synthetic secrets; test only).
        func records() -> [[String: Any]] {
            lines("records").compactMap { line in
                (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any]
            }
        }
    }

    /// `mode`: ready; slow (READY after 2 s); fail (the host's own error record, then exit); silent
    /// (no READY); badready (a READY for another origin); extra (a second line); stubborn (ignores
    /// EOF and SIGTERM); closed (closes its stdin unread, then waits). `startStatus` forces READY's start_status; otherwise it is pending for a
    /// fresh_consent=true record and consumed for a false one.
    func stubHost(_ name: String, origin: String, mode: String = "ready", startStatus: String = "") throws -> StubHost {
        let directory = root.appending(path: name, directoryHint: .isDirectory)
        let services = directory.appending(path: "repo/services/api", directoryHint: .isDirectory)
        let log = directory.appending(path: "log", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: services, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: log, withIntermediateDirectories: true)
        try Data().write(to: services.appending(path: "desktop_local.py"))
        let dsn = directory.appending(path: "dsn")
        try Data("dbname=synthetic_test_only host=/nonexistent-synthetic\n".utf8).write(to: dsn)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dsn.path(percentEncoded: false))
        let ready = "{\"format\":\"lc-desktop-capture-host-ready-v1\",\"status\":\"ready\",\"origin\":\"\(origin)\",\"start_status\":\"%s\"}"
        let script = """
        #!/bin/sh
        log='\(log.path(percentEncoded: false))'
        printf '%s\\n' "$#" "$@" >> "$log/argv"
        echo $$ >> "$log/pids"
        if [ -p /dev/stdin ]; then echo fifo >> "$log/stdin"; else echo other >> "$log/stdin"; fi
        env | sort > "$log/env"
        if [ '\(mode)' = closed ]; then exec 0<&-; sleep 5; exit 0; fi
        IFS= read -r record || exit 4
        printf '%s\\n' "$record" >> "$log/records"
        status='\(startStatus)'
        if [ -z "$status" ]; then
          case "$record" in *'"fresh_consent":true'*) status=pending ;; *) status=consumed ;; esac
        fi
        case '\(mode)' in
          ready) printf '\(ready)\\n' "$status" ;;
          slow) sleep 2; printf '\(ready)\\n' "$status" ;;
          fail) printf '%s\\n' '{"format":"lc-desktop-capture-host-error-v1","error":"unavailable"}' >&2; exit 1 ;;
          silent) ;;
          badready) printf '%s\\n' '{"format":"lc-desktop-capture-host-ready-v1","status":"ready","origin":"http://localhost:1","start_status":"pending"}' ;;
          extra) printf '\(ready)\\nmore\\n' "$status" ;;
          stubborn) trap 'echo term >> "$log/ends"' TERM; printf '\(ready)\\n' "$status"; while :; do sleep 1; done ;;
        esac
        # EOF is awaited by the shell itself: no other process holds the pipe.
        while IFS= read -r line; do :; done
        echo eof >> "$log/ends"

        """
        let python = directory.appending(path: "python")
        try Data(script.utf8).write(to: python)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: python.path(percentEncoded: false))
        let config = CaptureHostConfig(python: python, repository: directory.appending(path: "repo", directoryHint: .isDirectory),
                                       dsnFile: dsn, userID: "synthetic-user", deviceID: "synthetic-mac-device",
                                       sessionID: "synthetic-learning-session", producerID: "synthetic-mac-producer")
        return StubHost(config: config, log: log)
    }

    /// Polls `condition` until it holds or `seconds` pass.
    func until(_ seconds: Double, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return await condition()
    }

    final class Toggle: @unchecked Sendable {
        private let lock = NSLock()
        private var value = false
        var isOn: Bool {
            get { lock.withLock { value } }
            set { lock.withLock { value = newValue } }
        }
    }

    final class EndLog: @unchecked Sendable {
        private let lock = NSLock()
        private var reasons: [String] = []
        func add(_ reason: String) { lock.withLock { reasons.append(reason) } }
        var all: [String] { lock.withLock { reasons } }
    }

    func linkStreams(_ directory: URL) throws -> [[String: Any]] {
        let data = try Data(contentsOf: directory.appending(path: "journal.json"))
        let journal = try decodedObject(data)
        return try XCTUnwrap(journal["streams"] as? [[String: Any]])
    }

    func linkStreamID(_ directory: URL) throws -> String {
        let registration = try XCTUnwrap(try linkStreams(directory).last?["registration"] as? [String: Any])
        return try XCTUnwrap(registration["streamID"] as? String)
    }

    func linkSourceID(_ directory: URL) throws -> String {
        try XCTUnwrap(try linkStreams(directory).last?["sourceID"] as? String)
    }

    func stubLink(_ stub: StubHost, _ directory: URL, stopWait: TimeInterval = 1, framesPerBatch: Int = 20) -> CaptureLink {
        CaptureLink(config: .success(stub.config), directory: directory,
                    launcher: ProcessHostLauncher(readyTimeout: 10, endGrace: 3), stopWait: stopWait,
                    framesPerBatch: framesPerBatch)
    }

    /// Every status the link published, in order.
    final class StatusLog: @unchecked Sendable {
        private let lock = NSLock()
        private var statuses: [CaptureLinkStatus] = []
        func add(_ status: CaptureLinkStatus) { lock.withLock { statuses.append(status) } }
        var all: [CaptureLinkStatus] { lock.withLock { statuses } }
    }

    /// Keeps a stand-in answer back until the test lets it go (bounded, so a failed test ends).
    final class Hold: @unchecked Sendable {
        private let semaphore = DispatchSemaphore(value: 0)
        func wait() { _ = semaphore.wait(timeout: .now() + 30) }
        func release() { semaphore.signal() }
    }

    /// The counts a status shows, in the order of its counts line.
    func shown(_ status: CaptureLinkStatus) -> [Int] {
        [status.stored, status.awaiting, status.unknown, status.refused, status.notSent]
    }

    // MARK: - Configuration and secrets

    func testCaptureHostConfigurationAndStartupRecordKeepSecretsPrivate() throws {
        let directory = root.appending(path: "config", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appending(path: "capture-host.json")
        XCTAssertEqual(CaptureHostConfig.load(file), .failure(.notConfigured), "no file: not set up, never a fixture")
        let stub = try stubHost("config-stub", origin: "http://127.0.0.1:9")
        func write(_ object: [String: Any]) throws {
            try JSONSerialization.data(withJSONObject: object).write(to: file)
        }
        var object: [String: Any] = ["format": "lc-macos-dev-capture-host/v1", "user_id": "synthetic-user"]
        object["python"] = stub.config.python.path(percentEncoded: false)
        object["repository"] = stub.config.repository.path(percentEncoded: false)
        object["dsn_file"] = stub.config.dsnFile.path(percentEncoded: false)
        object["device_id"] = "synthetic-mac-device"
        object["session_id"] = "synthetic-learning-session"
        object["producer_id"] = "synthetic-mac-producer"
        try write(object)
        XCTAssertEqual(CaptureHostConfig.load(file), .success(stub.config))
        let changes: [(String, String)] = [("format", "other"), ("python", "relative/python"), ("user_id", "not an id"),
                                           ("repository", "/nonexistent-synthetic"), ("python", "/etc/hosts")]
        for (key, value) in changes {
            var changed = object
            changed[key] = value
            try write(changed)
            guard case .failure(.invalid) = CaptureHostConfig.load(file) else { return XCTFail("\(key)=\(value) was accepted") }
        }
        object["extra"] = true
        try write(object)
        guard case .failure(.invalid) = CaptureHostConfig.load(file) else { return XCTFail("an extra member was accepted") }

        // The connection string: owner-only, one line, never through a link.
        XCTAssertEqual(stub.config.readDSN(), .success("dbname=synthetic_test_only host=/nonexistent-synthetic"))
        let dsnPath = stub.config.dsnFile.path(percentEncoded: false)
        try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: dsnPath)
        guard case .failure = stub.config.readDSN() else { return XCTFail("a group-readable dsn_file was accepted") }
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dsnPath)
        let linked = directory.appending(path: "dsn-link")
        try FileManager.default.createSymbolicLink(at: linked, withDestinationURL: stub.config.dsnFile)
        let viaLink = CaptureHostConfig(python: stub.config.python, repository: stub.config.repository, dsnFile: linked,
                                        userID: "synthetic-user", deviceID: "d", sessionID: "s", producerID: "p")
        guard case .failure = viaLink.readDSN() else { return XCTFail("a linked dsn_file was accepted") }

        // The startup record: exactly the host's 18 keys on one line; the secrets are only here.
        let registration = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                              streamID: "stream-synthetic", previousStreamID: nil)
        let token = CaptureLink.randomHex(32)
        XCTAssertEqual(token.count, 64)
        XCTAssertNotEqual(token, CaptureLink.randomHex(32))
        let record = try XCTUnwrap(CaptureLink.startupRecord(dsn: "dbname=x", userID: "synthetic-user", producerID: "synthetic-mac-producer",
                                                              registration: registration, token: token,
                                                              expires: Date(timeIntervalSince1970: 1_790_100_000), fresh: true))
        XCTAssertEqual(record.last, 0x0A)
        XCTAssertEqual(record.filter { $0 == 0x0A }.count, 1)
        let parsed = try decodedObject(Data(record.dropLast()))
        let keys: Set<String> = ["format", "port", "database_dsn", "user_id", "device_id", "session_id", "producer_id",
                                 "registration", "token", "expires_at", "scopes", "capabilities", "fresh_consent",
                                 "producer_profile", "enable_raw_ingress", "enable_desktop_ingress", "enable_windows_ingress",
                                 "enable_macos_ingress"]
        XCTAssertEqual(Set(parsed.keys), keys)
        XCTAssertEqual(parsed["expires_at"] as? String, "2026-09-22T18:00:00Z")
        XCTAssertEqual(parsed["port"] as? Int, 0)
        XCTAssertEqual(parsed["token"] as? String, token)
        XCTAssertEqual(parsed["fresh_consent"] as? Bool, true)
        XCTAssertEqual(parsed["enable_macos_ingress"] as? Bool, true)
        XCTAssertEqual(parsed["enable_windows_ingress"] as? Bool, false)
        let continuity = (parsed["registration"] as? [String: Any])?["continuity"] as? [String: String]
        XCTAssertEqual(continuity, ["kind": "initial"])

        // The child's environment keeps nothing the interpreter or libpq would act on.
        let parent: [String: String] = ["PATH": "/usr/bin", "PGPASSWORD": "x", "PGHOST": "x", "PYTHONPATH": "x",
                                        "LC_DATABASE_URL": "x", "HOME": "/tmp"]
        XCTAssertEqual(HostProcess.childEnvironment(parent), ["PATH": "/usr/bin", "HOME": "/tmp", "PYTHONDONTWRITEBYTECODE": "1"])
    }

    // MARK: - The host child

    func testHostChildGetsOnlyAPrivatePipeAndEndsOnEOF() async throws {
        let registration = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                              streamID: "stream-synthetic-host", previousStreamID: nil)
        let token = CaptureLink.randomHex(32)
        func record(_ stub: StubHost) throws -> Data {
            try XCTUnwrap(CaptureLink.startupRecord(dsn: "dbname=synthetic", userID: stub.config.userID,
                                                    producerID: stub.config.producerID, registration: registration, token: token,
                                                    expires: Date(timeIntervalSinceNow: 600), fresh: true))
        }
        let origin = "http://127.0.0.1:48125"
        let stub = try stubHost("host-ready", origin: origin)
        let sent = try record(stub)
        let launched = await ProcessHostLauncher(readyTimeout: 5, endGrace: 3).launch(stub.config, record: sent)
        guard case .success(let (host, ready)) = launched else { return XCTFail("the stub host was not ready") }
        XCTAssertEqual(ready, HostReady(origin: origin, startStatus: "pending"))
        XCTAssertEqual(stub.lines("argv"), ["2", "-m", "services.api.desktop_local"], "exactly the module in argv")
        XCTAssertEqual(stub.lines("stdin"), ["fifo"], "the startup record comes through a pipe")
        XCTAssertEqual(stub.lines("records"), [String(decoding: sent.dropLast(), as: UTF8.self)])
        let environment = stub.lines("env").joined(separator: "\n")
        XCTAssertFalse(environment.contains(token), "the bearer is not in the environment")
        XCTAssertFalse(environment.contains("dbname=synthetic"), "the connection string is not in the environment")
        XCTAssertTrue(stub.lines("env").contains("PYTHONDONTWRITEBYTECODE=1"))
        XCTAssertFalse(host.hasExited, "stdin stays open for the child's life")
        let endedBySelf = await host.end()
        XCTAssertTrue(endedBySelf, "EOF ends the child")
        XCTAssertEqual(stub.lines("ends"), ["eof"])

        // No READY in its exact form: not believed, the child is ended, and the failure says whether
        // the record was delivered (so a grant may exist).
        let modes: [(String, String?)] = [("fail", "unavailable"), ("silent", nil), ("badready", nil), ("extra", nil)]
        for (mode, expectedCode) in modes {
            let other = try stubHost("host-" + mode, origin: origin, mode: mode)
            let result = await ProcessHostLauncher(readyTimeout: 2, endGrace: 2).launch(other.config, record: try record(other))
            guard case .failure(let failure) = result else {
                XCTFail("\(mode) was believed")
                continue
            }
            XCTAssertEqual(failure.code, expectedCode, mode)
            XCTAssertTrue(failure.delivered, mode)
        }

        // A known failed spawn is not delivered; nor is a record the child stopped reading (it gets
        // EPIPE, never a signal, and the write never blocks past its bound).
        let missing = CaptureHostConfig(python: stub.config.repository.appending(path: "no-such-python"),
                                        repository: stub.config.repository, dsnFile: stub.config.dsnFile,
                                        userID: "synthetic-user", deviceID: "d", sessionID: "s", producerID: "p")
        guard case .failure(let unspawned) = await ProcessHostLauncher(readyTimeout: 2).launch(missing, record: sent) else {
            return XCTFail("a missing interpreter was started")
        }
        XCTAssertEqual(unspawned.reason, "the capture host could not be started")
        XCTAssertFalse(unspawned.delivered)
        let closed = try stubHost("host-closed", origin: origin, mode: "closed")
        var large = Data(repeating: 0x20, count: 300_000)
        large.append(0x0A)
        let started = Date()
        let refused = await ProcessHostLauncher(readyTimeout: 2, endGrace: 0.5).launch(closed.config, record: large)
        guard case .failure(let undelivered) = refused else { return XCTFail("a closed stdin took the record") }
        XCTAssertEqual(undelivered.reason, "the startup record could not be delivered")
        XCTAssertFalse(undelivered.delivered)
        XCTAssertLessThan(Date().timeIntervalSince(started), 8, "bounded, and the child was ended")
        XCTAssertEqual(closed.lines("records"), [])

        // A child that ignores EOF and SIGTERM is killed; only it.
        let stubborn = try stubHost("host-stubborn", origin: origin, mode: "stubborn")
        let held = await ProcessHostLauncher(readyTimeout: 5, endGrace: 0.5).launch(stubborn.config, record: try record(stubborn))
        guard case .success(let (child, _)) = held else { return XCTFail("the stubborn stub was not ready") }
        let exitedBySelf = await child.end()
        XCTAssertFalse(exitedBySelf, "it did not exit by itself")
        let exited = await until(3) { child.hasExited }
        XCTAssertTrue(exited)
        XCTAssertTrue(stubborn.lines("ends").contains("term"), "SIGTERM came before SIGKILL")
    }

    // MARK: - Start, store, Stop

    func testLinkStoresRetainedFramesAndStopsTheStream() async throws {
        let service = ServiceStandIn()
        let linkDirectory = root.appending(path: "flow-link", directoryHint: .isDirectory)
        let checked = EndLog()
        // Every batch's exact bytes and key are journaled before it is sent.
        service.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            let key = request.header("Idempotency-Key").first ?? ""
            let data = (try? Data(contentsOf: linkDirectory.appending(path: "journal.json"))) ?? Data()
            let journal = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
            let streams = (journal["streams"] as? [[String: Any]]) ?? []
            let jobs = streams.flatMap { ($0["jobs"] as? [[String: Any]]) ?? [] }
            let file = jobs.first { ($0["key"] as? String) == key }?["file"] as? String
            let body = file.flatMap { try? Data(contentsOf: linkDirectory.appending(path: $0)) }
            checked.add(body == request.body ? "journaled" : "not journaled")
            return nil
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("flow-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "flow-session", directoryHint: .isDirectory))
        let link = stubLink(stub, linkDirectory, stopWait: 2)
        let ended = EndLog()
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { ended.add($0) }
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        let storing = await link.currentStatus()
        XCTAssertTrue(stored, "\(storing)")
        XCTAssertEqual(storing.state, .storing)
        XCTAssertEqual(checked.all, ["journaled"])

        // One registration for this Start, the state read, the display source, then the uploads.
        let stream = try linkStreamID(linkDirectory)
        let source = try linkSourceID(linkDirectory)
        let requests = server.requests
        let opening = requests.prefix(3).map { "\($0.method) \($0.target)" }
        XCTAssertEqual(opening, ["POST /v2/process/streams", "GET /v2/process/streams/" + stream,
                                 "PUT /v2/process/display-sources/" + source])
        let registering = try XCTUnwrap(requests.first)
        let registration = try decodedObject(registering.body)
        XCTAssertEqual(registration["continuity"] as? [String: String], ["kind": "initial"])
        XCTAssertEqual(registering.header("Idempotency-Key"), [stream + ".register"])
        let record = try XCTUnwrap(stub.records().first)
        XCTAssertEqual(stub.records().count, 1)
        XCTAssertEqual(record["fresh_consent"] as? Bool, true, "the user's Start is the fresh consent")
        let token = try XCTUnwrap(record["token"] as? String)
        for request in requests {
            XCTAssertEqual(request.header("Host"), ["127.0.0.1:\(server.port)"], "on the socket")
            XCTAssertEqual(request.header("Authorization"), ["Bearer " + token])
            XCTAssertEqual(request.header("Origin"), [])
            XCTAssertEqual(request.header("Cookie"), [])
        }
        XCTAssertTrue(requests.contains { $0.target.hasPrefix("/v2/process/originals/") })
        XCTAssertEqual(requests.filter { $0.target == "/v2/process/macos-frames:batch" }.count, 1)

        // Stop: the gate first, then the journaled Stop, the state read back, and EOF to the child.
        gate.close("user_stop")
        await link.stop()
        let final = await link.currentStatus()
        XCTAssertEqual(final.state, .stopped)
        XCTAssertEqual([final.stored, final.notSent, final.unknown, final.refused], [7, 1, 0, 0], "frame 8 has no outcome yet")
        XCTAssertEqual(final.detail, "the stream is stopped")
        let closing = server.requests.suffix(2).map { "\($0.method) \($0.target)" }
        XCTAssertEqual(closing, ["POST /v2/process/streams/\(stream):control", "GET /v2/process/streams/\(stream)"])
        let stop = try XCTUnwrap(server.requests.first { $0.target.hasSuffix(":control") })
        XCTAssertEqual(stop.header("Idempotency-Key"), [stream + ".stop.1"])
        let journaled = try XCTUnwrap(try linkStreams(linkDirectory).first)
        XCTAssertEqual(journaled["final"] as? String, "stopped")
        let stops = try XCTUnwrap(journaled["stops"] as? [[String: Any]])
        XCTAssertEqual(stops.first?["body"] as? String, String(decoding: stop.body, as: UTF8.self))
        XCTAssertEqual(stub.lines("ends"), ["eof"], "the child got EOF")
        XCTAssertEqual(ended.all, [])

        // The journal: owner-only, and without the bearer or the connection string.
        let journalPath = linkDirectory.appending(path: "journal.json").path(percentEncoded: false)
        let text = try String(contentsOfFile: journalPath, encoding: .utf8)
        XCTAssertFalse(text.contains(token))
        XCTAssertFalse(text.contains("dbname="))
        let mode = try FileManager.default.attributesOfItem(atPath: journalPath)[.posixPermissions] as? Int
        XCTAssertEqual(mode, 0o600)
        // Everything retained is still intact.
        XCTAssertNoThrow(try RetainedSession.read(session))
    }

    // MARK: - Stop races and lost answers

    func testStopRacesKeepDoubtAndNeverRegisterAfterStop() async throws {
        let session = try writeMacSession(root: root.appending(path: "race-session", directoryHint: .isDirectory))

        // Stop while the child is still starting: nothing is registered, and the pending grant is
        // abandoned.
        let quiet = ServiceStandIn()
        let quietServer = try LoopbackServer { quiet.respond($0, $1) }
        defer { quietServer.stop() }
        let slow = try stubHost("race-slow", origin: quietServer.origin, mode: "slow")
        let slowDirectory = root.appending(path: "race-slow-link", directoryHint: .isDirectory)
        let early = stubLink(slow, slowDirectory)
        let earlyGate = LiveGate()
        await early.begin(gate: earlyGate, session: session) { _ in }
        let asked = await until(5) { !slow.lines("records").isEmpty }
        XCTAssertTrue(asked)
        earlyGate.close("user_stop")
        await early.stop()
        XCTAssertEqual(quietServer.requests.count, 0, "no registration after Stop")
        let earlyStream = try XCTUnwrap(try linkStreams(slowDirectory).first)
        XCTAssertEqual(earlyStream["final"] as? String, "abandoned")
        XCTAssertEqual(earlyStream["registrationSent"] as? Bool, false)
        XCTAssertEqual(slow.lines("ends"), ["eof"])

        // The registration commits but its answer is lost: not known, then settled by a read at
        // Stop, and Stopped. Nothing is uploaded meanwhile.
        let lossy = ServiceStandIn()
        lossy.override = { request, _ in
            guard request.method == "POST", request.target == "/v2/process/streams" else { return nil }
            _ = lossy.route(request)
            return .some(nil)
        }
        let lossyServer = try LoopbackServer { lossy.respond($0, $1) }
        defer { lossyServer.stop() }
        let lost = try stubHost("race-lost", origin: lossyServer.origin)
        let lostDirectory = root.appending(path: "race-lost-link", directoryHint: .isDirectory)
        let lostLink = stubLink(lost, lostDirectory)
        let lostGate = LiveGate()
        await lostLink.begin(gate: lostGate, session: session) { _ in }
        let notConnected = await until(30) { await lostLink.currentStatus().state == .notConnected }
        let doubt = await lostLink.currentStatus()
        XCTAssertTrue(notConnected, "\(doubt)")
        lostGate.close("user_stop")
        await lostLink.stop()
        let lostStream = try XCTUnwrap(try linkStreams(lostDirectory).first)
        XCTAssertEqual(lostStream["final"] as? String, "stopped")
        XCTAssertEqual(lostStream["registered"] as? Bool, true)
        let lostID = try linkStreamID(lostDirectory)
        XCTAssertTrue(lossyServer.requests.contains { $0.target == "/v2/process/streams/\(lostID):control" })
        XCTAssertFalse(lossyServer.requests.contains { $0.target.hasPrefix("/v2/process/originals/") }, "nothing sent unconfirmed")

        // A batch still in flight at Stop: cancelled after the bound, and in doubt, never refused.
        let delaying = ServiceStandIn()
        delaying.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            var reply = delaying.route(request)
            reply.delay = 4
            return reply
        }
        let batchServer = try LoopbackServer { delaying.respond($0, $1) }
        defer { batchServer.stop() }
        let busy = try stubHost("race-batch", origin: batchServer.origin)
        let busyDirectory = root.appending(path: "race-batch-link", directoryHint: .isDirectory)
        let busyLink = stubLink(busy, busyDirectory)
        let busyGate = LiveGate()
        await busyLink.begin(gate: busyGate, session: session) { _ in }
        let sending = await until(20) { batchServer.requests.contains { $0.target == "/v2/process/macos-frames:batch" } }
        XCTAssertTrue(sending)
        busyGate.close("user_stop")
        await busyLink.stop()
        let busyStream = try XCTUnwrap(try linkStreams(busyDirectory).first)
        let jobs = try XCTUnwrap(busyStream["jobs"] as? [[String: Any]])
        XCTAssertEqual(jobs.count, 1)
        XCTAssertEqual(jobs.first?["status"] as? String, "unknown", "\(jobs)")
        XCTAssertEqual(jobs.first?["inDoubt"] as? String, "batch")
        XCTAssertEqual(busyStream["final"] as? String, "stopped")
        let busyStatus = await busyLink.currentStatus()
        XCTAssertEqual([busyStatus.stored, busyStatus.unknown, busyStatus.refused], [0, 7, 0])
    }

    // MARK: - Restart

    func testRestartReconcilesWithoutReplayOrRestart() async throws {
        let service = ServiceStandIn()
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("restart-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "restart-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "restart-link", directoryHint: .isDirectory)
        let first = stubLink(stub, directory)
        let gate = LiveGate()
        await first.begin(gate: gate, session: session) { _ in }
        let stored = await until(20) { await first.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        let stream = try linkStreamID(directory)
        let before = server.requests.count

        // As after a crash: a new run finds the stream unsettled, reads it and Stops it. Nothing is
        // resent, no registration or source is sent, and no capture starts.
        let second = stubLink(stub, directory)
        await second.reconcile()
        let after = server.requests.dropFirst(before).map { "\($0.method) \($0.target)" }
        XCTAssertEqual(after, ["GET /v2/process/streams/\(stream)", "POST /v2/process/streams/\(stream):control",
                               "GET /v2/process/streams/\(stream)"])
        XCTAssertEqual(stub.records().count, 2)
        XCTAssertEqual(stub.records().last?["fresh_consent"] as? Bool, false, "reconciliation never asks for consent")
        XCTAssertEqual(try linkStreams(directory).first?["final"] as? String, "stopped")
        let reconciled = await second.currentStatus()
        XCTAssertEqual(reconciled.state, .idle)
        XCTAssertEqual(reconciled.earlierUnknown, 0)
        let again = server.requests.count
        await second.reconcile()
        XCTAssertEqual(server.requests.count, again, "reconciliation runs once")

        // Registrations that never committed are abandoned, never sent: one never POSTed (no child
        // is started for it), and one whose grant is still pending on reopen.
        let pendingStub = try stubHost("restart-pending", origin: server.origin, startStatus: "pending")
        let pendingDirectory = root.appending(path: "restart-pending-link", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: pendingDirectory, withIntermediateDirectories: true)
        func unsettledStream(_ id: String, sent: Bool) -> LinkStream {
            let registration = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                                  streamID: id, previousStreamID: nil)
            return LinkStream(userID: "synthetic-user", producerID: "synthetic-mac-producer", registration: registration,
                              registrationKey: id + ".register", sourceID: "src-" + id, sourceTimezone: "UTC",
                              captureSession: "synthetic", grant: "requested_unknown", delivered: true, registrationSent: sent)
        }
        var unsettled = LinkJournal()
        unsettled.streams = [unsettledStream("stream-never-posted", sent: false), unsettledStream("stream-never-committed", sent: true)]
        try JSONEncoder().encode(unsettled).write(to: pendingDirectory.appending(path: "journal.json"))
        let requestsBefore = server.requests.count
        let third = stubLink(pendingStub, pendingDirectory)
        await third.reconcile()
        XCTAssertEqual(server.requests.count, requestsBefore, "nothing is registered at a restart")
        XCTAssertEqual(pendingStub.records().count, 1, "no child for a registration that was never sent")
        XCTAssertEqual(pendingStub.records().first?["fresh_consent"] as? Bool, false)
        let settled = try linkStreams(pendingDirectory).map { $0["final"] as? String }
        XCTAssertEqual(settled, ["abandoned", "abandoned"])

        gate.close("app_quit")
        await first.stop()
    }

    // MARK: - Service withdrawal

    func testServiceWithdrawalEndsLocalCapture() async throws {
        let service = ServiceStandIn()
        // The service withdraws the stream as its first batch arrives.
        service.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            let batch = ((try? JSONSerialization.jsonObject(with: request.body)) as? [String: Any])?["batch"] as? [String: Any]
            service.setState((batch?["stream_id"] as? String) ?? "", "withdrawn")
            return service.route(request)
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("withdraw-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "withdraw-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "withdraw-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        let gate = LiveGate()
        let ended = EndLog()
        // As the app does: the capture gate closes, then the link's Stop runs.
        await link.begin(gate: gate, session: session) { reason in
            ended.add(reason)
            gate.close(reason)
            Task { await link.stop() }
        }
        let endedLocally = await until(20) { ended.all == ["server_withdrawn"] }
        XCTAssertTrue(endedLocally, "\(ended.all)")
        XCTAssertFalse(gate.isOpen)
        await link.stop()
        let status = await link.currentStatus()
        XCTAssertEqual(status.state, .endedByService)
        XCTAssertEqual(status.detail, "the stream is withdrawn")
        let journaled = try XCTUnwrap(try linkStreams(directory).first)
        XCTAssertEqual(journaled["final"] as? String, "withdrawn")
        let jobs = try XCTUnwrap(journaled["jobs"] as? [[String: Any]])
        XCTAssertEqual(jobs.first?["code"] as? String, "capture_stopped")
        XCTAssertFalse(server.requests.contains { $0.target.hasSuffix(":control") }, "a withdrawn stream gets no Stop")
        XCTAssertEqual(stub.lines("ends"), ["eof"])
    }

    // MARK: - The link record

    func testDamagedLinkRecordIsKeptAndNeverUsed() async throws {
        let service = ServiceStandIn()
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let session = try writeMacSession(root: root.appending(path: "record-session", directoryHint: .isDirectory))
        let stream: [String: Any] = [
            "userID": "synthetic-user", "producerID": "synthetic-mac-producer",
            "registration": ["deviceID": "synthetic-mac-device", "sessionID": "synthetic-learning-session",
                             "streamID": "stream-damaged", "authorizationGeneration": 1, "membershipRevision": 1],
            "registrationKey": "stream-damaged.register", "sourceID": "src-damaged", "sourceTimezone": "UTC",
            "captureSession": "synthetic", "grant": "consumed", "delivered": true, "registrationSent": true, "registered": true,
            "nextSequence": 1, "batches": 0, "planned": [Int](), "jobs": [Any](), "stops": [Any](), "notes": [String](),
        ]
        func journalData(_ change: (inout [String: Any]) -> Void) throws -> Data {
            var changed = stream
            change(&changed)
            let journal: [String: Any] = ["format": "lc-macos-capture-link/v1", "streams": [changed]]
            return try JSONSerialization.data(withJSONObject: journal)
        }
        // A missing `final` is a legitimate unsettled stream: it is reconciled.
        let legitimate = try stubHost("record-legitimate", origin: server.origin)
        let legitimateDirectory = root.appending(path: "record-legitimate-link", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: legitimateDirectory, withIntermediateDirectories: true)
        try journalData { _ in }.write(to: legitimateDirectory.appending(path: "journal.json"))
        await stubLink(legitimate, legitimateDirectory).reconcile()
        XCTAssertEqual(legitimate.records().count, 1, "reconciled with a fresh_consent=false host")
        XCTAssertEqual(server.requests.map { "\($0.method) \($0.target)" }, ["GET /v2/process/streams/stream-damaged"])

        // Damaged records: kept byte for byte, no host, no grant, no Stop, and no new Start linked.
        let damages: [(String, (inout [String: Any]) -> Void)] = [
            ("null job", { $0["jobs"] = [NSNull()] }),
            ("path stream", {
                $0["registration"] = ["deviceID": "synthetic-mac-device", "sessionID": "synthetic-learning-session",
                                      "streamID": "../stream", "authorizationGeneration": 1, "membershipRevision": 1]
                $0["registrationKey"] = "../stream.register"
            }),
            ("path source", { $0["sourceID"] = "../src" }),
            ("no producer", { $0["producerID"] = nil }),
            ("foreign stop", { $0["stops"] = [["key": "stream-other.stop.1", "body": "{}", "outcome": "unknown"]] }),
            ("unknown grant", { $0["grant"] = "granted" }),
            ("unknown final", { $0["final"] = "gone" }),
            ("other key", { $0["registrationKey"] = "other.register" }),
        ]
        for (name, damage) in damages {
            let stub = try stubHost("record-" + name.replacingOccurrences(of: " ", with: "-"), origin: server.origin)
            let directory = root.appending(path: "record-link-" + name.replacingOccurrences(of: " ", with: "-"),
                                           directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let bytes = try journalData(damage)
            try bytes.write(to: directory.appending(path: "journal.json"))
            let before = server.requests.count
            let link = stubLink(stub, directory)
            let loaded = await link.currentStatus()
            XCTAssertEqual(loaded.state, .unavailable, name)
            await link.reconcile()
            let gate = LiveGate()
            await link.begin(gate: gate, session: session) { _ in }
            try await Task.sleep(nanoseconds: 300_000_000)
            let after = await link.currentStatus()
            XCTAssertEqual(after.state, .notConnected, name)
            XCTAssertEqual([after.stored, after.unknown, after.refused], [0, 0, 0], name)
            XCTAssertEqual(stub.records().count, 0, "no host for \(name)")
            XCTAssertEqual(server.requests.count, before, name)
            XCTAssertEqual(try Data(contentsOf: directory.appending(path: "journal.json")), bytes, "kept as it was: \(name)")
            gate.close("user_stop")
            await link.stop()
        }
    }

    func testRecordWritesAreCompleteBeforeTheyReplace() throws {
        let directory = root.appending(path: "complete-writes", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appending(path: "journal.json")
        let old = Data("{\"old\":true}".utf8)
        try old.write(to: file)
        let new = Data(repeating: 0x61, count: 1113)
        // A short write followed by no progress, and a failing write: nothing is replaced or left.
        let short: (Int32, UnsafeRawPointer, Int) -> Int = { descriptor, bytes, count in
            count > 1090 ? CaptureLink.systemWrite(descriptor, bytes, 23) : 0
        }
        XCTAssertFalse(CaptureLink.writeComplete(new, to: file, write: short))
        let failing: (Int32, UnsafeRawPointer, Int) -> Int = { _, _, _ in
            errno = EIO
            return -1
        }
        XCTAssertFalse(CaptureLink.writeComplete(new, to: file, write: failing))
        XCTAssertEqual(try Data(contentsOf: file), old)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path(percentEncoded: false)), ["journal.json"])
        XCTAssertTrue(CaptureLink.writeComplete(new, to: file))
        XCTAssertEqual(try Data(contentsOf: file), new)
        let mode = try FileManager.default.attributesOfItem(atPath: file.path(percentEncoded: false))[.posixPermissions] as? Int
        XCTAssertEqual(mode, 0o600)
    }

    func testUnwritableRecordSendsNoStopAndKeepsOutcomes() async throws {
        let service = ServiceStandIn()
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("unwritable-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "unwritable-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "unwritable-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        let stream = try linkStreamID(directory)
        let witness = try Data(contentsOf: directory.appending(path: "journal.json"))
        // The record can no longer be written: the Stop is not sent unwritten, and what was
        // stored stays shown.
        let path = directory.path(percentEncoded: false)
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: path)
        gate.close("user_stop")
        await link.stop()
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: path)
        let status = await link.currentStatus()
        XCTAssertEqual(status.state, .stopped)
        XCTAssertEqual([status.stored, status.notSent, status.unknown], [7, 1, 0])
        XCTAssertEqual(status.detail, "the capture link record could not be written; nothing more is sent; "
                       + "the server Stop is not confirmed")
        XCTAssertFalse(server.requests.contains { $0.target.hasSuffix(":control") }, "no Stop without a written witness")
        XCTAssertEqual(try Data(contentsOf: directory.appending(path: "journal.json")), witness)
        XCTAssertEqual(stub.lines("ends"), ["eof"])
        // The next launch reads the old record and sends the Stop.
        let next = stubLink(stub, directory)
        await next.reconcile()
        XCTAssertTrue(server.requests.contains { $0.target == "/v2/process/streams/\(stream):control" })
        XCTAssertEqual(try linkStreams(directory).first?["final"] as? String, "stopped")
    }

    // MARK: - Lineage, registration after Stop, failed spawn

    func testNewStreamsNameTheSettledPredecessor() async throws {
        let service = ServiceStandIn()
        let dropping = Toggle()
        // While dropping, every request takes effect but its answer is lost.
        service.override = { request, _ in
            guard dropping.isOn else { return nil }
            _ = service.route(request)
            return .some(nil)
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("lineage-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "lineage-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "lineage-link", directoryHint: .isDirectory)
        func capture(_ link: CaptureLink, until state: CaptureLinkStatus.State) async -> Bool {
            let gate = LiveGate()
            await link.begin(gate: gate, session: session) { _ in }
            let reached = await until(30) { await link.currentStatus().state == state }
            gate.close("user_stop")
            await link.stop()
            return reached
        }
        func registrations() -> [LoopbackServer.Request] {
            server.requests.filter { $0.method == "POST" && $0.target == "/v2/process/streams" }
        }
        // S1 is registered and Stopped.
        let link = stubLink(stub, directory)
        let first = await capture(link, until: .storing)
        XCTAssertTrue(first)
        // S2's registration commits, but no answer arrives, not even at Stop: it is not settled.
        dropping.isOn = true
        let second = await capture(link, until: .notConnected)
        XCTAssertTrue(second)
        var streams = try linkStreams(directory)
        XCTAssertEqual(streams.count, 2)
        XCTAssertNil(streams.at(1)?["final"] as? String)
        XCTAssertEqual(streams.at(1)?["registrationSent"] as? Bool, true)
        let s1 = try XCTUnwrap((streams.at(0)?["registration"] as? [String: Any])?["streamID"] as? String)
        let s2 = try XCTUnwrap((streams.at(1)?["registration"] as? [String: Any])?["streamID"] as? String)
        let posted = try decodedObject(try XCTUnwrap(registrations().last).body)
        XCTAssertEqual(posted["continuity"] as? [String: String], ["kind": "restart", "previous_stream_id": s1, "gap": "unknown"])
        // While S2 cannot be settled, a new Start registers nothing: its predecessor is not closed.
        let posts = registrations().count
        let third = await capture(link, until: .notConnected)
        XCTAssertTrue(third)
        let refusedStart = await link.currentStatus()
        XCTAssertEqual(refusedStart.detail, "an earlier stream of this capture could not be settled, so no new stream is "
                       + "registered; frames stay on this Mac")
        XCTAssertEqual(try linkStreams(directory).count, 2, "nothing journaled for it")
        XCTAssertEqual(registrations().count, posts)
        // A restart settles S2 (READY consumed shows it registered), and the next Start names S2.
        dropping.isOn = false
        let restarted = stubLink(stub, directory)
        await restarted.reconcile()
        streams = try linkStreams(directory)
        XCTAssertEqual(streams.at(1)?["final"] as? String, "stopped")
        let fourth = await capture(restarted, until: .storing)
        XCTAssertTrue(fourth)
        let latest = try decodedObject(try XCTUnwrap(registrations().last).body)
        XCTAssertEqual(latest["continuity"] as? [String: String], ["kind": "restart", "previous_stream_id": s2, "gap": "unknown"])
        XCTAssertEqual(try linkStreams(directory).count, 3)
    }

    func testStopDuringStartSettlementShowsTheSettledState() async throws {
        let service = ServiceStandIn()
        let dropping = Toggle()
        service.override = { request, _ in
            guard dropping.isOn, request.method == "GET" else { return nil }
            return .some(nil)
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("settle-host", origin: server.origin, mode: "slow")
        let session = try writeMacSession(root: root.appending(path: "settle-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "settle-link", directoryHint: .isDirectory)
        // An earlier stream of this lineage is live on the service; its Stop was never confirmed.
        let earlier = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                         streamID: "stream-unsettled", previousStreamID: nil)
        _ = service.route(LoopbackServer.Request(method: "POST", target: "/v2/process/streams", headers: [],
                                                 body: try DesktopJSON.encode(earlier.json)))
        var stream = LinkStream(userID: "synthetic-user", producerID: "synthetic-mac-producer", registration: earlier,
                                registrationKey: "stream-unsettled.register", sourceID: "src-unsettled", sourceTimezone: "UTC",
                                captureSession: "synthetic", grant: "consumed", delivered: true, registrationSent: true,
                                registered: true)
        stream.state = StreamStateValue(state: "live", revision: 1)
        var journal = LinkJournal()
        journal.streams = [stream]
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(journal).write(to: directory.appending(path: "journal.json"))
        // Launch reconciliation cannot read it.
        let link = stubLink(stub, directory)
        dropping.isOn = true
        await link.reconcile()
        XCTAssertNil(try linkStreams(directory).first?["final"] as? String)
        dropping.isOn = false
        // A Start settles it first; a Stop meanwhile waits for that and then shows the settled state.
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let settling = await until(10) { await link.currentStatus().state == .reconciling }
        XCTAssertTrue(settling)
        gate.close("user_stop")
        await link.stop()
        let status = await link.currentStatus()
        XCTAssertEqual(status.state, .idle)
        XCTAssertEqual(status.earlierUnknown, 0)
        let streams = try linkStreams(directory)
        XCTAssertEqual(streams.count, 1, "no stream for the stopped Start")
        XCTAssertEqual(streams.first?["final"] as? String, "stopped")
        XCTAssertEqual(server.requests.filter { $0.method == "POST" && $0.target == "/v2/process/streams" }.count, 0)
    }

    func testChildLossReconnectsWithoutConsentAndStopsOnce() async throws {
        let service = ServiceStandIn()
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("reconnect-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "reconnect-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "reconnect-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        let states = StatusLog()
        await link.setStatusHandler { states.add($0) }
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        let stream = try linkStreamID(directory)
        let before = server.requests.count
        let shownBefore = states.all.count
        // The child dies: a new child for the same registration, without consent, and sending
        // resumes only after the same checks. Nothing is registered anew.
        let pid = try XCTUnwrap(stub.lines("pids").first.flatMap { Int32($0) })
        XCTAssertEqual(kill(pid, SIGKILL), 0)
        let again = await until(20) { stub.records().count == 2 && server.requests.count >= before + 3 }
        XCTAssertTrue(again)
        let resumed = await until(20) { await link.currentStatus().state == .storing }
        XCTAssertTrue(resumed)
        // While its child was being replaced the link was shown as connecting, not as linked.
        let replacing = states.all.dropFirst(shownBefore).map(\.state)
        XCTAssertEqual(replacing.first, .connecting, "\(replacing)")
        XCTAssertEqual(replacing.last, .storing, "\(replacing)")
        XCTAssertEqual(stub.records().last?["fresh_consent"] as? Bool, false)
        let reopened = server.requests.dropFirst(before).prefix(3)
        XCTAssertEqual(reopened.map { "\($0.method) \($0.target)" }, [
            "POST /v2/process/streams", "GET /v2/process/streams/" + stream,
            "PUT /v2/process/display-sources/" + (try linkSourceID(directory)),
        ])
        XCTAssertEqual(reopened.first?.header("Idempotency-Key"), [stream + ".register"], "a replay under the same key")
        XCTAssertEqual(try linkStreams(directory).count, 1)
        gate.close("user_stop")
        await link.stop()
        XCTAssertEqual(server.requests.filter { $0.target.hasSuffix(":control") }.count, 1)
        XCTAssertEqual(try linkStreams(directory).first?["final"] as? String, "stopped")
        let ended = await until(5) { stub.lines("ends").count == 1 }
        XCTAssertTrue(ended, "the second child got EOF")
    }

    func testNoRegistrationAttemptAfterStop() async throws {
        let service = ServiceStandIn()
        let gate = LiveGate()
        // The first registration attempt is answered 503 unavailable as the user presses Stop.
        service.override = { request, _ in
            guard request.method == "POST", request.target == "/v2/process/streams" else { return nil }
            gate.close("user_stop")
            return service.reply(503, ["contract_version": "0.2.1", "error": "unavailable", "retryable": true])
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("gate-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "gate-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "gate-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        await link.begin(gate: gate, session: session) { _ in }
        let asked = await until(20) { server.requests.contains { $0.target == "/v2/process/streams" } }
        XCTAssertTrue(asked)
        await link.stop()
        let posts = server.requests.filter { $0.method == "POST" && $0.target == "/v2/process/streams" }
        XCTAssertEqual(posts.count, 1, "no registration attempt after Stop")
        let stream = try XCTUnwrap(try linkStreams(directory).first)
        XCTAssertEqual(stream["final"] as? String, "abandoned", "read back as never registered")
        XCTAssertFalse(server.requests.contains { $0.target.hasSuffix(":control") })
        XCTAssertFalse(server.requests.contains { $0.target.hasPrefix("/v2/process/display-sources/") })
    }

    func testFailedSpawnIsAbandonedAndNeverReconciled() async throws {
        let service = ServiceStandIn()
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let broken = try stubHost("spawn-broken", origin: server.origin)
        try FileManager.default.removeItem(at: broken.config.python)
        let session = try writeMacSession(root: root.appending(path: "spawn-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "spawn-link", directoryHint: .isDirectory)
        let link = stubLink(broken, directory)
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let failed = await until(20) { await link.currentStatus().state == .notConnected }
        let status = await link.currentStatus()
        XCTAssertTrue(failed, "\(status)")
        XCTAssertEqual(status.detail, "the capture host could not be started; frames stay on this Mac")
        gate.close("user_stop")
        await link.stop()
        let stream = try XCTUnwrap(try linkStreams(directory).first)
        XCTAssertEqual(stream["delivered"] as? Bool, false)
        XCTAssertEqual(stream["grant"] as? String, "abandoned")
        XCTAssertEqual(stream["final"] as? String, "abandoned")
        // Known not delivered: no later launch asks a child about it.
        let working = try stubHost("spawn-working", origin: server.origin)
        await stubLink(working, directory).reconcile()
        XCTAssertEqual(working.records().count, 0)
        XCTAssertEqual(server.requests.count, 0)
    }

    // MARK: - Lead review corrections: record faults, recorded Stops, earlier doubt

    /// A registered, live stream of the stub lineage as an earlier run left it, with its Stops.
    func seedOpenStream(_ id: String, in directory: URL, service: ServiceStandIn, stops: [LinkStop]) throws -> StreamRegistration {
        let registration = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                              streamID: id, previousStreamID: nil)
        _ = service.route(LoopbackServer.Request(method: "POST", target: "/v2/process/streams", headers: [],
                                                 body: try DesktopJSON.encode(registration.json)))
        var stream = LinkStream(userID: "synthetic-user", producerID: "synthetic-mac-producer", registration: registration,
                                registrationKey: id + ".register", sourceID: "src-" + id, sourceTimezone: "UTC",
                                captureSession: "synthetic", grant: "consumed", delivered: true, registrationSent: true,
                                registered: true)
        stream.state = StreamStateValue(state: "live", revision: 1)
        stream.stops = stops
        var journal = LinkJournal()
        journal.streams = [stream]
        XCTAssertNil(journal.problem)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(journal).write(to: directory.appending(path: "journal.json"))
        return registration
    }

    func testRecordFaultFencesEveryLaterRequest() async throws {
        let session = try writeMacSession(root: root.appending(path: "fence-session", directoryHint: .isDirectory))
        // The record becomes unwritable as the service answers one request: `after` names it.
        let cases: [(name: String, method: String, prefix: String, expected: [String])] = [
            ("registration", "POST", "/v2/process/streams", ["POST"]),
            ("state", "GET", "/v2/process/streams/", ["POST", "GET"]),
        ]
        for fenced in cases {
            let service = ServiceStandIn()
            let directory = root.appending(path: "fence-link-" + fenced.name, directoryHint: .isDirectory)
            let path = directory.path(percentEncoded: false)
            service.override = { request, _ in
                guard request.method == fenced.method, request.target.hasPrefix(fenced.prefix) else { return nil }
                let answer = service.route(request)
                try? FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: path)
                return answer
            }
            let server = try LoopbackServer { service.respond($0, $1) }
            defer { server.stop() }
            let stub = try stubHost("fence-host-" + fenced.name, origin: server.origin)
            let link = stubLink(stub, directory)
            let gate = LiveGate()
            let ended = EndLog()
            await link.begin(gate: gate, session: session) { ended.add($0) }
            let faulted = await until(20) { await link.currentStatus().detail?.hasSuffix("nothing more is sent") == true }
            XCTAssertTrue(faulted, fenced.name)
            // This stream's own child is ended; nothing else is started or requested.
            let childEnded = await until(10) { stub.lines("ends") == ["eof"] }
            XCTAssertTrue(childEnded, fenced.name)
            link.framesChanged()
            try await Task.sleep(nanoseconds: 1_500_000_000)
            XCTAssertEqual(server.requests.map(\.method), fenced.expected, "nothing after the fault: \(fenced.name)")
            XCTAssertFalse(server.requests.contains { $0.target.hasPrefix("/v2/process/display-sources/") }, fenced.name)
            XCTAssertEqual(stub.records().count, 1, "no new child: \(fenced.name)")
            // Local capture goes on: the fault is not a reason to end it.
            XCTAssertTrue(gate.isOpen, fenced.name)
            XCTAssertEqual(ended.all, [], fenced.name)
            let during = await link.currentStatus()
            XCTAssertEqual(during.state, .notConnected, fenced.name)
            XCTAssertEqual(during.detail, "the capture link record could not be written; nothing more is sent", fenced.name)
            gate.close("user_stop")
            await link.stop()
            XCTAssertEqual(server.requests.map(\.method), fenced.expected, "no Stop without a written witness: \(fenced.name)")
            let stopped = await link.currentStatus()
            XCTAssertEqual(stopped.detail, "the capture link record could not be written; nothing more is sent; "
                           + "the server Stop is not confirmed", fenced.name)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: path)
            service.override = nil
            // The record on disk still says the registration was sent, so the next launch settles it.
            let kept = try XCTUnwrap(try linkStreams(directory).first)
            XCTAssertEqual(kept["registrationSent"] as? Bool, true, fenced.name)
            XCTAssertNil(kept["final"] as? String, fenced.name)
            let stream = try linkStreamID(directory)
            let before = server.requests.count
            await stubLink(stub, directory).reconcile()
            let settled = server.requests.dropFirst(before).map { "\($0.method) \($0.target)" }
            XCTAssertEqual(settled, ["GET /v2/process/streams/\(stream)", "POST /v2/process/streams/\(stream):control",
                                     "GET /v2/process/streams/\(stream)"], fenced.name)
            XCTAssertEqual(try linkStreams(directory).first?["final"] as? String, "stopped", fenced.name)
        }
    }

    func testReopenedStopReusesItsRecordedCommand() async throws {
        let service = ServiceStandIn()
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        func recordedStop(_ registration: StreamRegistration, revision: Int) throws -> String {
            String(decoding: try DesktopJSON.encode(registration.stopBody(expectedRevision: revision)), as: UTF8.self)
        }
        func reconcileSeed(_ id: String, final: String? = "stopped", stop: (StreamRegistration) throws -> LinkStop,
                           prepare: () -> Void = {}) async throws -> (LoopbackServer.Request, [[String: Any]], [String: Any]) {
            let directory = root.appending(path: "reuse-link-" + id, directoryHint: .isDirectory)
            let template = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                              streamID: id, previousStreamID: nil)
            _ = try seedOpenStream(id, in: directory, service: service, stops: [try stop(template)])
            prepare()
            let stub = try stubHost("reuse-host-" + id, origin: server.origin)
            let before = server.requests.count
            await stubLink(stub, directory).reconcile()
            let sent = Array(server.requests.dropFirst(before))
            XCTAssertEqual(sent.map(\.method), ["GET", "POST", "GET"], id)
            XCTAssertEqual(stub.records().first?["fresh_consent"] as? Bool, false, id)
            let stream = try XCTUnwrap(try linkStreams(directory).first)
            XCTAssertEqual(stream["final"] as? String, final, id)
            return (try XCTUnwrap(sent.at(1), id), try XCTUnwrap(stream["stops"] as? [[String: Any]]), stream)
        }

        // The same revision: the recorded command goes again under its own key, with its exact bytes.
        var stored = ""
        let (same, sameStops, sameStream) = try await reconcileSeed("stream-reuse-same", stop: { registration in
            stored = try recordedStop(registration, revision: 1)
            return LinkStop(key: "stream-reuse-same.stop.1", body: stored, outcome: "unknown")
        })
        XCTAssertEqual(same.header("Idempotency-Key"), ["stream-reuse-same.stop.1"])
        XCTAssertEqual(String(decoding: same.body, as: UTF8.self), stored)
        XCTAssertEqual(sameStops.count, 1, "no second command for the same revision")
        XCTAssertEqual(sameStops.at(0)?["outcome"] as? String, "stopped")
        XCTAssertEqual(sameStops.at(0)?["replays"] as? Int, 1)
        let notes = (sameStream["notes"] as? [String]) ?? []
        XCTAssertEqual(notes, ["the recorded Stop stream-reuse-same.stop.1 (unknown) is sent again with the same bytes"])

        // Control: the read revision changed, so a new command is made; the earlier one is kept.
        let (changed, changedStops, _) = try await reconcileSeed("stream-reuse-changed", stop: { registration in
            LinkStop(key: "stream-reuse-changed.stop.1", body: try recordedStop(registration, revision: 1), outcome: "unknown")
        }, prepare: { service.setState("stream-reuse-changed", "live") })
        XCTAssertEqual(changed.header("Idempotency-Key"), ["stream-reuse-changed.stop.2"])
        XCTAssertEqual(try decodedObject(changed.body)["expected_revision"] as? Int, 2)
        XCTAssertEqual(changedStops.map { $0["key"] as? String }, ["stream-reuse-changed.stop.1", "stream-reuse-changed.stop.2"])
        XCTAssertEqual(changedStops.map { $0["outcome"] as? String }, ["unknown", "stopped"])
        XCTAssertNil(changedStops.at(0)?["replays"] as? Int)

        // Control: stored bytes that are not exactly this stream's Stop at this revision are never
        // sent; they stay as they are, and a new command is made.
        let foreign = "{\"action\":{\"kind\":\"stop\",\"pre_stop_sequence\":null},\"contract_version\":\"0.2.1\","
            + "\"device_id\":\"synthetic-mac-device\",\"expected_revision\":1,\"session_id\":\"another-session\","
            + "\"stream_id\":\"stream-reuse-foreign\"}"
        let (fresh, freshStops, _) = try await reconcileSeed("stream-reuse-foreign", stop: { _ in
            LinkStop(key: "stream-reuse-foreign.stop.1", body: foreign, outcome: "unknown")
        })
        XCTAssertEqual(fresh.header("Idempotency-Key"), ["stream-reuse-foreign.stop.2"])
        XCTAssertEqual(try decodedObject(fresh.body)["session_id"] as? String, "synthetic-learning-session")
        XCTAssertEqual(freshStops.at(0)?["body"] as? String, foreign)
        XCTAssertEqual(freshStops.map { $0["outcome"] as? String }, ["unknown", "stopped"])

        // Control: a command recorded but never known sent (a crash after the journal write) is
        // also sent under its own key.
        let (written, writtenStops, _) = try await reconcileSeed("stream-reuse-written", stop: { registration in
            LinkStop(key: "stream-reuse-written.stop.1", body: try recordedStop(registration, revision: 1), outcome: "written")
        })
        XCTAssertEqual(written.header("Idempotency-Key"), ["stream-reuse-written.stop.1"])
        XCTAssertEqual(writtenStops.count, 1)
        XCTAssertEqual(writtenStops.at(0)?["outcome"] as? String, "stopped")

        // A recorded known refusal that is sent again and now taken: the entry holds this answer,
        // and the earlier answer stays in the notes.
        let (_, takenStops, takenStream) = try await reconcileSeed("stream-reuse-refused", stop: { registration in
            LinkStop(key: "stream-reuse-refused.stop.1", body: try recordedStop(registration, revision: 1), outcome: "refused",
                     httpStatus: 403, code: "forbidden")
        })
        XCTAssertEqual(takenStops.count, 1)
        XCTAssertEqual(takenStops.at(0)?["outcome"] as? String, "stopped")
        XCTAssertNil(takenStops.at(0)?["httpStatus"])
        XCTAssertNil(takenStops.at(0)?["code"])
        XCTAssertEqual(takenStream["notes"] as? [String], ["the recorded Stop stream-reuse-refused.stop.1 (refused 403 forbidden) "
                                                           + "is sent again with the same bytes"])

        // A recorded command sent again and refused at once: one that may already have taken
        // effect (unknown, or written and never known sent) stays not known; a known refusal
        // stays a refusal. The reads still show the stream live, so it is not settled.
        service.override = { request, _ in
            guard request.target.hasSuffix(":control") else { return nil }
            return service.typed(403, "forbidden", "0.2.1")
        }
        for (earlier, expected) in [("unknown", "unknown"), ("written", "unknown"), ("refused", "refused")] {
            let id = "stream-reuse-403-" + earlier
            let (again, againStops, _) = try await reconcileSeed(id, final: nil, stop: { registration in
                LinkStop(key: id + ".stop.1", body: try recordedStop(registration, revision: 1), outcome: earlier)
            })
            XCTAssertEqual(again.header("Idempotency-Key"), [id + ".stop.1"], earlier)
            XCTAssertEqual(againStops.count, 1, earlier)
            XCTAssertEqual(againStops.at(0)?["outcome"] as? String, expected, "a later refusal after \(earlier)")
            XCTAssertEqual(againStops.at(0)?["httpStatus"] as? Int, 403, earlier)
            XCTAssertEqual(againStops.at(0)?["replays"] as? Int, 1, earlier)
        }
        service.override = nil

        // A recorded known refusal is in flight again once it is sent: if its answer is never
        // recorded (here the record becomes unwritable as the service commits it), the record does
        // not go on calling it known not taken.
        let lostDirectory = root.appending(path: "reuse-link-lost", directoryHint: .isDirectory)
        let lostPath = lostDirectory.path(percentEncoded: false)
        _ = try seedOpenStream("stream-reuse-lost", in: lostDirectory, service: service, stops: [
            LinkStop(key: "stream-reuse-lost.stop.1",
                     body: try recordedStop(StreamRegistration(deviceID: "synthetic-mac-device",
                                                               sessionID: "synthetic-learning-session",
                                                               streamID: "stream-reuse-lost", previousStreamID: nil), revision: 1),
                     outcome: "refused", httpStatus: 403, code: "forbidden"),
        ])
        service.override = { request, _ in
            guard request.target == "/v2/process/streams/stream-reuse-lost:control" else { return nil }
            let answer = service.route(request)
            try? FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: lostPath)
            return answer
        }
        let lostStub = try stubHost("reuse-host-lost", origin: server.origin)
        let lostBefore = server.requests.count
        await stubLink(lostStub, lostDirectory).reconcile()
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: lostPath)
        service.override = nil
        XCTAssertEqual(server.requests.dropFirst(lostBefore).map(\.method), ["GET", "POST"], "no read back after the fault")
        var lostStream = try XCTUnwrap(try linkStreams(lostDirectory).first)
        var lostStops = try XCTUnwrap(lostStream["stops"] as? [[String: Any]])
        XCTAssertEqual(lostStops.at(0)?["outcome"] as? String, "written", "sent again; its answer was not recorded")
        XCTAssertNil(lostStops.at(0)?["httpStatus"])
        XCTAssertNil(lostStream["final"] as? String)
        await stubLink(lostStub, lostDirectory).reconcile()
        lostStream = try XCTUnwrap(try linkStreams(lostDirectory).first)
        lostStops = try XCTUnwrap(lostStream["stops"] as? [[String: Any]])
        XCTAssertEqual(lostStream["final"] as? String, "stopped")
        XCTAssertEqual(lostStops.map { $0["outcome"] as? String }, ["written"])
    }

    func testLaterRefusalKeepsAnEarlierControlDoubt() async throws {
        let registration = StreamRegistration(deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                              streamID: "stream-doubt", previousStreamID: nil)
        let incarnation = CaptureIncarnation(deviceID: registration.deviceID, sessionID: registration.sessionID,
                                             streamID: registration.streamID)
        let authority = try MacIngressAuthority(origin: Self.uploadOrigin, token: Self.uploadToken,
                                                expiresAt: Date(timeIntervalSinceNow: 3600), userID: "synthetic-user",
                                                incarnation: incarnation)
        let stand = ServiceStandIn()
        let state = Self.json(200, stand.stateObject("stream-doubt", (registration: try decodedObject(try DesktopJSON.encode(registration.json)),
                                                                       state: "live", revision: 1)))
        let stopBody = try DesktopJSON.encode(registration.stopBody(expectedRevision: 1))
        let sourceBody = try XCTUnwrap(CaptureControl.sourceBody(sourceID: "src-doubt", streamID: "stream-doubt", timezone: "UTC"))
        let snapshot = Self.json(200, [
            "contract_version": "0.2.3", "user_id": "synthetic-user", "source_id": "src-doubt", "source_version": 1,
            "type": "shared_display", "device_id": registration.deviceID, "session_id": registration.sessionID,
            "stream_id": "stream-doubt", "project_id": NSNull(), "created_at": "2026-09-30T21:00:00Z", "source_timezone": "UTC",
        ] as [String: Any])
        func refusal(_ status: Int, _ code: String, _ version: String) -> MacHTTPReply {
            Self.json(status, ["contract_version": version, "error": code, "retryable": code == "unavailable"] as [String: Any])
        }
        /// One scripted answer per attempt: nil is a lost answer.
        typealias Script = [MacHTTPReply?]
        func run(_ operation: String, _ script: Script, stopped: Bool = false) async -> (String, [SentRequest]) {
            let host = StandInHost { _, index in
                guard index < script.count, let reply = script[index] else { throw URLError(.networkConnectionLost) }
                return reply
            }
            let control = CaptureControl(authority: authority, transport: host, attempts: 3, pause: 0)
            let name: String
            switch operation {
            case "register":
                name = Self.outcomeName(await control.register(registration, key: "stream-doubt.register", shouldStop: { stopped }))
            case "stop":
                name = Self.outcomeName(await control.stop(registration, body: stopBody, key: "stream-doubt.stop.1"))
            case "source":
                name = Self.outcomeName(await control.putSource(sourceBody, sourceID: "src-doubt", registration: registration,
                                                                timezone: "UTC", createdAt: nil, shouldStop: { stopped }))
            default:
                name = Self.outcomeName(await control.read(registration))
            }
            return (name, host.sent)
        }
        let writes: [(operation: String, version: String, success: MacHTTPReply)] = [
            ("register", "0.2.1", state), ("stop", "0.2.1", state), ("source", "0.2.4", snapshot),
        ]
        for write in writes {
            let forbidden = refusal(403, "forbidden", write.version)
            // An earlier attempt in doubt, then a typed refusal of its retry: still not known.
            let doubts: [(String, Script)] = [
                ("lost then 401", [nil, refusal(401, "unauthenticated", write.version)]),
                ("503 then 403", [refusal(503, "unavailable", write.version), forbidden]),
                ("malformed 200 then 403", [Self.json(200, ["unexpected": true]), forbidden]),
                ("another URL then 403", [MacHTTPReply(status: write.success.status, body: write.success.body,
                                                       url: URL(string: "http://127.0.0.1:1/elsewhere")), forbidden]),
            ]
            for (name, script) in doubts {
                let (outcome, sent) = await run(write.operation, script)
                XCTAssertEqual(outcome, "unknown", "\(write.operation): \(name)")
                XCTAssertEqual(sent.count, 2, "\(write.operation): \(name)")
                XCTAssertEqual(sent.at(0)?.body, sent.at(1)?.body, "the same bytes: \(write.operation)")
                XCTAssertEqual(sent.at(0)?.headers, sent.at(1)?.headers, "the same headers: \(write.operation)")
            }
            // Controls: a first-attempt refusal is known not taken; an exactly corresponding answer
            // settles an earlier doubt.
            let (first, firstSent) = await run(write.operation, [forbidden])
            XCTAssertEqual(first, "refused 403 forbidden", write.operation)
            XCTAssertEqual(firstSent.count, 1)
            let (settled, settledSent) = await run(write.operation, [nil, write.success])
            XCTAssertEqual(settled, "ok", write.operation)
            XCTAssertEqual(settledSent.count, 2)
            let (lost, lostSent) = await run(write.operation, [nil, nil, nil])
            XCTAssertEqual(lost, "unknown", write.operation)
            XCTAssertEqual(lostSent.count, 3)
        }
        // Controls: stopped before the first attempt, nothing is sent.
        for operation in ["register", "source"] {
            let (unsent, sent) = await run(operation, [state], stopped: true)
            XCTAssertEqual(unsent, "notSent", operation)
            XCTAssertEqual(sent.count, 0, operation)
        }
        // Control: a read changes nothing, so a later refusal is its answer.
        let (read, readSent) = await run("read", [nil, refusal(403, "forbidden", "0.2.1")])
        XCTAssertEqual(read, "refused 403 forbidden")
        XCTAssertEqual(readSent.count, 2)
    }

    static func outcomeName<Value>(_ outcome: ControlOutcome<Value>) -> String {
        switch outcome {
        case .ok: return "ok"
        case .refused(let status, let code): return "refused \(status) \(code)"
        case .unknown: return "unknown"
        case .notSent: return "notSent"
        }
    }

    func testLostAnswerThenRefusalStaysUnknownInTheLink() async throws {
        let session = try writeMacSession(root: root.appending(path: "doubt-session", directoryHint: .isDirectory))
        let forbidden: [String: Any] = ["contract_version": "0.2.1", "error": "forbidden", "retryable": false]

        // The Stop commits, its answer is lost, and its retry and the read back are refused.
        let service = ServiceStandIn()
        let commits = EndLog()
        service.override = { request, _ in
            guard request.target.hasSuffix(":control") || (request.method == "GET" && !commits.all.isEmpty) else { return nil }
            if request.method == "GET" { return service.reply(403, forbidden) }
            guard commits.all.isEmpty else { return service.reply(403, forbidden) }
            commits.add("committed")
            _ = service.route(request)
            return .some(nil)
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("doubt-host", origin: server.origin)
        let directory = root.appending(path: "doubt-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        gate.close("user_stop")
        await link.stop()
        let status = await link.currentStatus()
        XCTAssertEqual(status.detail, "the server Stop is not confirmed")
        var stream = try XCTUnwrap(try linkStreams(directory).first)
        var stops = try XCTUnwrap(stream["stops"] as? [[String: Any]])
        XCTAssertEqual(stops.count, 1)
        XCTAssertEqual(stops.at(0)?["outcome"] as? String, "unknown", "never refused: the first attempt may have committed")
        XCTAssertNil(stream["final"] as? String)
        let controls = server.requests.filter { $0.target.hasSuffix(":control") }
        XCTAssertEqual(controls.count, 2)
        XCTAssertEqual(controls.at(0)?.body, controls.at(1)?.body)
        XCTAssertEqual(controls.at(0)?.header("Idempotency-Key"), controls.at(1)?.header("Idempotency-Key"))
        // Independent state evidence settles the stream at the next launch; no second command.
        service.override = nil
        await stubLink(stub, directory).reconcile()
        stream = try XCTUnwrap(try linkStreams(directory).first)
        stops = try XCTUnwrap(stream["stops"] as? [[String: Any]])
        XCTAssertEqual(stream["final"] as? String, "stopped")
        XCTAssertEqual(stops.count, 1)
        XCTAssertEqual(stops.at(0)?["outcome"] as? String, "unknown", "the read settled the stream, not this command's outcome")
        XCTAssertEqual(server.requests.filter { $0.target.hasSuffix(":control") }.count, 2)

        // The registration commits, its answer is lost, and its retry is refused: shown as not
        // known, never as "not registered"; the Stop then finds it registered and Stops it.
        let registering = ServiceStandIn()
        let registered = EndLog()
        registering.override = { request, _ in
            guard request.method == "POST", request.target == "/v2/process/streams" else { return nil }
            guard registered.all.isEmpty else { return registering.reply(403, forbidden) }
            registered.add("committed")
            _ = registering.route(request)
            return .some(nil)
        }
        let registerServer = try LoopbackServer { registering.respond($0, $1) }
        defer { registerServer.stop() }
        let registerStub = try stubHost("doubt-register-host", origin: registerServer.origin)
        let registerDirectory = root.appending(path: "doubt-register-link", directoryHint: .isDirectory)
        let registerLink = stubLink(registerStub, registerDirectory)
        let registerGate = LiveGate()
        await registerLink.begin(gate: registerGate, session: session) { _ in }
        let shown = await until(20) { await registerLink.currentStatus().state == .notConnected }
        XCTAssertTrue(shown)
        let detail = await registerLink.currentStatus().detail
        XCTAssertEqual(detail, "whether the stream was registered is not known; frames stay on this Mac")
        XCTAssertFalse(registerServer.requests.contains { $0.target.hasPrefix("/v2/process/display-sources/") })
        registerGate.close("user_stop")
        await registerLink.stop()
        let settled = try XCTUnwrap(try linkStreams(registerDirectory).first)
        XCTAssertEqual(settled["registered"] as? Bool, true)
        XCTAssertEqual(settled["final"] as? String, "stopped")
    }

    func testStopAfterDoubtRenewsTheBearerAndKeepsTheDoubt() async throws {
        let session = try writeMacSession(root: root.appending(path: "renew-session", directoryHint: .isDirectory))
        // `renewed`: how the renewed child's Stop is answered (nil lets the stand-in take it).
        let variants: [(name: String, renewed: Int?, outcome: String, final: String?)] = [
            ("taken", nil, "stopped", "stopped"), ("refused", 403, "unknown", nil),
        ]
        for variant in variants {
            let service = ServiceStandIn()
            let armed = Toggle()
            let bearers = EndLog()
            let drops = EndLog()
            // The first bearer's Stop gets no answer (and is not taken); its retry is refused 401.
            service.override = { request, _ in
                let bearer = request.header("Authorization").first ?? ""
                if bearers.all.isEmpty { bearers.add(bearer) }
                guard armed.isOn, request.target.hasSuffix(":control") else { return nil }
                if bearer == bearers.all.first {
                    guard drops.all.isEmpty else { return service.typed(401, "unauthenticated", "0.2.1") }
                    drops.add("dropped")
                    return .some(nil)
                }
                return variant.renewed.map { service.typed($0, "forbidden", "0.2.1") }
            }
            let server = try LoopbackServer { service.respond($0, $1) }
            defer { server.stop() }
            let stub = try stubHost("renew-host-" + variant.name, origin: server.origin)
            let directory = root.appending(path: "renew-link-" + variant.name, directoryHint: .isDirectory)
            let link = stubLink(stub, directory)
            let gate = LiveGate()
            await link.begin(gate: gate, session: session) { _ in }
            let stored = await until(20) { await link.currentStatus().stored == 7 }
            XCTAssertTrue(stored, variant.name)
            armed.isOn = true
            gate.close("user_stop")
            await link.stop()
            // A new child and bearer without consent; the same key and bytes each time.
            XCTAssertEqual(stub.records().count, 2, variant.name)
            XCTAssertEqual(stub.records().last?["fresh_consent"] as? Bool, false, variant.name)
            let controls = server.requests.filter { $0.target.hasSuffix(":control") }
            XCTAssertEqual(controls.count, 3, variant.name)
            XCTAssertEqual(Set(controls.map(\.body)).count, 1, variant.name)
            XCTAssertEqual(Set(controls.compactMap { $0.header("Idempotency-Key").first }).count, 1, variant.name)
            XCTAssertEqual(Set(controls.compactMap { $0.header("Authorization").first }).count, 2, variant.name)
            let stream = try XCTUnwrap(try linkStreams(directory).first)
            let stops = try XCTUnwrap(stream["stops"] as? [[String: Any]])
            XCTAssertEqual(stops.count, 1, variant.name)
            // A refusal of the resend does not make the first attempt known not taken.
            XCTAssertEqual(stops.at(0)?["outcome"] as? String, variant.outcome, variant.name)
            XCTAssertEqual(stream["final"] as? String, variant.final, variant.name)
        }
    }

    func testSourceInDoubtThenRefusedEndsTheCaptureWithoutClaimingItWasNotRegistered() async throws {
        let session = try writeMacSession(root: root.appending(path: "source-session", directoryHint: .isDirectory))
        // The first PUT is in doubt (taken with an answer that is not believed, or answered 503);
        // `refusal` is its retry's answer (nil: every PUT is taken and its answer lost).
        let variants: [(name: String, commits: Bool, refusal: Int?)] = [
            ("taken then 403", true, 403), ("503 then 403", false, 403), ("all lost", true, nil),
        ]
        for variant in variants {
            let service = ServiceStandIn()
            let puts = EndLog()
            service.override = { request, _ in
                guard request.method == "PUT", request.target.hasPrefix("/v2/process/display-sources/") else { return nil }
                let first = puts.all.isEmpty
                puts.add("put")
                if first, !variant.commits {
                    return service.reply(503, ["contract_version": "0.2.4", "error": "unavailable", "retryable": true])
                }
                if first, variant.refusal != nil {
                    // Taken, with an answered 200 that does not correspond: no dropped connection,
                    // so the doubt does not depend on how the transport treats one.
                    _ = service.route(request)
                    return service.reply(200, ["unexpected": true])
                }
                if variant.refusal == nil {
                    _ = service.route(request)
                    return .some(nil)
                }
                return service.typed(403, "forbidden", "0.2.4")
            }
            let server = try LoopbackServer { service.respond($0, $1) }
            defer { server.stop() }
            let name = variant.name.replacingOccurrences(of: " ", with: "-")
            let stub = try stubHost("source-host-" + name, origin: server.origin)
            let directory = root.appending(path: "source-link-" + name, directoryHint: .isDirectory)
            let link = stubLink(stub, directory)
            let gate = LiveGate()
            let ended = EndLog()
            await link.begin(gate: gate, session: session) { reason in
                ended.add(reason)
                gate.close(reason)
                Task { await link.stop() }
            }
            if variant.refusal != nil {
                // The permission is gone: this capture ends, and the earlier doubt is kept.
                let lost = await until(30) { ended.all == ["server_permission_lost"] }
                XCTAssertTrue(lost, variant.name)
                await link.stop()
                let status = await link.currentStatus()
                XCTAssertEqual(status.state, .endedByService, variant.name)
            } else {
                let shown = await until(30) { await link.currentStatus().state == .notConnected }
                XCTAssertTrue(shown, variant.name)
                let detail = await link.currentStatus().detail
                XCTAssertEqual(detail, "whether the display source was registered is not known; frames stay on this Mac")
                XCTAssertTrue(gate.isOpen, variant.name)
                XCTAssertEqual(ended.all, [], variant.name)
                gate.close("user_stop")
                await link.stop()
            }
            let notes = (try XCTUnwrap(try linkStreams(directory).first)["notes"] as? [String]) ?? []
            XCTAssertTrue(notes.contains("whether the display source was registered is not known"), "\(variant.name): \(notes)")
            XCTAssertFalse(server.requests.contains { $0.target.hasPrefix("/v2/process/originals/") }, variant.name)
        }
    }

    func testServerEndInARegistrationReplayEndsTheCaptureDespiteARecordFault() async throws {
        let service = ServiceStandIn()
        let armed = Toggle()
        let directory = root.appending(path: "replay-end-link", directoryHint: .isDirectory)
        let path = directory.path(percentEncoded: false)
        // After the child is lost, the registration replay answers withdrawn, and the record becomes
        // unwritable as it does.
        service.override = { request, _ in
            guard armed.isOn, request.method == "POST", request.target == "/v2/process/streams" else { return nil }
            let answer = service.route(request)
            try? FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: path)
            return answer
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("replay-end-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "replay-end-session", directoryHint: .isDirectory))
        let link = stubLink(stub, directory)
        let gate = LiveGate()
        let ended = EndLog()
        await link.begin(gate: gate, session: session) { reason in
            ended.add(reason)
            gate.close(reason)
            Task { await link.stop() }
        }
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        service.setState(try linkStreamID(directory), "withdrawn")
        armed.isOn = true
        let before = server.requests.count
        let pid = try XCTUnwrap(stub.lines("pids").first.flatMap { Int32($0) })
        XCTAssertEqual(kill(pid, SIGKILL), 0)
        // The believed withdrawal ends this capture although the record could not be written, and
        // nothing more is requested.
        let endedByService = await until(20) { ended.all == ["server_withdrawn"] }
        XCTAssertTrue(endedByService, "\(ended.all)")
        await link.stop()
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: path)
        XCTAssertEqual(server.requests.dropFirst(before).map { "\($0.method) \($0.target)" }, ["POST /v2/process/streams"])
        let status = await link.currentStatus()
        XCTAssertEqual(status.state, .endedByService)
    }

    func testReconnectReplayActsOnABelievedServerEndOrLostPermission() async throws {
        let session = try writeMacSession(root: root.appending(path: "replay-session", directoryHint: .isDirectory))
        // After the child is lost, the registration replay is answered `replay`: the stream's
        // withdrawn state (and the state read after it would get no believed answer), or a 403.
        let variants: [(name: String, withdrawn: Bool, reason: String, final: String, controls: Int)] = [
            ("withdrawn", true, "server_withdrawn", "withdrawn", 0), ("forbidden", false, "server_permission_lost", "stopped", 1),
        ]
        for variant in variants {
            let service = ServiceStandIn()
            let armed = Toggle()
            service.override = { request, _ in
                guard armed.isOn else { return nil }
                if variant.withdrawn, request.method == "GET" {
                    return service.reply(503, ["contract_version": "0.2.1", "error": "unavailable", "retryable": true])
                }
                if !variant.withdrawn, request.method == "POST", request.target == "/v2/process/streams" {
                    return service.typed(403, "forbidden", "0.2.1")
                }
                return nil
            }
            let server = try LoopbackServer { service.respond($0, $1) }
            defer { server.stop() }
            let stub = try stubHost("replay-host-" + variant.name, origin: server.origin)
            let directory = root.appending(path: "replay-link-" + variant.name, directoryHint: .isDirectory)
            let link = stubLink(stub, directory)
            let gate = LiveGate()
            let ended = EndLog()
            await link.begin(gate: gate, session: session) { reason in
                ended.add(reason)
                gate.close(reason)
                Task { await link.stop() }
            }
            let stored = await until(20) { await link.currentStatus().stored == 7 }
            XCTAssertTrue(stored, variant.name)
            if variant.withdrawn { service.setState(try linkStreamID(directory), "withdrawn") }
            armed.isOn = true
            let before = server.requests.count
            let pid = try XCTUnwrap(stub.lines("pids").first.flatMap { Int32($0) })
            XCTAssertEqual(kill(pid, SIGKILL), 0, variant.name)
            // The replay's believed answer ends this capture at once: no state read is needed.
            let endedByService = await until(20) { ended.all == [variant.reason] }
            XCTAssertTrue(endedByService, "\(variant.name): \(ended.all)")
            let during = await link.currentStatus().detail ?? ""
            XCTAssertFalse(during.contains("not registered"), "\(variant.name): \(during)")
            await link.stop()
            armed.isOn = false
            let after = server.requests.dropFirst(before)
            XCTAssertEqual(after.first.map { "\($0.method) \($0.target)" }, "POST /v2/process/streams", variant.name)
            if variant.withdrawn {
                XCTAssertEqual(after.count, 1, "no state read and no Stop after a believed withdrawal")
            }
            XCTAssertEqual(after.filter { $0.target.hasSuffix(":control") }.count, variant.controls, variant.name)
            let status = await link.currentStatus()
            XCTAssertEqual(status.state, .endedByService, variant.name)
            XCTAssertEqual(try linkStreams(directory).first?["final"] as? String, variant.final, variant.name)
        }
    }

    // MARK: - What the link shows: confirmed, awaiting an answer, not known

    func testPendingFramesAreShownAtOnceAndStoredOnlyAfterTheirACK() async throws {
        let service = ServiceStandIn()
        let holds = [Hold(), Hold()]
        let arrived = EndLog()
        let log = StatusLog()
        let seenAtFirstUpload = EndLog()
        // Each batch's answer is held back; the first original's upload notes what was shown then.
        service.override = { request, _ in
            if request.target.hasPrefix("/v2/process/originals/"), seenAtFirstUpload.all.isEmpty {
                seenAtFirstUpload.add("\(log.all.last?.awaiting ?? -1)")
            }
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            let index = arrived.all.count
            arrived.add("batch")
            if index < holds.count { holds[index].wait() }
            return nil
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        defer { holds.forEach { $0.release() } }
        let stub = try stubHost("pending-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "pending-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "pending-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory, framesPerBatch: 4)
        await link.setStatusHandler { log.add($0) }
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }

        // The first batch is at the service and not answered: nothing is confirmed, and its frames
        // were shown as awaiting an answer before its first request went out.
        let firstHeld = await until(20) { arrived.all.count == 1 }
        XCTAssertTrue(firstHeld)
        let first = await link.currentStatus()
        XCTAssertEqual(first.state, .storing)
        XCTAssertEqual(shown(first), [0, 4, 0, 0, 4])
        XCTAssertEqual(first.summaryLine, "Linked to the capture service.")
        XCTAssertEqual(first.countsLine, "0 frame(s) confirmed stored, 4 awaiting an answer, 0 not known, 0 refused, 4 not sent yet.")
        XCTAssertEqual(first.menuLine, "Capture storage: Linked to the capture service.")
        XCTAssertEqual(seenAtFirstUpload.all, ["4"], "shown before the batch's first request")
        XCTAssertEqual(log.all.map(\.stored).max(), 0, "nothing confirmed before an ACK")
        // Linked with nothing sent yet: the counts line is there and confirms nothing.
        let linked = try XCTUnwrap(log.all.first { $0.state == .storing })
        XCTAssertEqual(linked.countsLine?.hasPrefix("0 frame(s) confirmed stored, 0 awaiting an answer, 0 not known, 0 refused, "), true)

        // Its exact ACK confirms those four; the next batch then awaits its own answer.
        holds[0].release()
        let secondHeld = await until(20) { arrived.all.count == 2 }
        XCTAssertTrue(secondHeld)
        let second = await link.currentStatus()
        XCTAssertEqual(shown(second), [4, 3, 0, 0, 1])
        XCTAssertEqual(second.countsLine, "4 frame(s) confirmed stored, 3 awaiting an answer, 0 not known, 0 refused, 1 not sent yet.")
        XCTAssertEqual(log.all.map(\.stored).max(), 4, "the later batch is not confirmed before its ACK")
        holds[1].release()
        let allStored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(allStored)
        let third = await link.currentStatus()
        XCTAssertEqual(shown(third), [7, 0, 0, 0, 1])

        gate.close("user_stop")
        await link.stop()
        let final = await link.currentStatus()
        XCTAssertEqual(final.summaryLine, "Stopped.")
        XCTAssertEqual(final.countsLine, "7 frame(s) confirmed stored, 0 awaiting an answer, 0 not known, 0 refused, 1 not sent.")
        // No status ever said frames were being stored, and `stored` only ever grew by an ACK.
        for status in log.all {
            XCTAssertFalse(status.summaryLine.lowercased().contains("storing"), status.summaryLine)
            XCTAssertTrue([0, 4, 7].contains(status.stored), "\(status)")
            if status.state == .storing { XCTAssertNotNil(status.countsLine) }
        }
    }

    func testBatchWithoutABelievedAnswerStaysNotKnownUntilItsExactACK() async throws {
        let service = ServiceStandIn()
        let hold = Hold()
        let posts = EndLog()
        // The batch is answered 503 three times (one whole upload call with no believed answer); its
        // resend is then held back, and at last answered exactly.
        service.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            let attempt = posts.all.count
            posts.add("post")
            if attempt < 3 {
                return service.reply(503, ["contract_version": "0.2.12", "error": "unavailable", "retryable": true])
            }
            if attempt == 3 { hold.wait() }
            return nil
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        defer { hold.release() }
        let stub = try stubHost("unanswered-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "unanswered-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "unanswered-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        let log = StatusLog()
        await link.setStatusHandler { log.add($0) }
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let resent = await until(30) { posts.all.count == 4 }
        XCTAssertTrue(resent)
        // Not known: never "stored", never "not stored", and the link is not shown as storing.
        let doubt = await link.currentStatus()
        XCTAssertEqual(doubt.state, .storing)
        XCTAssertEqual(shown(doubt), [0, 0, 7, 0, 1])
        XCTAssertEqual(doubt.summaryLine, "Linked to the capture service.")
        XCTAssertEqual(doubt.countsLine, "0 frame(s) confirmed stored, 0 awaiting an answer, 7 not known, 0 refused, 1 not sent yet.")
        XCTAssertEqual(log.all.map(\.stored).max(), 0)
        // The same bytes and key every time; the exact ACK then counts them.
        hold.release()
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        let settled = await link.currentStatus()
        XCTAssertEqual(shown(settled), [7, 0, 0, 0, 1])
        let batches = server.requests.filter { $0.target == "/v2/process/macos-frames:batch" }
        XCTAssertEqual(batches.count, 4)
        XCTAssertEqual(Set(batches.map(\.body)).count, 1)
        XCTAssertEqual(Set(batches.compactMap { $0.header("Idempotency-Key").first }).count, 1)
        gate.close("user_stop")
        await link.stop()
    }

    func testStopOrARecordFaultNeverShowsTheLinkAsUpAndEndsWithNothingAwaiting() async throws {
        let session = try writeMacSession(root: root.appending(path: "shown-session", directoryHint: .isDirectory))

        // Stop while a batch awaits its answer: cut off, it is not known; the link is not shown up.
        let slow = ServiceStandIn()
        slow.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            var reply = slow.route(request)
            reply.delay = 3
            return reply
        }
        let slowServer = try LoopbackServer { slow.respond($0, $1) }
        defer { slowServer.stop() }
        let slowStub = try stubHost("shown-stop-host", origin: slowServer.origin)
        let slowDirectory = root.appending(path: "shown-stop-link", directoryHint: .isDirectory)
        let slowLink = stubLink(slowStub, slowDirectory)
        let slowLog = StatusLog()
        await slowLink.setStatusHandler { slowLog.add($0) }
        let slowGate = LiveGate()
        await slowLink.begin(gate: slowGate, session: session) { _ in }
        let sending = await until(20) { slowServer.requests.contains { $0.target == "/v2/process/macos-frames:batch" } }
        XCTAssertTrue(sending)
        let awaiting = await slowLink.currentStatus()
        XCTAssertEqual(shown(awaiting), [0, 7, 0, 0, 1])
        slowGate.close("user_stop")
        let atStop = slowLog.all.count
        await slowLink.stop()
        let stopped = await slowLink.currentStatus()
        XCTAssertEqual(stopped.state, .stopped)
        XCTAssertEqual(shown(stopped), [0, 0, 7, 0, 1])
        XCTAssertEqual(stopped.countsLine, "0 frame(s) confirmed stored, 0 awaiting an answer, 7 not known, 0 refused, 1 not sent.")
        // The batch in flight stays "awaiting" only until it is cut off; then it is not known.
        let afterStop = slowLog.all.dropFirst(atStop)
        XCTAssertFalse(afterStop.contains { $0.state == .storing }, "\(afterStop.map(\.state))")
        XCTAssertEqual(afterStop.map { "\($0.state.rawValue) \(shown($0))" },
                       ["stopping [0, 7, 0, 0, 1]", "stopping [0, 0, 7, 0, 1]", "stopped [0, 0, 7, 0, 1]"])

        // The record becomes unwritable as the first batch is answered: its verified ACK still
        // counts, nothing else is sent, and the link is no longer shown as up.
        let service = ServiceStandIn()
        let directory = root.appending(path: "shown-fault-link", directoryHint: .isDirectory)
        let path = directory.path(percentEncoded: false)
        service.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            let answer = service.route(request)
            try? FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: path)
            return answer
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("shown-fault-host", origin: server.origin)
        let link = stubLink(stub, directory, framesPerBatch: 4)
        let log = StatusLog()
        await link.setStatusHandler { log.add($0) }
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let faulted = await until(20) { await link.currentStatus().detail?.hasSuffix("nothing more is sent") == true }
        XCTAssertTrue(faulted)
        link.framesChanged()
        try await Task.sleep(nanoseconds: 1_500_000_000)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: path)
        let fault = await link.currentStatus()
        XCTAssertEqual(fault.state, .notConnected)
        XCTAssertEqual(shown(fault), [4, 0, 0, 0, 4])
        XCTAssertEqual(server.requests.filter { $0.target == "/v2/process/macos-frames:batch" }.count, 1)
        let firstFault = try XCTUnwrap(log.all.firstIndex { $0.state == .notConnected })
        let afterFault = log.all.dropFirst(firstFault)
        XCTAssertFalse(afterFault.contains { $0.state == .storing || $0.awaiting > 0 }, "\(afterFault)")
        XCTAssertTrue(gate.isOpen, "local capture is not ended by the fault")
        gate.close("user_stop")
        await link.stop()

        // The record becomes unwritable just before the next batch's send is recorded: that batch
        // is never sent, and it is never shown as awaiting an answer.
        let later = ServiceStandIn()
        let laterServer = try LoopbackServer { later.respond($0, $1) }
        defer { laterServer.stop() }
        let laterStub = try stubHost("shown-intent-host", origin: laterServer.origin)
        let laterDirectory = root.appending(path: "shown-intent-link", directoryHint: .isDirectory)
        let laterPath = laterDirectory.path(percentEncoded: false)
        let laterLink = stubLink(laterStub, laterDirectory, framesPerBatch: 4)
        let laterLog = StatusLog()
        await laterLink.setStatusHandler { status in
            laterLog.add(status)
            if status.stored == 4 {
                try? FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: laterPath)
            }
        }
        let laterGate = LiveGate()
        await laterLink.begin(gate: laterGate, session: session) { _ in }
        let laterFault = await until(20) { await laterLink.currentStatus().state == .notConnected }
        XCTAssertTrue(laterFault)
        try await Task.sleep(nanoseconds: 500_000_000)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: laterPath)
        let laterStatus = await laterLink.currentStatus()
        XCTAssertEqual(shown(laterStatus), [4, 0, 0, 0, 4])
        XCTAssertEqual(laterServer.requests.filter { $0.target == "/v2/process/macos-frames:batch" }.count, 1)
        let laterFirst = try XCTUnwrap(laterLog.all.firstIndex { $0.state == .notConnected })
        let laterAfter = laterLog.all.dropFirst(laterFirst)
        XCTAssertFalse(laterAfter.contains { $0.state == .storing || $0.awaiting > 0 }, "\(laterAfter.map { shown($0) })")
        laterGate.close("user_stop")
        await laterLink.stop()
    }

    func testResendIntentIsRecordedShownAndFenced() async throws {
        let session = try writeMacSession(root: root.appending(path: "resend-session", directoryHint: .isDirectory))
        func batches(_ server: LoopbackServer) -> [LoopbackServer.Request] {
            server.requests.filter { $0.target == "/v2/process/macos-frames:batch" }
        }
        func jobStatus(_ directory: URL) throws -> String? {
            let jobs = try XCTUnwrap(try linkStreams(directory).first?["jobs"] as? [[String: Any]])
            return jobs.first?["status"] as? String
        }

        // A batch not taken for a 401 is sent again with a new bearer: its new send is recorded and
        // shown as awaiting an answer before the answer comes.
        let service = ServiceStandIn()
        let hold = Hold()
        let posts = EndLog()
        service.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch" else { return nil }
            let attempt = posts.all.count
            posts.add("post")
            if attempt == 0 { return service.typed(401, "unauthenticated", "0.2.12") }
            if attempt == 1 { hold.wait() }
            return nil
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        defer { hold.release() }
        let stub = try stubHost("resend-host", origin: server.origin)
        let directory = root.appending(path: "resend-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { _ in }
        let resent = await until(30) { posts.all.count == 2 }
        XCTAssertTrue(resent)
        let pending = await link.currentStatus()
        XCTAssertEqual(pending.state, .storing)
        XCTAssertEqual(shown(pending), [0, 7, 0, 0, 1], "awaiting its answer, not \"not sent\"")
        XCTAssertEqual(try jobStatus(directory), "sending")
        XCTAssertEqual(stub.records().count, 2, "a new child and bearer")
        hold.release()
        let stored = await until(20) { await link.currentStatus().stored == 7 }
        XCTAssertTrue(stored)
        XCTAssertEqual(Set(batches(server).map(\.body)).count, 1)
        XCTAssertEqual(Set(batches(server).compactMap { $0.header("Idempotency-Key").first }).count, 1)
        gate.close("user_stop")
        await link.stop()

        // The same, but the record becomes unwritable after the new child is linked: the batch is
        // not sent again, and it is never shown as awaiting an answer.
        let faulty = ServiceStandIn()
        let refused = EndLog()
        faulty.override = { request, _ in
            guard request.target == "/v2/process/macos-frames:batch", refused.all.isEmpty else { return nil }
            refused.add("401")
            return faulty.typed(401, "unauthenticated", "0.2.12")
        }
        let faultyServer = try LoopbackServer { faulty.respond($0, $1) }
        defer { faultyServer.stop() }
        let faultyStub = try stubHost("resend-fault-host", origin: faultyServer.origin)
        let faultyDirectory = root.appending(path: "resend-fault-link", directoryHint: .isDirectory)
        let faultyPath = faultyDirectory.path(percentEncoded: false)
        let faultyLink = stubLink(faultyStub, faultyDirectory)
        let faultyLog = StatusLog()
        let reconnecting = Toggle()
        await faultyLink.setStatusHandler { status in
            faultyLog.add(status)
            if !refused.all.isEmpty, status.state == .connecting { reconnecting.isOn = true }
            if reconnecting.isOn, status.state == .storing {
                try? FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: faultyPath)
            }
        }
        let faultyGate = LiveGate()
        await faultyLink.begin(gate: faultyGate, session: session) { _ in }
        let faulted = await until(30) { await faultyLink.currentStatus().state == .notConnected && reconnecting.isOn }
        XCTAssertTrue(faulted)
        try await Task.sleep(nanoseconds: 500_000_000)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: faultyPath)
        XCTAssertEqual(batches(faultyServer).count, 1, "not sent again without a written record")
        let faultyStatus = await faultyLink.currentStatus()
        XCTAssertEqual(shown(faultyStatus), [0, 0, 0, 0, 8])
        let firstFault = try XCTUnwrap(faultyLog.all.firstIndex { $0.state == .notConnected })
        let afterFault = faultyLog.all.dropFirst(firstFault)
        XCTAssertFalse(afterFault.contains { $0.state == .storing || $0.awaiting > 0 }, "\(afterFault.map { shown($0) })")
        faultyGate.close("user_stop")
        await faultyLink.stop()

        // Stop between planning a batch and sending it: the batch is not sent, never shown as
        // awaiting, and no later status shows the link as up.
        let quiet = ServiceStandIn()
        let quietServer = try LoopbackServer { quiet.respond($0, $1) }
        defer { quietServer.stop() }
        let quietStub = try stubHost("resend-stop-host", origin: quietServer.origin)
        let quietDirectory = root.appending(path: "resend-stop-link", directoryHint: .isDirectory)
        let quietGate = LiveGate()
        let armed = Toggle()
        let quietLog = StatusLog()
        let closedAt = EndLog()
        // The link reads the clock after it checked the gate and before it sends.
        let quietLink = CaptureLink(config: .success(quietStub.config), directory: quietDirectory,
                                    launcher: ProcessHostLauncher(readyTimeout: 10, endGrace: 3),
                                    clock: {
                                        if armed.isOn, quietGate.close("user_stop") { closedAt.add("\(quietLog.all.count)") }
                                        return Date()
                                    }, stopWait: 1)
        await quietLink.setStatusHandler { status in
            quietLog.add(status)
            if status.state == .storing { armed.isOn = true }
        }
        await quietLink.begin(gate: quietGate, session: session) { _ in }
        let closed = await until(20) { !closedAt.all.isEmpty }
        XCTAssertTrue(closed)
        await quietLink.stop()
        XCTAssertFalse(quietServer.requests.contains { $0.target.hasPrefix("/v2/process/originals/") })
        XCTAssertEqual(batches(quietServer).count, 0)
        XCTAssertFalse(quietLog.all.contains { $0.awaiting > 0 }, "\(quietLog.all.map { shown($0) })")
        let from = try XCTUnwrap(closedAt.all.first.flatMap { Int($0) })
        let afterClose = quietLog.all.dropFirst(from)
        XCTAssertFalse(afterClose.contains { $0.state == .storing }, "\(afterClose.map(\.state))")
        let jobs = try XCTUnwrap(try linkStreams(quietDirectory).first?["jobs"] as? [[String: Any]])
        XCTAssertTrue(jobs.allSatisfy { ($0["status"] as? String) == "not_sent" }, "\(jobs)")
        let final = await quietLink.currentStatus()
        XCTAssertEqual(final.state, .stopped)
        XCTAssertEqual(final.countsLine, "0 frame(s) confirmed stored, 0 awaiting an answer, 0 not known, 0 refused, 8 not sent.")
    }

    func testOriginalsOfAnUnsentBatchAreReportedAsAlreadyAccepted() async throws {
        let service = ServiceStandIn()
        let gate = LiveGate()
        let puts = EndLog()
        // The user stops as the third original is accepted: the batch itself is never sent.
        service.override = { request, _ in
            guard request.target.hasPrefix("/v2/process/originals/") else { return nil }
            let answer = service.route(request)
            puts.add("put")
            if puts.all.count == 3 { gate.close("user_stop") }
            return answer
        }
        let server = try LoopbackServer { service.respond($0, $1) }
        defer { server.stop() }
        let stub = try stubHost("accepted-host", origin: server.origin)
        let session = try writeMacSession(root: root.appending(path: "accepted-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "accepted-link", directoryHint: .isDirectory)
        let link = stubLink(stub, directory)
        await link.begin(gate: gate, session: session) { _ in }
        let stopped = await until(20) { !gate.isOpen }
        XCTAssertTrue(stopped)
        await link.stop()
        XCTAssertEqual(puts.all.count, 3)
        XCTAssertFalse(server.requests.contains { $0.target == "/v2/process/macos-frames:batch" })
        let final = await link.currentStatus()
        XCTAssertEqual(final.countsLine, "0 frame(s) confirmed stored, 0 awaiting an answer, 0 not known, 0 refused, 8 not sent.")
        // "Not sent" is about the frames' batch: their accepted originals are said to be there.
        XCTAssertEqual(final.detail, "the stream is stopped; 3 original file(s) of frames not sent were already accepted by "
                       + "the capture service")
        let jobs = try XCTUnwrap(try linkStreams(directory).first?["jobs"] as? [[String: Any]])
        XCTAssertEqual(jobs.first?["status"] as? String, "not_sent")
        XCTAssertEqual(jobs.first?["acceptedOriginals"] as? Int, 3)
    }

    // MARK: - URLSession on a real loopback socket

    func testLoopbackTransportOnARealSocket() async throws {
        let server = try LoopbackServer { request, _ in
            switch request.target {
            case "/redirect":
                return LoopbackServer.Reply(status: 307, headers: [("Location", "/elsewhere")], body: Data("{}".utf8))
            case "/big":
                return LoopbackServer.Reply(status: 200, body: Data(repeating: 0x20, count: 100_000))
            case "/bigerror":
                return LoopbackServer.Reply(status: 403, body: Data(repeating: 0x20, count: 5_000))
            default:
                return LoopbackServer.Reply(status: 200, body: Data("{\"ok\":true}".utf8))
            }
        }
        defer { server.stop() }
        let transport = LoopbackHTTPTransport(requestTimeout: 5, resourceTimeout: 10)
        func request(_ path: String) throws -> URLRequest {
            var request = URLRequest(url: try XCTUnwrap(URL(string: server.origin + path)))
            request.httpMethod = "POST"
            request.setValue("Bearer " + Self.uploadToken, forHTTPHeaderField: "Authorization")
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.setValue("synthetic-key-1", forHTTPHeaderField: "Idempotency-Key")
            request.httpBody = Data("{\"a\":1}".utf8)
            return request
        }
        let echoed = try await transport.send(try request("/echo"), responseLimit: 64 * 1024)
        XCTAssertEqual(echoed.status, 200)
        XCTAssertEqual(echoed.body, Data("{\"ok\":true}".utf8))
        let seen = try XCTUnwrap(server.requests.first)
        XCTAssertEqual(seen.method, "POST")
        XCTAssertEqual(seen.header("Host"), ["127.0.0.1:\(server.port)"])
        XCTAssertEqual(seen.header("Authorization"), ["Bearer " + Self.uploadToken], "the bearer reaches the socket")
        XCTAssertEqual(seen.header("Content-Type"), ["application/json; charset=utf-8"])
        XCTAssertEqual(seen.header("Idempotency-Key"), ["synthetic-key-1"])
        XCTAssertEqual(seen.header("Origin"), [])
        XCTAssertEqual(seen.header("Cookie"), [])
        XCTAssertEqual(seen.body, Data("{\"a\":1}".utf8))

        // A redirect is the answer: nothing is sent to its location.
        let redirected = try await transport.send(try request("/redirect"), responseLimit: 64 * 1024)
        XCTAssertEqual(redirected.status, 307)
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertFalse(server.requests.contains { $0.target == "/elsewhere" }, "the redirect was not followed")

        // Replies are read to their bounds only.
        let big = try await transport.send(try request("/big"), responseLimit: 64 * 1024)
        XCTAssertEqual(big.status, 200)
        XCTAssertNil(big.body)
        let bigError = try await transport.send(try request("/bigerror"), responseLimit: 64 * 1024)
        XCTAssertEqual(bigError.status, 403)
        XCTAssertNil(bigError.body, "an error reply is read to at most 4097 bytes")
    }
}
