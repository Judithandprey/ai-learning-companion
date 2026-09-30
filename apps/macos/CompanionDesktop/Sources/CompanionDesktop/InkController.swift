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

    weak var capture: CaptureController?
    private var session: InkSession?
    private var store: InkStore?
    private var displayID: CGDirectDisplayID?
    private var overlay: NSPanel?
    private var overlayView: InkOverlayView?
    private var palette: NSPanel?
    /// Closed documents whose last save failed; kept in memory and saved again at the next
    /// capture start, capture end or quit.
    private var unsaved: [(session: InkSession, store: InkStore)] = []
    /// Tablet pointing devices in proximity, by `NSEvent.deviceID`, from app-level monitors.
    private var proximity: [Int: InkDevice] = [:]
    private var proximityMonitors: [Any] = []

    /// Shown whenever WRITE or ASK takes the pointer.
    var interceptionNote: String? {
        mode == .nav ? nil
            : "Pointer input over this display's page area goes to the ink layer; the menu bar, Dock and this palette stay usable. Choose NAV to use the app underneath."
    }

    // MARK: - Capture lifecycle

    func captureStarted(displayID: CGDirectDisplayID) {
        guard let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
        }) else {
            message = "The selected display has no screen to draw on, so ink is unavailable."
            return
        }
        self.displayID = displayID
        saveUnsaved()
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
        refresh()
    }

    /// Closes input first, keeps a stroke in progress as interrupted, saves, then removes the layer.
    func captureEnding(reason: String) {
        guard available else { return }
        available = false
        if let session, let store {
            session.closeInput(reason: reason, host: HostClock.now())
            if !save("Input closed (\(reason))") {
                unsaved.append((session, store))
                message = "Ink not saved (\(message)). It is kept in memory and saved again at the next capture start or end, or when the app quits."
            }
        }
        saveUnsaved()
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
        if case .refused(let reason) = session.undo(host: HostClock.now()) { message = reason } else { save("Undone") }
        refresh()
    }

    func redo() {
        guard let session else { return }
        if case .refused(let reason) = session.redo(host: HostClock.now()) { message = reason } else { save("Redone") }
        refresh()
    }

    /// Keeps the region with the exact retained frame it refers to and an actual crop of it.
    /// Nothing is sent or explained.
    func finishAsk() {
        guard let session, let store, let rect = session.pendingSelection else { return }
        let status = capture?.status
        let frame = status?.lastKept.map(FrameReference.init)
        let mapped = InkSession.pixelRect(for: rect, frame: frame, display: status?.display)
        var crop: SelectionCrop?
        var problem: String? = mapped.rect == nil ? mapped.mapping : nil
        if let frame, let pixelRect = mapped.rect, let captureSession = capture?.sessionDirectory {
            switch SelectionCropper.crop(frame, pixelRect: pixelRect, captureSession: captureSession,
                                         inkDirectory: store.fileURL.deletingLastPathComponent(),
                                         name: session.nextSelectionID) {
            case .success(let made): crop = made
            case .failure(let refusal): problem = refusal.reason
            }
        }
        var freshness = capture.map { String(describing: $0.currentFreshness()) } ?? "unknown"
        if let frame, frame.sequence != status?.lastNewPixelsSequence {
            freshness = "the frame is older than the current pixels (newer pixels were not kept), so this verdict does not apply to it: " + freshness
        }
        let context = SelectionContext(nativeSession: status?.session, display: status?.display, frame: frame,
                                       freshness: freshness, crop: crop, cropProblem: problem)
        if let selection = session.finishAsk(context, host: HostClock.now()) {
            save("Selection \(selection.id) kept" + (selection.crop == nil ? " without a crop (\(selection.cropProblem ?? "unknown"))" : " with a crop of \(selection.frame?.file ?? "")") + "; nothing is sent")
        }
        refresh()
    }

    func cancelAsk() {
        guard let session else { return }
        session.cancelAsk(host: HostClock.now())
        save("Selection cancelled")
        refresh()
    }

    /// Opens the most recently saved earlier ink with strokes on this display, other than the
    /// current capture session's and the document already open, to keep editing it. Its file stays
    /// where it is. Conflict copies are not reopened.
    func reopenLatest() {
        guard available, let displayID else { return }
        let excluded = [capture?.sessionDirectory, store?.fileURL.deletingLastPathComponent().deletingLastPathComponent()]
            .compactMap { $0 }
        guard let found = InkStore.latestDocument(in: CaptureController.storageRoot, displayID: displayID,
                                                  excluding: excluded) else {
            message = "No other earlier ink with strokes was found for this display."
            return
        }
        // The open document must be saved before it is closed; otherwise it stays open and editable.
        if session != nil, !save("Saved before reopening") {
            message = "The open ink could not be saved (\(message)), so nothing was reopened; it stays open."
            return
        }
        let earlier = InkStore(sessionDirectory: found)
        do {
            let document = try earlier.load()
            if let session, let store {
                session.closeInput(reason: "another document was reopened", host: HostClock.now())
                if !save("Closed") {
                    unsaved.append((session, store))
                }
            }
            let reopened = InkSession(document: document)
            reopened.mouseWritingEnabled = mouseWriting
            reopened.reopened(nativeSession: capture?.status?.session, host: HostClock.now())
            session = reopened
            store = earlier
            save("Reopened ink from \(found.lastPathComponent)")
        } catch {
            message = "The earlier ink could not be opened, and it is left unchanged: \(error.localizedDescription)"
        }
        refresh()
    }

    /// The display's geometry changed during capture: the overlay is refitted, and the change is
    /// recorded; strokes keep their recorded coordinates.
    func displayChanged() {
        guard available, let displayID, let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID
        }) else { return }
        overlay?.setFrame(screen.frame, display: true)
        if let session {
            session.displayChanged(widthPoints: Double(screen.frame.width), heightPoints: Double(screen.frame.height),
                                   host: HostClock.now())
            save("Display changed")
        }
        refresh()
    }

    /// Saves closed documents whose earlier save failed.
    func saveUnsaved() {
        unsaved = unsaved.filter { pending in
            (try? pending.store.save(pending.session.document)) == nil
        }
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
        switch session.end(host: HostClock.now()) {
        case .accepted:
            if wasAsking {
                message = "Region selected: Finish keeps it, Cancel drops it."
            } else {
                save("Saved")
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
        if let pending = session.pendingSelection { return pending }
        let points = session.gesturePoints
        guard points.count > 1, let minX = points.map(\.x).min(), let maxX = points.map(\.x).max(),
              let minY = points.map(\.y).min(), let maxY = points.map(\.y).max() else { return nil }
        return RecordedRect(CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY))
    }

    // MARK: - Helpers

    private func ensureSession() {
        guard session == nil, let displayID, let directory = capture?.sessionDirectory,
              let nativeSession = capture?.status?.session else { return }
        let created = InkSession(document: InkDocument(displayID: displayID, createdInSession: nativeSession, createdWall: Date()))
        created.mouseWritingEnabled = mouseWriting
        session = created
        store = InkStore(sessionDirectory: directory)
    }

    /// Saves the whole document atomically. On failure the document stays in memory: open, it is
    /// saved again with the next change; closed, it is kept for `saveUnsaved`.
    @discardableResult
    private func save(_ note: String) -> Bool {
        guard let session, let store else { return false }
        do {
            let url = try store.save(session.document)
            message = "\(note). Revision \(session.document.revision) saved"
                + (url.lastPathComponent == "ink.json" ? "." : " beside a changed file, as \(url.lastPathComponent).")
            return true
        } catch {
            message = "Not saved: \(error.localizedDescription). The ink is still in memory; the next save tries again."
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
