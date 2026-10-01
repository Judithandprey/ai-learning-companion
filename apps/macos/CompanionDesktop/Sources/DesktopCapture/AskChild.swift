import Darwin
import Foundation

// The subscription connector (`python -m services.worker.connectors.chatgpt_local`) as this app's
// own foreground child, in the same way as the capture host:
// - the configuration names only the interpreter and the repository, and optionally where the
//   connector keeps its own product state and which `codex` it runs; it holds no secret;
// - the child gets a minimal environment: no inherited API key, provider, database or
//   development-runtime variable;
// - requests go as JSON lines on a private stdin pipe held open for the child's life (EOF asks it
//   to stop, with its own Codex child); answers and events come as JSON lines on stdout; nothing
//   it writes to stderr is read, shown or logged;
// - one writer writes the lines in order. A line can be taken back until its last byte is
//   written (`AskRevocation`); a line cut off part way is never completed, nothing follows it
//   into the pipe, and the child is ended;
// - there is no startup record and no READY line: the first `connection/read` is the handshake.
// The connector and Codex own the official login and its tokens. This app never opens, copies or
// shows a credential file, and ending this child logs out nothing else.

/// Where the connector runs. Nothing here is secret.
public struct AskConnectorConfig: Equatable, Sendable {
    public static let format = "lc-macos-dev-ask-connector/v1"
    public static let module = "services.worker.connectors.chatgpt_local"
    public let python: URL
    /// The repository root holding the connector module; the child's working directory.
    public let repository: URL
    /// Optional: the connector's own product state directory and `codex` binary
    /// (`LC_SUBSCRIPTION_STATE_DIR`, `LC_SUBSCRIPTION_CODEX_BIN`). Without them the connector uses
    /// its defaults.
    public let stateDirectory: URL?
    public let codexBinary: URL?

    public init(python: URL, repository: URL, stateDirectory: URL? = nil, codexBinary: URL? = nil) {
        self.python = python
        self.repository = repository
        self.stateDirectory = stateDirectory
        self.codexBinary = codexBinary
    }

    /// `~/Library/Application Support/CompanionDesktop/ask-connector.json`.
    public static var defaultLocation: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "CompanionDesktop/ask-connector.json")
    }

    /// The configuration file: one JSON object with `format`, `python` and `repository`, and
    /// optionally `state_dir` and `codex_bin`; every path absolute.
    public static func load(_ file: URL = defaultLocation) -> Result<AskConnectorConfig, CaptureHostProblem> {
        guard RetainedOriginal.entryType(file) != nil else { return .failure(.notConfigured) }
        let required: Set<String> = ["format", "python", "repository"]
        let optional: Set<String> = ["state_dir", "codex_bin"]
        guard RetainedOriginal.entryType(file) == .typeRegular, let data = try? Data(contentsOf: file), data.count <= 16_384,
              let object = MacIngressUpload.object(data), required.isSubset(of: object.keys),
              Set(object.keys).isSubset(of: required.union(optional)), MacIngressUpload.same(object["format"], format) else {
            return .failure(.invalid("the configuration is not one \(format) object with format, python and repository"))
        }
        func path(_ key: String) -> URL? {
            guard let text = object[key] as? String, text.hasPrefix("/"), text.count <= 4096,
                  !text.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) else { return nil }
            return URL(fileURLWithPath: text)
        }
        guard let python = path("python"), let repository = path("repository"),
              object["state_dir"] == nil || path("state_dir") != nil, object["codex_bin"] == nil || path("codex_bin") != nil else {
            return .failure(.invalid("every path must be absolute, without control characters"))
        }
        guard FileManager.default.isExecutableFile(atPath: python.path(percentEncoded: false)) else {
            return .failure(.invalid("the python path is not an executable file"))
        }
        // The module as a file or as a package.
        let connectors = repository.appending(path: "services/worker/connectors", directoryHint: .isDirectory)
        guard RetainedOriginal.entryType(connectors.appending(path: "chatgpt_local.py")) == .typeRegular
                || RetainedOriginal.entryType(connectors.appending(path: "chatgpt_local/__main__.py")) == .typeRegular else {
            return .failure(.invalid("the repository has no services/worker/connectors/chatgpt_local"))
        }
        if let codex = path("codex_bin"), !FileManager.default.isExecutableFile(atPath: codex.path(percentEncoded: false)) {
            return .failure(.invalid("the codex_bin path is not an executable file"))
        }
        return .success(AskConnectorConfig(python: python, repository: repository, stateDirectory: path("state_dir"),
                                           codexBinary: path("codex_bin")))
    }

    /// The child's whole environment: what a program needs to run and find the user's home, the
    /// two connector settings, and nothing else of the parent's.
    func environment(_ parent: [String: String]) -> [String: String] {
        var environment = parent.filter { ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "SHELL"].contains($0.key) }
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        if let stateDirectory {
            environment["LC_SUBSCRIPTION_STATE_DIR"] = stateDirectory.path(percentEncoded: false)
        }
        if let codexBinary {
            environment["LC_SUBSCRIPTION_CODEX_BIN"] = codexBinary.path(percentEncoded: false)
        }
        return environment
    }
}

/// Lets the sender take back one line that has not been delivered whole.
///
/// A line is delivered only when its last byte, the newline, has been written: the connector acts
/// on nothing less (it refuses a line without its newline). Taking a line back and writing its
/// last byte exclude each other, so after `revoke()` returns true that line never becomes one the
/// connector can act on:
/// - a line still waiting to be written is dropped, and the pipe stays as it was;
/// - a line written in part is abandoned, and the child is ended, because its pipe can carry
///   nothing more. It is never completed, and nothing is sent in its place.
public final class AskRevocation: @unchecked Sendable {
    private let lock = NSLock()
    private var revoked = false
    private var delivered = false
    private var inPart = false

    public init() {}

    /// Takes the line back. False when it was already delivered whole.
    @discardableResult
    public func revoke() -> Bool {
        lock.withLock {
            guard !delivered else { return false }
            revoked = true
            return true
        }
    }

    public var isRevoked: Bool { lock.withLock { revoked } }

    /// The line was taken back after some of its bytes had been written.
    public var wasWrittenInPart: Bool { lock.withLock { inPart } }

    /// For the writer: one write step of a line with `remaining` bytes left, unless the line was
    /// taken back (then nil). `write` must not block; it returns the bytes it wrote, or less than
    /// one. Writing the last byte and marking the line delivered are one step.
    func attempt(remaining: Int, started: Bool, _ write: () -> Int) -> Int? {
        lock.withLock {
            guard !revoked else {
                inPart = inPart || started
                return nil
            }
            let written = write()
            if written == remaining { delivered = true }
            return written
        }
    }
}

/// A running connector child.
public protocol AskChild: AnyObject, Sendable {
    var hasExited: Bool { get }
    /// Writes one whole line; true only when all of it, its newline included, was written. False
    /// when it was taken back through `revocation`, or could not be written in time: it is then
    /// never delivered. Never blocks the caller's thread for long.
    func send(_ line: Data, revocation: AskRevocation?) async -> Bool
    /// EOF, then a bounded wait, then SIGTERM and SIGKILL of this child only.
    func end() async
}

extension AskChild {
    func send(_ line: Data) async -> Bool {
        await send(line, revocation: nil)
    }
}

/// Launches the connector. Injectable for tests. `onLine` gets each stdout line without its
/// newline, in order; `onExit` is called once, when the child has exited or broke the line rules.
public protocol AskChildLauncher: Sendable {
    func launch(_ config: AskConnectorConfig, onLine: @escaping @Sendable (Data) -> Void,
                onExit: @escaping @Sendable () -> Void) -> (any AskChild)?
}

/// The real child process.
public struct ProcessAskLauncher: AskChildLauncher {
    public var sendTimeout: TimeInterval
    public var endGrace: TimeInterval

    /// Engineering defaults: 30 s to hand a request to the child, 8 s for it to end after EOF.
    public init(sendTimeout: TimeInterval = 30, endGrace: TimeInterval = 8) {
        self.sendTimeout = sendTimeout
        self.endGrace = endGrace
    }

    public func launch(_ config: AskConnectorConfig, onLine: @escaping @Sendable (Data) -> Void,
                       onExit: @escaping @Sendable () -> Void) -> (any AskChild)? {
        AskProcess.launch(config, sendTimeout: sendTimeout, endGrace: endGrace, onLine: onLine, onExit: onExit)
    }
}

final class AskProcess: AskChild, @unchecked Sendable {
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private let errors = Pipe()
    private let sendTimeout: TimeInterval
    private let endGrace: TimeInterval
    private let onLine: @Sendable (Data) -> Void
    private let onExit: @Sendable () -> Void
    private let lock = NSLock()
    private let writes = DispatchQueue(label: "ask-connector.stdin")
    private var buffer = Data()
    private var exited = false
    private var reported = false
    /// A line broke the bound: nothing more from this child is passed on.
    private var violated = false
    private var inputClosed = false
    /// A line was cut off part way: nothing may follow it into the pipe.
    private var cutOff = false
    private var exitWaiters: [OneShot<Bool>] = []

    private init(sendTimeout: TimeInterval, endGrace: TimeInterval, onLine: @escaping @Sendable (Data) -> Void,
                 onExit: @escaping @Sendable () -> Void) {
        self.sendTimeout = sendTimeout
        self.endGrace = endGrace
        self.onLine = onLine
        self.onExit = onExit
    }

    static func launch(_ config: AskConnectorConfig, sendTimeout: TimeInterval, endGrace: TimeInterval,
                       onLine: @escaping @Sendable (Data) -> Void, onExit: @escaping @Sendable () -> Void) -> (any AskChild)? {
        let child = AskProcess(sendTimeout: sendTimeout, endGrace: endGrace, onLine: onLine, onExit: onExit)
        let process = child.process
        process.executableURL = config.python
        // Exactly the module: no option, path or secret in argv.
        process.arguments = ["-m", AskConnectorConfig.module]
        process.currentDirectoryURL = config.repository
        process.environment = config.environment(ProcessInfo.processInfo.environment)
        process.standardInput = child.input
        process.standardOutput = child.output
        process.standardError = child.errors
        _ = fcntl(child.input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
        for handle in [child.input.fileHandleForWriting, child.output.fileHandleForReading, child.errors.fileHandleForReading] {
            _ = fcntl(handle.fileDescriptor, F_SETFD, FD_CLOEXEC)
        }
        child.output.fileHandleForReading.readabilityHandler = { [weak child] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil } else { child?.received(data) }
        }
        // Read and dropped, so the child never blocks on it; never shown or logged.
        child.errors.fileHandleForReading.readabilityHandler = { handle in
            if handle.availableData.isEmpty { handle.readabilityHandler = nil }
        }
        process.terminationHandler = { [weak child] _ in child?.childExited() }
        do {
            try process.run()
        } catch {
            child.output.fileHandleForReading.readabilityHandler = nil
            child.errors.fileHandleForReading.readabilityHandler = nil
            return nil
        }
        return child
    }

    /// Whole lines in order. A line longer than the bound is not a connector line: from then on
    /// nothing this child writes is passed on or kept, it is reported as gone at once, and it is ended.
    private func received(_ data: Data) {
        var lines: [Data] = []
        var report = false
        let broke: Bool = lock.withLock {
            guard !violated else { return false }
            buffer.append(data)
            while let newline = buffer.firstIndex(of: 0x0A) {
                lines.append(Data(buffer[buffer.startIndex..<newline]))
                buffer = Data(buffer[buffer.index(after: newline)...])
            }
            guard buffer.count > AskWire.maxIncomingLine || lines.contains(where: { $0.count > AskWire.maxIncomingLine }) else {
                return false
            }
            violated = true
            buffer = Data()
            report = !reported
            reported = true
            return true
        }
        guard !broke else {
            if report { onExit() }
            Task { await self.end() }
            return
        }
        lines.forEach(onLine)
    }

    private func childExited() {
        let (waiters, first): ([OneShot<Bool>], Bool) = lock.withLock {
            exited = true
            let first = !reported
            reported = true
            let waiting = exitWaiters
            exitWaiters = []
            return (waiting, first)
        }
        waiters.forEach { $0.resolve(true) }
        if first { onExit() }
    }

    var hasExited: Bool { lock.withLock { exited } }

    func send(_ line: Data, revocation: AskRevocation?) async -> Bool {
        // `ends`: this send found the child unusable for its line (cut off part way, or not taken
        // in time), so it ends the child. A send that only met a closed or closing pipe does not.
        let done = OneShot<(delivered: Bool, ends: Bool)>()
        let deadline = Date().addingTimeInterval(max(sendTimeout, 0))
        // On its own queue: a child that reads slowly never blocks the caller's thread. The pipe is
        // checked and taken there, in order with its close, so nothing is written once it is closed.
        writes.async {
            guard !self.closing() else {
                done.resolve((false, false))
                return
            }
            let result = Self.writeAll(line, to: self.input.fileHandleForWriting.fileDescriptor, until: deadline,
                                       revocation: revocation, stopped: self.closing)
            let closing = self.closing()
            // Marked here, on the writer's own queue, so no line queued behind it is appended
            // to the part that was written.
            if !result.delivered, result.written > 0 { self.lock.withLock { self.cutOff = true } }
            // A line taken back before its first byte leaves the pipe as it was.
            done.resolve((result.delivered, !result.delivered && !closing && (result.written > 0 || revocation?.isRevoked != true)))
        }
        let result = await done.wait()
        if result.ends { await end() }
        return result.delivered
    }

    /// The pipe is closed or closing, or the child is gone: nothing more is written.
    private func closing() -> Bool {
        lock.withLock { inputClosed || exited || cutOff }
    }

    /// Writes all of `data`, never past `deadline`, never once `stopped`, and never after the line
    /// was taken back; EPIPE is an error here, never a signal. `written` is how many bytes went
    /// into the pipe.
    private static func writeAll(_ data: Data, to descriptor: Int32, until deadline: Date, revocation: AskRevocation?,
                                 stopped: () -> Bool) -> (delivered: Bool, written: Int) {
        let flags = fcntl(descriptor, F_GETFL)
        guard flags >= 0, fcntl(descriptor, F_SETFL, flags | O_NONBLOCK) == 0 else { return (false, 0) }
        return data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) -> (delivered: Bool, written: Int) in
            guard let base = buffer.baseAddress else { return (data.isEmpty, 0) }
            var offset = 0
            while offset < buffer.count {
                guard !stopped() else { return (false, offset) }
                var failure: Int32 = 0
                let step = {
                    let count = write(descriptor, base + offset, buffer.count - offset)
                    if count < 0 { failure = errno }
                    return count
                }
                let written: Int
                if let revocation {
                    guard let count = revocation.attempt(remaining: buffer.count - offset, started: offset > 0, step) else {
                        return (false, offset)
                    }
                    written = count
                } else {
                    written = step()
                }
                if written > 0 {
                    offset += written
                    continue
                }
                if written < 0, failure == EINTR { continue }
                guard written < 0, failure == EAGAIN else { return (false, offset) }
                let remaining = deadline.timeIntervalSinceNow
                guard remaining > 0 else { return (false, offset) }
                // Short waits, so a line taken back or a closing pipe is noticed soon.
                var ready = pollfd(fd: descriptor, events: Int16(POLLOUT), revents: 0)
                _ = poll(&ready, 1, Int32(min(remaining, 0.1) * 1000) + 1)
            }
            return (true, offset)
        }
    }

    func end() async {
        let closeInput: Bool = lock.withLock {
            let first = !inputClosed
            inputClosed = true
            return first
        }
        if closeInput {
            // After any write in progress, so the descriptor is not closed under it.
            let closed = OneShot<Bool>()
            writes.async {
                try? self.input.fileHandleForWriting.close()
                closed.resolve(true)
            }
            _ = await closed.wait()
        }
        let bySelf = await waitForExit(endGrace)
        if !bySelf, process.isRunning {
            process.terminate()
            let terminated = await waitForExit(2)
            if !terminated {
                kill(process.processIdentifier, SIGKILL)
                _ = await waitForExit(2)
            }
        }
        output.fileHandleForReading.readabilityHandler = nil
        errors.fileHandleForReading.readabilityHandler = nil
    }

    /// Waits for this child's own exit, bounded, whatever the caller's cancellation.
    private func waitForExit(_ seconds: TimeInterval) async -> Bool {
        let done = OneShot<Bool>()
        let already: Bool = lock.withLock {
            if exited { return true }
            exitWaiters.append(done)
            return false
        }
        if already { return true }
        DispatchQueue.global().asyncAfter(deadline: .now() + max(seconds, 0)) { done.resolve(false) }
        let ended = await done.wait()
        return ended || hasExited
    }
}
