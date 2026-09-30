import Foundation

/// Whether one Start may still proceed and its capture may still be presented as live. It is
/// created at the Start click and closed by Stop, a stream error, a disconnected display, sleep or
/// quit. Closing is immediate and thread-safe, before the stream has finished stopping and before
/// the recorder has written its ending. A gate never reopens; the first closure's reason and time
/// are kept.
///
/// Callbacks are admitted through the same lock. An admitted callback's time is therefore never
/// later than the closure's time, and no callback is admitted after the gate closed.
public final class LiveGate: @unchecked Sendable {
    public struct Closure: Equatable, Sendable {
        public let reason: String
        /// `HostClock` seconds, read under the lock.
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

    /// Admits one callback: its time, read under the lock, while the gate is open; nil once it has
    /// closed.
    public func admit(clock: () -> Double = HostClock.now) -> Double? {
        lock.lock()
        defer { lock.unlock() }
        return closed == nil ? clock() : nil
    }

    /// Returns true if this call closed the gate, false if it was already closed.
    @discardableResult
    public func close(_ reason: String, clock: () -> Double = HostClock.now) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard closed == nil else { return false }
        closed = Closure(reason: reason, host: clock())
        return true
    }
}
