import Foundation
import FoundationNetworking
import Glibc
import Foundation

// The user's original ink over one selected display. Only the local, screen-fixed loop exists:
// - NAV/WRITE/ASK routing;
// - pen strokes, partial erase of the drawn line and undo/redo;
// - ASK region selections, pinned to the retained frame on record when they were drawn;
// - atomic save, and reopening the most recent saved copy, conflict copies included.
// Every stroke ever made stays in the document; erase and undo change only what is visible, and
// every change is an ordered, timed operation. Content-anchored display is not implemented:
// strokes keep their screen position and their original anchor. Nothing is sent to a provider or
// the network.

/// Input routing only, separate from any teaching state. Only WRITE makes ink; ASK only selects;
/// NAV leaves the original app operable.
public enum InputMode: String, Codable, Sendable {
    case nav = "NAV"
    case write = "WRITE"
    case ask = "ASK"
}

public enum InkTool: String, Codable, Sendable {
    case pen
    case eraser
}

/// Where a gesture came from, as AppKit reported it. Pen hardware is untested.
public enum InkDevice: String, Codable, Sendable {
    case mouse
    case tabletPen = "tablet_pen"
    case tabletEraser = "tablet_eraser"
    case tabletOther = "tablet_other"
}

/// One input point with its native facts.
public struct InkPoint: Codable, Equatable, Sendable {
    /// Display-local points: origin at the selected display's top-left corner, y down.
    public var x: Double
    public var y: Double
    /// `NSEvent.timestamp`, in seconds since system start-up, as AppKit reports it.
    public var eventTime: Double
    /// `NSEvent.pressure` and `.tilt` for tablet points; nil for a plain mouse.
    public var pressure: Double?
    public var tiltX: Double?
    public var tiltY: Double?
    /// True for a point a partial erase computed where the eraser's edge crosses the drawn line,
    /// between two recorded samples; its time, pressure and tilt are interpolated. Nil for a
    /// recorded input sample.
    public var interpolated: Bool?

    public init(x: Double, y: Double, eventTime: Double, pressure: Double? = nil, tiltX: Double? = nil,
                tiltY: Double? = nil, interpolated: Bool? = nil) {
        self.x = x
        self.y = y
        self.eventTime = eventTime
        self.pressure = pressure
        self.tiltX = tiltX
        self.tiltY = tiltY
        self.interpolated = interpolated
    }
}

/// One retained kept frame, by its recorded facts.
public struct FrameReference: Codable, Equatable, Sendable {
    public var sequence: Int
    public var file: String
    public var sha256: String
    public var byteLength: Int
    public var width: Int
    public var height: Int
    public var callbackHost: Double
    public var sourceHost: Double?

    public init(_ kept: KeptFrame) {
        sequence = kept.sequence
        file = kept.file
        sha256 = kept.sha256
        byteLength = kept.byteLength
        width = kept.width
        height = kept.height
        callbackHost = kept.callbackHost
        sourceHost = kept.sourceHost
    }
}

/// The capture context when a stroke began: its original anchor, kept even though screen-fixed
/// ink does not move with content.
public struct InkAnchor: Codable, Equatable, Sendable {
    public var nativeSession: String?
    /// The latest retained frame at that moment; nil when none had been kept yet.
    public var frame: FrameReference?
    /// `HostClock` seconds.
    public var host: Double

    public init(nativeSession: String?, frame: FrameReference?, host: Double) {
        self.nativeSession = nativeSession
        self.frame = frame
        self.host = host
    }
}

public struct InkStroke: Codable, Equatable, Sendable {
    public var id: String
    /// Creation order; drawing order follows it.
    public var number: Int
    public var device: InkDevice
    public var width: Double
    public var points: [InkPoint]
    public var anchor: InkAnchor
    /// The stroke this piece was cut from by a partial erase; nil for a stroke as written.
    public var parent: String?
    /// Input closed (Stop, error or quit) while this stroke was being drawn; kept as observed.
    public var interrupted: Bool
}

/// One change, in order. Content changes raise the revision; the others record what happened.
public struct InkOperation: Codable, Equatable, Sendable {
    public var sequence: Int
    /// stroke, erase, undo, redo, mode, ask_finished, ask_cancelled, erase_interrupted,
    /// input_closed, reopened or display_changed.
    public var kind: String
    /// `HostClock` seconds.
    public var host: Double
    /// The content revision after this operation.
    public var revision: Int
    public var added: [String]
    public var removed: [String]
    /// For undo and redo: the operation they reverse or repeat.
    public var target: Int?
    public var detail: [String: String]
}

/// A confirmed ASK region. Nothing is sent or explained.
public struct InkSelection: Codable, Equatable, Sendable {
    public var id: String
    /// When Finish confirmed it, and when the region was drawn and its evidence pinned (nil in
    /// documents saved before pinning existed).
    public var host: Double
    public var establishedHost: Double?
    public var displayID: UInt32
    /// Display-local points.
    public var rect: RecordedRect
    public var nativeSession: String?
    /// The retained frame the region refers to, and the freshness verdict, both as on record
    /// when the region was drawn.
    public var frame: FrameReference?
    public var freshness: String
    /// The region in that frame's pixels: rect scaled by frame size / display size in points.
    public var framePixelRect: RecordedRect?
    public var pixelMapping: String
    /// The actual pixels: a crop of the exact retained original, written as its own PNG. Nil,
    /// with the reason, when there is no crop.
    public var crop: SelectionCrop?
    public var cropProblem: String?
    /// The content revision when the region was drawn, and the committed revision at the frame's
    /// admission time (`InkDocument.revision(at:)`); nil when unknown.
    public var inkRevision: Int
    public var inkRevisionAtFrame: Int?
    /// How the selected pixels are obtained, and whether an ink composite exists.
    public var composition: String
}

/// The user's original layer. AI additions never go in this file.
public struct InkDocument: Codable, Equatable, Sendable {
    public static let currentSchemaVersion = 1
    public static let userLayer = "user_original"

    public var schemaVersion = InkDocument.currentSchemaVersion
    public var layer = InkDocument.userLayer
    public var authorship = "user"
    public var displayMode = "screen_fixed"
    public var contentAnchored = "not implemented: strokes stay at their screen position and keep their original anchor"
    public var coordinates = "display-local points; origin at the selected display's top-left corner; y down"
    public var overlay = "drawn in overlay panels of this app; the session's display scope says whether the capture filter excludes this app's windows (then kept frames are meant to be ink-free and are composed separately) or not (then whether they contain this ink is unknown)"
    public var displayID: UInt32
    /// The capture session it was created in; each stroke keeps its own anchor.
    public var createdInSession: String
    public var createdWall: Date
    /// Every stroke ever made, including erased and undone ones.
    public var strokes: [InkStroke] = []
    public var visible: [String] = []
    public var operations: [InkOperation] = []
    public var undoStack: [Int] = []
    public var redoStack: [Int] = []
    public var selections: [InkSelection] = []
    public var revision = 0
    public var nextStrokeNumber = 1

    public init(displayID: UInt32, createdInSession: String, createdWall: Date) {
        self.displayID = displayID
        self.createdInSession = createdInSession
        self.createdWall = createdWall
    }

    public var visibleStrokes: [InkStroke] {
        let shown = Set(visible)
        return strokes.filter { shown.contains($0.id) }
    }

    /// The committed content revision at `host`: that of the last operation at or before it. Only
    /// operations since the last reopening count, because earlier ones belong to another session
    /// (possibly another boot's host clock); a time before that reopening is unknown (nil). A
    /// gesture in progress is not a revision, and this does not say what any pixels show.
    public func revision(at host: Double) -> Int? {
        let start = operations.lastIndex { $0.kind == "reopened" }
        let scoped = start.map { operations[$0...] } ?? operations[...]
        if let start, host < operations[start].host { return nil }
        return scoped.last { $0.host <= host }?.revision ?? 0
    }
}

/// What was on record when an ASK region was drawn. Finish uses exactly this: a frame kept, or a
/// capture started, after the region was drawn never replaces it.
public struct SelectionContext: Equatable, Sendable {
    public var nativeSession: String?
    /// The capture session directory holding `frame`'s retained original.
    public var captureSession: URL?
    public var display: DisplayFacts?
    public var frame: FrameReference?
    public var freshness: String
    /// Why display-local points could not be mapped to this capture's frames when the region was
    /// drawn (see `DisplayGeometry`); nil when they could.
    public var geometryProblem: String?

    public init(nativeSession: String?, captureSession: URL?, display: DisplayFacts?, frame: FrameReference?,
                freshness: String, geometryProblem: String?) {
        self.nativeSession = nativeSession
        self.captureSession = captureSession
        self.display = display
        self.frame = frame
        self.freshness = freshness
        self.geometryProblem = geometryProblem
    }

    /// For a region whose gesture ended without the app's context, for example at a mode switch.
    public static let unrecorded = SelectionContext(
        nativeSession: nil, captureSession: nil, display: nil, frame: nil,
        freshness: "unknown: nothing was recorded when the region was drawn", geometryProblem: nil)
}

/// An ASK region waiting for Finish or Cancel, with what was pinned when it was drawn.
public struct PendingSelection: Equatable, Sendable {
    /// Display-local points.
    public var rect: RecordedRect
    public var context: SelectionContext
    /// `HostClock` seconds when the region was drawn.
    public var host: Double
    /// The content revision then, and the committed revision at the pinned frame's admission.
    public var inkRevision: Int
    public var inkRevisionAtFrame: Int?
}

/// Routing, strokes, erase, undo/redo and ASK for one document. Not thread-safe: the app uses it
/// on the main thread.
public final class InkSession {
    public enum Outcome: Equatable, Sendable {
        case accepted
        case refused(String)
    }

    public static let penWidth = 3.0
    public static let eraserRadius = 8.0

    private enum Gesture {
        case stroke(device: InkDevice, anchor: InkAnchor, points: [InkPoint])
        case erase(points: [InkPoint])
        case select(points: [InkPoint])
    }

    public private(set) var document: InkDocument
    public private(set) var mode: InputMode = .nav
    public private(set) var modeBeforeAsk: InputMode?
    public var tool: InkTool = .pen
    /// Mouse input writes only when the user turns this on.
    public var mouseWritingEnabled = false
    public private(set) var inputClosed = false
    /// The ASK region waiting for Finish or Cancel.
    public private(set) var pendingSelection: PendingSelection?
    private var gesture: Gesture?

    public init(document: InkDocument) {
        self.document = document
    }

    /// Points of the gesture in progress, for drawing it.
    public var gesturePoints: [InkPoint] {
        switch gesture {
        case .stroke(_, _, let points), .erase(let points), .select(let points): return points
        case nil: return []
        }
    }

    public var isErasing: Bool {
        if case .erase = gesture { return true }
        return false
    }

    public var canUndo: Bool { !inputClosed && mode == .write && !document.undoStack.isEmpty }
    public var canRedo: Bool { !inputClosed && mode == .write && !document.redoStack.isEmpty }

    // MARK: - Modes

    @discardableResult
    public func setMode(_ newMode: InputMode, host: Double) -> Outcome {
        guard !inputClosed || newMode == .nav else { return .refused("input is closed") }
        guard newMode != mode else { return .accepted }
        if gesture != nil { _ = end(host: host) }
        let previous = mode
        if newMode == .ask {
            modeBeforeAsk = previous
        } else {
            modeBeforeAsk = nil
        }
        pendingSelection = nil
        mode = newMode
        record("mode", host: host, detail: ["from": previous.rawValue, "to": newMode.rawValue])
        return .accepted
    }

    // MARK: - Gestures

    /// Starts a gesture. NAV takes none; WRITE takes pen input, and mouse input only when mouse
    /// writing is on; ASK takes a region drag.
    public func begin(at point: InkPoint, device: InkDevice, anchor: InkAnchor) -> Outcome {
        guard !inputClosed else { return .refused("input is closed") }
        // A gesture that never saw its end is committed first, so none of its points are lost.
        if gesture != nil { end(host: anchor.host) }
        switch mode {
        case .nav:
            return .refused("NAV: input belongs to the original app")
        case .write:
            if device == .mouse && !mouseWritingEnabled {
                return .refused("mouse writing is off; turn it on or use a pen")
            }
            gesture = tool == .eraser || device == .tabletEraser
                ? .erase(points: [point])
                : .stroke(device: device, anchor: anchor, points: [point])
        case .ask:
            gesture = .select(points: [point])
        }
        return .accepted
    }

    public func extend(to point: InkPoint) {
        switch gesture {
        case .stroke(let device, let anchor, var points):
            points.append(point)
            gesture = .stroke(device: device, anchor: anchor, points: points)
        case .erase(var points):
            points.append(point)
            gesture = .erase(points: points)
        case .select(var points):
            points.append(point)
            gesture = .select(points: points)
        case nil:
            break
        }
    }

    /// Ends the gesture: a stroke is committed, an erase is applied, a drag becomes the pending
    /// ASK region, pinned to `selection` (what is on record now).
    @discardableResult
    public func end(host: Double, selection: SelectionContext? = nil) -> Outcome {
        guard let current = gesture else { return .refused("no gesture in progress") }
        gesture = nil
        switch current {
        case .stroke(let device, let anchor, let points):
            commitStroke(device: device, anchor: anchor, points: points, interrupted: false, host: host)
            return .accepted
        case .erase(let points):
            return applyErase(along: points, host: host)
        case .select(let points):
            let xs = points.map(\.x), ys = points.map(\.y)
            guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max(),
                  maxX > minX, maxY > minY else {
                return .refused("a selection needs an area; drag across the region")
            }
            let context = selection ?? .unrecorded
            pendingSelection = PendingSelection(
                rect: RecordedRect(CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)), context: context,
                host: host, inkRevision: document.revision,
                inkRevisionAtFrame: context.frame.flatMap { document.revision(at: $0.callbackHost) })
            return .accepted
        }
    }

    // MARK: - Undo and redo

    @discardableResult
    public func undo(host: Double) -> Outcome {
        guard canUndo, let target = document.undoStack.popLast(),
              let operation = document.operations.first(where: { $0.sequence == target }) else {
            return .refused("nothing to undo")
        }
        document.redoStack.append(target)
        change(kind: "undo", added: operation.removed, removed: operation.added, target: target, host: host)
        return .accepted
    }

    @discardableResult
    public func redo(host: Double) -> Outcome {
        guard canRedo, let target = document.redoStack.popLast(),
              let operation = document.operations.first(where: { $0.sequence == target }) else {
            return .refused("nothing to redo")
        }
        document.undoStack.append(target)
        change(kind: "redo", added: operation.added, removed: operation.removed, target: target, host: host)
        return .accepted
    }

    // MARK: - ASK

    /// Confirms the pending region with exactly what was pinned when it was drawn, and restores the
    /// mode that was active before ASK. Nothing is sent or explained.
    /// - `geometryProblem`: why display points cannot be mapped to this capture's frames now, if
    ///   they cannot. A known display change before Finish leaves the region without pixels too.
    /// - `inkDirectory`: where a crop of the pinned frame's retained original is written (see
    ///   `SelectionCropper`); nil makes no crop.
    public func finishAsk(geometryProblem: String?, inkDirectory: URL?, host: Double) -> InkSelection? {
        guard mode == .ask, let pending = pendingSelection else { return nil }
        let context = pending.context
        let mapped: (rect: RecordedRect?, mapping: String)
        if let problem = context.geometryProblem ?? geometryProblem.map({ "before Finish, " + $0 }) {
            mapped = (nil, problem)
        } else {
            mapped = Self.pixelRect(for: pending.rect, frame: context.frame, display: context.display)
        }
        var crop: SelectionCrop?
        var cropProblem = mapped.rect == nil ? mapped.mapping : nil
        if let frame = context.frame, let pixelRect = mapped.rect {
            if let captureSession = context.captureSession, let inkDirectory {
                switch SelectionCropper.crop(frame, pixelRect: pixelRect, captureSession: captureSession,
                                             inkDirectory: inkDirectory, name: nextSelectionID) {
                case .success(let made): crop = made
                case .failure(let refusal): cropProblem = refusal.reason
                }
            } else {
                cropProblem = "the capture session or ink directory is unknown, so no crop was made"
            }
        }
        let committed = pending.inkRevisionAtFrame.map { "the committed ink revision at that frame's admission was \($0)" }
            ?? "the ink revision at that frame's admission is unknown (the frame precedes this document's reopening)"
        let composition: String
        if let frame = context.frame {
            let pixels = crop == nil
                ? "No crop was made (\(cropProblem ?? "no reason recorded")); the frame \(frame.file) (callback \(frame.callbackHost) s) is referenced only."
                : "The crop is a frozen region of the retained frame \(frame.file) (callback \(frame.callbackHost) s), not a live observation."
            let excluded = context.display?.scope.hasPrefix(DisplayFacts.appExcludedScopePrefix) == true
            composition = pixels + (excluded
                ? " The capture filter is configured to exclude this app's windows, so the frame is meant to hold no ink or controls (unverified on a Mac); \(committed)."
                    + " The session is configured to compose this frame separately with the ink revision at its pixels' time; its composed record or not_composed reason is joined by the frame's sequence. The ink is kept as strokes at revision \(pending.inkRevision)."
                : " Whether that frame's pixels contain this ink or the controls is unknown; \(committed)."
                    + " No ink composite is rendered: over pixels that may already hold this ink it could duplicate it. The ink is kept as strokes at revision \(pending.inkRevision).")
        } else {
            composition = "no retained frame; only the region and the ink revision are recorded, and no pixels are selected"
        }
        let selection = InkSelection(
            id: nextSelectionID, host: host, establishedHost: pending.host, displayID: document.displayID,
            rect: pending.rect, nativeSession: context.nativeSession, frame: context.frame, freshness: context.freshness,
            framePixelRect: mapped.rect, pixelMapping: mapped.mapping, crop: crop, cropProblem: crop == nil ? (cropProblem ?? "no crop was made") : nil,
            inkRevision: pending.inkRevision, inkRevisionAtFrame: pending.inkRevisionAtFrame, composition: composition)
        document.selections.append(selection)
        let restored = modeBeforeAsk ?? .nav
        record("ask_finished", host: host, detail: ["selection": selection.id, "restored_mode": restored.rawValue])
        leaveAsk(to: restored)
        return selection
    }

    /// The identifier the next confirmed selection gets.
    public var nextSelectionID: String { "a\(document.selections.count + 1)" }

    /// A display-local rectangle in a frame's pixels: scaled by frame size / display size in points.
    public static func pixelRect(for rect: RecordedRect, frame: FrameReference?, display: DisplayFacts?)
        -> (rect: RecordedRect?, mapping: String) {
        guard let frame else { return (nil, "no retained frame yet; no pixels are selected") }
        guard let display, display.frame.width > 0, display.frame.height > 0 else {
            return (nil, "no display size to map points to pixels")
        }
        let sx = Double(frame.width) / display.frame.width
        let sy = Double(frame.height) / display.frame.height
        return (RecordedRect(CGRect(x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy)),
                "display-local points scaled by frame size / display size in points (\(sx) × \(sy)); contentRect and scaleFactor are not applied; unverified on a Mac")
    }

    /// Drops the pending region and restores the mode that was active before ASK.
    @discardableResult
    public func cancelAsk(host: Double) -> Outcome {
        guard mode == .ask else { return .refused("not in ASK") }
        let restored = modeBeforeAsk ?? .nav
        record("ask_cancelled", host: host, detail: ["restored_mode": restored.rawValue])
        leaveAsk(to: restored)
        return .accepted
    }

    private func leaveAsk(to restored: InputMode) {
        gesture = nil
        pendingSelection = nil
        modeBeforeAsk = nil
        mode = restored
    }

    // MARK: - Closing and reopening

    /// Stop, a stream error or quit: input closes first. A stroke in progress is kept as
    /// interrupted; an unfinished erase or selection changes nothing and is recorded as such.
    public func closeInput(reason: String, host: Double) {
        guard !inputClosed else { return }
        switch gesture {
        case .stroke(let device, let anchor, let points):
            commitStroke(device: device, anchor: anchor, points: points, interrupted: true, host: host)
        case .erase(let points):
            record("erase_interrupted", host: host, detail: ["points": String(points.count)])
        case .select, nil:
            break
        }
        gesture = nil
        if mode == .ask {
            record("ask_cancelled", host: host, detail: ["restored_mode": InputMode.nav.rawValue, "reason": reason])
        }
        pendingSelection = nil
        modeBeforeAsk = nil
        mode = .nav
        inputClosed = true
        record("input_closed", host: host, detail: ["reason": reason])
    }

    /// Records that the display's geometry changed; strokes keep their recorded coordinates.
    public func displayChanged(widthPoints: Double, heightPoints: Double, rotationDegrees: Double, host: Double) {
        record("display_changed", host: host, detail: [
            "width_points": String(widthPoints), "height_points": String(heightPoints),
            "rotation_degrees": String(rotationDegrees),
        ])
    }

    /// Records that a saved document was opened again for editing, in `nativeSession`.
    public func reopened(nativeSession: String?, host: Double) {
        record("reopened", host: host, detail: ["session": nativeSession ?? "none"])
    }

    // MARK: - Changes

    private func commitStroke(device: InkDevice, anchor: InkAnchor, points: [InkPoint], interrupted: Bool,
                              host: Double) {
        let stroke = InkStroke(id: "s\(document.nextStrokeNumber)", number: document.nextStrokeNumber, device: device,
                               width: Self.penWidth, points: points, anchor: anchor, parent: nil, interrupted: interrupted)
        document.nextStrokeNumber += 1
        document.strokes.append(stroke)
        let sequence = change(kind: "stroke", added: [stroke.id], removed: [], target: nil, host: host,
                              detail: interrupted ? ["interrupted": "true"] : [:])
        document.undoStack.append(sequence)
        document.redoStack.removeAll()
    }

    /// Removes from visible strokes what lies within the eraser radius of its path, measured on
    /// the drawn line segments, not only at recorded samples. A stroke that loses part of its line
    /// is replaced by its remaining portions, as new pieces; the original is kept.
    private func applyErase(along path: [InkPoint], host: Double) -> Outcome {
        var removed: [String] = []
        var pieces: [InkStroke] = []
        for stroke in document.visibleStrokes {
            guard let remaining = Self.remainder(of: stroke.points, erasedAlong: path) else { continue }
            removed.append(stroke.id)
            pieces += remaining.map { piece(of: stroke, $0) }
        }
        guard !removed.isEmpty else { return .refused("nothing under the eraser") }
        document.strokes.append(contentsOf: pieces)
        let sequence = change(kind: "erase", added: pieces.map(\.id), removed: removed, target: nil, host: host,
                              detail: ["eraser_points": String(path.count)])
        document.undoStack.append(sequence)
        document.redoStack.removeAll()
        return .accepted
    }

    private func piece(of stroke: InkStroke, _ points: [InkPoint]) -> InkStroke {
        defer { document.nextStrokeNumber += 1 }
        return InkStroke(id: "s\(document.nextStrokeNumber)", number: document.nextStrokeNumber, device: stroke.device,
                         width: stroke.width, points: points, anchor: stroke.anchor, parent: stroke.id,
                         interrupted: stroke.interrupted)
    }

    /// Applies a content change and records it; returns its operation sequence.
    @discardableResult
    private func change(kind: String, added: [String], removed: [String], target: Int?, host: Double,
                        detail: [String: String] = [:]) -> Int {
        let hidden = Set(removed)
        let shown = Set(document.visible).subtracting(hidden).union(added)
        document.visible = document.strokes.filter { shown.contains($0.id) }.map(\.id)
        document.revision += 1
        return record(kind, host: host, added: added, removed: removed, target: target, detail: detail)
    }

    @discardableResult
    private func record(_ kind: String, host: Double, added: [String] = [], removed: [String] = [], target: Int? = nil,
                        detail: [String: String] = [:]) -> Int {
        let sequence = (document.operations.last?.sequence ?? 0) + 1
        document.operations.append(InkOperation(sequence: sequence, kind: kind, host: host, revision: document.revision,
                                                added: added, removed: removed, target: target, detail: detail))
        return sequence
    }

    /// Distance from a point to the eraser's path (its points joined by segments).
    static func distance(from point: InkPoint, to path: [InkPoint]) -> Double {
        guard let first = path.first else { return .infinity }
        var best = hypot(point.x - first.x, point.y - first.y)
        for (a, b) in zip(path, path.dropFirst()) {
            let dx = b.x - a.x, dy = b.y - a.y
            let lengthSquared = dx * dx + dy * dy
            let t = lengthSquared == 0 ? 0 : max(0, min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
            best = min(best, hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
        }
        return best
    }

    // MARK: - Erasing the drawn line

    /// Lengths below this, in points, are rounding noise: no cut is made for them.
    private static let negligible = 1e-9

    /// The portions of a drawn line (its points joined by segments, as the overlay draws it) that
    /// lie outside the eraser's reach, or nil when the eraser reaches none of it. A portion ends
    /// where the eraser's edge crosses the line, at an interpolated point; recorded samples are kept.
    static func remainder(of points: [InkPoint], erasedAlong path: [InkPoint]) -> [[InkPoint]]? {
        guard let first = points.first, !path.isEmpty else { return nil }
        guard points.count > 1 else {
            return distance(from: first, to: path) <= eraserRadius ? [] : nil
        }
        var touched = false
        var portions: [[InkPoint]] = []
        var run: [InkPoint] = []
        for (a, b) in zip(points, points.dropFirst()) {
            let length = hypot(b.x - a.x, b.y - a.y)
            let erased = erasedIntervals(from: a, to: b, along: path)
            touched = touched || !erased.isEmpty
            // The kept parts of this segment, as parameters in 0...1 from a to b.
            var kept: [(Double, Double)] = []
            var cursor = 0.0
            for (low, high) in erased {
                if low > cursor { kept.append((cursor, low)) }
                cursor = max(cursor, high)
            }
            if cursor < 1 { kept.append((cursor, 1)) }
            // A run is open only while it reaches this segment's end, b.
            var reachesB = false
            for (low, high) in kept where length == 0 || (high - low) * length > negligible {
                let end = high == 1 ? b : interpolate(a, b, high)
                if low == 0, !run.isEmpty {
                    run.append(end)  // The line continues through a.
                } else {
                    if !run.isEmpty { portions.append(run) }
                    run = [low == 0 ? a : interpolate(a, b, low), end]
                }
                reachesB = high == 1
            }
            if !reachesB, !run.isEmpty {
                portions.append(run)
                run = []
            }
        }
        if !run.isEmpty { portions.append(run) }
        return touched ? portions : nil
    }

    /// Where segment a→b lies within the eraser radius of `path`, as sorted, merged parameter
    /// intervals in 0...1. The reach of each eraser segment (or of a single eraser point) is a
    /// convex capsule, so the segment meets it in one interval: the union of where it meets the
    /// capsule's two end discs and its middle band.
    static func erasedIntervals(from a: InkPoint, to b: InkPoint, along path: [InkPoint]) -> [(Double, Double)] {
        let radius = eraserRadius
        let ux = b.x - a.x, uy = b.y - a.y
        let lengthSquared = ux * ux + uy * uy
        if lengthSquared == 0 {
            return distance(from: a, to: path) <= radius ? [(0, 1)] : []
        }
        let length = lengthSquared.squareRoot()
        /// The t in 0...1 with lower ≤ p + q·t ≤ upper.
        func solve(_ p: Double, _ q: Double, _ lower: Double, _ upper: Double) -> (Double, Double)? {
            if q == 0 { return lower <= p && p <= upper ? (0, 1) : nil }
            let t1 = (lower - p) / q, t2 = (upper - p) / q
            let low = max(min(t1, t2), 0), high = min(max(t1, t2), 1)
            return low <= high ? (low, high) : nil
        }
        /// Where the segment is within the radius of point c.
        func disc(_ c: InkPoint) -> (Double, Double)? {
            let wx = a.x - c.x, wy = a.y - c.y
            let half = ux * wx + uy * wy
            let discriminant = half * half - lengthSquared * (wx * wx + wy * wy - radius * radius)
            guard discriminant >= 0 else { return nil }
            let root = discriminant.squareRoot()
            let low = max((-half - root) / lengthSquared, 0), high = min((-half + root) / lengthSquared, 1)
            return low <= high ? (low, high) : nil
        }
        /// Where the segment is within the radius of segment c→d, beside it rather than past its ends.
        func band(_ c: InkPoint, _ d: InkPoint) -> (Double, Double)? {
            let vx = d.x - c.x, vy = d.y - c.y
            let vv = vx * vx + vy * vy
            guard vv > 0 else { return nil }
            let wx = a.x - c.x, wy = a.y - c.y
            let v = vv.squareRoot()
            guard let along = solve((wx * vx + wy * vy) / vv, (ux * vx + uy * vy) / vv, 0, 1),
                  let across = solve((vx * wy - vy * wx) / v, (vx * uy - vy * ux) / v, -radius, radius) else { return nil }
            let low = max(along.0, across.0), high = min(along.1, across.1)
            return low <= high ? (low, high) : nil
        }
        let reaches = path.count == 1 ? [(path[0], path[0])] : Array(zip(path, path.dropFirst()))
        var intervals: [(Double, Double)] = []
        for (c, d) in reaches {
            let parts = [disc(c), disc(d), band(c, d)].compactMap { $0 }
            guard let low = parts.map({ $0.0 }).min(), let high = parts.map({ $0.1 }).max(),
                  (high - low) * length > negligible else { continue }
            intervals.append((low, high))
        }
        var merged: [(Double, Double)] = []
        for interval in intervals.sorted(by: { $0.0 < $1.0 }) {
            if let last = merged.last, interval.0 <= last.1 {
                merged[merged.count - 1].1 = max(last.1, interval.1)
            } else {
                merged.append(interval)
            }
        }
        return merged
    }

    /// The point at t on segment a→b; time, pressure and tilt are interpolated where both ends
    /// have them.
    static func interpolate(_ a: InkPoint, _ b: InkPoint, _ t: Double) -> InkPoint {
        func mix(_ p: Double?, _ q: Double?) -> Double? {
            guard let p, let q else { return nil }
            return p + (q - p) * t
        }
        return InkPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
                        eventTime: a.eventTime + (b.eventTime - a.eventTime) * t,
                        pressure: mix(a.pressure, b.pressure), tiltX: mix(a.tiltX, b.tiltX),
                        tiltY: mix(a.tiltY, b.tiltY), interpolated: true)
    }
}

// MARK: - Storage

/// Saves one ink document as `<capture session>/ink/ink.json`, with the iOS ink store's rules:
/// - every save writes the whole file atomically, so a crash leaves the old or the new file;
/// - a file that changed on disk since this store last read or wrote it, or that exists but
///   cannot be read, is never replaced; the document is saved beside it instead, as
///   `ink.conflict-<id>.json`, and later saves go there;
/// - nothing is deleted.
public final class InkStore {
    public private(set) var fileURL: URL
    private var lastKnown: Data?

    /// A new document's store: `<sessionDirectory>/ink/ink.json`.
    public init(sessionDirectory: URL) {
        fileURL = sessionDirectory.appending(path: "ink", directoryHint: .isDirectory).appending(path: "ink.json")
    }

    /// The store of an existing document file: an `ink.json` or a conflict copy beside it.
    public init(documentFile: URL) {
        fileURL = documentFile
    }

    /// Reads the document; refuses another schema or layer. The file is not changed.
    public func load() throws -> InkDocument {
        let bytes = try Data(contentsOf: fileURL)
        let document = try CaptureFiles.decoder.decode(InkDocument.self, from: bytes)
        guard document.schemaVersion == InkDocument.currentSchemaVersion, document.layer == InkDocument.userLayer,
              document.authorship == "user" else {
            throw MappingRefusal("\(fileURL.lastPathComponent) is not a schema-\(InkDocument.currentSchemaVersion) user-original ink file")
        }
        lastKnown = bytes
        return document
    }

    /// Returns the file actually written.
    @discardableResult
    public func save(_ document: InkDocument) throws -> URL {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)),
           (try? Data(contentsOf: fileURL)) != lastKnown || lastKnown == nil {
            fileURL = fileURL.deletingLastPathComponent().appending(path: "ink.conflict-\(UUID().uuidString.prefix(8)).json")
            lastKnown = nil
        }
        let bytes = try CaptureFiles.encoder.encode(document)
        try bytes.write(to: fileURL, options: .atomic)
        lastKnown = bytes
        return fileURL
    }

    /// The most recently saved readable user document for `displayID` with at least one stroke,
    /// among each capture session's `ink/ink.json` and the conflict copies saved beside it, other
    /// than the files in `excluded`. A conflict copy counts like any other document, so newer work
    /// saved beside a changed or unreadable `ink.json` is found. Returns the file; open it with
    /// `init(documentFile:)`. Nothing is changed.
    public static func latestDocument(in root: URL, displayID: UInt32, excluding excluded: [URL] = []) -> URL? {
        let manager = FileManager.default
        func key(_ url: URL) -> String { url.standardizedFileURL.resolvingSymlinksInPath().path(percentEncoded: false) }
        let skipped = Set(excluded.map(key))
        let sessions = (try? manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        let files = sessions.flatMap { session -> [URL] in
            let directory = session.appending(path: "ink", directoryHint: .isDirectory)
            let names = (try? manager.contentsOfDirectory(atPath: directory.path(percentEncoded: false))) ?? []
            return names.filter { $0 == "ink.json" || ($0.hasPrefix("ink.conflict-") && $0.hasSuffix(".json")) }
                .map { directory.appending(path: $0) }
        }
        let candidates = files.filter { !skipped.contains(key($0)) }.compactMap { file -> (URL, Date)? in
            guard let document = try? InkStore(documentFile: file).load(), document.displayID == displayID,
                  !document.strokes.isEmpty else { return nil }
            let saved = (try? manager.attributesOfItem(atPath: file.path(percentEncoded: false)))?[.modificationDate] as? Date
            return (file, saved ?? .distantPast)
        }
        return candidates.max { ($0.1, $0.0.path(percentEncoded: false)) < ($1.1, $1.0.path(percentEncoded: false)) }?.0
    }
}

/// Closed ink documents whose save failed. Each stays here, in memory with its store, until a
/// save succeeds, it is exported, or the user explicitly discards it; while any remain, quitting
/// has to wait for one of those.
public final class UnsavedInk {
    public private(set) var documents: [(session: InkSession, store: InkStore)] = []
    /// The most recent save or export failure.
    public private(set) var problem: String?

    public init() {}

    public var isEmpty: Bool { documents.isEmpty }

    /// The files they will be saved to; nothing else should open these meanwhile.
    public var files: [URL] { documents.map { $0.store.fileURL } }

    /// Closes the input of an open document and saves it; a failed save keeps it here. Returns
    /// the file written, or nil when the document is kept here.
    @discardableResult
    public func close(_ session: InkSession, store: InkStore, reason: String, host: Double) -> URL? {
        session.closeInput(reason: reason, host: host)
        do {
            return try store.save(session.document)
        } catch {
            problem = error.localizedDescription
            documents.append((session, store))
            return nil
        }
    }

    /// Saves each again, keeping only those that still fail.
    public func retry() {
        documents = documents.filter { pending in
            do {
                try pending.store.save(pending.session.document)
                return false
            } catch {
                problem = error.localizedDescription
                return true
            }
        }
    }

    /// Writes each document, whole, as a new file in `directory`, never replacing a file, and reads
    /// it back. Those written and read back intact are no longer kept here; the rest stay. Returns
    /// the files written.
    @discardableResult
    public func export(to directory: URL) -> [URL] {
        var written: [URL] = []
        documents = documents.filter { pending in
            let document = pending.session.document
            let file = directory.appending(path: "ink-\(document.createdInSession)-r\(document.revision)-\(UUID().uuidString.prefix(8)).json")
            do {
                let bytes = try CaptureFiles.encoder.encode(document)
                try bytes.write(to: file, options: .withoutOverwriting)
                guard try Data(contentsOf: file) == bytes else {
                    throw MappingRefusal("\(file.lastPathComponent) did not read back as written")
                }
                written.append(file)
                return false
            } catch {
                problem = "export failed: \(error.localizedDescription)"
                return true
            }
        }
        return written
    }

    /// Drops them all, only at the user's explicit choice; returns how many were dropped.
    @discardableResult
    public func discard() -> Int {
        defer { documents.removeAll() }
        return documents.count
    }
}

/// Whether display-local points still map onto one capture's frames. The mapping is taken as
/// established only while the display keeps the size in points and the rotation recorded when
/// capture started. After a known change it stays unverified until capture starts again, even if
/// the display changes back: how the stream transformed frames meanwhile is unknown.
public struct DisplayGeometry: Equatable, Sendable {
    public let started: DisplayFacts
    /// Why points cannot be mapped to this capture's frames; nil while the geometry is unchanged.
    public private(set) var problem: String?
    /// When the change was noticed (host seconds). Pixels from before it keep the start's mapping;
    /// a change is known only once AppKit reports it.
    public private(set) var changedHost: Double?

    public init(started: DisplayFacts) {
        self.started = started
    }

    /// Compares the display's current size in points and rotation with those at the start.
    public mutating func observe(widthPoints: Double, heightPoints: Double, rotationDegrees: Double, host: Double) {
        guard problem == nil, widthPoints != started.frame.width || heightPoints != started.frame.height
            || rotationDegrees != started.rotationDegrees else { return }
        func size(_ width: Double, _ height: Double, _ rotation: Double) -> String {
            String(format: "%g×%g pt at %g°", width, height, rotation)
        }
        changedHost = host
        problem = "the display measured \(size(widthPoints, heightPoints, rotationDegrees)) at host \(host) s, not the "
            + "\(size(started.frame.width, started.frame.height, started.rotationDegrees)) recorded when capture started; "
            + "how frames map to display points since then is unverified, so no pixels are selected. Restart capture to map regions again."
    }
}
