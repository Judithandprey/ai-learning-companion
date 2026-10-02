import AppKit
import DesktopCapture
import SwiftUI

/// The ink loop over the selected display while capture runs: a transparent overlay exactly over
/// the display, a floating control palette, the user's document and its saves. Screen-fixed only.
/// The tools exist only while capturing, and input closes the moment capture ends.
@MainActor
final class InkController: ObservableObject {
    @Published private(set) var available = false
    @Published private(set) var mode: InputMode = .nav
    @Published private(set) var tool: InkTool = .pen
    @Published var mouseWriting = false {
        didSet { session?.mouseWritingEnabled = mouseWriting }
    }
    @Published private(set) var hasPendingSelection = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published private(set) var message = "Ink is available while capture runs."
    /// Ink that is only in memory, shown until it is saved, exported or discarded; mode and start
    /// hints never replace it.
    @Published private(set) var unsavedWarning: String?

    weak var capture: CaptureController?
    /// Gets each confirmed region, for its card; it is sent only while the AI observes.
    weak var live: LiveController?
    /// Why the frame pinned to the pending ASK region does not show what was on screen, or nil.
    private var pinnedFrameProblem: String?
    private var session: InkSession?
    private var store: InkStore?
    private var displayID: CGDirectDisplayID?
    private var overlay: NSPanel?
    private var overlayView: InkOverlayView?
    private var palette: NSPanel?
    /// Whether this capture's frames still map to display points; kept after the capture ends, for
    /// frames paired late.
    private var geometry: DisplayGeometry?
    /// The documents open during the latest capture (`spansSession`), in order, for pairing each
    /// kept frame with the ink committed when its pixels were on screen.
    private var spans: [InkSpan] = []
    private var spansSession: String?
    /// Why the open document's last save failed; nil once a save succeeds.
    private var openSaveProblem: String?
    /// Closed documents whose save failed; saved again at the next capture start or end, and Quit
    /// waits until each is saved, exported or explicitly discarded.
    private let unsaved = UnsavedInk()
    /// Tablet pointing devices in proximity, by `NSEvent.deviceID`, from app-level monitors.
    private var proximity: [Int: InkDevice] = [:]
    private var proximityMonitors: [Any] = []

    /// Shown whenever WRITE or ASK takes the pointer.
    var interceptionNote: String? {
        mode == .nav ? nil
            : "Pointer input over this display's page area goes to the ink layer; the menu bar, Dock and this palette stay usable. Choose NAV to use the app underneath."
    }

    // MARK: - Capture lifecycle

    /// A capture session was created, before any of its frames: its ink history and display
    /// geometry start here, so every kept frame of it can be paired.
    func captureOpened(session: String, display: DisplayFacts) {
        spans = []
        spansSession = session
        geometry = DisplayGeometry(started: display)
    }

    func captureStarted(displayID: CGDirectDisplayID) {
        guard let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
        }) else {
            message = "The selected display has no screen to draw on, so ink is unavailable."
            return
        }
        self.displayID = displayID
        geometry?.observe(widthPoints: Double(screen.frame.width), heightPoints: Double(screen.frame.height),
                          rotationDegrees: CGDisplayRotation(displayID), host: HostClock.now())
        unsaved.retry()
        installProximityMonitors()
        let view = InkOverlayView(controller: self)
        let overlay = Self.panel(frame: screen.frame, style: [.borderless, .nonactivatingPanel], content: view)
        overlay.level = .floating
        overlay.isOpaque = false
        overlay.backgroundColor = .clear
        overlay.hasShadow = false
        overlay.ignoresMouseEvents = true
        let size = NSSize(width: 360, height: 180)
        let origin = NSPoint(x: screen.visibleFrame.maxX - size.width - 16, y: screen.visibleFrame.maxY - size.height - 16)
        let palette = Self.panel(frame: NSRect(origin: origin, size: size),
                                 style: [.titled, .utilityWindow, .hudWindow, .nonactivatingPanel],
                                 content: NSHostingView(rootView: InkPalette().environmentObject(self)))
        palette.title = "Ink"
        palette.level = NSWindow.Level(rawValue: NSWindow.Level.floating.rawValue + 1)
        overlay.orderFrontRegardless()
        palette.orderFrontRegardless()
        self.overlay = overlay
        self.overlayView = view
        self.palette = palette
        available = true
        message = "NAV: the original app has the pointer. Choose WRITE or ASK to use ink on this display."
            + (geometry?.problem.map { " ASK regions get no pixels on this capture: " + $0 } ?? "")
        refresh()
    }

    /// Closes input first, keeps a stroke in progress as interrupted, saves, then removes the layer.
    /// A document whose save fails is kept in memory (see `unsaved`).
    func captureEnding(reason: String) {
        guard available else { return }
        available = false
        if let session, let store {
            let host = HostClock.now()
            if let file = unsaved.close(session, store: store, reason: reason, host: host) {
                openSaveProblem = nil
                message = "Input closed (\(reason)). Revision \(session.document.revision) saved as \(file.lastPathComponent)."
            } else {
                openSaveProblem = unsaved.problem
                message = "Input closed (\(reason)); the ink could not be saved."
            }
            closeOpenSpan(host: host)
            openSaveProblem = nil
        }
        unsaved.retry()
        removeProximityMonitors()
        overlay?.orderOut(nil)
        palette?.orderOut(nil)
        overlay = nil
        overlayView = nil
        palette = nil
        session = nil
        store = nil
        refresh()
    }

    /// Pairs a newly kept frame of the capture `session` with the ink committed when its pixels
    /// were on screen (`InkComposer.request`). Called on the main thread, where ink is committed,
    /// when the frame is reported, so every change committed before then is in the document.
    func compositionRequest(for kept: KeptFrame, display: DisplayFacts, session: String) -> CompositionRequest {
        guard session == spansSession else {
            return .refused(kept, "the ink history of that capture is no longer held (another capture started)")
        }
        if let open = self.session, let store, spans.last?.closed == nil, !spans.isEmpty {
            spans[spans.count - 1].document = open.document
            spans[spans.count - 1].file = Self.spanFile(store.fileURL)
            spans[spans.count - 1].saveProblem = openSaveProblem
        }
        // The open document is frozen into the request as a value here, before any later edit.
        return InkComposer.request(for: kept, display: display, spans: spans, geometry: geometry, frozenHost: HostClock.now(),
                                   pendingGesture: !(self.session?.gesturePoints.isEmpty ?? true),
                                   pendingAskRegion: self.session?.pendingSelection != nil)
    }

    /// `frame` with the ink committed and visible now, frozen for the AI's session.
    func liveInput(frame: FrameReference, captureSession: URL, captureSessionID: String, display: DisplayFacts) -> LiveFrameInput {
        LiveFrameInput.freeze(frame: frame, document: session?.document, captureSession: captureSession,
                              captureSessionID: captureSessionID, display: display,
                              geometryProblem: geometry == nil ? "no display geometry was recorded for this capture" : geometry?.problem)
    }

    /// Before the app quits (capture has already ended): unsaved ink is saved again, and if that
    /// still fails Quit waits while the user saves again, exports it to a chosen folder, or
    /// explicitly discards it. Returns whether quitting may go on.
    func mayQuit() -> Bool {
        unsaved.retry()
        refresh()
        while !unsaved.isEmpty {
            NSApp.activate()
            let alert = NSAlert()
            alert.alertStyle = .critical
            let count = unsaved.documents.count
            alert.messageText = count == 1 ? "Ink is not saved" : "\(count) ink documents are not saved"
            alert.informativeText = "Capture has stopped and ink input is closed, but this ink exists only in memory ("
                + (unsaved.problem ?? "no reason recorded") + "). Save it again, export it to a folder you choose, "
                + "keep the app open, or discard it."
            alert.addButton(withTitle: "Save Again")
            alert.addButton(withTitle: "Export…")
            alert.addButton(withTitle: "Don't Quit")
            alert.addButton(withTitle: count == 1 ? "Discard Ink and Quit" : "Discard \(count) and Quit").hasDestructiveAction = true
            switch alert.runModal() {
            case .alertFirstButtonReturn:
                unsaved.retry()
            case .alertSecondButtonReturn:
                exportUnsaved()
            case NSApplication.ModalResponse(rawValue: NSApplication.ModalResponse.alertThirdButtonReturn.rawValue + 1):
                unsaved.discard()
            default:
                refresh()
                return false
            }
            refresh()
        }
        return true
    }

    /// Writes each unsaved document to a folder the user chooses; each one written and read back
    /// is no longer held.
    func exportUnsaved() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Export Here"
        panel.message = "Choose a folder for the unsaved ink. Each document is written as a new JSON file; no file is replaced."
        guard panel.runModal() == .OK, let folder = panel.url else { return }
        let written = unsaved.export(to: folder)
        message = written.isEmpty ? "Nothing was exported." : "Exported \(written.map(\.lastPathComponent).joined(separator: ", ")) to \(folder.path(percentEncoded: false))."
        refresh()
    }

    // MARK: - Controls

    func setMode(_ newMode: InputMode) {
        guard available else { return }
        if newMode != .nav {
            ensureSession()
        }
        guard let session else { return }
        if case .refused(let reason) = session.setMode(newMode, host: HostClock.now()) {
            message = reason
            return
        }
        save(newMode.rawValue)
        switch newMode {
        case .nav:
            message = "NAV: the original app has the pointer again."
        case .write:
            message = "WRITE: " + (mouseWriting ? "mouse writing is on." : "a pen writes; mouse writing is off.")
        case .ask:
            message = "ASK: drag across a region, then Finish or Cancel."
        }
        refresh()
    }

    func setEraser(_ on: Bool) {
        session?.tool = on ? .eraser : .pen
        refresh()
    }

    func undo() {
        guard let session else { return }
        if case .refused(let reason) = session.undo(host: HostClock.now()) { message = reason } else {
            save("Undone")
            capture?.pictureChanged()
        }
        refresh()
    }

    func redo() {
        guard let session else { return }
        if case .refused(let reason) = session.redo(host: HostClock.now()) { message = reason } else {
            save("Redone")
            capture?.pictureChanged()
        }
        refresh()
    }

    /// Keeps the region with the retained frame pinned when it was drawn, never a later one, and
    /// an actual crop of it when the mapping is still valid. The previous mode is back at once.
    /// The selection's card opens; while the AI observes this display, the selection is sent at
    /// once as the user's focus in the whole picture, and otherwise nothing is sent.
    func finishAsk() {
        guard let session, let store else { return }
        if let selection = session.finishAsk(geometryProblem: geometry?.problem,
                                             inkDirectory: store.fileURL.deletingLastPathComponent(), host: HostClock.now()) {
            // The editable ink is frozen here, as exact bytes, before anything is saved or prepared.
            let frozen: AskSelectionInput?
            if let directory = capture?.sessionDirectory, let display = capture?.status?.display {
                frozen = AskSelectionInput.freeze(selection: selection, document: session.document, captureSession: directory,
                                                  display: display)
            } else {
                frozen = nil
            }
            // A region whose pixels cannot be found in the pinned frame is kept and never sent as a focus.
            let unlocated = selection.framePixelRect == nil ? selection.pixelMapping : pinnedFrameProblem
            // Sent only while the AI observes this display (the user's own Start AI).
            let sends = frozen != nil && live?.isObserving == true && unlocated == nil
            save("Selection \(selection.id) kept" + (selection.crop == nil ? " without a crop (\(selection.cropProblem ?? "unknown"))" : " with a crop of \(selection.frame?.file ?? "")")
                + (sends ? "; while the AI observes, it goes to ChatGPT as your focus (its card says what was sent)"
                    : unlocated != nil ? "; not sent as a focus (\(unlocated ?? ""))" : "; nothing is sent (the AI is not started)"))
            if let frozen {
                live?.selectionConfirmed(frozen, unlocated: unlocated, geometryProblem: geometry?.problem)
            }
        }
        refresh()
    }

    func cancelAsk() {
        guard let session else { return }
        session.cancelAsk(host: HostClock.now())
        save("Selection cancelled")
        refresh()
    }

    /// Opens the most recently saved ink with strokes on this display, a conflict copy included,
    /// other than the document already open and those held unsaved, to keep editing it. Its file
    /// stays where it is.
    func reopenLatest() {
        guard available, let displayID else { return }
        let excluded = [store?.fileURL].compactMap { $0 } + unsaved.files
        guard let found = InkStore.latestDocument(in: CaptureController.storageRoot, displayID: displayID,
                                                  excluding: excluded) else {
            message = "No other saved ink with strokes was found for this display."
            return
        }
        // The open document must be saved before it is closed; otherwise it stays open and editable.
        if session != nil, !save("Saved before reopening") {
            message = "The open ink could not be saved (\(openSaveProblem ?? "no reason recorded")), so nothing was reopened; it stays open."
            return
        }
        let earlier = InkStore(documentFile: found)
        do {
            let document = try earlier.load()
            if let session, let store {
                let host = HostClock.now()
                openSaveProblem = unsaved.close(session, store: store, reason: "another document was reopened", host: host) == nil
                    ? unsaved.problem : nil
                closeOpenSpan(host: host)
            }
            let reopened = InkSession(document: document)
            reopened.mouseWritingEnabled = mouseWriting
            let host = HostClock.now()
            reopened.reopened(nativeSession: capture?.status?.session, host: host)
            session = reopened
            store = earlier
            openSaveProblem = nil
            spans.append(InkSpan(document: reopened.document, file: Self.spanFile(earlier.fileURL), opened: host))
            let name = found.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent + "/ink/" + found.lastPathComponent
            save("Reopened ink from \(name)")
            capture?.pictureChanged()
        } catch {
            message = "The earlier ink could not be opened, and it is left unchanged: \(error.localizedDescription)"
        }
        refresh()
    }

    /// The display's geometry changed during capture: the overlay is refitted, and the change is
    /// recorded; strokes keep their recorded coordinates. A changed size or rotation leaves ASK
    /// regions of this capture without pixels, pending ones included, until capture restarts.
    func displayChanged() {
        guard available, let displayID else { return }
        // The display's own bounds, so the check runs even when AppKit lists no screen for it.
        let bounds = CGDisplayBounds(displayID)
        let host = HostClock.now()
        let (width, height) = (Double(bounds.width), Double(bounds.height))
        let rotation = CGDisplayRotation(displayID)
        geometry?.observe(widthPoints: width, heightPoints: height, rotationDegrees: rotation, host: host)
        if let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
        }) {
            overlay?.setFrame(screen.frame, display: true)
        }
        if let session {
            session.displayChanged(widthPoints: width, heightPoints: height, rotationDegrees: rotation, host: host)
            save("Display changed")
        }
        if geometry?.problem != nil {
            message = "The display's size or rotation changed: ink keeps its recorded points, and ASK regions on this capture get no pixels until capture restarts."
        }
        refresh()
    }

    /// Saves closed documents whose earlier save failed.
    func saveUnsaved() {
        unsaved.retry()
        refresh()
    }

    /// The input device of a pointer event: a tablet point maps to the end reported by the last
    /// proximity event for its device, or `tablet_other` when none was seen (unverified on a Mac).
    func device(for event: NSEvent) -> InkDevice {
        guard event.subtype == .tabletPoint else { return .mouse }
        return proximity[event.deviceID] ?? .tabletOther
    }

    // MARK: - Pointer input from the overlay

    func pointerDown(_ point: InkPoint, device: InkDevice) {
        guard let session else { return }
        let anchor = InkAnchor(nativeSession: capture?.status?.session,
                               frame: capture?.status?.lastKept.map(FrameReference.init), host: HostClock.now())
        if case .refused(let reason) = session.begin(at: point, device: device, anchor: anchor) {
            message = reason
        }
        overlayView?.needsDisplay = true
    }

    func pointerMoved(_ point: InkPoint) {
        session?.extend(to: point)
        overlayView?.needsDisplay = true
    }

    func pointerUp() {
        guard let session else { return }
        let wasAsking = session.mode == .ask
        switch session.end(host: HostClock.now(), selection: wasAsking ? selectionContext() : nil) {
        case .accepted:
            if wasAsking {
                message = "Region selected: Finish keeps it, Cancel drops it."
            } else {
                save("Saved")
                capture?.pictureChanged()
            }
        case .refused(let reason):
            if reason != "no gesture in progress" { message = reason }
        }
        refresh()
    }

    // MARK: - Drawing state

    var visibleStrokes: [InkStroke] { session?.document.visibleStrokes ?? [] }
    var gesturePoints: [InkPoint] { session?.gesturePoints ?? [] }
    var gestureIsErasing: Bool { session?.isErasing ?? false }

    var selectionRect: RecordedRect? {
        guard let session, session.mode == .ask else { return nil }
        if let pending = session.pendingSelection { return pending.rect }
        let points = session.gesturePoints
        guard points.count > 1, let minX = points.map(\.x).min(), let maxX = points.map(\.x).max(),
              let minY = points.map(\.y).min(), let maxY = points.map(\.y).max() else { return nil }
        return RecordedRect(CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY))
    }

    // MARK: - Helpers

    /// What is on record now, pinned to an ASK region as it is drawn.
    private func selectionContext() -> SelectionContext {
        let status = capture?.status
        let frame = status?.lastKept.map(FrameReference.init)
        var freshness = capture.map { String(describing: $0.currentFreshness()) } ?? "unknown"
        pinnedFrameProblem = frame != nil && frame?.sequence != status?.lastNewPixelsSequence
            ? "the frame on record when you drew it was older than what was on screen (newer pixels were not kept)" : nil
        if pinnedFrameProblem == nil, let capture, case .live = capture.currentFreshness() {
            // The existing freshness verdict permits this frame as the screen at pen-down.
        } else if pinnedFrameProblem == nil, frame != nil {
            pinnedFrameProblem = "the source was not live when you drew it; its retained frame cannot locate what was on screen"
        }
        if let frame, frame.sequence != status?.lastNewPixelsSequence {
            freshness = "the frame is older than the current pixels (newer pixels were not kept), so this verdict does not apply to it: " + freshness
        }
        return SelectionContext(nativeSession: status?.session, captureSession: capture?.sessionDirectory,
                                display: status?.display, frame: frame, freshness: freshness,
                                geometryProblem: geometry == nil ? "no display geometry was recorded for this capture" : geometry?.problem)
    }

    private func ensureSession() {
        guard session == nil, let displayID, let directory = capture?.sessionDirectory,
              let nativeSession = capture?.status?.session else { return }
        let created = InkSession(document: InkDocument(displayID: displayID, createdInSession: nativeSession, createdWall: Date()))
        created.mouseWritingEnabled = mouseWriting
        let newStore = InkStore(sessionDirectory: directory)
        session = created
        store = newStore
        spans.append(InkSpan(document: created.document, file: Self.spanFile(newStore.fileURL), opened: HostClock.now()))
    }

    /// Closes the open document's span with its final content.
    private func closeOpenSpan(host: Double) {
        guard let session, let store, spans.last?.closed == nil, !spans.isEmpty else { return }
        spans[spans.count - 1].document = session.document
        spans[spans.count - 1].file = Self.spanFile(store.fileURL)
        spans[spans.count - 1].saveProblem = openSaveProblem
        spans[spans.count - 1].closed = host
    }

    /// `<capture session>/ink/<file name>`.
    private static func spanFile(_ url: URL) -> String {
        url.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent + "/ink/" + url.lastPathComponent
    }

    /// Saves the whole document atomically. On failure the open document stays in memory, the
    /// warning stays up, and the next change or mode switch saves again.
    @discardableResult
    private func save(_ note: String) -> Bool {
        guard let session, let store else { return false }
        do {
            let url = try store.save(session.document)
            openSaveProblem = nil
            message = "\(note). Revision \(session.document.revision) saved"
                + (url.lastPathComponent == "ink.json" ? "." : " as \(url.lastPathComponent).")
            return true
        } catch {
            openSaveProblem = error.localizedDescription
            message = "\(note). Not saved."
            return false
        }
    }

    private func installProximityMonitors() {
        removeProximityMonitors()
        let track: @Sendable (NSEvent) -> Void = { [weak self] event in
            let entering = event.isEnteringProximity
            let deviceID = event.deviceID
            let type = event.pointingDeviceType
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if !entering {
                        self.proximity[deviceID] = nil
                    } else {
                        switch type {
                        case .pen: self.proximity[deviceID] = .tabletPen
                        case .eraser: self.proximity[deviceID] = .tabletEraser
                        default: self.proximity[deviceID] = .tabletOther
                        }
                    }
                }
            }
        }
        if let local = NSEvent.addLocalMonitorForEvents(matching: .tabletProximity, handler: { event in
            track(event)
            return event
        }) {
            proximityMonitors.append(local)
        }
        if let global = NSEvent.addGlobalMonitorForEvents(matching: .tabletProximity, handler: { event in
            track(event)
        }) {
            proximityMonitors.append(global)
        }
    }

    private func removeProximityMonitors() {
        proximityMonitors.forEach { NSEvent.removeMonitor($0) }
        proximityMonitors.removeAll()
        proximity.removeAll()
    }

    private func refresh() {
        mode = session?.mode ?? .nav
        tool = session?.tool ?? .pen
        canUndo = session?.canUndo ?? false
        canRedo = session?.canRedo ?? false
        hasPendingSelection = session?.pendingSelection != nil
        var warnings: [String] = []
        if let openSaveProblem {
            warnings.append("The open ink is not saved (\(openSaveProblem)); it is kept in memory and saved again with the next change or mode switch.")
        }
        if !unsaved.isEmpty {
            let count = unsaved.documents.count
            warnings.append((count == 1 ? "A closed ink document is" : "\(count) closed ink documents are")
                + " not saved (\(unsaved.problem ?? "no reason recorded")); kept in memory and saved again at the next capture start or end. Quit waits until each is saved, exported or discarded.")
        }
        unsavedWarning = warnings.isEmpty ? nil : warnings.joined(separator: " ")
        // NAV leaves the original app operable; WRITE and ASK take the pointer on this display.
        overlay?.ignoresMouseEvents = mode == .nav
        overlayView?.needsDisplay = true
    }

    /// A panel that never activates the app, follows every Space, and is marked not to be shared
    /// with screen capture (whether ScreenCaptureKit honours that is unverified).
    private static func panel(frame: NSRect, style: NSWindow.StyleMask, content: NSView) -> NSPanel {
        let panel = NSPanel(contentRect: frame, styleMask: style, backing: .buffered, defer: false)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.sharingType = .none
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isFloatingPanel = true
        panel.contentView = content
        panel.setFrame(frame, display: false)
        return panel
    }
}
