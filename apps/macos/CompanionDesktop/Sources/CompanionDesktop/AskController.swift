import AppKit
import DesktopCapture
import SwiftUI

/// The ChatGPT subscription connection and the card of the confirmed selection, for the views.
/// All the rules are in `AskLink`: this only shows its status and passes the user's own actions on.
/// Nothing is sent by capturing, writing or selecting; a question leaves on Submit only.
@MainActor
final class AskController: ObservableObject {
    @Published private(set) var status = AskStatus(connection: .disconnected)
    /// The question being typed on the card, and the help level and model chosen for it.
    @Published var question = ""
    @Published var assistance: AskAssistance = .hint
    @Published var model: String?

    let link = AskLink(config: AskConnectorConfig.load())
    private var card: NSPanel?

    init() {
        let link = link
        Task { [weak self] in
            // In order: a later status is never replaced by an earlier one.
            await link.setStatusHandler { status in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.show(status) }
                }
            }
        }
    }

    var canSubmit: Bool {
        status.card?.canSubmit == true && status.connection == .signedIn
            && !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Connection

    /// Starts the connector and reads the connection. No sign-in and no question.
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

    // MARK: - The card

    /// Finish confirmed a region: its card opens with a new, empty question. Nothing is sent.
    func selectionConfirmed(_ input: AskSelectionInput) {
        question = ""
        assistance = .hint
        let link = link
        Task { await link.open(input) }
    }

    func submit() {
        guard canSubmit else { return }
        let (link, question, assistance, model) = (self.link, self.question, self.assistance, self.model)
        Task { await link.submit(question: question, assistance: assistance, model: model) }
    }

    /// Cancels a question on its way, or closes a card with nothing on its way.
    func cancel() {
        let link = link
        Task { await link.cancelCard() }
    }

    func close() {
        let link = link
        Task { await link.closeCard() }
    }

    // MARK: - Lifecycle

    /// The capture ended: nothing more is asked from it, and a question on its way is fenced.
    func captureStopped(_ session: String) {
        let link = link
        Task { await link.sessionStopped(session) }
    }

    private func show(_ status: AskStatus) {
        self.status = status
        if let model, !status.imageModels.contains(where: { $0.id == model }) {
            self.model = nil
        }
        if status.card == nil {
            card?.orderOut(nil)
            card = nil
        } else if card == nil {
            card = Self.panel(AskCardView().environmentObject(self))
            card?.orderFrontRegardless()
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
        panel.title = "Ask about the selection"
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

/// The connection to the user's ChatGPT subscription, in the main window.
struct AskConnectionView: View {
    @ObservedObject var ask: AskController

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(ask.status.summaryLine)
            if let detail = ask.status.detail {
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            if ask.status.connection == .signedIn {
                Text(ask.status.quotaLine).font(.caption)
                Text(ask.status.modelsLine).font(.caption)
            }
            HStack {
                Button(ask.status.connection == .disconnected ? "Connect" : "Check Again") { ask.connect() }
                    .disabled([.notConfigured, .unavailable, .connecting].contains(ask.status.connection))
                if ask.status.loginPending {
                    Button("Open Sign-In Page Again") { ask.openSignInPageAgain() }
                    Button("Cancel Sign-In") { ask.cancelSignIn() }
                } else if [.signedOut, .otherMode].contains(ask.status.connection) {
                    Button("Sign In with ChatGPT…") { ask.signIn() }
                }
            }
            Text("A question is sent only when you press Submit on a selection's card: that selected image and your question go to ChatGPT through your own subscription. Capturing, writing and selecting send nothing. Sign-in happens on the official page in your browser; this app never reads your password or token, and signs nothing else out.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

/// The card of the confirmed selection: the user's question, the help they ask for, Submit and
/// Cancel, and the answer as plain text.
struct AskCardView: View {
    @EnvironmentObject private var ask: AskController

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let card = ask.status.card {
                Text(card.imageLine).font(.caption)
                TextField("Your question about this selection", text: $ask.question, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                    .disabled(card.phase == .sending || card.phase == .stopped)
                    .accessibilityLabel("Question")
                Picker("Help", selection: $ask.assistance) {
                    Text("A hint").tag(AskAssistance.hint)
                    Text("An explanation").tag(AskAssistance.explain)
                    Text("The full solution").tag(AskAssistance.fullSolution)
                }
                .disabled(card.phase == .sending)
                if ask.status.imageModels.count > 1 {
                    Picker("Model", selection: $ask.model) {
                        Text("Default").tag(String?.none)
                        ForEach(ask.status.imageModels, id: \.id) { model in
                            Text(model.label).tag(String?.some(model.id))
                        }
                    }
                    .disabled(card.phase == .sending)
                }
                HStack {
                    Button("Submit") { ask.submit() }
                        .disabled(!ask.canSubmit)
                        .keyboardShortcut(.return, modifiers: [.command])
                    Button(card.phase == .sending ? "Cancel" : "Close") { ask.cancel() }
                }
                if ask.status.connection != .signedIn {
                    Text(ask.status.summaryLine + (ask.status.connection.canBecomeSignedIn
                        ? " Connect and sign in from the main window first." : ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(card.summaryLine).font(.caption.weight(.semibold))
                if let detail = card.detail {
                    Text(detail).font(.caption).fixedSize(horizontal: false, vertical: true)
                }
                // The question that was sent, which may differ from the text now in the field.
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
                    Text("Generated by ChatGPT from this selection and the question shown above it. It can be wrong.")
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
