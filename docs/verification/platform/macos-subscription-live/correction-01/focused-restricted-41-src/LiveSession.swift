import Foundation
import FoundationNetworking
import Glibc
import Foundation

// The local account of one live session: which pictures were offered to it, which were sent,
// answered or left out, how many requests are used, and what was said. It is pure state with no
// I/O and no clock of its own (`LiveLink` sends, and passes the time in), so each rule can be
// tested on its own:
// - every picture offered to the session gets the next number, in the order offered; that number
//   is the request's `frame_seq`. It is this session's own order, not the capture's;
// - at most one unattended frame waits, the newest; a passed-over frame is a stated gap;
// - an unattended look is sent only when nothing else is out, the interval since the last look was
//   written has passed, and more requests are left than the ones kept for the user's own
//   (`LivePolicy.reserve`); a picture the model has already looked at is not sent again;
// - a request that may have reached the service uses one request, and is never given back;
// - the recent context sent with a request is whole entries only, newest first, within the
//   interface's bounds; what is left out is a stated gap, never a cut text.

/// What the session line shows. The session's own bounds are counted here, on this Mac; they are
/// not ChatGPT's quota.
public struct LiveSessionInfo: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        /// No session: the reason it is not running, when one was tried or ended before it began.
        case off(String?)
        case starting
        case on
        /// Every request is used. Nothing more is sent; the last answer stays.
        case usedUp
        case ended(String)
    }

    public var state: State
    public var model: String?
    public var policy: LivePolicy?
    public var used = 0
    /// Host-clock seconds (`HostClock`) at which the session's time is over.
    public var expiresHost: Double?
    /// Why unattended looks have stopped while the user's own requests still go, or nil.
    public var paused: String?
    /// Why the newest look was not made, or nil.
    public var missed: String?
    /// The last look ChatGPT completed: when its answer arrived (UTC), and which picture it was.
    public var seenAt: String?
    public var seenFrame: Int?
    /// Pictures offered to this session so far.
    public var frames = 0
    /// Requests on their way.
    public var out = 0

    public init(state: State) {
        self.state = state
    }

    public var isRunning: Bool { state == .on }

    /// The session in fixed words. `nowHost` is `HostClock.now()`.
    public func line(nowHost: Double) -> String {
        let bounds = "These are this session's own bounds, counted on this Mac, not ChatGPT's quota."
        switch state {
        case .off(let reason):
            return "AI: not observing this display" + (reason.map { ": \($0)" } ?? " (it was not started)")
                + ". Frames and ink stay on this Mac."
        case .starting:
            return "AI: starting…"
        case .usedUp:
            return "AI: all \(policy?.maxSubmissions ?? used) requests of this session are used (its own bound, not ChatGPT's quota). "
                + "Nothing more is sent to ChatGPT in it; Start the AI ends it and starts a new session."
        case .ended(let reason):
            return "AI: stopped observing this display: \(reason). \(usedWords). Nothing is sent to ChatGPT now; "
                + "Start the AI starts a new session."
        case .on:
            guard let policy, let expiresHost else { return "AI: running." }
            let minutes = max(0, Int(((expiresHost - nowHost) / 60).rounded(.up)))
            let watching = paused.map { "looks only when you select or ask (\($0))" }
                ?? "observes this whole display as it changes, at most once every \(Self.seconds(policy.minObservationIntervalMS))"
            let looked = seenAt.map { "ChatGPT last completed a look at \($0) (picture \(seenFrame ?? 0) of \(frames) offered)" }
                ?? "ChatGPT has not completed a look yet (\(frames) picture(s) offered)"
            return "AI: ChatGPT (\(model ?? "?")) \(watching). \(usedWords); about \(minutes) min left. \(bounds) \(looked)"
                + (missed.map { "; the newest look was not made (\($0))" } ?? "") + (out > 0 ? "; a request is out." : ".")
        }
    }

    private var usedWords: String {
        guard let policy else { return "\(used) request(s) used" }
        let left = max(0, policy.maxSubmissions - used)
        return "\(used) of \(policy.maxSubmissions) requests used (\(left) left; the last \(policy.reserve) "
            + "\(policy.reserve == 1 ? "is" : "are") kept for your own selections and questions)"
    }

    private static func seconds(_ milliseconds: Int) -> String {
        milliseconds % 1_000 == 0 ? "\(milliseconds / 1_000) s" : "\(Double(milliseconds) / 1_000) s"
    }
}

struct LiveSession {
    static let epoch = 1
    /// The user's permission does not change within a session in this version: Stop ends it.
    static let permissionRevision = 1
    /// The recent context of a request holds at most 23 whole entries and 24,000 characters. The
    /// interface allows 24 and 32,000; one entry is kept free for an earlier focus, and the rest is
    /// headroom for the connector's own 65,536-character prompt bound (an engineering default).
    static let historyEntries = LiveTurn.maxHistoryEntries - 1
    static let historyCharacters = 24_000

    let id: String
    let captureSessionID: String
    let model: String
    let policy: LivePolicy
    /// Host-clock seconds at which the session's time is over.
    let expiresHost: Double
    private(set) var used: Int
    /// Pictures numbered so far.
    private(set) var frames = 0
    /// The picture of the last request that was written, with its number (without its bytes).
    private(set) var latest: (seq: Int, picture: LivePicture)?
    private(set) var history: [LiveHistoryEntry] = []
    private(set) var gaps: [LiveGap] = []
    /// The newest unattended frame not yet sent.
    private(set) var waiting: (seq: Int, input: LiveFrameInput)?
    /// Pictures offered before the newest pixels became unavailable cannot become current looks.
    private(set) var unavailableThroughFrame = 0
    private var coolingUntilHost = -Double.infinity
    private(set) var paused: String?
    var missed: String?
    private(set) var ended: String?
    private(set) var seen: (at: String, frameSeq: Int)?
    /// Requests on their way.
    var out = 0

    init(id: String, captureSessionID: String, model: String, policy: LivePolicy, remaining: Int, expiresHost: Double) {
        self.id = id
        self.captureSessionID = captureSessionID
        self.model = model
        self.policy = policy
        self.expiresHost = expiresHost
        used = policy.maxSubmissions - remaining
    }

    var isUsedUp: Bool { used >= policy.maxSubmissions }
    var isRunning: Bool { ended == nil }

    var info: LiveSessionInfo {
        var info = LiveSessionInfo(state: ended.map(LiveSessionInfo.State.ended) ?? (isUsedUp ? .usedUp : .on))
        info.model = model
        info.policy = policy
        info.used = used
        info.expiresHost = expiresHost
        info.paused = paused
        info.missed = missed
        info.seenAt = seen?.at
        info.seenFrame = seen?.frameSeq
        info.frames = frames
        info.out = out
        return info
    }

    // MARK: - Unattended frames

    /// A newly kept frame, or new ink over the newest one: it gets the next number and waits to
    /// be looked at. A frame still waiting is passed over, and that is a stated gap. Once looks
    /// have stopped, the frame is numbered and stated as not given.
    mutating func offer(_ input: LiveFrameInput) {
        guard ended == nil else { return }
        if let passed = waiting { gap(passed.seq, .coalesced) }
        frames += 1
        if paused != nil {
            waiting = nil
            gap(frames, .budget)
        } else {
            waiting = (frames, input)
        }
    }

    mutating func pictureUnavailable(_ reason: String) {
        unavailableThroughFrame = frames
        missed = reason
        if let dropped = waiting {
            gap(dropped.seq, .notObserved)
            waiting = nil
        }
    }

    /// A source gap without new pixels still belongs in later model context. This records only
    /// the local judgment and its time; it is explicitly not fabricated screen evidence.
    mutating func recordSourceLoss(_ reason: String, at: String) -> Bool {
        let notice = "Current screen unavailable: \(reason). This is source-status metadata, not an observed picture."
        guard history.last?.text != notice else { return false }
        history.append(LiveHistoryEntry(kind: .observation, text: notice, at: at, frameSeq: nil,
                                       requestID: nil, presentation: "not_presented"))
        return true
    }

    func canObserve(_ seq: Int) -> Bool {
        ended == nil && seq > unavailableThroughFrame
    }

    /// An explicit request takes priority over pending or still-rendering unattended pictures.
    mutating func supersedeLooks() {
        unavailableThroughFrame = frames
        if let dropped = waiting {
            gap(dropped.seq, .coalesced)
            waiting = nil
        }
    }

    /// The waiting frame, when an unattended look may go now: nothing else is out, the interval
    /// since the last look has passed, and more requests are left than the ones kept for the user.
    /// When only those are left, looks stop for the rest of the session and that is said.
    mutating func nextLook(nowHost: Double) -> (seq: Int, input: LiveFrameInput)? {
        guard ended == nil, paused == nil, out == 0, let next = waiting, coolingUntilHost <= nowHost else { return nil }
        waiting = nil
        guard used < policy.observationLimit else {
            pauseLooks("the requests left in this session are kept for your own selections and questions")
            gap(next.seq, .budget)
            return nil
        }
        return next
    }

    /// When the next look may go at the earliest, if one is waiting only for the interval.
    var nextLookHost: Double? {
        ended == nil && paused == nil && waiting != nil ? coolingUntilHost : nil
    }

    /// Unattended looks stop for the rest of this session; the user's own requests still go.
    mutating func pauseLooks(_ reason: String) {
        paused = reason
        if let dropped = waiting {
            gap(dropped.seq, .budget)
            waiting = nil
        }
    }

    // MARK: - The user's own requests

    /// The number of the picture of a selection or follow-up: the latest sent picture's own number
    /// when it is that very frame and nothing newer was numbered, else the next number.
    mutating func number(_ picture: LivePicture) -> Int {
        if let latest, latest.seq == frames, latest.picture.isSameFrame(as: picture) { return latest.seq }
        frames += 1
        return frames
    }

    /// Whether `picture` is the very frame of `seq`, with nothing newer sent since: a follow-up may
    /// then keep the focus that was made on it.
    func isLatest(_ seq: Int, _ picture: LivePicture) -> Bool {
        latest.map { $0.seq == seq && $0.picture.isSameFrame(as: picture) } ?? false
    }

    /// A request was written to the connector. An older frame still waiting is passed over by it.
    /// The interval to the next unattended look runs from when a look was written.
    mutating func sent(_ turn: LiveTurn, nowHost: Double) {
        var facts = turn.picture
        facts.png = Data()
        latest = (turn.frameSeq, facts)
        if turn.trigger == .observation {
            coolingUntilHost = nowHost + Double(policy.minObservationIntervalMS) / 1_000
        }
        if let passed = waiting, passed.seq < turn.frameSeq {
            gap(passed.seq, .coalesced)
            waiting = nil
        }
    }

    /// Whether the model was given this very picture last, and looked at or answered it: there is
    /// then nothing new for an unattended look.
    func hasSeen(_ picture: LivePicture) -> Bool {
        guard let latest, latest.picture.isSameFrame(as: picture) else { return false }
        return history.contains { $0.kind != .user && $0.frameSeq == latest.seq }
    }

    /// A request that may have reached the service uses one request of this session, whatever
    /// became of it. It is never given back.
    mutating func spend() {
        used += 1
    }

    /// The connector says this session's own bound is reached: nothing is left.
    mutating func exhaust() {
        used = max(used, policy.maxSubmissions)
    }

    mutating func end(_ reason: String) {
        guard ended == nil else { return }
        ended = reason
        if let dropped = waiting {
            gap(dropped.seq, .notObserved)
            waiting = nil
        }
    }

    // MARK: - What was said and seen

    /// A look was answered: its text is kept as context for later requests. It is never shown.
    mutating func looked(_ turn: LiveTurn, text: String, at: String) {
        seen = (at, turn.frameSeq)
        if canObserve(turn.frameSeq) { missed = nil }
        history.append(LiveHistoryEntry(kind: .observation, text: text, at: at, frameSeq: turn.frameSeq, requestID: turn.requestID,
                                        presentation: "not_presented"))
    }

    /// The user's request was answered and the answer was put on its card: the user's words (if
    /// any) and the answer join the context. Whether the answer was displayed is recorded apart.
    mutating func answered(_ turn: LiveTurn, text: String, askedAt: String, at: String) {
        if let words = turn.userText {
            history.append(LiveHistoryEntry(kind: .user, text: words, at: askedAt, frameSeq: turn.frameSeq, requestID: turn.requestID,
                                            presentation: nil))
        }
        history.append(LiveHistoryEntry(kind: .assistant, text: text, at: at, frameSeq: turn.frameSeq, requestID: turn.requestID,
                                        presentation: "unconfirmed"))
    }

    /// The card reported that the answer of `requestID` was displayed, or was closed without it.
    mutating func presented(_ requestID: String, shown: Bool) {
        guard let index = history.lastIndex(where: { $0.kind == .assistant && $0.requestID == requestID }),
              history[index].presentation == "unconfirmed" else { return }
        history[index].presentation = shown ? "shown" : "not_presented"
    }

    /// Frames `seq` was not given to the model, for `reason`. Neighbouring frames with the same
    /// reason are one run.
    mutating func gap(_ seq: Int, _ reason: LiveGap.Reason) {
        if let last = gaps.last, last.reason == reason, seq >= last.from, seq <= last.to + 1 {
            gaps[gaps.count - 1].to = max(last.to, seq)
        } else {
            gaps.append(LiveGap(from: seq, to: seq, reason: reason))
        }
    }

    /// Whether `seq` is known to the model through an answer or look, or is already stated as a gap.
    func isAccountedFor(_ seq: Int) -> Bool {
        gaps.contains { $0.from <= seq && seq <= $0.to } || history.contains { $0.kind != .user && $0.frameSeq == seq }
    }

    // MARK: - The context of one request

    /// The recent context and the gaps for a request about picture `seq`: whole entries only,
    /// newest first, within the bounds; an entry that does not fit, and every older one, is left
    /// out and stated as a `budget` gap over its picture. Partial/current-frame omissions and gap
    /// ranges that do not fit are disclosed as metadata, never as new screen observations. Nothing
    /// is cut or deleted from the session's record. `extra` adds an earlier focus to this request.
    func context(for seq: Int, extra: LiveHistoryEntry? = nil) -> (history: [LiveHistoryEntry], gaps: [LiveGap]) {
        var taken: [LiveHistoryEntry] = []
        var omitted: [LiveHistoryEntry] = []
        var characters = extra?.text.unicodeScalars.count ?? 0
        var full = false
        for entry in history.reversed() where (entry.frameSeq ?? 0) <= seq {
            let length = entry.text.unicodeScalars.count
            let fits = length <= LiveTurn.maxTextCharacters && taken.count < Self.historyEntries
                && characters + length <= Self.historyCharacters
            if fits, !full {
                taken.append(entry)
                characters += length
            } else {
                // An entry too long by itself is skipped; anything else that does not fit closes the list.
                if length <= LiveTurn.maxTextCharacters { full = true }
                omitted.append(entry)
            }
        }
        taken.reverse()

        while true {
            let selected = taken + (extra.map { [$0] } ?? [])
            let sentFrames = Set(selected.compactMap(\.frameSeq))
            // Whole earlier frames can be represented by budget gaps. A missing dialogue entry
            // on a partly retained or current frame needs a notice: the available pixels/other
            // entry do not restore that text. An unknown-frame entry needs the notice as well.
            let unrepresented = omitted.filter { entry in
                guard let frame = entry.frameSeq else { return true }
                return frame == seq || sentFrames.contains(frame)
            }
            var left: [LiveGap] = []
            for frame in Set(omitted.compactMap(\.frameSeq)).subtracting(sentFrames).sorted() where frame < seq {
                if let last = left.last, last.to + 1 == frame {
                    left[left.count - 1].to = frame
                } else {
                    left.append(LiveGap(from: frame, to: frame, reason: .budget))
                }
            }
            var earlier: [LiveGap] = []
            for gap in gaps where gap.from < seq {
                earlier.append(LiveGap(from: gap.from, to: min(gap.to, seq - 1), reason: gap.reason))
            }
            let keptLeft = Array(left.suffix(LiveTurn.maxGaps / 2))
            let keptEarlier = Array(earlier.suffix(LiveTurn.maxGaps - keptLeft.count))
            let omittedGaps = Array(left.prefix(left.count - keptLeft.count))
                + Array(earlier.prefix(earlier.count - keptEarlier.count))
            var notice: LiveHistoryEntry?
            if !unrepresented.isEmpty || !omittedGaps.isEmpty {
                func bounds(_ frames: [Int]) -> String {
                    guard let first = frames.min(), let last = frames.max() else { return "none" }
                    return "\(first) through \(last)"
                }
                let text = "Bounded context omission metadata (not a screen observation). "
                    + "Unrepresented original history entries: \(unrepresented.count); known frame bounds: "
                    + bounds(unrepresented.compactMap(\.frameSeq))
                    + "; entries without a frame: \(unrepresented.filter { $0.frameSeq == nil }.count); "
                    + "entries on the request's current frame: \(unrepresented.filter { $0.frameSeq == seq }.count). "
                    + "Gap range records omitted: \(omittedGaps.count); frame bounds: "
                    + bounds(omittedGaps.flatMap { [$0.from, $0.to] }) + ". "
                    + "Bounds locate omitted records; they do not assert that each intervening frame is missing. "
                    + "This metadata supplies no omitted text, pixels, or new observations. Do not infer complete history or coverage."
                notice = LiveHistoryEntry(kind: .observation, text: text, at: nil, frameSeq: nil, requestID: nil,
                                          presentation: "not_presented")
            }
            // Make room for the notice using whole oldest entries. Recompute their omission
            // evidence; keep an explicitly supplied focus and the originals untouched.
            if let notice, !taken.isEmpty,
               (selected.count + 1 > LiveTurn.maxHistoryEntries
                || characters + notice.text.unicodeScalars.count > Self.historyCharacters) {
                let dropped = taken.removeFirst()
                omitted.append(dropped)
                characters -= dropped.text.unicodeScalars.count
                continue
            }
            return (taken + (notice.map { [$0] } ?? []) + (extra.map { [$0] } ?? []), keptEarlier + keptLeft)
        }
    }

    /// For a follow-up after the screen changed: the earlier focus as one context entry, with the
    /// picture it was made on, and the plain statement that those pixels are not part of this
    /// request. The old rectangle is never put on a newer picture. Nil when it does not fit.
    static func focusReference(_ origin: LiveTurn) -> LiveHistoryEntry? {
        guard let focus = origin.focus, case .object(let members) = origin.json(includingImage: false),
              let image = members["image"], let context = members["context"] else { return nil }
        let reference: JSONValue = .object([
            "kind": .string("historical_focus_reference"), "request_id": .string(origin.requestID), "image": image,
            "context": context, "focus": focus.json, "pixels_attached_to_this_request": .bool(false),
            "provider_retention": .string("unverified"),
            "limitation": .string("This is an earlier focus, not a rectangle on the current image. Its pixels are unavailable in this "
                + "request. Do not infer their content from these coordinates or claim a provider thread retained them."),
        ])
        guard let data = try? DesktopJSON.encode(reference), let text = String(data: data, encoding: .utf8),
              text.unicodeScalars.count <= LiveTurn.maxTextCharacters else { return nil }
        return LiveHistoryEntry(kind: .observation, text: text, at: nil, frameSeq: origin.frameSeq, requestID: origin.requestID,
                                presentation: "not_presented")
    }
}
