/// What may be claimed about the screen right now. Only `live` allows presenting the last new
/// pixels as the current screen; every other case says why not.
///
/// Callback responsiveness and pixel age are judged separately. A callback's host time is when it
/// was processed, which can be long after its pixels were on screen when the queue is busy, so
/// pixel age comes only from validated source time (`displayTime`).
public enum Freshness: Equatable, Sendable {
    /// Not capturing, or live claims have ended (the reason is the ending's or the gate's).
    case notLive(reason: String)
    /// Capturing, but there has been no callback within the silence limit (or none yet): the
    /// screen may be unchanged or frames may have stopped; the current screen is unknown.
    case unknown(silentFor: Double)
    /// A recent callback, but no usable current pixels: blank, suspended, a missing or unknown
    /// status, a status-only callback, or no new pixels yet.
    case unavailable(status: String, callbackAge: Double)
    /// A recent callback, and the system reports the pixels current, but no validated source time
    /// says when they were on screen: their age is unknown.
    case pixelAgeUnknown(callbackAge: Double)
    /// A recent callback, but the pixels were last confirmed on screen longer ago than the limit,
    /// for example a sample that waited in a busy queue.
    case stale(pixelAge: Double, callbackAge: Double)
    /// A recent callback, and the pixels were confirmed on screen within the limit by source time.
    /// `newPixelsAge` is how long ago these pixels were new, when known.
    case live(callbackAge: Double, pixelAge: Double, newPixelsAge: Double?)

    /// `capturing` must be false as soon as live claims end, even before `status` shows an ending.
    public static func judge(_ status: SessionStatus?, capturing: Bool, now: Double) -> Freshness {
        guard let status else { return .notLive(reason: "not started") }
        if let ending = status.ending { return .notLive(reason: ending.reason) }
        guard capturing else { return .notLive(reason: "not capturing") }
        let limit = status.settings.silenceLimit
        guard let last = status.lastCallbackHost else {
            return .unknown(silentFor: max(0, now - (status.streamStartedHost ?? status.startedHost)))
        }
        let age = now - last
        guard age >= 0, age <= limit else { return .unknown(silentFor: max(0, age)) }
        guard status.pixelsCurrent, status.lastNewPixelsHost != nil else {
            let reported = status.lastCallbackStatus ?? "missing"
            return .unavailable(status: status.lastNewPixelsHost == nil ? "no new pixels yet (\(reported))" : reported,
                                callbackAge: age)
        }
        guard let asOf = status.screenStateAsOfHost else { return .pixelAgeUnknown(callbackAge: age) }
        // A source time up to the lead tolerance after now counts as age zero.
        let pixelAge = max(0, now - asOf)
        guard pixelAge <= limit else { return .stale(pixelAge: pixelAge, callbackAge: age) }
        return .live(callbackAge: age, pixelAge: pixelAge,
                     newPixelsAge: status.lastNewPixelsSourceHost.map { max(0, now - $0) })
    }

    /// Refuses a retained frame as the current picture unless the existing freshness judgment
    /// permits live pixels and this is the newest retained pixel sequence. Reasons omit changing
    /// ages, so a continuing source gap can be reported without inventing new transitions.
    public static func currentFrameProblem(_ status: SessionStatus?, capturing: Bool, sequence: Int, now: Double) -> String? {
        switch judge(status, capturing: capturing, now: now) {
        case .notLive(let reason):
            return "the capture is not live (\(reason)); there is no current picture to give"
        case .unknown:
            return "no recent screen callback confirms this display; its current picture is unknown"
        case .unavailable(let reported, _):
            return "the capture reports \(reported) without usable current pixels; there is no current picture to give"
        case .pixelAgeUnknown:
            return "the pixels have no validated source time; their current age is unknown"
        case .stale:
            return "the pixels were last confirmed on screen too long ago; there is no fresh current picture to give"
        case .live:
            guard status?.lastKept?.sequence == sequence, status?.lastNewPixelsSequence == sequence else {
                if sequence > 0, let newest = status?.lastKept?.sequence,
                   newest == status?.lastNewPixelsSequence, sequence < newest {
                    return advancedFrameProblem
                }
                return "the newest pixels of this display were not kept in this frame; there is no current picture to give"
            }
            return nil
        }
    }

    /// A local classification shared by dispatch and presentation, never a wire field. Only
    /// healthy, fully retained newer pixels produce it; the earlier frame remains immutable.
    public static let advancedFrameProblem = "this earlier frame is not the current picture; healthy newer pixels were retained"

    /// Current-frame eligibility ends on healthy advancement. Source authority for an already
    /// submitted answer does not. Every actual freshness/retention loss still refuses display.
    public static func sourceLossProblem(_ currentFrameProblem: String?) -> String? {
        currentFrameProblem == advancedFrameProblem ? nil : currentFrameProblem
    }
}
