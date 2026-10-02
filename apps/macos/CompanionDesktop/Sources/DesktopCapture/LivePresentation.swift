import Foundation

/// Revocable local authority for one answer's first display. Every queued status shares this
/// reference. Its shown fact survives revocation; it never grants a new request or wire field.
public final class LiveAnswerPresentation: @unchecked Sendable, Equatable {
    public static func == (lhs: LiveAnswerPresentation, rhs: LiveAnswerPresentation) -> Bool { lhs === rhs }

    public let requestID: String
    let sessionID: String
    let captureSessionID: String
    let owner: UUID
    let directory: URL
    private let generation: LiveGate?
    private let capture: LiveGate?
    private let expiresHost: Double
    private let clock: @Sendable () -> Double
    private let sourceProblem: (@Sendable () -> String?)?
    // Presentation may synchronously notify UI observers which inspect this same permit.
    private let lock = NSRecursiveLock()
    private var active = true
    private var firstShownAt: String?

    init(turn: LiveTurn, captureSessionID: String, owner: UUID, directory: URL,
         generation: LiveGate?, capture: LiveGate?, sourceProblem: (@Sendable () -> String?)?,
         expiresHost: Double, clock: @escaping @Sendable () -> Double) {
        requestID = turn.requestID
        sessionID = turn.sessionID
        self.captureSessionID = captureSessionID
        self.owner = owner
        self.directory = directory
        self.generation = generation
        self.capture = capture
        self.expiresHost = expiresHost
        self.clock = clock
        self.sourceProblem = sourceProblem
    }

    public var shownAt: String? { lock.withLock { firstShownAt } }

    public func revoke() { lock.withLock { active = false } }

    /// No await or event-loop pumping inside `show`. It returns actual panel visibility.
    /// Capture -> permit is the inner lock order; closing a gate never acquires the permit lock.
    @discardableResult
    public func whileAllowed(_ show: () -> Bool) -> Bool {
        func display() -> Bool {
            lock.withLock {
                guard active, clock() < expiresHost else { return false }
                let visible = show()
                if visible, firstShownAt == nil { firstShownAt = LiveWire.utc(Date()) }
                return visible
            }
        }
        // A previously observed display is historical; revocation does not erase that fact.
        if shownAt != nil { return show() }
        guard sourceProblem?() == nil else { return false }
        func inCapture() -> Bool {
            if let capture { return capture.whileOpen(display) ?? false }
            return display()
        }
        if let generation { return generation.whileOpen(inCapture) ?? false }
        return inCapture()
    }
}
