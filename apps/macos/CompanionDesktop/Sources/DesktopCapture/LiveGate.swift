import Foundation

/// Whether one capture may still be presented as live. Closing is immediate and thread-safe, so
/// Stop, a stream error or a disconnected display ends live claims before the stream has finished
/// stopping and before the recorder has written its ending. A gate never reopens; the first
/// closure's reason and time are kept.
public final class LiveGate: @unchecked Sendable {
    public struct Closure: Equatable, Sendable {
        public let reason: String
        /// `HostClock` seconds.
        public let host: Double
    }

    private let lock = NSLock()
    private var closed: Closure?

    public init() {}

    public var isOpen: Bool {
        lock.lock()
        defer { lock.unlock() }
        return closed == nil
    }

    public var closure: Closure? {
        lock.lock()
        defer { lock.unlock() }
        return closed
    }

    /// Returns true if this call closed the gate, false if it was already closed.
    @discardableResult
    public func close(_ reason: String, host: Double) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard closed == nil else { return false }
        closed = Closure(reason: reason, host: host)
        return true
    }
}
