import Foundation
import FoundationNetworking
import Glibc
import Foundation

// The trusted foreground capture host (`python -m services.api.desktop_local`), run as this app's
// own child for one stream registration:
// - the configuration names only the interpreter, the repository and the file holding the
//   database connection string, plus the nonsecret identities; it holds no secret;
// - the connection string is read from its owner-only file at each launch and never copied; the
//   bearer is random per launch and held in memory only;
// - both reach the child only in its one startup record on a private stdin pipe, never argv, the
//   environment, a file, a log or the UI; stdin stays open for the child's life, so EOF asks it
//   to stop;
// - READY is believed only in its exact form, and says nothing about live permission: the caller
//   reads the stream state itself (`CaptureControl`);
// - nothing the child writes is shown; only the host's fixed error codes are recognized.
// Ending the child ends only this process: it is not a server Stop or a physical capture stop.

/// Why the capture host cannot be used; the reason is fixed text, never a path's content.
public enum CaptureHostProblem: Error, Equatable, Sendable {
    /// No configuration file: the development capture service is not set up on this Mac.
    case notConfigured
    case invalid(String)
}

/// Where the development capture host runs and whose streams it registers. Nothing here is secret.
public struct CaptureHostConfig: Equatable, Sendable {
    public static let format = "lc-macos-dev-capture-host/v1"
    /// The Python interpreter of the repository's backend environment.
    public let python: URL
    /// The repository root holding `services/api/desktop_local.py`; the child's working directory.
    public let repository: URL
    /// An owner-only file holding the PostgreSQL connection string, read at each launch.
    public let dsnFile: URL
    public let userID: String
    public let deviceID: String
    public let sessionID: String
    /// Stable for this capture path, so each new stream declares its predecessor.
    public let producerID: String

    public init(python: URL, repository: URL, dsnFile: URL, userID: String, deviceID: String, sessionID: String,
                producerID: String) {
        self.python = python
        self.repository = repository
        self.dsnFile = dsnFile
        self.userID = userID
        self.deviceID = deviceID
        self.sessionID = sessionID
        self.producerID = producerID
    }

    /// `~/Library/Application Support/CompanionDesktop/capture-host.json`.
    public static var defaultLocation: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "CompanionDesktop/capture-host.json")
    }

    /// The configuration file: one JSON object with exactly `format`, `python`, `repository`,
    /// `dsn_file`, `user_id`, `device_id`, `session_id` and `producer_id`.
    public static func load(_ file: URL = defaultLocation) -> Result<CaptureHostConfig, CaptureHostProblem> {
        guard RetainedOriginal.entryType(file) != nil else { return .failure(.notConfigured) }
        guard RetainedOriginal.entryType(file) == .typeRegular, let data = try? Data(contentsOf: file), data.count <= 16_384,
              let object = MacIngressUpload.closed(MacIngressUpload.object(data),
                                                   ["format", "python", "repository", "dsn_file", "user_id", "device_id",
                                                    "session_id", "producer_id"]),
              MacIngressUpload.same(object["format"], format) else {
            return .failure(.invalid("the configuration is not one \(format) object with exactly its eight members"))
        }
        func path(_ key: String) -> URL? {
            guard let text = object[key] as? String, text.hasPrefix("/"), text.count <= 4096,
                  !text.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7F }) else { return nil }
            return URL(fileURLWithPath: text)
        }
        guard let python = path("python"), let repository = path("repository"), let dsnFile = path("dsn_file") else {
            return .failure(.invalid("python, repository and dsn_file must be absolute paths without control characters"))
        }
        let ids = ["user_id", "device_id", "session_id", "producer_id"].map { object[$0] as? String ?? "" }
        guard ids.allSatisfy(DesktopIngress.isIdentifier) else {
            return .failure(.invalid("user_id, device_id, session_id and producer_id must be contract Identifiers"))
        }
        guard FileManager.default.isExecutableFile(atPath: python.path(percentEncoded: false)) else {
            return .failure(.invalid("the python path is not an executable file"))
        }
        let host = repository.appending(path: "services/api/desktop_local.py")
        guard RetainedOriginal.entryType(host) == .typeRegular else {
            return .failure(.invalid("the repository has no services/api/desktop_local.py"))
        }
        return .success(CaptureHostConfig(python: python, repository: repository, dsnFile: dsnFile, userID: ids[0],
                                          deviceID: ids[1], sessionID: ids[2], producerID: ids[3]))
    }

    /// The connection string: a regular file (not a link) owned by this user, readable by nobody
    /// else, of one line at most 8192 characters. It is checked and read through one descriptor.
    /// Its content is not interpreted here.
    func readDSN() -> Result<String, CaptureHostProblem> {
        let descriptor = open(dsnFile.path(percentEncoded: false), O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard descriptor >= 0 else { return .failure(.invalid("the dsn_file cannot be opened as a regular file (not a link)")) }
        defer { close(descriptor) }
        var info = stat()
        guard fstat(descriptor, &info) == 0, info.st_mode & S_IFMT == S_IFREG else {
            return .failure(.invalid("the dsn_file is not a regular file"))
        }
        guard info.st_uid == getuid(), info.st_mode & 0o077 == 0 else {
            return .failure(.invalid("the dsn_file must be owned by this user and readable by nobody else (chmod 600)"))
        }
        var bytes = [UInt8](repeating: 0, count: 8194)
        var count = 0
        while count < bytes.count {
            let got = bytes.withUnsafeMutableBytes { buffer in
                read(descriptor, buffer.baseAddress! + count, buffer.count - count)
            }
            if got < 0, errno == EINTR { continue }
            guard got >= 0 else { return .failure(.invalid("the dsn_file cannot be read")) }
            if got == 0 { break }
            count += got
        }
        guard count <= 8193, var text = String(bytes: bytes[0..<count], encoding: .utf8) else {
            return .failure(.invalid("the dsn_file is not UTF-8 text of at most 8192 characters"))
        }
        if text.hasSuffix("\n") { text.removeLast() }
        guard !text.isEmpty, text.count <= 8192, !text.unicodeScalars.contains(where: { $0.value < 0x20 }) else {
            return .failure(.invalid("the dsn_file must hold one non-empty line"))
        }
        return .success(text)
    }
}

/// The host's READY record, believed only in its exact form.
public struct HostReady: Equatable, Sendable {
    /// Exactly `http://127.0.0.1:<port>`.
    public let origin: String
    /// `pending` (the start grant exists, nothing registered) or `consumed` (registered; its state
    /// is read separately).
    public let startStatus: String

    static func parse(_ line: Data) -> HostReady? {
        guard let object = MacIngressUpload.closed(MacIngressUpload.object(line), ["format", "status", "origin", "start_status"]),
              MacIngressUpload.same(object["format"], "lc-desktop-capture-host-ready-v1"),
              MacIngressUpload.same(object["status"], "ready"),
              let status = object["start_status"] as? String, ["pending", "consumed"].contains(status),
              let origin = object["origin"] as? String, let exact = MacIngressAuthority.loopbackOrigin(origin), exact == origin,
              !["http://127.0.0.1:4173", "http://127.0.0.1:8174"].contains(origin) else {
            return nil
        }
        return HostReady(origin: origin, startStatus: status)
    }
}

/// How a launch failed. `delivered` says whether the whole startup record reached the child, so a
/// start grant may exist although no READY came.
public struct HostLaunchFailure: Error, Equatable, Sendable {
    /// Fixed words.
    public let reason: String
    /// The host's own fixed error code, when it wrote exactly its error record.
    public let code: String?
    public let delivered: Bool
}

/// Launches one host for one registration. Injectable for tests.
public protocol CaptureHostLauncher: Sendable {
    func launch(_ config: CaptureHostConfig, record: Data) async -> Result<(any CaptureHostHandle, HostReady), HostLaunchFailure>
}

/// A running host: it ends when asked, or on its own.
public protocol CaptureHostHandle: AnyObject, Sendable {
    var hasExited: Bool { get }
    /// Called once, off the main thread, when the child exits (also after `end`).
    func onExit(_ handler: @escaping @Sendable () -> Void)
    /// EOF, then a bounded wait, then SIGTERM and SIGKILL of this child only. True when it exited
    /// on its own after EOF.
    func end() async -> Bool
}

/// The real child process.
public struct ProcessHostLauncher: CaptureHostLauncher {
    public var readyTimeout: TimeInterval
    public var endGrace: TimeInterval

    /// Engineering defaults: the host's own 10 s startup bound plus import time; its 5 s shutdown
    /// bound plus margin.
    public init(readyTimeout: TimeInterval = 15, endGrace: TimeInterval = 8) {
        self.readyTimeout = readyTimeout
        self.endGrace = endGrace
    }

    public func launch(_ config: CaptureHostConfig, record: Data) async -> Result<(any CaptureHostHandle, HostReady), HostLaunchFailure> {
        await HostProcess.launch(config, record: record, readyTimeout: readyTimeout, endGrace: endGrace)
    }
}

/// One-time value handed from a callback thread to one async waiter.
final class OneShot<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value?
    private var waiter: CheckedContinuation<Value, Never>?

    func resolve(_ newValue: Value) {
        lock.lock()
        guard value == nil else {
            lock.unlock()
            return
        }
        value = newValue
        let waiting = waiter
        waiter = nil
        lock.unlock()
        waiting?.resume(returning: newValue)
    }

    func wait() async -> Value {
        await withCheckedContinuation { (continuation: CheckedContinuation<Value, Never>) in
            lock.lock()
            if let value {
                lock.unlock()
                continuation.resume(returning: value)
            } else {
                waiter = continuation
                lock.unlock()
            }
        }
    }
}

final class HostProcess: CaptureHostHandle, @unchecked Sendable {
    private enum Early: Sendable {
        case ready(Data)
        case violation
        case exited
        case timeout
    }

    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private let errors = Pipe()
    private let endGrace: TimeInterval
    private let lock = NSLock()
    private var stdout = Data()
    private var stderr = Data()
    private var readyLine: Data?
    private var exitHandlers: [@Sendable () -> Void] = []
    private var exited = false
    private var inputClosed = false
    private let early = OneShot<Early>()

    private init(endGrace: TimeInterval) {
        self.endGrace = endGrace
    }

    static func launch(_ config: CaptureHostConfig, record: Data, readyTimeout: TimeInterval,
                       endGrace: TimeInterval) async -> Result<(any CaptureHostHandle, HostReady), HostLaunchFailure> {
        let host = HostProcess(endGrace: endGrace)
        let process = host.process
        process.executableURL = config.python
        // Exactly the module and nothing else: no option, secret or configuration in argv.
        process.arguments = ["-m", "services.api.desktop_local"]
        process.currentDirectoryURL = config.repository
        process.environment = childEnvironment(ProcessInfo.processInfo.environment)
        process.standardInput = host.input
        process.standardOutput = host.output
        process.standardError = host.errors
        // A dead child's stdin must not raise SIGPIPE in this app; other children must not inherit
        // this app's ends of the pipes.
        _ = fcntl(host.input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
        for handle in [host.input.fileHandleForWriting, host.output.fileHandleForReading, host.errors.fileHandleForReading] {
            _ = fcntl(handle.fileDescriptor, F_SETFD, FD_CLOEXEC)
        }
        // At EOF a handler sees empty data once and is removed, so it does not spin.
        host.output.fileHandleForReading.readabilityHandler = { [weak host] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil } else { host?.stdoutData(data) }
        }
        host.errors.fileHandleForReading.readabilityHandler = { [weak host] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil } else { host?.stderrData(data) }
        }
        process.terminationHandler = { [weak host] _ in host?.childExited() }
        do {
            try process.run()
        } catch {
            host.stopReading()
            return .failure(HostLaunchFailure(reason: "the capture host could not be started", code: nil, delivered: false))
        }
        // The host acts only on one complete line; an incomplete write is known not delivered.
        guard host.writeAll(record, within: readyTimeout) else {
            _ = await host.end()
            return .failure(HostLaunchFailure(reason: "the startup record could not be delivered", code: host.errorCode(),
                                              delivered: false))
        }
        let timer = Task {
            try? await Task.sleep(nanoseconds: UInt64(max(readyTimeout, 0) * 1_000_000_000))
            host.early.resolve(.timeout)
        }
        // A cancelled caller (Stop's bound) gets its answer at once; the child is still ended.
        let first = await withTaskCancellationHandler {
            await host.early.wait()
        } onCancel: {
            host.early.resolve(.timeout)
        }
        timer.cancel()
        switch first {
        case .ready(let line):
            if let ready = HostReady.parse(line) {
                return .success((host, ready))
            }
            _ = await host.end()
            return .failure(HostLaunchFailure(reason: "the capture host answered with a READY that is not believed", code: nil,
                                              delivered: true))
        case .violation:
            _ = await host.end()
            return .failure(HostLaunchFailure(reason: "the capture host wrote more than one READY line", code: nil, delivered: true))
        case .exited:
            host.drainErrors()
            return .failure(HostLaunchFailure(reason: "the capture host ended before READY", code: host.errorCode(), delivered: true))
        case .timeout:
            _ = await host.end()
            return .failure(HostLaunchFailure(reason: "the capture host was not ready in time", code: host.errorCode(),
                                              delivered: true))
        }
    }

    /// The parent's environment without variables the interpreter or libpq would act on.
    static func childEnvironment(_ parent: [String: String]) -> [String: String] {
        var environment = parent.filter { key, _ in
            let upper = key.uppercased()
            return !(upper.hasPrefix("LC_") || upper.hasPrefix("PYTHON") || upper.hasPrefix("PG"))
        }
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        return environment
    }

    /// Writes the whole record, never blocking past `seconds`: a child that closed its stdin,
    /// exited or stopped reading gets no more bytes (EPIPE is an error here, never a signal).
    private func writeAll(_ data: Data, within seconds: TimeInterval) -> Bool {
        let descriptor = input.fileHandleForWriting.fileDescriptor
        let flags = fcntl(descriptor, F_GETFL)
        guard flags >= 0, fcntl(descriptor, F_SETFL, flags | O_NONBLOCK) == 0 else { return false }
        let deadline = Date().addingTimeInterval(max(seconds, 0))
        return data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) -> Bool in
            guard let base = buffer.baseAddress else { return data.isEmpty }
            var offset = 0
            while offset < buffer.count {
                let written = write(descriptor, base + offset, buffer.count - offset)
                if written > 0 {
                    offset += written
                    continue
                }
                if written < 0, errno == EINTR { continue }
                guard written < 0, errno == EAGAIN else { return false }
                let remaining = deadline.timeIntervalSinceNow
                guard remaining > 0 else { return false }
                var ready = pollfd(fd: descriptor, events: Int16(POLLOUT), revents: 0)
                _ = poll(&ready, 1, Int32(min(remaining, 1) * 1000) + 1)
            }
            return true
        }
    }

    private func stdoutData(_ data: Data) {
        guard !data.isEmpty else { return }
        lock.lock()
        if readyLine != nil {
            // Anything after READY is a protocol violation: the host is ended.
            lock.unlock()
            Task { _ = await self.end() }
            return
        }
        stdout.append(data)
        let line: Data?
        let violation: Bool
        if let newline = stdout.firstIndex(of: 0x0A) {
            let remainder = stdout.index(after: newline) < stdout.endIndex
            line = remainder ? nil : Data(stdout[stdout.startIndex..<newline])
            violation = remainder
            readyLine = line
        } else {
            line = nil
            violation = stdout.count > 4096
        }
        lock.unlock()
        if violation {
            early.resolve(.violation)
        } else if let line {
            early.resolve(.ready(line))
        }
    }

    private func stderrData(_ data: Data) {
        lock.lock()
        if stderr.count < 4096 {
            stderr.append(data.prefix(4096 - stderr.count))
        }
        lock.unlock()
    }

    /// The host's fixed error code when stderr is exactly its one error record.
    private func errorCode() -> String? {
        lock.lock()
        let text = stderr
        lock.unlock()
        let codes: Set<String> = ["invalid_startup", "unavailable", "parent_input_lost", "unexpected_input", "startup_timeout",
                                  "shutdown_timeout"]
        guard text.last == 0x0A, text.filter({ $0 == 0x0A }).count == 1,
              let record = MacIngressUpload.closed(MacIngressUpload.object(Data(text.dropLast())), ["format", "error"]),
              MacIngressUpload.same(record["format"], "lc-desktop-capture-host-error-v1"),
              let code = record["error"] as? String, codes.contains(code) else { return nil }
        return code
    }

    private func childExited() {
        lock.lock()
        exited = true
        let handlers = exitHandlers
        exitHandlers = []
        lock.unlock()
        early.resolve(.exited)
        handlers.forEach { $0() }
    }

    private func stopReading() {
        output.fileHandleForReading.readabilityHandler = nil
        errors.fileHandleForReading.readabilityHandler = nil
    }

    /// After the child exited: the rest of its stderr (bounded), which the handler may not have
    /// seen yet when the exit was reported.
    private func drainErrors() {
        stopReading()
        if let rest = try? errors.fileHandleForReading.read(upToCount: 4096) {
            stderrData(rest)
        }
    }

    var hasExited: Bool {
        lock.lock()
        defer { lock.unlock() }
        return exited
    }

    func onExit(_ handler: @escaping @Sendable () -> Void) {
        lock.lock()
        if exited {
            lock.unlock()
            handler()
            return
        }
        exitHandlers.append(handler)
        lock.unlock()
    }

    func end() async -> Bool {
        let closeInput: Bool = lock.withLock {
            let first = !inputClosed
            inputClosed = true
            return first
        }
        if closeInput {
            try? input.fileHandleForWriting.close()
        }
        var bySelf = await waitForExit(endGrace)
        if !bySelf, process.isRunning {
            process.terminate()
            let terminated = await waitForExit(2)
            if !terminated {
                kill(process.processIdentifier, SIGKILL)
                _ = await waitForExit(2)
            }
            bySelf = false
        }
        stopReading()
        return bySelf
    }

    /// Waits for this child's own exit, bounded, whatever the caller's cancellation: the child is
    /// always ended and reaped.
    private func waitForExit(_ seconds: TimeInterval) async -> Bool {
        let done = OneShot<Bool>()
        onExit { done.resolve(true) }
        DispatchQueue.global().asyncAfter(deadline: .now() + max(seconds, 0)) { done.resolve(false) }
        let exited = await done.wait()
        return exited || hasExited
    }
}
