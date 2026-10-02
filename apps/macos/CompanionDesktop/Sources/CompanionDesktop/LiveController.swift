import AppKit
import DesktopCapture
import SwiftUI

/// The ChatGPT subscription connection, the AI's bounded session on the captured display and the
/// card of the confirmed selection, for the views. All the rules are in `LiveLink`: this only
/// shows its status and passes the user's own actions on. Nothing is sent before Start AI.
@MainActor
final class LiveController: ObservableObject {
    @Published private(set) var status = LiveStatus(connection: .disconnected)
    /// The bounds of the next session, as the user sets them before Start AI.
    @Published var requests = LivePolicy.preset.maxSubmissions
    @Published var minutes = LivePolicy.preset.maxSessionMS / 60_000
    @Published var seconds = LivePolicy.preset.minObservationIntervalMS / 1_000
    @Published var model: String?
    /// The words being typed on the card, and the help chosen for them.
    @Published var words = ""
    @Published var assistance: LiveAssistance = .hint

    let link = LiveLink(config: AskConnectorConfig.load())
    /// The newest kept frame of the running capture with the ink as it is now, or nil.
    var newest: (() -> LiveFrameInput?)?
    private var card: NSPanel?
    /// The request whose answer was last reported as displayed.
    private var reported: String?
    /// Frames and ink changes for the AI, in the order they came.
    private enum PictureChange {
        case picture(LiveFrameInput)
        case unavailable(String)
    }
    private let frames: AsyncStream<PictureChange>.Continuation

    init() {
        let (stream, continuation) = AsyncStream<PictureChange>.makeStream()
        frames = continuation
        let link = link
        Task { [weak self] in
            // In order: a later status is never replaced by an earlier one.
            await link.setStatusHandler { status in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.show(status) }
                }
            }
            for await change in stream {
                switch change {
                case .picture(let input): await link.enqueue(input)
                case .unavailable(let reason): await link.noPicture(reason)
                }
            }
        }
    }

    /// The AI observes the captured display now.
    var isObserving: Bool { status.session.isRunning }

    /// A session exists that Stop AI ends: observing, with all its requests used, or being started.
    var canStop: Bool {
        switch status.session.state {
        case .on, .usedUp, .starting: return true
        case .off, .ended: return false
        }
    }

    var canSend: Bool {
        isObserving && status.card.map { $0.phase != .asking } == true
            && !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Connection

    /// Starts the connector and reads the connection and usage. No sign-in, no session, no picture.
    func connect() {
        let link = link
        Task { await link.connect() }
    }

    /// Starts the official sign-in and opens its page in the browser: the user's own click.
    func signIn() {
        let link = link
        Task { @MainActor in
            if let url = await link.startLogin() {
                NSWorkspace.shared.open(url)
            }
        }
    }

    func openSignInPageAgain() {
        let link = link
        Task { @MainActor in
            if let url = await link.pendingLoginURL() {
                NSWorkspace.shared.open(url)
            }
        }
    }

    func cancelSignIn() {
        let link = link
        Task { await link.cancelLogin() }
    }

    // MARK: - The AI session

    /// The user's Start AI for the capture kept in `captureSession`: one session with exactly the
    /// bounds set, and then the picture that is on record now.
    func start(captureSession: URL, captureSessionID: String) {
        let policy = LivePolicy(maxSubmissions: requests, maxSessionMS: minutes * 60_000, minObservationIntervalMS: seconds * 1_000)
        let (link, model) = (self.link, self.model)
        Task { @MainActor in
            await link.startSession(policy: policy, captureSession: captureSession, captureSessionID: captureSessionID, model: model)
            if let input = self.newest?() {
                await link.enqueue(input)
            }
        }
    }

    /// The user's Stop AI: the capture goes on, and nothing more is sent.
    func stop() {
        let link = link
        Task { await link.stopSession() }
    }

    /// A newly kept frame, or new ink over the newest one, while the AI observes.
    func changed(_ input: LiveFrameInput) {
        frames.yield(.picture(input))
    }

    // MARK: - The card

    /// Finish confirmed a region: its card opens and, while the AI observes, the selection is sent
    /// at once as the user's focus in the whole picture it was pinned to. `unlocated` says why the
    /// region cannot be found in that picture; it is then kept and not sent as a focus.
    func selectionConfirmed(_ input: AskSelectionInput, unlocated: String?, geometryProblem: String?) {
        guard let frozen = LiveFrameInput(selection: input, geometryProblem: geometryProblem) else { return }
        words = ""
        assistance = .hint
        let (link, rect, id) = (self.link, input.selection.rect, input.selection.id)
        Task { await link.selected(frozen, rect: rect, selectionID: id, unlocated: unlocated) }
    }

    /// New pixels or ink that cannot be given, with the reason, for the session line.
    func noPicture(_ reason: String) {
        frames.yield(.unavailable(reason))
    }

    /// The user's typed words about the card's selection, with the picture that is on record now.
    func send() {
        guard canSend else { return }
        let (link, words, assistance, fresh) = (self.link, self.words, self.assistance, newest?())
        self.words = ""
        Task { await link.followUp(words, assistance: assistance, fresh: fresh) }
    }

    /// Cancels a request on its way, or closes a card with nothing on its way.
    func cancel() {
        let link = link
        Task { await link.cancelCard() }
    }

    // MARK: - Lifecycle

    /// The capture ended: the AI session ends with it, and a request on its way is fenced.
    func captureStopped(_ session: String) {
        let link = link
        Task { await link.captureStopped(session) }
    }

    private func show(_ status: LiveStatus) {
        self.status = status
        if let model, !status.usableModels.contains(where: { $0.id == model }) {
            self.model = nil
        }
        if status.card == nil {
            card?.orderOut(nil)
            card = nil
        } else if card == nil {
            card = Self.panel(LiveCardView().environmentObject(self))
            card?.orderFrontRegardless()
        }
        // An answer on a panel that is on screen is reported as displayed, once, apart from the answer.
        if let shown = status.card, shown.phase == .answered, let request = shown.requestID, request != reported,
           card?.isVisible == true {
            reported = request
            let link = link
            Task { await link.answerShown(request) }
        }
    }

    /// A floating panel that takes the keyboard only for its text field, follows every Space, and
    /// is marked not to be shared with screen capture (this app's windows are excluded anyway).
    private static func panel(_ content: some View) -> NSPanel {
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 800, height: 600)
        let size = NSSize(width: 380, height: 420)
        let frame = NSRect(origin: NSPoint(x: screen.maxX - size.width - 16, y: screen.minY + 16), size: size)
        let panel = NSPanel(contentRect: frame, styleMask: [.titled, .utilityWindow, .resizable, .nonactivatingPanel],
                            backing: .buffered, defer: false)
        panel.title = "Your selection"
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1)
        panel.sharingType = .none
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isFloatingPanel = true
        panel.contentView = NSHostingView(rootView: content)
        return panel
    }
}

/// The connection to the user's ChatGPT subscription and the AI's session, in the main window.
struct LiveConnectionView: View {
    @ObservedObject var live: LiveController
    /// Whether a capture is running, so the AI can be started on it.
    let capturing: Bool
    /// `HostClock` seconds, for the time left.
    let now: Double
    let start: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(live.status.summaryLine)
            if let detail = live.status.detail {
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            // The account's own usage, as reported: apart from this app's session bounds below.
            if let quota = live.status.quota, let readAt = live.status.quotaReadAt {
                ForEach(quota.lines(readAt: readAt), id: \.self) { line in
                    Text(verbatim: line).font(.caption)
                }
            }
            HStack {
                Button(live.status.connection == .disconnected ? "Connect" : "Check Again") { live.connect() }
                    .disabled([.notConfigured, .unavailable, .connecting].contains(live.status.connection))
                if live.status.loginPending {
                    Button("Open Sign-In Page Again") { live.openSignInPageAgain() }
                    Button("Cancel Sign-In") { live.cancelSignIn() }
                } else if [.signedOut, .otherMode].contains(live.status.connection) {
                    Button("Sign In with ChatGPT…") { live.signIn() }
                }
            }
            Divider()
            Text(verbatim: live.status.session.line(nowHost: now))
            // This session's own bounds, set before Start AI. They are not ChatGPT's quota.
            Stepper("At most \(live.requests) requests in one session", value: $live.requests, in: LivePolicy.submissions)
                .disabled(live.isObserving)
            Stepper("At most \(live.minutes) min in one session", value: $live.minutes, in: 1...60)
                .disabled(live.isObserving)
            Stepper("Looks by itself at most once every \(live.seconds) s", value: $live.seconds, in: 1...60)
                .disabled(live.isObserving)
            if live.status.usableModels.count > 1 {
                Picker("Model", selection: $live.model) {
                    Text("Default").tag(String?.none)
                    ForEach(live.status.usableModels, id: \.id) { model in
                        Text(model.label).tag(String?.some(model.id))
                    }
                }
                .disabled(live.isObserving)
            }
            HStack {
                Button("Start AI on This Display") { start() }
                    .disabled(!capturing || live.status.startProblem != nil || live.isObserving
                        || live.status.session.state == .starting)
                Button("Stop AI") { live.stop() }
                    .disabled(!live.canStop)
            }
            Text("Start AI gives ChatGPT, through your own subscription, pictures of the whole captured display with your ink: when the screen or your ink changes (at most as often as set above), when you finish a selection (sent at once as your focus, for a small hint), and when you send words on its card. It stays within the bounds above and ends by itself; it is never started or renewed for you. What ChatGPT sees by itself is not shown as help. No sound is sent: neither the lesson's audio nor your voice is connected. Sign-in happens on the official page in your browser; this app never reads your password or token, and signs nothing else out.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

/// The card of the confirmed selection: what the AI was asked about it and answered, as plain
/// text, and the user's own words as a follow-up.
struct LiveCardView: View {
    @EnvironmentObject private var live: LiveController

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let card = live.status.card {
                Text(card.summaryLine).font(.caption.weight(.semibold))
                if let detail = card.detail {
                    Text(verbatim: detail).font(.caption).fixedSize(horizontal: false, vertical: true)
                }
                // What was asked, which may differ from the words now in the field.
                if let asked = card.askedLine {
                    Text(verbatim: asked).font(.caption).fixedSize(horizontal: false, vertical: true)
                }
                if let answer = card.answer {
                    ScrollView {
                        // Model text is shown as it is: plain text, never run or rendered as markup.
                        Text(verbatim: answer)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                TextField("Your words about this (optional)", text: $live.words, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                    .disabled(card.phase == .asking || !live.isObserving)
                    .accessibilityLabel("Follow-up")
                Picker("Help", selection: $live.assistance) {
                    Text("A hint").tag(LiveAssistance.hint)
                    Text("An explanation").tag(LiveAssistance.explain)
                    Text("The full solution").tag(LiveAssistance.fullSolution)
                }
                .disabled(card.phase == .asking)
                HStack {
                    Button("Send") { live.send() }
                        .disabled(!live.canSend)
                        .keyboardShortcut(.return, modifiers: [.command])
                    Button(card.phase == .asking ? "Cancel" : "Close") { live.cancel() }
                }
                if !live.isObserving {
                    Text(verbatim: live.status.session.line(nowHost: HostClock.now()))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(minWidth: 340, minHeight: 260, alignment: .topLeading)
    }
}
