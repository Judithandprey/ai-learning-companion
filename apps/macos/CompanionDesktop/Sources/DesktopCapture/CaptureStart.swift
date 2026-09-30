/// One Start, from the click to a running stream. The caller creates `gate` at the click, so Stop
/// can close it during any step. Each step begins only while the gate is open:
/// - closed before the display list resolves: nothing else runs, and nothing is created;
/// - closed while the stream starts: a stream that started is stopped with `stopStarted`.
/// A step that completes after the gate closed has no further effect.
@MainActor
public enum CaptureStart {
    public enum Outcome: Equatable, Sendable {
        case started
        /// Stopped before a session existed: nothing was created.
        case stoppedBeforeSession
        /// Stopped after the session existed; a stream that had started was stopped.
        case stoppedAfterSession
        case failed(step: String, reason: String)
    }

    /// `find` lists what can be captured, `open` creates the session (the recorder and stream),
    /// and `start` starts the stream.
    public static func run<Target, Session>(
        gate: LiveGate,
        find: () async throws -> Target,
        open: (Target) throws -> Session,
        start: (Session) async throws -> Void,
        stopStarted: (Session) async -> Void
    ) async -> Outcome {
        guard gate.isOpen else { return .stoppedBeforeSession }
        let target: Target
        do {
            target = try await find()
        } catch {
            return gate.isOpen ? .failed(step: "find", reason: StopReason(error).summary) : .stoppedBeforeSession
        }
        // No await between this check and `open`, so a Stop on the main actor cannot come in between.
        guard gate.isOpen else { return .stoppedBeforeSession }
        let session: Session
        do {
            session = try open(target)
        } catch {
            return .failed(step: "open", reason: StopReason(error).summary)
        }
        do {
            try await start(session)
        } catch {
            return gate.isOpen ? .failed(step: "start", reason: StopReason(error).summary) : .stoppedAfterSession
        }
        guard gate.isOpen else {
            await stopStarted(session)
            return .stoppedAfterSession
        }
        return .started
    }
}
