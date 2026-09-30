/// What may be claimed about the screen right now. Only `live` allows presenting the last new
/// pixels as the current screen; every other case says why not.
public enum Freshness: Equatable, Sendable {
    /// Not capturing, or live claims have ended (the reason is the ending's or the gate's).
    case notLive(reason: String)
    /// Capturing, but there has been no callback within the silence limit (or none yet): the
    /// screen may be unchanged or frames may have stopped; the current screen is unknown.
    case unknown(silentFor: Double)
    /// A recent callback, but no usable current pixels: blank, suspended, a missing or unknown
    /// status, a status-only callback, or no new pixels yet.
    case unavailable(status: String, callbackAge: Double)
    /// A recent callback, and by the system's report the last new pixels are still current.
    case live(callbackAge: Double, newPixelsAge: Double)

    /// `capturing` must be false as soon as live claims end, even before `status` shows an ending.
    public static func judge(_ status: SessionStatus?, capturing: Bool, now: Double) -> Freshness {
        guard let status else { return .notLive(reason: "not started") }
        if let ending = status.ending { return .notLive(reason: ending.reason) }
        guard capturing else { return .notLive(reason: "not capturing") }
        guard let last = status.lastCallbackHost else {
            return .unknown(silentFor: max(0, now - (status.streamStartedHost ?? status.startedHost)))
        }
        let age = now - last
        guard age >= 0, age <= status.settings.silenceLimit else { return .unknown(silentFor: max(0, age)) }
        guard status.pixelsCurrent, let pixels = status.lastNewPixelsHost else {
            let reported = status.lastCallbackStatus ?? "missing"
            return .unavailable(status: status.lastNewPixelsHost == nil ? "no new pixels yet (\(reported))" : reported,
                                callbackAge: age)
        }
        return .live(callbackAge: age, newPixelsAge: now - pixels)
    }
}
